import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './layouts/MainLayout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Repositories from './pages/Repositories.jsx';
import RepositoryWorkspace from './pages/RepositoryWorkspace.jsx';
import IndexingHistory from './pages/IndexingHistory.jsx';
import Settings from './pages/Settings.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/repositories" element={<Repositories />} />
        <Route path="/repositories/:id" element={<RepositoryWorkspace />} />
        <Route path="/indexing-history" element={<IndexingHistory />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
