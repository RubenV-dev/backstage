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
import React from 'react';
import { MenuItem, Select } from '@material-ui/core';
import { Controller } from 'react-hook-form';
import useAsync from 'react-use/lib/useAsync';
import { Progress } from '@backstage/core-components';
import Alert from '@material-ui/lab/Alert';

export const FormInputDropdown = ({ name, control, label }) => {
  const { value, loading, error } = useAsync(async () => {
    const response = await fetch(
      'http://localhost:7007/api/kubernetes/clusters',
    );
    const data = await response.json();
    return data.items;
  }, []);

  const generateSelectOptions = () => {
    return value.map((clusters, index) => {
      return (
        <MenuItem key={index + 1} value={clusters.name}>
          {clusters.name}
        </MenuItem>
      );
    });
  };

  if (loading) {
    return <Progress />;
  } else if (error) {
    return <Alert severity="error">{error.message}</Alert>;
  }

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: field }) => (
        <Select onChange={field.onChange} value={field.value}>
          {generateSelectOptions()}
        </Select>
      )}
    />
  );
};
