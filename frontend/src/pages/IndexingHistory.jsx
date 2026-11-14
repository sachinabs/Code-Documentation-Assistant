import React, { useEffect, useState } from 'react';
import { Card, Table, Tag, Alert } from 'antd';
import { repositoriesApi, getErrorMessage, toArray } from '../services/api';

export default function IndexingHistory() {
  const [repos, setRepos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await repositoriesApi.list();
        setRepos(toArray(res));
      } catch (e) {
        setError(getErrorMessage(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const columns = [
    { title: 'Repository', dataIndex: 'name', key: 'name' },
    { title: 'URL', dataIndex: 'url', key: 'url', ellipsis: true },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (v) => <Tag color={v === 'indexed' || v === 'completed' ? 'green' : v === 'indexing' ? 'blue' : 'default'}>{v || 'unknown'}</Tag>,
    },
    { title: 'Indexed Files', dataIndex: 'indexedFiles', key: 'indexedFiles' },
    { title: 'Last Indexed', dataIndex: 'lastIndexedAt', key: 'lastIndexedAt' },
  ];

  return (
    <div className="page-container">
      <h2 className="page-title">Indexing History</h2>
      {error && <Alert type="error" title={error} style={{ marginBottom: 12 }} showIcon />}
      <Card size="small">
        <Table loading={loading} dataSource={repos} columns={columns} rowKey={(r) => r.id || r._id || r.name} size="small" pagination={{ pageSize: 10 }} />
      </Card>
    </div>
  );
}
