// Supabase Edge Function: broadcast
// Sends a Web Push (and optionally drops a chat message) to every conversation
// of a flow that is currently parked on a given step / status.
//
// Deploy:   supabase functions deploy broadcast
// Secrets:  VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:you@x.com)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface Body {
  flowId: string;
  nodeId?: string | null; // restrict to a specific step
  status?: 'active' | 'completed' | 'any';
  title: string;
  message: string;
  alsoSendMessage?: boolean; // also insert the text into each chat thread
  appUrl: string; // e.g. https://yourapp.com
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // 1. Authenticate the caller and require admin (a row in profiles).
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);

    const { data: profile } = await userClient
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();
    if (!profile) return json({ error: 'forbidden' }, 403);

    const body = (await req.json()) as Body;
    if (!body.flowId || !body.title || !body.message) {
      return json({ error: 'missing fields' }, 400);
    }

    // 2. Find matching conversations (service role bypasses RLS).
    const admin = createClient(url, service);
    let q = admin
      .from('conversations')
      .select('id, link_id')
      .eq('flow_id', body.flowId);
    if (body.nodeId) q = q.eq('current_node_id', body.nodeId);
    if (body.status && body.status !== 'any') q = q.eq('status', body.status);
    const { data: convs, error: convErr } = await q;
    if (convErr) return json({ error: convErr.message }, 500);
    if (!convs || convs.length === 0) {
      return json({ matched: 0, sent: 0, failed: 0 });
    }

    const convIds = convs.map((c) => c.id);

    // Build a link_id → slug map to deep-link the notification.
    const { data: links } = await admin
      .from('flow_links')
      .select('id, slug')
      .eq('flow_id', body.flowId);
    const slugByLink = new Map((links ?? []).map((l) => [l.id, l.slug]));

    // 3. Optionally insert the message into each thread.
    if (body.alsoSendMessage) {
      await admin.from('messages').insert(
        convIds.map((id) => ({
          conversation_id: id,
          sender: 'admin',
          type: 'text',
          content: body.message,
        })),
      );
    }

    // 4. Send push to every subscription of the matched conversations.
    webpush.setVapidDetails(
      Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com',
      Deno.env.get('VAPID_PUBLIC_KEY')!,
      Deno.env.get('VAPID_PRIVATE_KEY')!,
    );

    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('id, conversation_id, subscription')
      .in('conversation_id', convIds);

    let sent = 0;
    let failed = 0;
    const expired: string[] = [];

    await Promise.all(
      (subs ?? []).map(async (s) => {
        const conv = convs.find((c) => c.id === s.conversation_id);
        const slug = conv ? slugByLink.get(conv.link_id) : undefined;
        const payload = JSON.stringify({
          title: body.title,
          body: body.message,
          url: slug ? `${body.appUrl}/c/${slug}` : body.appUrl,
          tag: `flow-${body.flowId}`,
        });
        try {
          // deno-lint-ignore no-explicit-any
          await webpush.sendNotification(s.subscription as any, payload);
          sent++;
        } catch (err) {
          failed++;
          // 404/410 → the subscription is dead, clean it up.
          // deno-lint-ignore no-explicit-any
          const code = (err as any)?.statusCode;
          if (code === 404 || code === 410) expired.push(s.id);
        }
      }),
    );

    if (expired.length) {
      await admin.from('push_subscriptions').delete().in('id', expired);
    }

    return json({ matched: convs.length, sent, failed });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }

  function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
