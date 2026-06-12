# Web Push + Broadcast setup

Push re-engagement: visitors can enable notifications on the chat page, and an
admin can **broadcast** a notification (and optional chat message) to everyone
on a flow — targeted by step and/or status — from **Admin → Campanhas**.

Everything is built. The one manual step is **deploying the Edge Function**,
which needs your Supabase login (the management API access token isn't something
the build can do for you).

## 1. VAPID keys

Already generated. The **public** key is in `.env` as `VITE_VAPID_PUBLIC_KEY`
(safe to expose). The **private** key must only ever live as a Supabase secret —
never commit it. (Regenerate anytime with `npx web-push generate-vapid-keys`,
but if you change them, update both the env var and the secret.)

## 2. Deploy the broadcast function

```bash
# from the project folder
npx supabase login                       # opens browser, one-time
npx supabase link --project-ref bwpxvubwrpfsiabjpsiq

# set the push secrets (use YOUR private key + a contact email)
npx supabase secrets set \
  VAPID_PUBLIC_KEY=BI_nDfmMF5agp0nvCxO4wvRCFvltMuF97l0TxDp9wHFMcZg5gm_-bxvrV__m6quyp3wtqdFmeTh6pbJNZ7Par8U \
  VAPID_PRIVATE_KEY=YOUR_PRIVATE_KEY_HERE \
  VAPID_SUBJECT=mailto:you@example.com

npx supabase functions deploy broadcast
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected
into Edge Functions automatically — you don't set those.

## 3. Try it

1. Open a flow link (`/c/<slug>`) and click **🔔 Notificar-me**, allow the prompt.
2. In **Admin → Campanhas**, pick that flow, (optionally a step/status), write a
   message, and **Enviar**. You should get the notification even with the tab
   closed.

## Coverage notes

- Works on desktop Chrome/Edge/Firefox/Safari and Android browsers.
- **iPhone/iPad:** push only works if the visitor adds the page to their Home
  Screen first (Apple limitation). The chat hides the bell when it can't work.
- Requires HTTPS in production (localhost is fine for dev).

## How targeting works

`conversations` already tracks `flow_id`, `current_node_id`, and `status`. The
broadcast matches on those, looks up each conversation's push subscriptions, and
sends. Dead subscriptions (404/410) are auto-removed. With "Também enviar como
mensagem" checked, the text is also inserted into each chat thread so it's
waiting for the visitor when they return.
