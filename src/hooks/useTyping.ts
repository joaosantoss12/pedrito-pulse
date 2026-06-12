import { useEffect, useReducer, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Sender } from '../types/database';

// Lightweight typing indicator over Supabase Realtime broadcast.
// Each side announces "I'm typing" as a given role; the other side(s) see it.
// Returns the roles currently typing (excluding your own) and a throttled
// `notify()` to call from an input's onChange.
export function useTyping(conversationId: string | null, selfRole: Sender) {
  // role -> expiry timestamp (ms)
  const expiries = useRef<Partial<Record<Sender, number>>>({});
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastSent = useRef(0);
  const [, tick] = useReducer((x) => x + 1, 0);

  useEffect(() => {
    if (!conversationId) return;
    const ch = supabase.channel(`typing:${conversationId}`, {
      config: { broadcast: { self: false } },
    });
    ch.on('broadcast', { event: 'typing' }, ({ payload }) => {
      const role = payload?.role as Sender | undefined;
      if (!role || role === selfRole) return;
      expiries.current[role] = Date.now() + 3500;
      tick();
    }).subscribe();
    channelRef.current = ch;
    return () => {
      supabase.removeChannel(ch);
      channelRef.current = null;
      expiries.current = {};
    };
  }, [conversationId, selfRole]);

  // prune expired entries each second so indicators fade out
  useEffect(() => {
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
  }, []);

  function notify() {
    const now = Date.now();
    if (now - lastSent.current < 1500) return; // throttle broadcasts
    lastSent.current = now;
    channelRef.current?.send({
      type: 'broadcast',
      event: 'typing',
      payload: { role: selfRole },
    });
  }

  const now = Date.now();
  const typing = (Object.keys(expiries.current) as Sender[]).filter(
    (r) => (expiries.current[r] ?? 0) > now,
  );

  return { typing, notify };
}
