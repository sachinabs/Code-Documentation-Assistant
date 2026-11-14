import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import CodeBlock from './CodeBlock.jsx';
import ArchitectureDiagram from './ArchitectureDiagram.jsx';

export default function MarkdownMessage({ content }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          pre: ({ children }) => {
            const codeEl = Array.isArray(children) ? children[0] : children;
            const className = codeEl?.props?.className || '';
            const code = (codeEl?.props?.children ?? '')
              .toString()
              .replace(/\n$/, '');
            if (/language-mermaid/.test(className)) {
              return <ArchitectureDiagram code={code} />;
            }
            return <CodeBlock className={className}>{codeEl?.props?.children}</CodeBlock>;
          },
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {content || ''}
      </ReactMarkdown>
    </div>
  );
}