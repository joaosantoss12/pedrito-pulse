import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export default function Login() {
  const { signIn, session, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session && isAdmin) navigate('/admin', { replace: true });
  }, [session, isAdmin, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn(email, password);
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ocorreu um erro');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card card col" onSubmit={submit}>
        <div className="brand">
          PEDRITO <span>SENDPULSE</span>
        </div>
        <p className="muted" style={{ marginTop: -4 }}>
          Iniciar sessão de administrador
        </p>
        <div>
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label>Palavra-passe</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
        </div>
        {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
        <button className="primary" disabled={busy}>
          {busy ? '…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
