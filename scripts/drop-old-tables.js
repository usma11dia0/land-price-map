const fs = require('fs');
const { neon } = require('@neondatabase/serverless');
const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.+)$/);
  if (match) env[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '');
});
const sql = neon(env.DATABASE_URL);

async function run() {
  console.log('CASCADE で旧テーブルを削除...');
  await sql.query('DROP TABLE IF EXISTS land_price_points_old CASCADE');
  console.log('  land_price_points_old: 削除完了');
  await sql.query('DROP VIEW IF EXISTS land_price_points_views CASCADE');
  console.log('  land_price_points_views (VIEW): 削除完了');
  
  const tables = await sql.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' ORDER BY table_name
  `);
  console.log('\n残っているテーブル:');
  tables.forEach(t => console.log('  -', t.table_name));

  const sizes = await sql.query(`
    SELECT relname, pg_size_pretty(pg_total_relation_size(c.oid)) as size,
           pg_total_relation_size(c.oid) as bytes
    FROM pg_class c LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY pg_total_relation_size(c.oid) DESC
  `);
  let total = 0;
  console.log('\nストレージ:');
  sizes.forEach(r => { console.log('  ' + r.relname + ': ' + r.size); total += parseInt(r.bytes); });
  console.log('  合計: ' + (total/1024/1024).toFixed(2) + ' MB / 512 MB');
}
run().catch(e => { console.error(e.message); process.exit(1); });
