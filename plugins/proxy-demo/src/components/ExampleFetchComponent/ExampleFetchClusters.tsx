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
import React, { useState } from 'react';
import { Table, TableColumn, Progress } from '@backstage/core-components';
import Alert from '@material-ui/lab/Alert';
import useAsync from 'react-use/lib/useAsync';
import { googleAuthApiRef, useApi } from '@backstage/core-plugin-api';
import { Grid } from '@material-ui/core';

type Cluster = {
  name: string;
  namespaces: NamespaceObj[];
};

type NamespaceObj = {
  metadata: {
    name: string;
    uid: string;
  };
  spec: {
    finalizers: string;
  };
  status: {
    phase: string;
  };
};

type DenseTableProps = {
  clusters: Cluster[];
};

export const DenseTable = ({ clusters }: DenseTableProps) => {
  const columns: TableColumn[] = [
    { title: 'Namespaces Available', field: 'namespace' },
  ];

  const data = clusters.map(({ name, namespaces }, index) => {
    const nsArray = namespaces.map(({ metadata }, index1) => {
      return {
        namespace: metadata.name,
        id: index1 + 100,
      };
    });
    return {
      name: name,
      id: index + 1001,
      namespaces: nsArray,
    };
  });

  const tableArr = data.map(({ name, namespaces }) => {
    return (
      <Grid item>
        <Table
          title={`Cluster: ${name}`}
          options={{ search: false, paging: false }}
          columns={columns}
          data={namespaces}
        />
      </Grid>
    );
  });
  return (
    <Grid container spacing={1} direction="row">
      {tableArr}
    </Grid>
  );
};

export const ExampleFetchClusters = () => {
  // const [clusterObjectArr, setClusterObjectArr] = useState([
  //   { name: '', namespaces: [] },
  // ]);
  const googleAuthApi = useApi(googleAuthApiRef);

  const { value, loading, error } = useAsync(async () => {
    const token = await googleAuthApi.getAccessToken(
      'https://www.googleapis.com/auth/cloud-platform',
    );
    const response = await fetch(
      'http://localhost:7007/api/kubernetes/clusters',
    );
    const data = await response.json();
    const clusterArray = data.items;

    const ArrwithNamespaces = await clusterArray.map(async ({ name }) => {
      const response1 = await fetch(
        `http://localhost:7007/api/kubernetes/proxy/api/v1/namespaces`,
        {
          method: 'GET',
          headers: {
            'X-Kubernetes-Cluster': name,
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const data1 = await response1.json();
      return { name: name, namespaces: data1.items };
    });
    // setClusterObject({
    //   name: ArrwithNamespaces.name,
    //   namespaces: ArrwithNamespaces.namespaces,
    // });
    return Promise.all(ArrwithNamespaces);
  }, []);

  if (loading) {
    return <Progress />;
  } else if (error) {
    return <Alert severity="error">{error.message}</Alert>;
  }
  // if (value) {
  //   setClusterObjectArr(value);
  // }
  // console.log(value);
  // console.log(clusterObjectArr);

  return <DenseTable clusters={value || []} />;
};
