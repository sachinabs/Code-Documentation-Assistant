import React, { useState } from 'react';
import { Card, Form, Input, Button, message as antdMessage } from 'antd';

export default function Settings() {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const handleSave = () => {
    setSaving(true);
    setTimeout(() => {
      antdMessage.success('Settings saved.');
      setSaving(false);
    }, 300);
  };

  return (
    <div className="page-container">
      <h2 className="page-title">Settings</h2>
      <Card size="small" style={{ maxWidth: 520 }}>
        <Form form={form} layout="vertical" initialValues={{ backendUrl: 'http://localhost:5000/api' }}>
          <Form.Item name="backendUrl" label="Backend API Base URL">
            <Input />
          </Form.Item>
          <Form.Item name="theme" label="Theme">
            <Input placeholder="classic" />
          </Form.Item>
          <Button type="primary" onClick={handleSave} loading={saving}>
            Save
          </Button>
        </Form>
      </Card>
    </div>
  );
}
