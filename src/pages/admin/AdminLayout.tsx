import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export default function AdminLayout() {
  const { signOut, session } = useAuth();
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('sidebar-collapsed') === '1',
  );

  function toggle() {
    setCollapsed((c) => {
      localStorage.setItem('sidebar-collapsed', c ? '0' : '1');
      return !c;
    });
  }

  return (
    <div
      className="admin"
      style={{ gridTemplateColumns: collapsed ? '52px 1fr' : '220px 1fr' }}
    >
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
        <div className="sb-header">
          {!collapsed && (
            <div className="brand" style={{ fontSize: 16 }}>
              PEDRITO <span>SP</span>
            </div>
          )}
          <button
            className="ghost sb-toggle"
            onClick={toggle}
            title={collapsed ? 'Expandir menu' : 'Fechar menu'}
          >
            {collapsed ? '☰' : '«'}
          </button>
        </div>

        {!collapsed && (
          <>
            <nav className="nav">
              <NavLink to="/admin" end>
                Fluxos
              </NavLink>
              <NavLink to="/admin/inbox">Caixa de entrada</NavLink>
              <NavLink to="/admin/broadcast">Campanhas</NavLink>
            </nav>
            <div style={{ marginTop: 'auto' }} className="col">
              <div className="muted" style={{ fontSize: 12 }}>
                {session?.user?.email}
              </div>
              <button className="ghost" onClick={() => signOut()}>
                Terminar sessão
              </button>
            </div>
          </>
        )}
      </aside>
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
