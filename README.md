# PEDRITO SENDPULSE

A lightweight, SendPulse-style chat-flow tool — **without** WhatsApp/Telegram.
Admins build chat flows visually, publish a shareable link, and visitors open
that link to chat straight away. Every conversation is **real-time** and visible
to the admin, who can jump in with messages mid-flow without interrupting it.
Text, images and video are supported.

Stack: **React + TypeScript + Vite + Supabase** (`@xyflow/react` for the visual
builder).

## How it works

- **Admins** sign in with email/password (Supabase Auth). A row in `profiles`
  marks a user as an admin.
- **Visitors** never see a login form. Opening a link triggers Supabase
  **anonymous sign-in**, so each visitor gets a real `auth.uid()`. Row-Level
  Security uses that id to isolate each visitor's conversation while letting
  admins see everything.
- The **flow runtime runs in the visitor's browser**: it writes bot messages and
  advances `conversations.current_node_id`. Admin messages are inserted directly
  into the thread and never touch flow state — so an operator can chime in
  without breaking the flow.
- **Realtime** is powered by Supabase Postgres changes on `messages` and
  `conversations`.

### Flow node types

| Node       | Behaviour                                                            |
| ---------- | ------------------------------------------------------------------- |
| `start`    | Entry point.                                                        |
| `message`  | Bot sends text and/or an image/video, then continues automatically. |
| `question` | Bot asks; waits for the visitor's free text; saves it to a variable.|
| `choice`   | Bot shows buttons; each option is its own branch (drag per option). |
| `end`      | Optional closing message; marks the conversation complete.          |

## Setup

### 1. Create a Supabase project

Then enable **anonymous sign-ins**: Dashboard → Authentication → Providers →
*Anonymous* → enable.

### 2. Run the schema

Open the SQL editor and run [`supabase/schema.sql`](supabase/schema.sql). It
creates the tables, RLS policies, realtime publication and the `chat-media`
storage bucket.

### 3. Configure env

```bash
cp .env.example .env
```

Fill in from Dashboard → Project Settings → API:

```
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

### 4. Install & run

```bash
npm install
npm run dev
```

## Using it

1. Go to `/admin`, sign up (the first sign-up becomes an admin).
2. Create a flow, build it visually, click **Save**, then **Publish**.
3. Click **🔗 Link** to copy the share URL (`/c/<slug>`).
4. Open that link (try an incognito window) to chat as a visitor.
5. Watch it live in **Inbox** and reply as the operator.

## Security notes (read before going to production)

- **Admin self-registration is open**: any email sign-up inserts itself into
  `profiles` and becomes an admin. For production, gate this (invite list,
  allowed-domain check, or remove the `profiles_insert_self` policy and seed
  admins manually).
- The flow engine runs client-side, so a determined visitor could manipulate
  their own conversation state. That's fine for marketing/onboarding flows; move
  the engine into an Edge Function if you need it tamper-proof.
- Storage bucket `chat-media` is public-read. Don't put sensitive media there.

## Project layout

```
src/
  contexts/AuthContext.tsx    admin auth + isAdmin detection
  flow/
    engine.ts                 client-side flow runtime
    nodes.tsx                 React Flow node renderers
    Inspector.tsx             node editor panel (with media upload)
  hooks/useMessages.ts        realtime messages for a conversation
  components/MessageList.tsx  shared message thread renderer
  lib/{supabase,media}.ts     client + media upload helpers
  pages/
    admin/{Login,AdminLayout,Dashboard,FlowBuilder,Inbox}.tsx
    chat/ChatPage.tsx         visitor chat
    Landing.tsx
supabase/schema.sql           database + RLS + storage + realtime
```
