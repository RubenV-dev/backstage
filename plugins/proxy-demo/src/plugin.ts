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
  createApiFactory,
  createPlugin,
  createRoutableExtension,
  discoveryApiRef,
  googleAuthApiRef,
  identityApiRef,
  microsoftAuthApiRef,
  oktaAuthApiRef,
  oneloginAuthApiRef,
} from '@backstage/core-plugin-api';
import {
  kubernetesApiRef,
  KubernetesAuthProviders,
  kubernetesAuthProvidersApiRef,
  KubernetesBackendClient,
} from '@backstage/plugin-kubernetes';

import { rootRouteRef } from './routes';

export const proxyDemoPlugin = createPlugin({
  id: 'proxy-demo',
  // apis: [
  //   createApiFactory({
  //     api: kubernetesApiRef,
  //     deps: {
  //       discoveryApi: discoveryApiRef,
  //       identityApi: identityApiRef,
  //     },
  //     factory: ({ discoveryApi, identityApi }) =>
  //       new KubernetesBackendClient({ discoveryApi, identityApi }),
  //   }),
  //   createApiFactory({
  //     api: kubernetesAuthProvidersApiRef,
  //     deps: {
  //       googleAuthApi: googleAuthApiRef,
  //       microsoftAuthApi: microsoftAuthApiRef,
  //       oktaAuthApi: oktaAuthApiRef,
  //       oneloginAuthApi: oneloginAuthApiRef,
  //     },
  //     factory: ({
  //       googleAuthApi,
  //       microsoftAuthApi,
  //       oktaAuthApi,
  //       oneloginAuthApi,
  //     }) => {
  //       const oidcProviders = {
  //         google: googleAuthApi,
  //         microsoft: microsoftAuthApi,
  //         okta: oktaAuthApi,
  //         onelogin: oneloginAuthApi,
  //       };

  //       return new KubernetesAuthProviders({ googleAuthApi, oidcProviders });
  //     },
  //   }),
  // ],
  routes: {
    root: rootRouteRef,
  },
});

export const ProxyDemoPage = proxyDemoPlugin.provide(
  createRoutableExtension({
    name: 'ProxyDemoPage',
    component: () =>
      import('./components/ExampleComponent').then(m => m.ExampleComponent),
    mountPoint: rootRouteRef,
  }),
);
