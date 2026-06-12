import { Client } from 'pg';

const c = new Client({
  host: 'db.bwpxvubwrpfsiabjpsiq.supabase.co',
  port: 5432,
  user: 'postgres',
  password: process.env.PGPASSWORD,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});

await c.connect();
await c.query(`create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  endpoint text not null unique,
  subscription jsonb not null,
  created_at timestamptz not null default now())`);
await c.query(
  'create index if not exists push_subs_conversation_idx on public.push_subscriptions(conversation_id)',
);
await c.query('alter table public.push_subscriptions enable row level security');
await c.query('drop policy if exists push_subs_select on public.push_subscriptions');
await c.query(
  'create policy push_subs_select on public.push_subscriptions for select using (user_id = auth.uid() or public.is_admin())',
);
await c.query('drop policy if exists push_subs_insert on public.push_subscriptions');
await c.query(
  'create policy push_subs_insert on public.push_subscriptions for insert with check (user_id = auth.uid())',
);
await c.query('drop policy if exists push_subs_update on public.push_subscriptions');
await c.query(
  'create policy push_subs_update on public.push_subscriptions for update using (user_id = auth.uid()) with check (user_id = auth.uid())',
);
const r = await c.query(
  "select count(*) from information_schema.tables where table_name='push_subscriptions'",
);
console.log('push_subscriptions ready:', r.rows[0].count === '1');
await c.end();
