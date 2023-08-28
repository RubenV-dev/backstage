/*
 * Copyright 2023 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { setupRequestMockHandlers } from '@backstage/backend-test-utils';
import {
  OAuthRefreshRequest,
  OAuthStartRequest,
  encodeState,
  readState,
} from '../../lib/oauth';
import { PinnipedAuthProvider, PinnipedOptions } from './provider';
import { setupServer } from 'msw/node';
import { rest } from 'msw';
import express from 'express';
import { UnsecuredJWT } from 'jose';
import { OAuthState } from '../../lib/oauth';

describe('PinnipedAuthProvider', () => {
  let provider: PinnipedAuthProvider;
  let startRequest: OAuthStartRequest;
  let fakeSession: Record<string, any>;

  const worker = setupServer();
  setupRequestMockHandlers(worker);

  const issuerMetadata = {
    issuer: 'https://pinniped.test',
    authorization_endpoint: 'https://pinniped.test/oauth2/authorize',
    token_endpoint: 'https://pinniped.test/oauth2/token',
    revocation_endpoint: 'https://pinniped.test/oauth2/revoke_token',
    userinfo_endpoint: 'https://pinniped.test/idp/userinfo.openid',
    introspection_endpoint: 'https://pinniped.test/introspect.oauth2',
    jwks_uri: 'https://pinniped.test/jwks.json',
    scopes_supported: [
      'openid',
      'offline_access',
      'pinniped:request-audience',
      'username',
      'groups',
    ],
    claims_supported: ['email', 'username', 'groups', 'additionalClaims'],
    response_types_supported: ['code'],
    id_token_signing_alg_values_supported: ['RS256', 'RS512', 'HS256'],
    token_endpoint_auth_signing_alg_values_supported: [
      'RS256',
      'RS512',
      'HS256',
    ],
    request_object_signing_alg_values_supported: ['RS256', 'RS512', 'HS256'],
  };

  const clientMetadata: PinnipedOptions = {
    federationDomain: 'https://federationDomain.test',
    clientId: 'clientId.test',
    clientSecret: 'secret.test',
    callbackUrl: 'https://federationDomain.test/callback',
    tokenSignedResponseAlg: 'none',
  };

  const testTokenMetadata = {
    sub: 'test',
    iss: 'https://pinniped.test',
    iat: Date.now(),
    aud: clientMetadata.clientId,
    exp: Date.now() + 10000,
  };

  const idToken = new UnsecuredJWT(testTokenMetadata)
    .setIssuer(testTokenMetadata.iss)
    .setAudience(testTokenMetadata.aud)
    .setSubject(testTokenMetadata.sub)
    .setIssuedAt(testTokenMetadata.iat)
    .setExpirationTime(testTokenMetadata.exp)
    .encode();

  const oauthState: OAuthState = {
    nonce: 'nonce',
    env: 'env',
    origin: 'undefined',
  };

  const clusterScopedIdToken = 'dummy-token';

  beforeEach(() => {
    jest.clearAllMocks();

    worker.use(
      rest.all(
        'https://federationDomain.test/.well-known/openid-configuration',
        (_req, res, ctx) =>
          res(
            ctx.status(200),
            ctx.set('Content-Type', 'application/json'),
            ctx.json(issuerMetadata),
          ),
      ),
      rest.post('https://pinniped.test/oauth2/token', async (req, res, ctx) => {
        const formBody = new URLSearchParams(await req.text());
        const isGrantTypeTokenExchange =
          formBody.get('grant_type') ===
          'urn:ietf:params:oauth:grant-type:token-exchange';
        const hasValidTokenExchangeParams =
          formBody.get('subject_token') === 'accessToken' &&
          formBody.get('audience') === 'test_cluster' &&
          formBody.get('subject_token_type') ===
            'urn:ietf:params:oauth:token-type:access_token' &&
          formBody.get('requested_token_type') ===
            'urn:ietf:params:oauth:token-type:jwt';

        return res(
          req.headers.get('Authorization') &&
            (!isGrantTypeTokenExchange || hasValidTokenExchangeParams)
            ? ctx.json({
                access_token: isGrantTypeTokenExchange
                  ? clusterScopedIdToken
                  : 'accessToken',
                refresh_token: 'refreshToken',
                ...(!isGrantTypeTokenExchange && { id_token: idToken }),
                scope: 'testScope',
              })
            : ctx.status(401),
        );
      }),
      rest.get('https://pinniped.test/idp/userinfo.openid', (_req, res, ctx) =>
        res(
          ctx.json({
            iss: 'https://pinniped.test',
            sub: 'test',
            aud: clientMetadata.clientId,
            claims: {
              given_name: 'Givenname',
              family_name: 'Familyname',
              email: 'user@example.com',
            },
          }),
          ctx.status(200),
        ),
      ),
    );

    fakeSession = {};
    startRequest = {
      session: fakeSession,
      method: 'GET',
      url: 'test',
      state: oauthState,
    } as unknown as OAuthStartRequest;

    provider = new PinnipedAuthProvider(clientMetadata);
  });

  describe('#start', () => {
    it('redirects to authorization endpoint returned from OIDC metadata endpoint', async () => {
      const startResponse = await provider.start(startRequest);
      const url = new URL(startResponse.url);

      expect(url.protocol).toBe('https:');
      expect(url.hostname).toBe('pinniped.test');
      expect(url.pathname).toBe('/oauth2/authorize');
    });

    it('initiates an authorization code grant', async () => {
      const startResponse = await provider.start(startRequest);
      const { searchParams } = new URL(startResponse.url);

      expect(searchParams.get('response_type')).toBe('code');
    });

    it('passes audience query parameter into OAuthState in the redirect url when defined in the request', async () => {
      startRequest.query = { audience: 'test-cluster' };
      const startResponse = await provider.start(startRequest);
      const { searchParams } = new URL(startResponse.url);
      const stateParam = searchParams.get('state');
      const decodedState = readState(stateParam!);

      expect(decodedState).toMatchObject({
        nonce: 'nonce',
        env: 'env',
        audience: 'test-cluster',
      });
    });

    it('passes client ID from config', async () => {
      const startResponse = await provider.start(startRequest);
      const { searchParams } = new URL(startResponse.url);

      expect(searchParams.get('client_id')).toBe('clientId.test');
    });

    it('passes callback URL', async () => {
      const startResponse = await provider.start(startRequest);
      const { searchParams } = new URL(startResponse.url);

      expect(searchParams.get('redirect_uri')).toBe(
        'https://federationDomain.test/callback',
      );
    });

    it('generates PKCE challenge', async () => {
      const startResponse = await provider.start(startRequest);
      const { searchParams } = new URL(startResponse.url);

      expect(searchParams.get('code_challenge_method')).toBe('S256');
      expect(searchParams.get('code_challenge')).not.toBeNull();
    });

    it('stores PKCE verifier in session', async () => {
      await provider.start(startRequest);
      expect(fakeSession['oidc:pinniped.test'].code_verifier).toBeDefined();
    });

    it('requests sufficient scopes for token exchange', async () => {
      const startResponse = await provider.start(startRequest);
      const { searchParams } = new URL(startResponse.url);
      const scopes = searchParams.get('scope')?.split(' ') ?? [];

      expect(scopes).toEqual(
        expect.arrayContaining([
          'openid',
          'pinniped:request-audience',
          'username',
          'offline_access',
        ]),
      );
    });

    it('encodes OAuth state in query param', async () => {
      const startResponse = await provider.start(startRequest);
      const { searchParams } = new URL(startResponse.url);
      const stateParam = searchParams.get('state');
      const decodedState = readState(stateParam!);

      expect(decodedState).toMatchObject(oauthState);
    });

    it('fails when request has no session', async () => {
      return expect(
        provider.start({
          method: 'GET',
          url: 'test',
        } as unknown as OAuthStartRequest),
      ).rejects.toThrow('authentication requires session support');
    });
  });

  describe('#handler', () => {
    let handlerRequest: express.Request;

    beforeEach(() => {
      // we want to somehow pass an authentication header in this request for testing purposes
      handlerRequest = {
        method: 'GET',
        url: `https://test?code=authorization_code&state=${encodeState(
          oauthState,
        )}`,
        session: {
          'oidc:pinniped.test': {
            state: encodeState(oauthState),
          },
        },
      } as unknown as express.Request;
    });

    it('exchanges authorization code for a access_token', async () => {
      const handlerResponse = await provider.handler(handlerRequest);
      const accessToken = handlerResponse.response.providerInfo.accessToken;

      expect(accessToken).toEqual('accessToken');
    });

    it('exchanges authorization code for a refresh_token', async () => {
      const handlerResponse = await provider.handler(handlerRequest);
      const refreshToken = handlerResponse.refreshToken;

      expect(refreshToken).toEqual('refreshToken');
    });

    it('exchanges authorization_code for a tokenset with a defined scope', async () => {
      const handlerResponse = await provider.handler(handlerRequest);
      const responseScope = handlerResponse.response.providerInfo.scope;

      expect(responseScope).toEqual('testScope');
    });

    it('returns cluster-scoped ID token when audience is specified', async () => {
      oauthState.audience = 'test_cluster';
      handlerRequest = {
        method: 'GET',
        url: `https://test?code=authorization_code&state=${encodeState(
          oauthState,
        )}`,
        session: {
          'oidc:pinniped.test': {
            state: encodeState(oauthState),
          },
        },
      } as unknown as express.Request;

      const handlerResponse = await provider.handler(handlerRequest);
      const responseIdToken = handlerResponse.response.providerInfo.idToken;

      expect(responseIdToken).toEqual(clusterScopedIdToken);
    });

    it('request errors out with missing authorization_code parameter in the request_url', async () => {
      handlerRequest.url = 'https://test.com';
      return expect(provider.handler(handlerRequest)).rejects.toThrow(
        'Unexpected redirect',
      );
    });

    it('fails when request has no state in req_url', async () => {
      return expect(
        provider.handler({
          method: 'GET',
          url: `https://test?code=authorization_code}`,
          session: {
            ['oidc:pinniped.test']: {
              state: { handle: 'sessionid', code_verifier: 'foo' },
            },
          },
        } as unknown as express.Request),
      ).rejects.toThrow(
        'Authentication rejected, state missing from the response',
      );
    });

    it('fails when request has no session', async () => {
      return expect(
        provider.handler({
          method: 'GET',
          url: 'https://test.com',
        } as unknown as OAuthStartRequest),
      ).rejects.toThrow('authentication requires session support');
    });

    // if no valid key is in the jwks array or even an unsigned jwt
    // have pinniped reject your clientid and secret possibly as a unit test
  });

  describe('#refresh', () => {
    let refreshRequest: OAuthRefreshRequest;

    beforeEach(() => {
      refreshRequest = {
        refreshToken: 'otherRefreshToken',
      } as unknown as OAuthRefreshRequest;
    });

    it('gets new refresh token', async () => {
      const { refreshToken } = await provider.refresh(refreshRequest);

      expect(refreshToken).toBe('refreshToken');
    });

    it('gets an access_token', async () => {
      const { response } = await provider.refresh(refreshRequest);

      expect(response.providerInfo.accessToken).toBe('accessToken');
    });
  });
});
