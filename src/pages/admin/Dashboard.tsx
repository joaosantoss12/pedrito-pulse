import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Flow, FlowLink } from '../../types/database';

const STARTER = {
  nodes: [
    {
      id: 'start',
      type: 'start',
      position: { x: 80, y: 80 },
      data: { label: 'Start' },
    },
    {
      id: 'welcome',
      type: 'message',
      position: { x: 80, y: 220 },
      data: { text: 'Olá! 👋 Bem-vindo. Como podemos ajudar hoje?' },
    },
  ],
  edges: [{ id: 'e-start-welcome', source: 'start', target: 'welcome' }],
};

function randomSlug() {
  return Math.random().toString(36).slice(2, 8);
}

const COLORS = [
  '#6d6afc',
  '#4f8cff',
  '#48c9b0',
  '#58d68d',
  '#f5b041',
  '#e59866',
  '#af7ac5',
  '#e5534b',
];

export default function Dashboard() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [flows, setFlows] = useState<Flow[]>([]);
  const [links, setLinks] = useState<Record<string, FlowLink>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Flow | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  async function saveName(flow: Flow) {
    const name = editName.trim();
    setEditingId(null);
    if (!name || name === flow.name) return;
    setFlows((fs) =>
      fs.map((f) => (f.id === flow.id ? { ...f, name } : f)),
    );
    await supabase.from('flows').update({ name }).eq('id', flow.id);
  }

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2600);
  }

  async function load() {
    setLoading(true);
    const { data: flowRows } = await supabase
      .from('flows')
      .select('*')
      .order('created_at', { ascending: false });
    const { data: linkRows } = await supabase.from('flow_links').select('*');
    const map: Record<string, FlowLink> = {};
    (linkRows ?? []).forEach((l) => {
      map[l.flow_id] = l as FlowLink;
    });

    // How many visitors started each flow (one conversation = one visitor).
    const { data: convRows } = await supabase
      .from('conversations')
      .select('flow_id');
    const tally: Record<string, number> = {};
    (convRows ?? []).forEach((c) => {
      if (c.flow_id) tally[c.flow_id] = (tally[c.flow_id] ?? 0) + 1;
    });

    setFlows((flowRows ?? []) as Flow[]);
    setLinks(map);
    setCounts(tally);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setNewName('Fluxo sem título');
    setCreating(true);
  }

  async function confirmCreate() {
    const name = newName.trim();
    if (!name) return;
    const { data, error } = await supabase
      .from('flows')
      .insert({
        name,
        definition: STARTER,
        created_by: session?.user?.id ?? null,
      })
      .select()
      .single();
    if (error) {
      alert(error.message);
      return;
    }
    setCreating(false);
    navigate(`/admin/flows/${data.id}`);
  }

  async function duplicateFlow(flow: Flow) {
    // Copy-paste a flow: clones name + node graph into a new draft.
    const { data, error } = await supabase
      .from('flows')
      .insert({
        name: `${flow.name} (cópia)`,
        definition: flow.definition,
        published: false,
        created_by: session?.user?.id ?? null,
      })
      .select()
      .single();
    if (error) {
      alert(error.message);
      return;
    }
    setFlows((fs) => [data as Flow, ...fs]);
  }

  async function setColor(flow: Flow, color: string | null) {
    setFlows((fs) =>
      fs.map((f) => (f.id === flow.id ? { ...f, color } : f)),
    );
    await supabase.from('flows').update({ color }).eq('id', flow.id);
  }

  async function togglePublish(flow: Flow) {
    await supabase
      .from('flows')
      .update({ published: !flow.published })
      .eq('id', flow.id);
    load();
  }

  async function ensureLink(flow: Flow) {
    if (links[flow.id]) return links[flow.id];
    const { data, error } = await supabase
      .from('flow_links')
      .insert({ flow_id: flow.id, slug: randomSlug() })
      .select()
      .single();
    if (error) {
      alert(error.message);
      return null;
    }
    setLinks((m) => ({ ...m, [flow.id]: data as FlowLink }));
    return data as FlowLink;
  }

  async function copyLink(flow: Flow) {
    const link = await ensureLink(flow);
    if (!link) return;
    const url = `${window.location.origin}/c/${link.slug}`;
    await navigator.clipboard.writeText(url);
    showToast('🔗 Link copiado para a área de transferência');
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    await supabase.from('flows').delete().eq('id', pendingDelete.id);
    setPendingDelete(null);
    showToast('Fluxo eliminado');
    load();
  }

  return (
    <>
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>Fluxos</h2>
        <button className="primary" onClick={openCreate}>
          + Novo fluxo
        </button>
      </div>
      <div className="content">
        {loading ? (
          <p className="muted">A carregar…</p>
        ) : flows.length === 0 ? (
          <p className="muted">Ainda não há fluxos. Crie o primeiro.</p>
        ) : (
          <div className="grid">
            {flows.map((flow) => (
              <div key={flow.id} className="card col">
                <div
                  className="flow-color-bar"
                  style={{ background: flow.color ?? 'var(--border)' }}
                />
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  {editingId === flow.id ? (
                    <input
                      className="flow-name-input"
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={() => saveName(flow)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveName(flow);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                    />
                  ) : (
                    <strong
                      className="flow-name"
                      title="Clique para editar o nome"
                      onClick={() => {
                        setEditingId(flow.id);
                        setEditName(flow.name);
                      }}
                    >
                      {flow.name}
                    </strong>
                  )}
                  <span className={`badge ${flow.published ? 'live' : ''}`}>
                    {flow.published ? 'publicado' : 'rascunho'}
                  </span>
                </div>
                <div className="row" style={{ gap: 14, fontSize: 12 }}>
                  <span className="muted">
                    {(flow.definition?.nodes?.length ?? 0)} nós
                  </span>
                  <span className="muted">
                    👤 {counts[flow.id] ?? 0} iniciaram
                  </span>
                </div>
                <div className="row swatches" style={{ flexWrap: 'wrap' }}>
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      className={`swatch ${flow.color === c ? 'active' : ''}`}
                      style={{ background: c }}
                      title="Definir cor"
                      onClick={() => setColor(flow, c)}
                    />
                  ))}
                  <button
                    className="swatch none"
                    title="Sem cor"
                    onClick={() => setColor(flow, null)}
                  >
                    ✕
                  </button>
                </div>
                <div className="btn-grid-4">
                  <button
                    onClick={() => navigate(`/admin/flows/${flow.id}`)}
                  >
                    Editar
                  </button>
                  <button className="ghost" onClick={() => togglePublish(flow)}>
                    {flow.published ? 'Despublicar' : 'Publicar'}
                  </button>
                  <button
                    className="ghost"
                    onClick={() => duplicateFlow(flow)}
                    title="Copiar para um novo fluxo"
                  >
                    ⧉ Duplicar
                  </button>
                  <button
                    className="ghost"
                    onClick={() => copyLink(flow)}
                    disabled={!flow.published}
                    title={
                      flow.published
                        ? 'Copiar link de partilha'
                        : 'Publique o fluxo primeiro'
                    }
                  >
                    🔗 Link
                  </button>
                </div>
                <button
                  className="danger"
                  style={{ width: '100%' }}
                  onClick={() => setPendingDelete(flow)}
                >
                  Eliminar
                </button>
                {links[flow.id] && (
                  <code style={{ fontSize: 11, color: 'var(--muted)' }}>
                    /c/{links[flow.id].slug}
                  </code>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {creating && (
        <div className="modal-overlay" onClick={() => setCreating(false)}>
          <div className="modal card col" onClick={(e) => e.stopPropagation()}>
            <strong>Novo fluxo</strong>
            <div>
              <label>Nome do fluxo</label>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmCreate();
                  if (e.key === 'Escape') setCreating(false);
                }}
              />
            </div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="ghost" onClick={() => setCreating(false)}>
                Cancelar
              </button>
              <button
                className="primary"
                onClick={confirmCreate}
                disabled={!newName.trim()}
              >
                Criar
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDelete && (
        <div className="modal-overlay" onClick={() => setPendingDelete(null)}>
          <div className="modal card col" onClick={(e) => e.stopPropagation()}>
            <strong>Eliminar fluxo</strong>
            <p className="muted" style={{ margin: 0 }}>
              Tem a certeza que quer eliminar “{pendingDelete.name}”? Os links
              associados também são removidos. Esta ação é irreversível.
            </p>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="ghost" onClick={() => setPendingDelete(null)}>
                Cancelar
              </button>
              <button className="danger" onClick={confirmDelete}>
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
