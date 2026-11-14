import React, { useState } from 'react';
import { Layout, Menu, Breadcrumb, Avatar, Dropdown, Space, Tag } from 'antd';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  DashboardOutlined,
  FolderOutlined,
  HistoryOutlined,
  SettingOutlined,
} from '@ant-design/icons';

const { Header, Sider, Content } = Layout;

const menuItems = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: 'Dashboard' },
  { key: '/repositories', icon: <FolderOutlined />, label: 'Repositories' },
  { key: '/indexing-history', icon: <HistoryOutlined />, label: 'Indexing History' },
  { key: '/settings', icon: <SettingOutlined />, label: 'Settings' },
];

export default function MainLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const selectedKey = menuItems.find((m) => location.pathname.startsWith(m.key))?.key || '/dashboard';

  const breadcrumbName = menuItems.find((m) => m.key === selectedKey)?.label || 'Dashboard';

  return (
    <Layout>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        width={200}
        style={{ background: '#fff', borderRight: '1px solid #e8e8e8' }}
      >
        <div
          style={{
            height: 48,
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? 0 : '0 16px',
            borderBottom: '1px solid #e8e8e8',
            fontWeight: 600,
            fontSize: 16,
            color: '#1890ff',
          }}
        >
          {collapsed ? 'RM' : 'RepoMind AI'}
        </div>
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ borderRight: 0 }}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: '#fff',
            padding: '0 16px',
            borderBottom: '1px solid #e8e8e8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: 48,
          }}
        >
          <Breadcrumb
            items={[
              { title: 'RepoMind AI' },
              { title: breadcrumbName },
            ]}
          />
          <Space>
            <Tag color="blue">RepoMind AI</Tag>
          </Space>
        </Header>
        <Content style={{ background: '#f0f2f5', minHeight: 'calc(100vh - 48px)' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
