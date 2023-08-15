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
  OAuthResponse,
  OAuthStartRequest,
  encodeState,
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

export type PinnipedOptions = OAuthProviderOptions & {
  federationDomain: string;
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  scope?: string;
  tokenSignedResponseAlg?: string;
};

export class PinnipedAuthProvider implements OAuthHandlers {
  private readonly implementation: Promise<OidcImpl>;

  constructor(options: PinnipedOptions) {
    this.implementation = this.setupStrategy(options);
  }

  async start(req: OAuthStartRequest): Promise<OAuthStartResponse> {
    const { strategy } = await this.implementation;
    const options: Record<string, string> = {
      scope: req.scope || 'pinniped:request-audience username',
      state: encodeState(req.state),
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
    const { strategy } = await this.implementation;

    //TODO: what do we do about a defined scope here? one is expected to be returned by this handler method and i currently have it hardcoded. does our accesstoken need to worry about scope at all?
    return new Promise((resolve, reject) => {
      strategy.success = user => {
        resolve({ response: {
          providerInfo: {accessToken: user.tokenset.access_token, scope: "none"},
          profile: {},
        }})
      }
      strategy.fail = info => {
        reject(new Error(`Authentication rejected, ${info.message || ''}`));
      };
      strategy.error = reject;

      strategy.authenticate(req);
    });
  }

  private async setupStrategy(options: PinnipedOptions): Promise<OidcImpl> {
    const issuer = await Issuer.discover(
      `${options.federationDomain}/.well-known/openid-configuration`,
    );
    const client = new issuer.Client({
      access_type: 'offline', // this option must be passed to provider to receive a refresh token
      client_id: options.clientId,
      client_secret: options.clientSecret,
      redirect_uris: [options.callbackUrl],
      response_types: ['code'],
      id_token_signed_response_alg: options.tokenSignedResponseAlg || 'RS256',
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
        const tokenSignedResponseAlg = 'ES256';

        const provider = new PinnipedAuthProvider({
          federationDomain,
          clientId,
          clientSecret,
          callbackUrl,
          tokenSignedResponseAlg,
        });

        return OAuthAdapter.fromConfig(globalConfig, provider, {
          providerId,
          callbackUrl,
        });
      });
  },
});
