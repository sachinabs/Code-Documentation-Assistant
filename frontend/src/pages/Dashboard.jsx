import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Table, Tag, Alert, Spin } from 'antd';
import { repositoriesApi, getErrorMessage, toArray } from '../services/api';

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [repos, setRepos] = useState([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const res = await repositoriesApi.list();
        if (mounted) setRepos(toArray(res));
      } catch (e) {
        if (mounted) setError(getErrorMessage(e));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const totalRepos = repos.length;
  const totalFiles = repos.reduce((s, r) => s + (r.indexedFiles || r.totalFiles || 0), 0);
  const languages = new Set();
  repos.forEach((r) => (r.languages || []).forEach((l) => languages.add(typeof l === 'string' ? l : l.name)));
  const lastIndexed = repos
    .map((r) => r.lastIndexedAt || r.indexedAt || r.updatedAt)
    .filter(Boolean)
    .sort()
    .pop();

  const columns = [
    { title: 'Repository', dataIndex: 'name', key: 'name' },
    {
      title: 'URL',
      dataIndex: 'githubUrl',
      key: 'githubUrl',
      ellipsis: true,
      render: (v) => v ? <a href={v} target="_blank" rel="noreferrer">{v}</a> : '-',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (v) => <Tag color={v === 'indexed' ? 'green' : v === 'indexing' ? 'blue' : 'default'}>{v || 'unknown'}</Tag>,
    },
    { title: 'Indexed Files', dataIndex: 'indexedFiles', key: 'indexedFiles' },
    { title: 'Last Indexed', dataIndex: 'lastIndexedAt', key: 'lastIndexedAt' },
  ];

  if (loading) {
    return (
      <div className="page-container">
        <Spin />
      </div>
    );
  }

  return (
    <div className="page-container">
      <h2 className="page-title">Dashboard</h2>
      {error && <Alert type="error" title={error} style={{ marginBottom: 12 }} showIcon />}
      <Row gutter={[12, 12]}>
        <Col xs={24} sm={12} md={6}>
          <Card className="stat-card compact-card">
            <Statistic title="Total Repositories" value={totalRepos} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="stat-card compact-card">
            <Statistic title="Indexed Files" value={totalFiles} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="stat-card compact-card">
            <Statistic title="Supported Languages" value={languages.size} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="stat-card compact-card">
            <Statistic title="Last Indexed" value={lastIndexed ? new Date(lastIndexed).toLocaleDateString() : '-'} />
          </Card>
        </Col>
      </Row>
      <Card title="Recent Repositories" style={{ marginTop: 12 }} size="small">
        <Table
          dataSource={repos}
          columns={columns}
          rowKey={(r) => r.id || r._id || r.name}
          size="small"
          pagination={{ pageSize: 8 }}
        />
      </Card>
    </div>
  );
}
