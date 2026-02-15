/**
 * 旧テーブル削除 + データクリア + バッチ処理テスト
 * 使い方: node scripts/cleanup-and-batch.js
 */
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
  // ──────────────────────────────
  // Step 1: 旧テーブル削除
  // ──────────────────────────────
  console.log('=== Step 1: 旧テーブル削除 ===');
  try {
    await sql.query('DROP TABLE IF EXISTS land_price_points_old');
    console.log('  land_price_points_old を削除しました');
  } catch (e) {
    console.log('  エラー:', e.message);
  }
  try {
    await sql.query('DROP TABLE IF EXISTS land_price_points_views');
    console.log('  land_price_points_views を削除しました');
  } catch (e) {
    console.log('  エラー:', e.message);
  }
  try {
    await sql.query('DROP TABLE IF EXISTS land_price_points');
    console.log('  land_price_points を削除しました（存在する場合）');
  } catch (e) {
    console.log('  エラー:', e.message);
  }

  // ──────────────────────────────
  // Step 2: 全データクリア
  // ──────────────────────────────
  console.log('\n=== Step 2: 全データクリア ===');
  
  // 外部キー制約があるのでyearlyを先に
  await sql.query('DELETE FROM land_price_yearly');
  const y = await sql.query('SELECT count(*) as cnt FROM land_price_yearly');
  console.log('  land_price_yearly:', y[0].cnt, '件（クリア後）');

  await sql.query('DELETE FROM land_price_masters');
  const m = await sql.query('SELECT count(*) as cnt FROM land_price_masters');
  console.log('  land_price_masters:', m[0].cnt, '件（クリア後）');

  await sql.query('DELETE FROM batch_progress');
  const b = await sql.query('SELECT count(*) as cnt FROM batch_progress');
  console.log('  batch_progress:', b[0].cnt, '件（クリア後）');

  // api_freshness_stateはリセット
  await sql.query("UPDATE api_freshness_state SET probe_count = 0, probe_date = CURRENT_DATE, latest_year = 2025 WHERE id = 1");
  console.log('  api_freshness_state: リセット完了');

  // テーブル一覧
  const tables = await sql.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' ORDER BY table_name
  `);
  console.log('\n  残っているテーブル:');
  tables.forEach(t => console.log('    -', t.table_name));

  // ストレージ確認
  const sizes = await sql.query(`
    SELECT
      relname as table_name,
      pg_size_pretty(pg_total_relation_size(c.oid)) as total_size
    FROM pg_class c
    LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY pg_total_relation_size(c.oid) DESC
  `);
  console.log('\n  ストレージ:');
  sizes.forEach(r => console.log('    ' + r.table_name + ': ' + r.total_size));

  console.log('\n=== クリア完了 ===\n');
}

run().catch(err => {
  console.error('エラー:', err.message);
  process.exit(1);
});
