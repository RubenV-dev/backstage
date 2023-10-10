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
import { PassportDoneCallback } from '@backstage/plugin-auth-node';
import {
  createOAuthAuthenticator,
  decodeOAuthState,
  encodeOAuthState,
} from '@backstage/plugin-auth-node';
import {
  Client,
  Issuer,
  TokenSet,
  Strategy as OidcStrategy,
} from 'openid-client';
import { randomBytes, createHash } from 'crypto';

function generatePKCEPair() {
  const NUM_OF_BYTES = 22; // Total of 44 characters (1 Bytes = 2 char) (standard states that: 43 chars <= verifier <= 128 chars)
  const HASH_ALG = 'sha256';
  const randomVerifier = randomBytes(NUM_OF_BYTES).toString('hex');
  const hash = createHash(HASH_ALG).update(randomVerifier).digest('base64');
  const challenge = hash
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, ''); // Clean base64 to make it URL safe
  return { verifier: randomVerifier, challenge };
}

const rfc8693TokenExchange = async ({
  subject_token,
  target_audience,
  ctx,
}: {
  subject_token: string;
  target_audience: string;
  ctx: Promise<{
    providerStrategy: OidcStrategy<{}>;
    client: Client;
  }>;
}): Promise<string | undefined> => {
  const { client } = await ctx;
  return client
    .grant({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token,
      audience: target_audience,
      subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      requested_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    })
    .then(tokenset => tokenset.access_token)
    .catch(err => {
      throw new Error(`RFC8693 token exchange failed with error: ${err}`);
    });
};

/** @public */
export const pinnipedAuthenticator = createOAuthAuthenticator({
  defaultProfileTransform: async (_r, _c) => ({ profile: {} }),
  async initialize({ callbackUrl, config }) {
    const issuer = await Issuer.discover(
      `${config.getString(
        'federationDomain',
      )}/.well-known/openid-configuration`,
    );
    const clientId = config.getString('clientId');
    const client = new issuer.Client({
      access_type: 'offline', // this option must be passed to provider to receive a refresh token
      client_id: clientId,
      client_secret: config.getString('clientSecret'),
      redirect_uris: [callbackUrl],
      response_types: ['code'],
      scope: config.getOptionalString('scope') || '',
      id_token_signed_response_alg: 'ES256',
    });
    // if we were to remove this entire strategy.... what would replace it???
    // im guessing probably nothing and we would have to perform all those strategy methods ourselves?
    // const providerStrategy = new OidcStrategy(
    //   {
    //     client,
    //     passReqToCallback: false,
    //   },
    //   (
    //     tokenset: TokenSet,
    //     done: PassportDoneCallback<
    //       { tokenset: TokenSet },
    //       {
    //         refreshToken?: string;
    //       }
    //     >,
    //   ) => {
    //     done(undefined, { tokenset }, {});
    //   },
    // );
    const providerStrategy = {
      redirect: function (url: any) {
        console.log(`hello, its a me: ${url}`);
      },
      error: function () {
        throw new Error('not sure yet');
      },
      authenticate: function (req: any, options: any) {
        if (!req.session) {
          throw new TypeError('authentication requires session support');
        }
        const baseUrl = new URL(
          `https://pinniped.test/oauth2/authorize?response_type=code`,
        );

        if (options) {
          baseUrl.searchParams.append('state', options.state);
        }

        baseUrl.searchParams.append('client_id', clientId);
        baseUrl.searchParams.append('redirect_uri', callbackUrl);

        const { verifier, challenge } = generatePKCEPair();

        baseUrl.searchParams.append('code_challenge_method', 'S256');
        baseUrl.searchParams.append('code_challenge', challenge);
        baseUrl.searchParams.append('scope', options.scope);

        // how do we make it so this method can manipulate session one level up? in our tests we want manipulate the fake session to know about the verifier???
        // req.session = {...req.session, ['oidc:pinniped.test']: {code_verifier: verifier} }
        req.session['oidc:pinniped.test'] = { code_verifier: verifier };

        this.redirect(baseUrl);
      },
    };

    return { providerStrategy, client };
  },

  async start(input, ctx) {
    const { providerStrategy } = await ctx;
    const stringifiedAudience = input.req.query?.audience as string;
    const decodedState = decodeOAuthState(input.state);
    const state = { ...decodedState, audience: stringifiedAudience };
    const options: Record<string, string> = {
      scope:
        input.scope ||
        'openid pinniped:request-audience username offline_access',
      state: encodeOAuthState(state),
    };

    return new Promise((resolve, reject) => {
      const strategy = Object.create(providerStrategy);
      strategy.redirect = (url: string) => {
        // console.log(url)
        resolve({ url });
      };
      strategy.error = (error: Error) => {
        reject(error);
      };
      strategy.authenticate(input.req, { ...options });
    });
  },

  async authenticate(input, ctx) {
    const { providerStrategy } = await ctx;
    const { req } = input;
    const { searchParams } = new URL(req.url, 'https://pinniped.com');
    const stateParam = searchParams.get('state');
    const audience = stateParam
      ? decodeOAuthState(stateParam).audience
      : undefined;

    return new Promise((resolve, reject) => {
      const strategy = Object.create(providerStrategy);
      strategy.success = (user: any) => {
        (audience
          ? rfc8693TokenExchange({
              subject_token: user.tokenset.access_token,
              target_audience: audience,
              ctx,
            }).catch(err =>
              reject(
                new Error(
                  `Failed to get cluster specific ID token for "${audience}": ${err}`,
                ),
              ),
            )
          : Promise.resolve(user.tokenset.id_token)
        ).then(idToken => {
          resolve({
            fullProfile: { provider: '', id: '', displayName: '' },
            session: {
              accessToken: user.tokenset.access_token!,
              tokenType: user.tokenset.token_type ?? 'bearer',
              scope: user.tokenset.scope!,
              idToken,
              refreshToken: user.tokenset.refresh_token,
            },
          });
        });
      };

      strategy.fail = (info: any) => {
        reject(new Error(`Authentication rejected, ${info.message || ''}`));
      };

      strategy.error = (error: Error) => {
        reject(error);
      };

      strategy.redirect = () => {
        reject(new Error('Unexpected redirect'));
      };

      strategy.authenticate(req);
    });
  },

  async refresh(input, ctx) {
    const { client } = await ctx;
    const tokenset = await client.refresh(input.refreshToken);

    return new Promise((resolve, reject) => {
      if (!tokenset.access_token) {
        reject(new Error('Refresh Failed'));
      }

      resolve({
        fullProfile: { provider: '', id: '', displayName: '' },
        session: {
          accessToken: tokenset.access_token!,
          tokenType: tokenset.token_type ?? 'bearer',
          scope: tokenset.scope!,
          idToken: tokenset.id_token,
          refreshToken: tokenset.refresh_token,
        },
      });
    });
  },
});
