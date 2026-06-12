import { Fragment, useEffect, useRef, type ReactNode } from 'react';
import type { Message } from '../types/database';

// Turns plain text containing URLs into text + clickable <a> links.
const URL_RE = /(https?:\/\/[^\s]+)/g;

function linkify(text: string): ReactNode[] {
  const parts = text.split(URL_RE);
  return parts.map((part, i) => {
    if (URL_RE.test(part)) {
      // strip a trailing punctuation char so "(link)." stays clean
      const trailing = /[.,!?)]+$/.exec(part)?.[0] ?? '';
      const url = trailing ? part.slice(0, -trailing.length) : part;
      return (
        <Fragment key={i}>
          <a href={url} target="_blank" rel="noopener noreferrer">
            {url}
          </a>
          {trailing}
        </Fragment>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

function Bubble({ m }: { m: Message }) {
  return (
    <div className="bubble">
      {m.type === 'image' && m.media_url && <img src={m.media_url} alt="" />}
      {m.type === 'video' && m.media_url && <video src={m.media_url} controls />}
      {m.content && (
        <div className={m.media_url ? 'cap' : undefined}>
          {linkify(m.content)}
        </div>
      )}
    </div>
  );
}

interface Props {
  messages: Message[];
  // mostrar uma pequena etiqueta de remetente por cima das bolhas
  showTags?: boolean;
  // quando fornecido, mostra um botão de eliminar por mensagem (admin)
  onDelete?: (id: string) => void;
}

export default function MessageList({ messages, showTags, onDelete }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  return (
    <div className="messages">
      {messages.map((m) => {
        // On the visitor side (no tags) admin messages are indistinguishable
        // from bot messages — same bubble, no operator styling.
        const cls = !showTags && m.sender === 'admin' ? 'bot' : m.sender;
        return (
          <div className={`msg ${cls}`} key={m.id}>
            {showTags && (
              <span className="sender-tag">
                {m.sender === 'admin'
                  ? 'operador'
                  : m.sender === 'bot'
                    ? 'bot'
                    : 'utilizador'}
              </span>
            )}
            <div className="bubble-row">
              <Bubble m={m} />
              {onDelete && (
                <button
                  className="msg-del"
                  title="Eliminar mensagem"
                  onClick={() => onDelete(m.id)}
                >
                  🗑
                </button>
              )}
            </div>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}
