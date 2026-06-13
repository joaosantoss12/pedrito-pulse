import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useMessages } from '../../hooks/useMessages';
import { useTyping } from '../../hooks/useTyping';
import MessageList from '../../components/MessageList';
import { uploadMedia, mediaKind } from '../../lib/media';
import { enablePush, pushStatus } from '../../lib/push';
import {
  continueAfterInput,
  isWaitingForInput,
  pendingChoice,
  pickChoice,
  startFlow,
} from '../../flow/engine';
import type { Conversation, Flow, MessageType } from '../../types/database';

export default function ChatPage() {
  const { slug } = useParams();
  const [flow, setFlow] = useState<Flow | null>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const initialized = useRef(false);
  const pushTried = useRef(false);
  // 'blocked' = user denied/disabled; 'ios' = iPhone needs add-to-home-screen
  const [pushHint, setPushHint] = useState<'blocked' | 'ios' | null>(null);
  const [hintDismissed, setHintDismissed] = useState(false);

  const [messages] = useMessages(conversation?.id ?? null);
  const { typing, notify } = useTyping(conversation?.id ?? null, 'user');
  const [botTyping, setBotTyping] = useState(false);

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  // bot + operator typing dots (operator comes via realtime broadcast)
  const typingSenders = [
    ...new Set([...typing, ...(botTyping ? (['bot'] as const) : [])]),
  ] as ('user' | 'bot' | 'admin')[];

  // Auto-request notification permission and subscribe as soon as the chat
  // opens (no button). The browser still shows its native permission prompt —
  // that can't be skipped — but the visitor doesn't have to find a button.
  // If they've blocked notifications, surface a hint on how to re-enable.
  useEffect(() => {
    if (!conversation || pushTried.current) return;
    pushTried.current = true;
    if (pushStatus() === 'denied') {
      setPushHint('blocked');
      return;
    }
    enablePush(conversation.id, conversation.user_id)
      .then((res) => {
        if (res.ok) return;
        if (res.reason === 'denied') setPushHint('blocked');
        else if (res.reason === 'ios-needs-install') setPushHint('ios');
      })
      .catch(() => {});
  }, [conversation]);

  async function refreshConversation(id: string) {
    const { data } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', id)
      .single();
    if (data) setConversation(data as Conversation);
    return data as Conversation | null;
  }

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    (async () => {
      try {
        // 1. Anonymous sign-in — gives the visitor a real auth.uid() with no
        //    login form, so RLS can isolate their conversation.
        let { data: sess } = await supabase.auth.getSession();
        if (!sess.session) {
          const { error: anonErr } = await supabase.auth.signInAnonymously();
          if (anonErr) throw anonErr;
          ({ data: sess } = await supabase.auth.getSession());
        }
        const uid = sess.session!.user.id;

        // 2. Resolve the link → flow.
        const { data: link } = await supabase
          .from('flow_links')
          .select('id, flow_id, flows(*)')
          .eq('slug', slug)
          .eq('active', true)
          .maybeSingle();
        if (!link || !link.flows) {
          setError('Este link é inválido ou já não está ativo.');
          return;
        }
        const theFlow = link.flows as unknown as Flow;
        // A flow that isn't published must not be reachable via its link —
        // even for an admin opening it. Republishing re-enables the same link.
        if (!theFlow.published) {
          setError('Este link não está disponível de momento.');
          return;
        }
        setFlow(theFlow);

        // 3. Find this visitor's existing conversation for this FLOW, or start
        // a new one. Keyed by flow (not link): the same person/device gets one
        // chat per flow, no matter which of the flow's links they opened.
        const { data: existingRows } = await supabase
          .from('conversations')
          .select('*')
          .eq('flow_id', theFlow.id)
          .eq('user_id', uid)
          .order('created_at', { ascending: false })
          .limit(1);

        const existing = existingRows?.[0];
        if (existing) {
          setConversation(existing as Conversation);
          return;
        }

        const { data: created, error: convErr } = await supabase
          .from('conversations')
          .insert({
            flow_id: theFlow.id,
            link_id: link.id,
            user_id: uid,
          })
          .select()
          .single();

        // If a concurrent tab won the race (unique constraint), reuse theirs
        // instead of creating a second chat — and don't re-run the flow.
        if (convErr) {
          const { data: rows } = await supabase
            .from('conversations')
            .select('*')
            .eq('flow_id', theFlow.id)
            .eq('user_id', uid)
            .order('created_at', { ascending: false })
            .limit(1);
          if (rows?.[0]) {
            setConversation(rows[0] as Conversation);
            return;
          }
          throw convErr;
        }

        const conv = created as Conversation;
        setConversation(conv);
        setBotTyping(true);
        await sleep(700);
        await startFlow(conv, theFlow);
        await refreshConversation(conv.id);
        setBotTyping(false);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Não foi possível iniciar o chat',
        );
      }
    })();
  }, [slug]);

  async function sendVisitorMessage(
    type: MessageType,
    content: string | null,
    mediaUrl: string | null,
  ) {
    if (!conversation) return;
    await supabase.from('messages').insert({
      conversation_id: conversation.id,
      sender: 'user',
      type,
      content,
      media_url: mediaUrl,
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || !conversation || !flow) return;
    setInput('');
    setBusy(true);
    try {
      await sendVisitorMessage('text', text, null);
      // If the flow is waiting for an answer, resume it (saving the reply).
      if (isWaitingForInput(conversation, flow)) {
        setBotTyping(true);
        // pause so the visitor's own message renders before the bot replies
        await sleep(900);
        await continueAfterInput(conversation, flow, text);
        await refreshConversation(conversation.id);
      }
    } finally {
      setBotTyping(false);
      setBusy(false);
    }
  }

  async function onChoose(optionId: string, label: string) {
    if (!conversation || !flow) return;
    setBusy(true);
    try {
      await sendVisitorMessage('text', label, null);
      setBotTyping(true);
      await sleep(900);
      await pickChoice(conversation, flow, optionId);
      await refreshConversation(conversation.id);
    } finally {
      setBotTyping(false);
      setBusy(false);
    }
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !conversation || !flow) return;
    setBusy(true);
    try {
      const url = await uploadMedia(file);
      const kind = mediaKind(file);
      await sendVisitorMessage(
        kind === 'video' ? 'video' : 'image',
        null,
        url,
      );
      // Sending media also resumes a "wait for answer" node (saving the URL).
      if (isWaitingForInput(conversation, flow)) {
        setBotTyping(true);
        await sleep(900);
        await continueAfterInput(conversation, flow, url);
        await refreshConversation(conversation.id);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Falha no carregamento');
    } finally {
      setBotTyping(false);
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  if (error) {
    return (
      <div className="center">
        <div className="card" style={{ maxWidth: 380, textAlign: 'center' }}>
          {error}
        </div>
      </div>
    );
  }

  if (!conversation || !flow) {
    return <div className="center muted">A ligar…</div>;
  }

  const choice = pendingChoice(conversation, flow);

  return (
    <div className="chat">
      <div className="chat-header">
        <strong>{flow.name}</strong>
        <span className="badge live">em direto</span>
      </div>

      <MessageList messages={messages} typing={typingSenders} />

      {pushHint && !hintDismissed && (
        <div className="push-hint">
          <span>
            {pushHint === 'blocked'
              ? '🔕 As notificações estão bloqueadas. Toque no 🔒 da barra de endereço → Notificações → Permitir para receber avisos.'
              : '📲 Para receber avisos no iPhone, adicione esta página ao ecrã principal (Partilhar → Adicionar ao ecrã principal).'}
          </span>
          <button className="ghost" onClick={() => setHintDismissed(true)}>
            ✕
          </button>
        </div>
      )}

      {choice && (
        <div className="choices">
          {choice.options.map((o) => (
            <button
              key={o.id}
              disabled={busy}
              onClick={() => onChoose(o.id, o.label)}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

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
          placeholder="Escreva uma mensagem…"
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
  );
}
