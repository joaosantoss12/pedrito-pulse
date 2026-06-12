import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Flow } from '../../types/database';
import type { FlowNode } from '../../types/flow';

type Status = 'any' | 'active' | 'completed';

function nodeLabel(n: FlowNode): string {
  const d = n.data as { text?: string; caption?: string };
  const text = (d.text || d.caption || '').toString().slice(0, 32);
  const kind: Record<string, string> = {
    start: 'Início',
    message: 'Mensagem',
    media: 'Multimédia',
    delay: 'Esperar',
    wait_input: 'Aguardar resposta',
    choice: 'Escolha',
    end: 'Fim',
  };
  return `${kind[n.type ?? ''] ?? n.type}${text ? ` — ${text}` : ''}`;
}

export default function Broadcast() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [flowId, setFlowId] = useState('');
  const [nodeId, setNodeId] = useState(''); // '' = any step
  const [status, setStatus] = useState<Status>('any');
  const [title, setTitle] = useState('PEDRITO SENDPULSE');
  const [message, setMessage] = useState('');
  const [alsoSendMessage, setAlsoSendMessage] = useState(true);
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('flows')
      .select('*')
      .order('name')
      .then(({ data }) => setFlows((data ?? []) as Flow[]));
  }, []);

  const selectedFlow = flows.find((f) => f.id === flowId) ?? null;
  const nodes = useMemo<FlowNode[]>(
    () => (selectedFlow?.definition?.nodes ?? []) as FlowNode[],
    [selectedFlow],
  );

  // Live count of conversations that currently match the target.
  useEffect(() => {
    if (!flowId) {
      setMatchCount(null);
      return;
    }
    let cancelled = false;
    (async () => {
      let q = supabase
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('flow_id', flowId);
      if (nodeId) q = q.eq('current_node_id', nodeId);
      if (status !== 'any') q = q.eq('status', status);
      const { count } = await q;
      if (!cancelled) setMatchCount(count ?? 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [flowId, nodeId, status]);

  function showToast(m: string) {
    setToast(m);
    window.setTimeout(() => setToast(null), 4000);
  }

  async function send() {
    if (!flowId || !message.trim()) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('broadcast', {
        body: {
          flowId,
          nodeId: nodeId || null,
          status,
          title: title.trim() || 'PEDRITO SENDPULSE',
          message: message.trim(),
          alsoSendMessage,
          appUrl: window.location.origin,
        },
      });
      if (error) throw error;
      const r = data as { matched: number; sent: number; failed: number };
      showToast(
        `✅ ${r.matched} conversa(s) • ${r.sent} notificação(ões) enviada(s)` +
          (r.failed ? ` • ${r.failed} falha(s)` : ''),
      );
      setMessage('');
    } catch (err) {
      showToast(
        '❌ ' +
          (err instanceof Error ? err.message : 'Falha ao enviar') +
          ' — a função "broadcast" está implementada?',
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>Campanhas / Notificações</h2>
      </div>
      <div className="content">
        <div className="card col" style={{ maxWidth: 620 }}>
          <p className="muted" style={{ marginTop: 0 }}>
            Envie uma notificação (e, opcionalmente, uma mensagem no chat) a
            todos os utilizadores de um fluxo — pode segmentar por passo ou
            estado.
          </p>

          <div>
            <label>Fluxo</label>
            <select value={flowId} onChange={(e) => setFlowId(e.target.value)}>
              <option value="">— Escolher fluxo —</option>
              {flows.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          <div className="row" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <label>Passo (current_node_id)</label>
              <select
                value={nodeId}
                onChange={(e) => setNodeId(e.target.value)}
                disabled={!flowId}
              >
                <option value="">Qualquer passo</option>
                {nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {nodeLabel(n)}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label>Estado</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as Status)}
                disabled={!flowId}
              >
                <option value="any">Qualquer</option>
                <option value="active">Em fluxo (ativo)</option>
                <option value="completed">Concluído</option>
              </select>
            </div>
          </div>

          {flowId && (
            <div className="badge" style={{ alignSelf: 'flex-start' }}>
              🎯 {matchCount ?? '…'} conversa(s) correspondem
            </div>
          )}

          <div>
            <label>Título da notificação</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label>Mensagem</label>
            <textarea
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="ex.: 👋 Ainda está aí? Continue de onde parou."
            />
          </div>

          <label className="row" style={{ gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={alsoSendMessage}
              onChange={(e) => setAlsoSendMessage(e.target.checked)}
            />
            <span>Também enviar como mensagem no chat (fica guardada)</span>
          </label>

          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button
              className="primary"
              disabled={sending || !flowId || !message.trim() || !matchCount}
              onClick={send}
            >
              {sending ? 'A enviar…' : `Enviar para ${matchCount ?? 0}`}
            </button>
          </div>
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
