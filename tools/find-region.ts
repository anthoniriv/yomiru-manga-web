import postgres from 'postgres';

const PASSWORD = 'OBbdLkvMmjws7tJ5';
const REF = 'fsfgzmmpfqurcoifcfys';
const REGIONS = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'eu-central-1', 'eu-west-1', 'eu-west-2',
  'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1',
  'sa-east-1', 'ca-central-1',
];

async function tryConnect(url: string, label: string) {
  const sql = postgres(url, { max: 1, connect_timeout: 6, idle_timeout: 2 });
  try {
    await sql`SELECT 1`;
    console.log(`FOUND: ${label}`);
    console.log(`URL: ${url}`);
    await sql.end();
    return true;
  } catch(e: any) {
    console.log(`✗ ${label}: ${(e.message ?? '').slice(0, 55)}`);
    await sql.end().catch(() => {});
    return false;
  }
}

async function main() {
  // Session pooler (port 5432) — IPv4 compatible
  for (const region of REGIONS) {
    const url = `postgresql://postgres.${REF}:${PASSWORD}@aws-0-${region}.pooler.supabase.com:5432/postgres`;
    const found = await tryConnect(url, `session-${region}`);
    if (found) return;
  }
  console.log('Not found in any region');
}

main().catch(console.error);
