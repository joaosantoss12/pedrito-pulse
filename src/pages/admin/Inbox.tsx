import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useMessages } from '../../hooks/useMessages';
import { useTyping } from '../../hooks/useTyping';
import MessageList from '../../components/MessageList';
import { uploadMedia, mediaKind } from '../../lib/media';
import type { Conversation } from '../../types/database';

// Reusable "quick message with link button" the operator configures once
// (stored locally) and sends to any chat — e.g. a group invite link.
interface QuickMsg {
  text: string;
  buttonLabel: string;
  buttonUrl: string;
}
const QUICK_KEY = 'inbox-quick-message';
function loadQuick(): QuickMsg {
  try {
    return {
      text: '',
      buttonLabel: 'Entrar no grupo',
      buttonUrl: '',
      ...JSON.parse(localStorage.getItem(QUICK_KEY) || '{}'),
    };
  } catch {
    return { text: '', buttonLabel: 'Entrar no grupo', buttonUrl: '' };
  }
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function Inbox() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [flowNames, setFlowNames] = useState<Record<string, string>>({});
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [messages, setMessages] = useMessages(conversationId ?? null);
  const { typing, notify } = useTyping(conversationId ?? null, 'admin');
  const [quick, setQuick] = useState<QuickMsg>(loadQuick);
  const [quickOpen, setQuickOpen] = useState(false);

  function saveQuick() {
    localStorage.setItem(QUICK_KEY, JSON.stringify(quick));
  }

  async function sendQuick() {
    if (!conversationId) return;
    await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender: 'admin',
      type: 'text',
      content: quick.text || null,
      button_label: quick.buttonUrl ? quick.buttonLabel || 'Abrir' : null,
      button_url: quick.buttonUrl || null,
    });
    saveQuick();
    setQuickOpen(false);
  }

  async function deleteMessage(id: string) {
    // optimistic removal; realtime DELETE keeps other clients in sync
    setMessages((prev) => prev.filter((m) => m.id !== id));
    const { error } = await supabase.from('messages').delete().eq('id', id);
    if (error) alert(error.message);
  }

  const flowNameOf = (c: Conversation) =>
    (c.flow_id && flowNames[c.flow_id]) || 'Fluxo removido';

  async function loadConversations() {
    const { data } = await supabase
      .from('conversations')
      .select('*')
      .order('last_message_at', { ascending: false });
    setConversations((data ?? []) as Conversation[]);
  }

  // Keep the conversation list live (new chats + reordering on new messages).
  useEffect(() => {
    supabase
      .from('flows')
      .select('id, name')
      .then(({ data }) => {
        const map: Record<string, string> = {};
        (data ?? []).forEach((f) => {
          map[f.id] = f.name;
        });
        setFlowNames(map);
      });

    loadConversations();
    const channel = supabase
      .channel('admin-conversations')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        () => loadConversations(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function sendAdminMessage(
    type: 'text' | 'image' | 'video',
    content: string | null,
    mediaUrl: string | null,
  ) {
    if (!conversationId) return;
    // Admin messages are inserted straight into the thread and never touch
    // the flow state, so the running flow continues uninterrupted.
    await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender: 'admin',
      type,
      content,
      media_url: mediaUrl,
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput('');
    setBusy(true);
    try {
      await sendAdminMessage('text', text, null);
    } finally {
      setBusy(false);
    }
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const url = await uploadMedia(file);
      const kind = mediaKind(file);
      await sendAdminMessage(kind === 'video' ? 'video' : 'image', null, url);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Falha no carregamento');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const active = conversations.find((c) => c.id === conversationId);

  return (
    <div className="inbox">
      <div className="conv-list">
        {conversations.length === 0 && (
          <div className="empty" style={{ padding: 20 }}>
            Ainda não há conversas
          </div>
        )}
        {conversations.map((c) => (
          <div
            key={c.id}
            className={`conv-item ${c.id === conversationId ? 'active' : ''}`}
            onClick={() => navigate(`/admin/inbox/${c.id}`)}
          >
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="title">
                {c.visitor_name || `Utilizador ${c.id.slice(0, 6)}`}
              </span>
              <span className="muted" style={{ fontSize: 11 }}>
                {timeAgo(c.last_message_at)}
              </span>
            </div>
            <div className="sub">
              🔀 {flowNameOf(c)}
            </div>
            <div className="sub" style={{ marginTop: 1 }}>
              {c.status === 'completed' ? 'fluxo concluído' : 'em fluxo'}
            </div>
          </div>
        ))}
      </div>

      {conversationId && active ? (
        <div className="chat" style={{ maxWidth: 'none', width: '100%', margin: 0 }}>
          <div className="chat-header">
            <div className="col" style={{ gap: 2 }}>
              <strong>
                {active.visitor_name || `Utilizador ${active.id.slice(0, 6)}`}
              </strong>
              <span className="muted" style={{ fontSize: 12 }}>
                🔀 {flowNameOf(active)}
              </span>
            </div>
            <div className="row">
              <button
                className="ghost"
                onClick={() => setQuickOpen(true)}
                title="Enviar mensagem com botão/link (ex.: grupo)"
              >
                🔗 Mensagem
              </button>
              <span className={`badge ${active.status === 'active' ? 'live' : ''}`}>
                {active.status === 'active' ? 'ativo' : 'concluído'}
              </span>
            </div>
          </div>

          <MessageList
            messages={messages}
            showTags
            onDelete={deleteMessage}
            typing={typing}
          />

          <form className="composer" onSubmit={onSubmit}>
            <button
              type="button"
              className="icon-btn"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              title="Enviar imagem ou vídeo"
            >
              📎
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              hidden
              onChange={onPickFile}
            />
            <input
              type="text"
              placeholder="Mensagem como operador…"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                notify();
              }}
            />
            <button className="primary" disabled={busy || !input.trim()}>
              Enviar
            </button>
          </form>
        </div>
      ) : (
        <div className="empty">Selecione uma conversa</div>
      )}

      {quickOpen && (
        <div className="modal-overlay" onClick={() => setQuickOpen(false)}>
          <div className="modal card col" onClick={(e) => e.stopPropagation()}>
            <strong>Mensagem com botão</strong>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              Configure uma vez; envia para esta conversa. Fica guardada para
              reutilizar.
            </p>
            <div>
              <label>Mensagem</label>
              <textarea
                rows={3}
                value={quick.text}
                onChange={(e) => setQuick({ ...quick, text: e.target.value })}
                placeholder="ex.: Junte-se ao nosso grupo 👇"
              />
            </div>
            <div>
              <label>Texto do botão</label>
              <input
                value={quick.buttonLabel}
                onChange={(e) =>
                  setQuick({ ...quick, buttonLabel: e.target.value })
                }
              />
            </div>
            <div>
              <label>Link do botão</label>
              <input
                value={quick.buttonUrl}
                onChange={(e) =>
                  setQuick({ ...quick, buttonUrl: e.target.value })
                }
                placeholder="https://…"
              />
            </div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button
                className="ghost"
                onClick={() => {
                  saveQuick();
                  setQuickOpen(false);
                }}
              >
                Guardar
              </button>
              <button
                className="primary"
                onClick={sendQuick}
                disabled={!quick.text && !quick.buttonUrl}
              >
                Enviar para este chat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
