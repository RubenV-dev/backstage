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
import { Progress } from '@backstage/core-components';
import { googleAuthApiRef, useApi } from '@backstage/core-plugin-api';
import { Button, Grid, Paper, TextField, Typography } from '@material-ui/core';
import Alert from '@material-ui/lab/Alert';
import React, { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import useAsync from 'react-use/lib/useAsync';
import { FormInputDropdown } from './FormInputDropdown';

const defaultValues = {
  textValue: '',
  dropdownValue: '',
};

export const FormDemo = () => {
  const { register } = useForm();
  const methods = useForm({ defaultValues: defaultValues });
  const { handleSubmit, reset, control, setValue } = methods;
  const googleAuthApi = useApi(googleAuthApiRef);

  const onSubmit = async (data: any) => {
    // console.log(data);
    const token = await googleAuthApi.getAccessToken(
      'https://www.googleapis.com/auth/cloud-platform',
    );
    const response = await fetch(
      `http://localhost:7007/api/kubernetes/proxy/api/v1/namespaces`,
      {
        method: 'POST',
        headers: {
          'X-Kubernetes-Cluster': `${data.dropdownValue}`,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          apiVersion: 'v1',
          kind: 'Namespace',
          metadata: {
            name: `${data.textValue}`,
          },
        }),
      },
    );

    const results = await response.json();
    return results;
  };

  return (
    <form>
      <Grid container spacing={2} direction="column">
        <Grid item>
          <Controller
            name="textValue"
            control={control}
            render={({ field: { onChange, value } }) => (
              <TextField onChange={onChange} value={value} label="Text Value" />
            )}
          />
        </Grid>
        <Grid item>
          <FormInputDropdown
            name="dropdownValue"
            control={control}
            label="Dropdown Input"
          />
        </Grid>
        <Grid item>
          <Button onClick={handleSubmit(onSubmit)} variant="outlined">
            Submit
          </Button>
        </Grid>
        <Grid item>
          <Button onClick={() => reset()} variant="outlined">
            Reset
          </Button>
        </Grid>
      </Grid>
    </form>
  );
};
