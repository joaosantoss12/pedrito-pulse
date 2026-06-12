import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Message } from '../types/database';

// Loads a conversation's messages and keeps them live via Supabase realtime.
// Returns the list plus a local setter so callers can update optimistically.
export function useMessages(conversationId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    let active = true;

    supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (active) setMessages((data ?? []) as Message[]);
      });

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const m = payload.new as Message;
          setMessages((prev) => {
            if (prev.some((x) => x.id === m.id)) return prev;
            // Insert in created_at order — realtime events can arrive out of
            // order, which otherwise puts a fast bot reply above the user's msg.
            const next = [...prev, m];
            next.sort((a, b) => a.created_at.localeCompare(b.created_at));
            return next;
          });
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const oldId = (payload.old as { id?: string }).id;
          if (oldId) setMessages((prev) => prev.filter((x) => x.id !== oldId));
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  return [messages, setMessages] as const;
}
