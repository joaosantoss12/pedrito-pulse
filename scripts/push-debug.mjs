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

const subs = await c.query(
  `select id, conversation_id, left(endpoint, 45) as endpoint_head, created_at
     from public.push_subscriptions order by created_at desc limit 10`,
);
console.log('push_subscriptions rows:', subs.rowCount);
subs.rows.forEach((r) =>
  console.log('  ', r.created_at.toISOString(), r.conversation_id, r.endpoint_head),
);

const convs = await c.query(
  `select id, flow_id, status, current_node_id, last_message_at
     from public.conversations order by last_message_at desc limit 10`,
);
console.log('\nconversations rows (latest):', convs.rowCount);
convs.rows.forEach((r) =>
  console.log('  ', r.id, 'flow=', r.flow_id, 'status=', r.status, 'node=', r.current_node_id),
);

await c.end();
