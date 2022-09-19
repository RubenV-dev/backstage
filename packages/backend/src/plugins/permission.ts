/*
 * Copyright 2021 The Backstage Authors
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

import { createRouter } from '@backstage/plugin-permission-backend';
import {
  AuthorizeResult,
  isPermission,
  PolicyDecision,
} from '@backstage/plugin-permission-common';
import { PermissionPolicy, PolicyQuery } from '@backstage/plugin-permission-node';
import { Router } from 'express';
import { BackstageIdentityResponse } from '../../../../plugins/auth-node/src';
import { catalogEntityDeletePermission } from '../../../../plugins/catalog-common/src';
import { PluginEnvironment } from '../types';
import { catalogConditions, createCatalogConditionalDecision } from '../../../../plugins/catalog-backend/src/permissions/conditionExports';

class AllowAllPermissionPolicy implements PermissionPolicy {
  async handle(): Promise<PolicyDecision> {
    return {
      result: AuthorizeResult.ALLOW,
    };
  }
}

class DenyAllCatalogEntityDeleteExceptOwnerPermissionPolicy implements PermissionPolicy {
  async handle(
      request: PolicyQuery,
      user?: BackstageIdentityResponse)
      : Promise<PolicyDecision> {
          if (isPermission(request.permission, catalogEntityDeletePermission)) {

              return createCatalogConditionalDecision(
                  request.permission,
                  catalogConditions.isEntityOwner(
                  user?.identity.ownershipEntityRefs ?? [],
                  ),
              );
          }
          return { result: AuthorizeResult.ALLOW};
      }
}


export default async function createPlugin(
  env: PluginEnvironment,
): Promise<Router> {
  return await createRouter({
    config: env.config,
    logger: env.logger,
    discovery: env.discovery,
    policy: new DenyAllCatalogEntityDeleteExceptOwnerPermissionPolicy(),
    identity: env.identity,
  });
}
