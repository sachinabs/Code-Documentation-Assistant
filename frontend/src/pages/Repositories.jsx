import React, { useEffect, useState, useRef } from 'react';
import {
  Card,
  Input,
  Button,
  Form,
  Alert,
  Progress,
  Table,
  Tag,
  Space,
  Descriptions,
  Modal,
} from 'antd';
import { useNavigate } from 'react-router-dom';
import { repositoriesApi, getErrorMessage, toArray } from '../services/api';
import { isValidGitHubUrl } from '../utils/validators';

export default function Repositories() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [current, setCurrent] = useState(null);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [repos, setRepos] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const pollRef = useRef(null);

  const loadList = async () => {
    try {
      setLoadingList(true);
      const res = await repositoriesApi.list();
      setRepos(toArray(res));
    } catch (e) {
      console.error(getErrorMessage(e));
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    loadList();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const pollStatus = (id) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await repositoriesApi.status(id);
        const data = res.data?.data || res.data || {};
        setCurrent((prev) => ({ ...prev, ...data }));
        setProgress(data.progress ?? data.indexingProgress ?? 0);
        setStatusText(data.message || data.status || '');
        const status = data.status;
        if (status === 'indexed' || status === 'completed' || status === 'success') {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setSuccess('Repository indexed successfully.');
          loadList();
          setTimeout(() => navigate(`/repositories/${id}`), 800);
        } else if (status === 'error' || status === 'failed') {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setError(data.message || 'Indexing failed.');
        }
      } catch {
        // keep polling; backend may be temporarily unavailable
      }
    }, 2000);
  };

  const handleAnalyze = async () => {
    setError(null);
    setSuccess(null);
    setCurrent(null);
    setProgress(0);
    setStatusText('');
    const values = form.getFieldsValue();
    const url = (values.url || '').trim();
    if (!isValidGitHubUrl(url)) {
      setError('Please enter a valid GitHub repository URL.');
      return;
    }
    try {
      setSubmitting(true);
      const res = await repositoriesApi.create(url);
      const raw = res.data?.data || res.data || {};
      const data = raw.repository || raw.data || raw;
      const id = data.id || data._id || data.repositoryId;
      setCurrent(data);
      setStatusText('Cloning repository...');
      if (id) pollStatus(id);
      else setSuccess('Repository submitted.');
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  const openRepo = (repo) => {
    const id = repo.id || repo._id;
    if (id) navigate(`/repositories/${id}`);
  };

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
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
      render: (v) => <Tag color={v === 'indexed' || v === 'completed' ? 'green' : v === 'indexing' ? 'blue' : 'default'}>{v || 'unknown'}</Tag>,
    },
    { title: 'Indexed Files', dataIndex: 'indexedFiles', key: 'indexedFiles' },
    {
      title: 'Action',
      key: 'action',
      render: (_, record) => (
        <Space>
          <Button size="small" onClick={() => openRepo(record)}>
            Open
          </Button>
          <Button
            size="small"
            danger
            onClick={() => {
              Modal.confirm({
                title: 'Delete Repository?',
                content:
                  'Are you sure you want to delete this repository? All associated conversations, messages, milestones, indexing records and repository data will also be permanently deleted. This action cannot be undone.',
                okText: 'Delete Repository',
                cancelText: 'Cancel',
                onOk: async () => {
                  try {
                    await repositoriesApi.delete(record.id || record._id);
                    message.success('Repository and associated data deleted successfully');
                    loadList();
                  } catch (e) {
                    message.error(getErrorMessage(e));
                  }
                },
              });
            }}
          >
            Delete
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div className="page-container">
      <h2 className="page-title">Repositories</h2>

      <Card size="small" style={{ marginBottom: 12 }}>
        <Form form={form} layout="vertical">
          <Form.Item
            name="url"
            label="GitHub Repository URL"
            rules={[{ required: true, message: 'Repository URL is required' }]}
          >
            <Input placeholder="https://github.com/username/repository" />
          </Form.Item>
          <Button type="primary" onClick={handleAnalyze} loading={submitting}>
            Analyze Repository
          </Button>
        </Form>
      </Card>

      {error && <Alert type="error" title={error} style={{ marginBottom: 12 }} showIcon closable onClose={() => setError(null)} />}
      {success && <Alert type="success" title={success} style={{ marginBottom: 12 }} showIcon />}

      {(submitting || statusText) && (
        <Card size="small" style={{ marginBottom: 12 }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <div>{statusText || 'Processing...'}</div>
            <Progress percent={progress} status={progress >= 100 ? 'success' : 'active'} />
            {current && (
              <Descriptions size="small" column={2} bordered>
                <Descriptions.Item label="Repository">{current.name || current.repositoryName}</Descriptions.Item>
                <Descriptions.Item label="URL">{current.url}</Descriptions.Item>
                <Descriptions.Item label="Branch">{current.branch || current.defaultBranch}</Descriptions.Item>
                <Descriptions.Item label="Status">{current.status}</Descriptions.Item>
                <Descriptions.Item label="Total Files">{current.totalFiles}</Descriptions.Item>
                <Descriptions.Item label="Indexed Files">{current.indexedFiles}</Descriptions.Item>
                <Descriptions.Item label="Languages">{(current.languages || []).join(', ')}</Descriptions.Item>
                <Descriptions.Item label="Last Indexed">{current.lastIndexedAt}</Descriptions.Item>
              </Descriptions>
            )}
          </Space>
        </Card>
      )}

      <Card title="Existing Repositories" size="small">
        <Table
          loading={loadingList}
          dataSource={repos}
          columns={columns}
          rowKey={(r) => r.id || r._id || r.name}
          size="small"
          pagination={{ pageSize: 10 }}
        />
      </Card>
    </div>
  );
}
