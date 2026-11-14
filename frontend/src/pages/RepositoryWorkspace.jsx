import React, { useEffect, useState, useRef } from 'react';
import {
  Layout,
  Tree,
  Input,
  Button,
  Select,
  Modal,
  Drawer,
  Table,
  List,
  Tag,
  Spin,
  Alert,
  Typography,
  Descriptions,
  message,
  Dropdown,
} from 'antd';
import { useParams } from 'react-router-dom';
import { repositoriesApi, chatApi, getErrorMessage, toArray } from '../services/api';
import api from '../services/api';
import { buildFileTree } from '../utils/tree';
import { EllipsisOutlined } from '@ant-design/icons';
import MarkdownMessage from '../components/MarkdownMessage.jsx';
import ArchitectureDiagram from '../components/ArchitectureDiagram.jsx';

const { Sider, Content } = Layout;

export default function RepositoryWorkspace() {
  const { id } = useParams();
  const [repo, setRepo] = useState(null);
  const [treeData, setTreeData] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  const [fileViewer, setFileViewer] = useState({ open: false, path: '', content: '', lines: null });
  const [loadingFile, setLoadingFile] = useState(false);

  const [messages, setMessages] = useState([]);
  const messagesContainerRef = useRef(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [convLoading, setConvLoading] = useState(false);
  const [renameModal, setRenameModal] = useState({ open: false, id: null });
  const [renameValue, setRenameValue] = useState('');
  const [apiDrawerOpen, setApiDrawerOpen] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [apis, setApis] = useState([]);
  const [milestoneDrawerOpen, setMilestoneDrawerOpen] = useState(false);
  const [milestones, setMilestones] = useState([]);
  const [generatingMilestone, setGeneratingMilestone] = useState(false);
  const [generatedMilestone, setGeneratedMilestone] = useState(null);

  const [sources, setSources] = useState([]);
  const [error, setError] = useState(null);

  const loadConversations = async (repoId) => {
    setConvLoading(true);
    try {
      const cres = await chatApi.conversations(repoId || id);
      const convs = toArray(cres);
      setConversations(convs);
      if (convs.length > 0 && !conversationId) {
        const last = convs[convs.length - 1];
        const cid = last.id || last._id || last.conversationId;
        setConversationId(cid);
        await loadMessages(cid);
      }
    } finally {
      setConvLoading(false);
    }
  };

  const loadMessages = async (cid) => {
    if (!cid) return;
    try {
      const res = await api.get(`/conversations/${cid}/messages`);
      const msgs = toArray(res);
      setMessages(msgs.map((m) => ({ role: m.role, content: m.content })));
      setSources([]);
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom || messages.length <= 2) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, sending]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const res = await repositoriesApi.get(id);
        const raw = res.data?.data || res.data || {};
        setRepo(raw.repository || raw.data || raw);
      } catch (e) {
        setError(getErrorMessage(e));
      }
      try {
        setLoadingFiles(true);
        const fres = await repositoriesApi.files(id);
        const list = toArray(fres);
        setTreeData(buildFileTree(list));
      } catch (e) {
        setError(getErrorMessage(e));
      } finally {
        setLoadingFiles(false);
      }
      try {
        await loadConversations(id);
      } catch {
        // ignore
      }
    })();
  }, [id]);

  const openFile = async (path, lines = null) => {
    if (!path) {
      message.warning('No file path available for this reference.');
      return;
    }
    try {
      setLoadingFile(true);
      setFileViewer({ open: true, path, content: '', lines });
      const res = await repositoriesApi.fileContent(id, path);
      const raw = res.data?.data || res.data || {};
      const content =
        typeof raw === 'string'
          ? raw
          : raw.content || raw.code || raw.text || raw.file?.content || '';
      setFileViewer({ open: true, path, content, lines });
    } catch (e) {
      message.error(getErrorMessage(e));
      setFileViewer({ open: false, path: '', content: '', lines: null });
    } finally {
      setLoadingFile(false);
    }
  };

  const handleSend = async () => {
    const q = input.trim();
    if (!q) return;
    const userMsg = { role: 'user', content: q };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);
    setError(null);
    try {
      const res = await chatApi.send(id, q, conversationId);
      const data = res.data?.data || res.data || {};
      const answer = data.answer || data.response || data.message || '';
      const newSources = data.sources || data.references || [];
      const newConvId = data.conversationId || data.id || conversationId;
      const diagram = data.diagram || null;
      if (newConvId) setConversationId(newConvId);
      setMessages((prev) => [...prev, { role: 'assistant', content: answer, diagram }]);
      setSources(newSources);
    } catch (e) {
      setError(getErrorMessage(e));
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Failed to get a response.' }]);
    } finally {
      setSending(false);
    }
  };

  const clearConversation = () => {
    setMessages([]);
    setSources([]);
    setConversationId(null);
  };

  const suggested = [
    'Explain the project architecture.',
    'How does authentication work?',
    'List all API endpoints.',
    'Explain the database schema.',
    'Where is the user registration implemented?',
  ];

  return (
    <div className="page-container" style={{ padding: 0, height: 'calc(100vh - 48px)', overflow: 'hidden' }}>
      {error && <Alert type="error" title={error} style={{ margin: 12 }} showIcon closable onClose={() => setError(null)} />}
      <Layout style={{ height: '100%', minHeight: 0, background: '#fff' }}>
        <Sider
          width={280}
          style={{ background: '#fff', borderRight: '1px solid #e8e8e8', display: 'flex', flexDirection: 'column', minHeight: 0 }}
        >
          <div style={{ padding: '8px 12px', borderBottom: '1px solid #e8e8e8', fontWeight: 600, fontSize: 13, flexShrink: 0 }}>
            File Explorer
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {loadingFiles ? (
              <Spin style={{ margin: 16 }} />
            ) : (
              <Tree
                className="file-tree"
                treeData={treeData}
                onSelect={(keys, info) => {
                  if (keys && keys.length && info?.node?.isLeaf) {
                    openFile(keys[0]);
                  }
                }}
                style={{ padding: 8 }}
              />
            )}
          </div>
          <div style={{ borderTop: '1px solid #e8e8e8', padding: '8px 12px', fontWeight: 600, fontSize: 13, flexShrink: 0 }}>
            Conversations
          </div>
          <div style={{ flexShrink: 0, padding: 8, display: 'flex', gap: 4 }}>
            <Button size="small" onClick={() => { setConversationId(null); setMessages([]); setSources([]); }}>New</Button>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 8px 8px' }}>
            {conversations.map((c) => {
              const cid = c.id || c._id || c.conversationId;
              return (
                <div
                  key={cid}
                  onClick={() => { setConversationId(cid); loadMessages(cid); }}
                  style={{
                    padding: '4px 8px',
                    marginBottom: 4,
                    cursor: 'pointer',
                    background: cid === conversationId ? '#e6f7ff' : 'transparent',
                    border: '1px solid #e8e8e8',
                    fontSize: 12,
                  }}
                >
                  {c.title || `Chat ${String(cid).slice(-4)}`}
                </div>
              );
            })}
          </div>
        </Sider>
        <Content style={{ display: 'flex', flexDirection: 'column', background: '#fff', minHeight: 0, overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px', borderBottom: '1px solid #e8e8e8', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{repo?.name || 'Repository Workspace'}</span>
            {conversationId && conversations.find((c) => (c.id || c._id || c.conversationId) === conversationId)?.title && (
              <span className="muted">/ {conversations.find((c) => (c.id || c._id || c.conversationId) === conversationId)?.title}</span>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <Button size="small" onClick={() => { setConversationId(null); setMessages([]); setSources([]); }}>New Chat</Button>
              {conversationId && (
                <Button size="small" onClick={() => { setRenameModal({ open: true, id: conversationId }); setRenameValue(''); }}>Rename</Button>
              )}
              <Button size="small" onClick={async () => {
                try {
                  const res = await repositoriesApi.apis(id);
                  setApis(res.data?.apis || toArray(res));
                  setApiDrawerOpen(true);
                } catch (e) { message.error(getErrorMessage(e)); }
              }}>APIs</Button>
              <Button size="small" onClick={async () => {
                try {
                  const res = await api.get(`/repositories/${id}/milestones`);
                  setMilestones(toArray(res));
                  setMilestoneDrawerOpen(true);
                } catch (e) { message.error(getErrorMessage(e)); }
              }}>Milestones</Button>
              <Button size="small" onClick={async () => {
                try {
                  await repositoriesApi.reindex(id);
                  message.success('Re-indexing started');
                } catch (e) { message.error(getErrorMessage(e)); }
              }}>Re-index</Button>
              <Dropdown
                menu={{
                  items: [
                    { key: 'deleteRepo', label: 'Delete Repository', danger: true },
                  ],
                  onClick: ({ key }) => {
                    if (key === 'deleteRepo') {
                      Modal.confirm({
                        title: 'Delete repository?',
                        content: 'This will remove the repository and its data.',
                        onOk: async () => {
                          try {
                            await repositoriesApi.delete(id);
                            message.success('Deleted');
                            window.location.href = '/repositories';
                          } catch (e) { message.error(getErrorMessage(e)); }
                        },
                      });
                    }
                  },
                }}
              >
                <Button size="small" icon={<EllipsisOutlined />} />
              </Dropdown>
              <Button size="small" onClick={() => setRightCollapsed((v) => !v)}>
                {rightCollapsed ? 'Show Info' : 'Hide Info'}
              </Button>
            </div>
          </div>
          <div ref={messagesContainerRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 12 }}>
            {messages.length === 0 && (
              <div style={{ color: '#8c8c8c', fontSize: 13, marginBottom: 12 }}>
                Hello! I've analyzed your repository. You can ask me about its architecture, APIs, dependencies, database models and implementation.
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className="chat-message" style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div className={`chat-bubble ${m.role}`}>
                  {m.role === 'assistant' ? (
                    <>
                      <MarkdownMessage content={m.content} />
                      {m.diagram && m.diagram.code && (
                        <div style={{ marginTop: 8 }}>
                          <ArchitectureDiagram code={m.diagram.code} />
                        </div>
                      )}
                    </>
                  ) : (
                    m.content
                  )}
                </div>
              </div>
            ))}
            {sending && <Spin size="small" />}
            {messages.length === 0 && (
              <div style={{ marginTop: 12 }}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>Suggested questions:</Typography.Text>
                <div style={{ marginTop: 4 }}>
                  {suggested.map((q) => (
                    <Tag key={q} style={{ cursor: 'pointer', marginBottom: 4 }} onClick={() => setInput(q)}>
                      {q}
                    </Tag>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div style={{ padding: 12, borderTop: '1px solid #e8e8e8', display: 'flex', gap: 8, flexShrink: 0 }}>
            <Input.TextArea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              autoSize={{ minRows: 1, maxRows: 4 }}
              placeholder="Ask a question about the codebase..."
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              style={{ resize: 'none' }}
            />
            <Button type="primary" onClick={handleSend} loading={sending}>
              Send
            </Button>
            <Button onClick={clearConversation}>Clear</Button>
          </div>
        </Content>
        {!rightCollapsed && (
        <Sider
          width={280}
          style={{ background: '#fff', borderLeft: '1px solid #e8e8e8', overflow: 'auto' }}
        >
          <div style={{ padding: '8px 12px', borderBottom: '1px solid #e8e8e8', fontWeight: 600, fontSize: 13 }}>
            Source References
          </div>
          <div style={{ padding: 8 }}>
            {sources.length === 0 ? (
              <div className="muted">No source references available.</div>
            ) : (
              <List
                size="small"
                dataSource={sources}
                renderItem={(s, idx) => {
                  const path = s.filePath || s.file || s.path || s.source || s.filename;
                  const fileName = path ? path.split('/').pop() : '';
                  const start = s.startLine || s.start || s.lineStart;
                  const end = s.endLine || s.end || s.lineEnd;
                  return (
                    <List.Item
                      style={{ cursor: 'pointer' }}
                      onClick={() => openFile(path, start && end ? [start, end] : null)}
                    >
                      <div style={{ fontSize: 12 }}>
                        <div style={{ fontWeight: 600 }}>{idx + 1}. {fileName}</div>
                        <div className="muted">{path}</div>
                        {start && end && <div className="muted">Lines {start}–{end}</div>}
                      </div>
                    </List.Item>
                  );
                }}
              />
            )}
          </div>
          {repo && (
            <div style={{ padding: 8, borderTop: '1px solid #e8e8e8' }}>
              <Descriptions size="small" column={1} bordered>
                <Descriptions.Item label="Branch">{repo.branch || repo.defaultBranch}</Descriptions.Item>
                <Descriptions.Item label="Languages">
                {(repo.languages || []).length === 0 ? (
                  <span className="muted">No programming languages detected.</span>
                ) : (
                  <div style={{ width: '100%' }}>
                    {(repo.languages || []).map((l) => (
                      <div key={l.name} style={{ marginBottom: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                          <span>{l.name}</span>
                          <span className="muted">{l.files} files · {l.percentage}%</span>
                        </div>
                        <div style={{ height: 6, background: '#f0f0f0', marginTop: 2 }}>
                          <div style={{ width: `${l.percentage}%`, height: '100%', background: '#1890ff' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Descriptions.Item>
                <Descriptions.Item label="Total Files">{repo.totalFiles}</Descriptions.Item>
                <Descriptions.Item label="Indexed">{repo.indexedFiles}</Descriptions.Item>
              </Descriptions>
            </div>
          )}
        </Sider>
        )}
      </Layout>

      <Modal
        open={!!generatedMilestone}
        title="Review AI Milestone"
        onCancel={() => setGeneratedMilestone(null)}
        onOk={async () => {
          try {
            await api.post(`/repositories/${id}/milestones`, {
              title: generatedMilestone.title,
              summary: generatedMilestone.summary,
              decisions: generatedMilestone.decisions,
              technologies: generatedMilestone.technologies,
              keyFiles: generatedMilestone.keyFiles,
              completedWork: generatedMilestone.completedWork,
              pendingWork: generatedMilestone.pendingWork,
              recommendations: generatedMilestone.recommendations,
              conversationId,
            });
            const res = await api.get(`/repositories/${id}/milestones`);
            setMilestones(toArray(res));
            setGeneratedMilestone(null);
            message.success('Milestone saved');
          } catch (e) {
            message.error(getErrorMessage(e));
          }
        }}
        width={720}
      >
        {generatedMilestone && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Input value={generatedMilestone.title} onChange={(e) => setGeneratedMilestone({ ...generatedMilestone, title: e.target.value })} placeholder="Title" />
            <Input.TextArea value={generatedMilestone.summary} onChange={(e) => setGeneratedMilestone({ ...generatedMilestone, summary: e.target.value })} placeholder="Summary" autoSize={{ minRows: 3 }} />
            <Input.TextArea value={(generatedMilestone.decisions || []).join('\n')} onChange={(e) => setGeneratedMilestone({ ...generatedMilestone, decisions: e.target.value.split('\n').filter(Boolean) })} placeholder="Decisions (one per line)" autoSize={{ minRows: 2 }} />
            <Input.TextArea value={(generatedMilestone.technologies || []).join('\n')} onChange={(e) => setGeneratedMilestone({ ...generatedMilestone, technologies: e.target.value.split('\n').filter(Boolean) })} placeholder="Technologies (one per line)" autoSize={{ minRows: 2 }} />
            <Input.TextArea value={(generatedMilestone.keyFiles || []).join('\n')} onChange={(e) => setGeneratedMilestone({ ...generatedMilestone, keyFiles: e.target.value.split('\n').filter(Boolean) })} placeholder="Key files (one per line)" autoSize={{ minRows: 2 }} />
            <Input.TextArea value={(generatedMilestone.completedWork || []).join('\n')} onChange={(e) => setGeneratedMilestone({ ...generatedMilestone, completedWork: e.target.value.split('\n').filter(Boolean) })} placeholder="Completed work (one per line)" autoSize={{ minRows: 2 }} />
            <Input.TextArea value={(generatedMilestone.pendingWork || []).join('\n')} onChange={(e) => setGeneratedMilestone({ ...generatedMilestone, pendingWork: e.target.value.split('\n').filter(Boolean) })} placeholder="Pending work (one per line)" autoSize={{ minRows: 2 }} />
            <Input.TextArea value={(generatedMilestone.recommendations || []).join('\n')} onChange={(e) => setGeneratedMilestone({ ...generatedMilestone, recommendations: e.target.value.split('\n').filter(Boolean) })} placeholder="Recommendations (one per line)" autoSize={{ minRows: 2 }} />
          </div>
        )}
      </Modal>

      <Drawer
        open={milestoneDrawerOpen}
        title="Milestones"
        onClose={() => setMilestoneDrawerOpen(false)}
        width={720}
      >
        <div style={{ marginBottom: 12 }}>
          <Button size="small" type="primary" loading={generatingMilestone} onClick={async () => {
            if (!conversationId) {
              message.warning('Open a conversation first.');
              return;
            }
            setGeneratingMilestone(true);
            try {
              const res = await api.post(`/repositories/${id}/milestones/generate`, { conversationId });
              setGeneratedMilestone(res.data);
            } catch (e) {
              message.error(getErrorMessage(e));
            } finally {
              setGeneratingMilestone(false);
            }
          }}>New AI Milestone</Button>
        </div>
        <List
          size="small"
          dataSource={milestones}
          renderItem={(m) => (
            <List.Item
              actions={[
                <Button size="small" danger onClick={async () => {
                  try {
                    await api.delete(`/milestones/${m.id || m._id}`);
                    const res = await api.get(`/repositories/${id}/milestones`);
                    setMilestones(toArray(res));
                  } catch (e) { message.error(getErrorMessage(e)); }
                }}>Delete</Button>,
              ]}
            >
              <List.Item.Meta title={m.title} description={m.summary} />
            </List.Item>
          )}
        />
      </Drawer>

      <Drawer
        open={apiDrawerOpen}
        title="API Explorer"
        onClose={() => setApiDrawerOpen(false)}
        width={720}
      >
        <Table
          size="small"
          dataSource={apis}
          rowKey={(r, i) => i}
          columns={[
            { title: 'Method', dataIndex: 'method', key: 'method' },
            { title: 'Path', dataIndex: 'path', key: 'path' },
            { title: 'File', dataIndex: 'file', key: 'file' },
            { title: 'Line', dataIndex: 'line', key: 'line' },
            { title: 'Framework', dataIndex: 'framework', key: 'framework' },
          ]}
          pagination={{ pageSize: 20 }}
        />
      </Drawer>

      <Modal
        open={renameModal.open}
        title="Rename conversation"
        onOk={async () => {
          try {
            await api.put(`/conversations/${renameModal.id}`, { title: renameValue });
            setRenameModal({ open: false, id: null });
            await loadConversations(id);
          } catch (e) {
            message.error(getErrorMessage(e));
          }
        }}
        onCancel={() => setRenameModal({ open: false, id: null })}
      >
        <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} placeholder="Conversation title" />
      </Modal>

      <Modal
        open={fileViewer.open}
        title={fileViewer.path}
        onCancel={() => setFileViewer({ open: false, path: '', content: '', lines: null })}
        footer={null}
        width={800}
      >
        {loadingFile ? (
          <Spin />
        ) : (
          <pre className="source-code">
            {fileViewer.lines && Array.isArray(fileViewer.lines)
              ? highlightLines(fileViewer.content, fileViewer.lines)
              : fileViewer.content}
          </pre>
        )}
      </Modal>
    </div>
  );
}

function highlightLines(content, lines) {
  const arr = content.split('\n');
  const [start, end] = lines;
  return arr
    .map((line, i) => {
      const n = i + 1;
      const marker = n >= start && n <= end ? '>' : ' ';
      return `${marker} ${String(n).padStart(4)}  ${line}`;
    })
    .join('\n');
}
