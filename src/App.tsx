import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './contexts/AuthContext';
import Login from './pages/admin/Login';
import Dashboard from './pages/admin/Dashboard';
import FlowBuilder from './pages/admin/FlowBuilder';
import Inbox from './pages/admin/Inbox';
import Broadcast from './pages/admin/Broadcast';
import AdminLayout from './pages/admin/AdminLayout';
import ChatPage from './pages/chat/ChatPage';
import Landing from './pages/Landing';

function RequireAdmin({ children }: { children: ReactNode }) {
  const { session, isAdmin, loading } = useAuth();
  if (loading) return <div className="center muted">A carregar…</div>;
  if (!session || !isAdmin) return <Navigate to="/admin/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />

      {/* Visitor chat opened from a shared link */}
      <Route path="/c/:slug" element={<ChatPage />} />

      {/* Admin */}
      <Route path="/admin/login" element={<Login />} />
      <Route
        element={
          <RequireAdmin>
            <AdminLayout />
          </RequireAdmin>
        }
      >
        <Route path="/admin" element={<Dashboard />} />
        <Route path="/admin/flows/:flowId" element={<FlowBuilder />} />
        <Route path="/admin/inbox" element={<Inbox />} />
        <Route path="/admin/inbox/:conversationId" element={<Inbox />} />
        <Route path="/admin/broadcast" element={<Broadcast />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
