import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <div className="center">
      <div className="auth-card card col" style={{ textAlign: 'center' }}>
        <div className="brand">
          PEDRITO <span>SENDPULSE</span>
        </div>
        <p className="muted">
          Crie fluxos de conversa visualmente, partilhe um link e fale com os
          os seus utilizadores em tempo real.
        </p>
        <Link to="/admin">
          <button className="primary" style={{ width: '100%' }}>
            Abrir administração
          </button>
        </Link>
      </div>
    </div>
  );
}
