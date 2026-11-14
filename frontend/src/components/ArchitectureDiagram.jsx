import React, { useEffect, useState } from 'react';
import mermaid from 'mermaid';
import { Modal, Button } from 'antd';

mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'strict' });

export default function ArchitectureDiagram({ code, showButton = true }) {
  const [svg, setSvg] = useState('');
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setSvg('');
    const id = `mermaid-${Math.random().toString(36).slice(2)}`;
    mermaid
      .render(id, code)
      .then((result) => {
        if (!cancelled) setSvg(result.svg || result);
      })
      .catch((err) => {
        console.error('Mermaid render error:', err);
        if (!cancelled) setError(err?.message || 'Invalid Mermaid syntax');
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <div className="architecture-diagram">
      {error && <div className="muted">Diagram could not be rendered: {error}</div>}
      {!error && !svg && <div className="muted">Rendering diagram...</div>}
      {!error && svg && (
        <div
          className="architecture-diagram-container"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      )}
      {showButton && !error && svg && (
        <div style={{ marginTop: 8 }}>
          <Button size="small" onClick={() => setModalOpen(true)}>
            View Architecture
          </Button>
        </div>
      )}
      <Modal
        open={modalOpen}
        title="Architecture Diagram"
        onCancel={() => setModalOpen(false)}
        footer={null}
        width="90%"
      >
        <div style={{ overflow: 'auto', maxHeight: '70vh' }}>
          <ArchitectureDiagram code={code} showButton={false} />
        </div>
      </Modal>
    </div>
  );
}