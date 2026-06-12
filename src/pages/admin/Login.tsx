import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export default function Login() {
  const { signIn, signUp, session, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
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
      if (mode === 'signin') await signIn(email, password);
      else await signUp(email, password);
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
          {mode === 'signin'
            ? 'Iniciar sessão de administrador'
            : 'Criar conta de administrador'}
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
          {busy ? '…' : mode === 'signin' ? 'Entrar' : 'Registar'}
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
        >
          {mode === 'signin'
            ? 'Não tem conta? Registe-se'
            : 'Já tem conta? Inicie sessão'}
        </button>
      </form>
    </div>
  );
}
