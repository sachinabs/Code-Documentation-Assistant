import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from 'antd';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './styles/global.css';
import 'highlight.js/styles/github.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#1890ff',
          borderRadius: 2,
          colorBgLayout: '#f0f2f5',
          fontSize: 14,
        },
        components: {
          Card: { borderRadiusLG: 2 },
          Button: { borderRadius: 2 },
          Input: { borderRadius: 2 },
          Table: { borderRadius: 2 },
        },
      }}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ConfigProvider>
  </React.StrictMode>
);
