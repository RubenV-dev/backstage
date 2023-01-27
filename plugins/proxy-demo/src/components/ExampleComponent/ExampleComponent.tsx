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
import React, { FormEventHandler } from 'react';
import { Typography, Grid, FormControl, FormGroup } from '@material-ui/core';
import {
  InfoCard,
  Header,
  Page,
  Content,
  ContentHeader,
  HeaderLabel,
  SupportButton,
} from '@backstage/core-components';
// import { ExampleFetchComponent } from '../ExampleFetchComponent';
import { ExampleFetchClusters } from '../ExampleFetchComponent';
import { FormDemo } from '../ExampleComponent/ExampleForm';

// const onFormSubmit: FormEventHandler = e => {
//   e.preventDefault();
//   console.log('What is going on, im hit');
// };

export const ExampleComponent = () => (
  <Page themeId="tool">
    <Header title="Welcome to K8s Proxy-Demo!" subtitle="Lightning Demo">
      <HeaderLabel label="Owner" value="Team X" />
      <HeaderLabel label="Lifecycle" value="Alpha" />
    </Header>
    <Content>
      <ContentHeader title="Namespace Creation Form">
        <SupportButton>
          Plugin made for the demonstration of the k8s proxy endpoint.
        </SupportButton>
      </ContentHeader>
      <Grid container spacing={3} direction="column">
        <Grid item>
          <FormDemo />
        </Grid>
        <Grid item>
          <ExampleFetchClusters />
        </Grid>
      </Grid>
    </Content>
  </Page>
);
