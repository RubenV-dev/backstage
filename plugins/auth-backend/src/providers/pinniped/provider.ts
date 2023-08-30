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
import {
  Client,
  Issuer,
  Strategy as OidcStrategy,
  TokenSet,
} from 'openid-client';
import {
  OAuthHandlers,
  OAuthProviderOptions,
  OAuthRefreshRequest,
  OAuthResponse,
  OAuthStartRequest,
  encodeState,
  readState,
} from '../../lib/oauth';
import { PassportDoneCallback } from '../../lib/passport';
import { OAuthStartResponse } from '../types';
import express from 'express';
import { OAuthAdapter, OAuthEnvironmentHandler } from '../../lib/oauth';
import { createAuthProviderIntegration } from '../createAuthProviderIntegration';

type OidcImpl = {
  strategy: OidcStrategy<undefined, Client>;
  client: Client;
};

type PrivateInfo = {
  refreshToken?: string;
};

export type PinnipedProviderOptions = OAuthProviderOptions & {
  federationDomain: string;
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  scope?: string;
};

export class PinnipedAuthProvider implements OAuthHandlers {
  private readonly implementation: Promise<OidcImpl>;

  constructor(options: PinnipedProviderOptions) {
    this.implementation = this.setupStrategy(options);
  }

  async start(req: OAuthStartRequest): Promise<OAuthStartResponse> {
    const { strategy } = await this.implementation;
    const stringifiedAudience = req.query?.audience as string;
    const state = { ...req.state, audience: stringifiedAudience };
    const options: Record<string, string> = {
      scope:
        req.scope || 'openid pinniped:request-audience username offline_access',
      state: encodeState(state),
    };
    return new Promise((resolve, reject) => {
      strategy.redirect = (url: string) => {
        resolve({ url });
      };
      strategy.error = (error: Error) => {
        reject(error);
      };
      strategy.authenticate(req, { ...options });
    });
  }

  async handler(
    req: express.Request,
  ): Promise<{ response: OAuthResponse; refreshToken?: string }> {
    const { strategy, client } = await this.implementation;
    const { searchParams } = new URL(req.url, 'https://pinniped.com');
    const stateParam = searchParams.get('state');
    const audience = stateParam ? readState(stateParam).audience : undefined;

    return new Promise((resolve, reject) => {
      strategy.success = user => {
        (audience
          ? client
              .grant({
                grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
                subject_token: user.tokenset.access_token,
                audience,
                subject_token_type:
                  'urn:ietf:params:oauth:token-type:access_token',
                requested_token_type: 'urn:ietf:params:oauth:token-type:jwt',
              })
              .then(tokenset => tokenset.access_token)
          : Promise.resolve(user.tokenset.id_token)
        ).then(idToken => {
          resolve({
            response: {
              providerInfo: {
                accessToken: user.tokenset.access_token,
                scope: user.tokenset.scope,
                idToken,
              },
              profile: {},
            },
            refreshToken: user.tokenset.refresh_token,
          });
        });
      };

      strategy.fail = info => {
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
  }

  async refresh(
    req: OAuthRefreshRequest,
  ): Promise<{ response: OAuthResponse; refreshToken?: string }> {
    const { client } = await this.implementation;
    const tokenset = await client.refresh(req.refreshToken);

    return new Promise((resolve, reject) => {
      if (!tokenset.access_token) {
        reject(new Error('Refresh Failed'));
      }

      resolve({
        response: {
          providerInfo: {
            accessToken: tokenset.access_token!,
            scope: tokenset.scope!,
            idToken: tokenset.id_token,
          },
          profile: {},
        },
        refreshToken: tokenset.refresh_token,
      });
    });
  }

  private async setupStrategy(
    options: PinnipedProviderOptions,
  ): Promise<OidcImpl> {
    const issuer = await Issuer.discover(
      `${options.federationDomain}/.well-known/openid-configuration`,
    );
    const client = new issuer.Client({
      access_type: 'offline', // this option must be passed to provider to receive a refresh token
      client_id: options.clientId,
      client_secret: options.clientSecret,
      redirect_uris: [options.callbackUrl],
      response_types: ['code'],
      scope: options.scope || '',
    });

    const strategy = new OidcStrategy(
      {
        client,
        passReqToCallback: false,
      },
      (
        tokenset: TokenSet,
        done: PassportDoneCallback<{ tokenset: TokenSet }, PrivateInfo>,
      ) => {
        done(undefined, { tokenset }, {});
      },
    );
    return { strategy, client };
  }
}

/**
 * Auth provider integration for Pinniped auth
 *
 * @public
 */
export const pinniped = createAuthProviderIntegration({
  create() {
    return ({ providerId, globalConfig, config }) =>
      OAuthEnvironmentHandler.mapConfig(config, envConfig => {
        const clientId = envConfig.getString('clientId');
        const clientSecret = envConfig.getString('clientSecret');
        const federationDomain = envConfig.getString('federationDomain');
        const customCallbackUrl = envConfig.getOptionalString('callbackUrl');
        const callbackUrl =
          customCallbackUrl ||
          `${globalConfig.baseUrl}/${providerId}/handler/frame`;

        const provider = new PinnipedAuthProvider({
          federationDomain,
          clientId,
          clientSecret,
          callbackUrl,
        });

        return OAuthAdapter.fromConfig(globalConfig, provider, {
          providerId,
          callbackUrl,
        });
      });
  },
});
