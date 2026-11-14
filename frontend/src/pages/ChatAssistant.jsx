import React, { useEffect, useState } from 'react';
import { Card, Select, Input, Button, Spin, Alert, Space, Tag } from 'antd';
import { repositoriesApi, chatApi, getErrorMessage, toArray } from '../services/api';
import MarkdownMessage from '../components/MarkdownMessage.jsx';
import ArchitectureDiagram from '../components/ArchitectureDiagram.jsx';

export default function ChatAssistant() {
  const [repos, setRepos] = useState([]);
  const [repoId, setRepoId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [sources, setSources] = useState([]);
  const [error, setError] = useState(null);
  const [loadingRepos, setLoadingRepos] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setLoadingRepos(true);
        const res = await repositoriesApi.list();
        const list = toArray(res);
        setRepos(list);
        if (list.length > 0) setRepoId(list[0].id || list[0]._id);
      } catch (e) {
        setError(getErrorMessage(e));
      } finally {
        setLoadingRepos(false);
      }
    })();
  }, []);

  const handleSend = async () => {
    const q = input.trim();
    if (!q || !repoId) return;
    setMessages((prev) => [...prev, { role: 'user', content: q }]);
    setInput('');
    setSending(true);
    try {
      const res = await chatApi.send(repoId, q, conversationId);
      const data = res.data?.data || res.data || {};
      setMessages((prev) => [...prev, { role: 'assistant', content: data.answer || data.response || '', diagram: data.diagram || null }]);
      setSources(data.sources || data.references || []);
      if (data.conversationId || data.id) setConversationId(data.conversationId || data.id);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="page-container">
      <h2 className="page-title">Chat Assistant</h2>
      {error && <Alert type="error" title={error} style={{ marginBottom: 12 }} showIcon closable onClose={() => setError(null)} />}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space>
          <span>Repository:</span>
          <Select
            style={{ width: 320 }}
            loading={loadingRepos}
            value={repoId}
            onChange={setRepoId}
            options={repos.map((r) => ({ value: r.id || r._id, label: r.name || r.url }))}
          />
        </Space>
      </Card>
      <Card size="small">
        <div style={{ height: 400, overflow: 'auto', marginBottom: 12 }}>
          {messages.length === 0 && (
            <div className="muted">Hello! I've analyzed your repository. You can ask me about its architecture, APIs, dependencies, database models and implementation.</div>
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
        </div>
        <Space style={{ width: '100%' }}>
          <Input value={input} onChange={(e) => setInput(e.target.value)} onPressEnter={handleSend} placeholder="Ask a question..." style={{ flex: 1 }} />
          <Button type="primary" onClick={handleSend} loading={sending}>
            Send
          </Button>
        </Space>
        {sources.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>Source References</div>
            {sources.map((s, i) => (
              <Tag key={i} style={{ marginBottom: 4 }}>
                {s.file || s.path || s.source}
                {s.startLine || s.start ? ` (Lines ${s.startLine || s.start}–${s.endLine || s.end})` : ''}
              </Tag>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
