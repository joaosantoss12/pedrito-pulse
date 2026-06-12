import { readFileSync } from 'node:fs';
import { Client } from 'pg';

const password = process.env.PGPASSWORD;
const ref = 'bwpxvubwrpfsiabjpsiq';
const sql = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');

const client = new Client({
  host: `db.${ref}.supabase.co`,
  port: 5432,
  user: 'postgres',
  password,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  await client.query(sql);
  console.log('SCHEMA_APPLIED_OK');
} catch (err) {
  console.error('SCHEMA_ERROR:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
