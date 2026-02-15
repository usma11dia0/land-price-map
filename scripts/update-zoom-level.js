/**
 * 既存データのタイル座標を z=15 → z=13 に更新
 * + batch_progress を再生成
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

const NEW_ZOOM = 13;

function latLonToTile(lat, lon, zoom) {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y };
}

async function run() {
  // ──────────────────────────────
  // Step 1: 既存マスターデータのタイル座標を更新
  // ──────────────────────────────
  console.log('=== Step 1: land_price_masters のタイル座標を z=13 に更新 ===');
  
  const masters = await sql.query('SELECT point_id, lat, lon, tile_z FROM land_price_masters');
  console.log(`  対象: ${masters.length} 件`);
  
  let updated = 0;
  for (const row of masters) {
    const tile = latLonToTile(row.lat, row.lon, NEW_ZOOM);
    await sql.query(
      'UPDATE land_price_masters SET tile_z = $1, tile_x = $2, tile_y = $3 WHERE point_id = $4',
      [NEW_ZOOM, tile.x, tile.y, row.point_id]
    );
    updated++;
  }
  console.log(`  更新完了: ${updated} 件`);
  
  // 確認
  const zoomCheck = await sql.query('SELECT tile_z, count(*) as cnt FROM land_price_masters GROUP BY tile_z');
  console.log('  ズームレベル分布:');
  zoomCheck.forEach(r => console.log(`    z=${r.tile_z}: ${r.cnt}件`));

  // ──────────────────────────────
  // Step 2: batch_progress をクリアして再生成
  // ──────────────────────────────
  console.log('\n=== Step 2: batch_progress を再生成（z=13） ===');
  
  await sql.query('DELETE FROM batch_progress');
  console.log('  既存エントリ削除完了');
  
  const currentYear = new Date().getFullYear() - 1;
  const MAJOR_CITIES = [
    { name: '東京', lat: 35.6812, lon: 139.7671 },
    { name: '大阪', lat: 34.6937, lon: 135.5023 },
    { name: '名古屋', lat: 35.1815, lon: 136.9066 },
    { name: '横浜', lat: 35.4437, lon: 139.6380 },
    { name: '福岡', lat: 33.5904, lon: 130.4017 },
    { name: '札幌', lat: 43.0618, lon: 141.3545 },
    { name: '仙台', lat: 38.2682, lon: 140.8694 },
    { name: '広島', lat: 34.3853, lon: 132.4553 },
    { name: '京都', lat: 35.0116, lon: 135.7681 },
    { name: '神戸', lat: 34.6901, lon: 135.1956 },
  ];
  
  let inserted = 0;
  for (const city of MAJOR_CITIES) {
    const centerTile = latLonToTile(city.lat, city.lon, NEW_ZOOM);
    // z=13 では 3×3 = 12km × 12km カバー
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const cls of [0, 1]) {
          try {
            await sql.query(
              `INSERT INTO batch_progress (tile_z, tile_x, tile_y, year, price_classification, status)
               VALUES ($1, $2, $3, $4, $5, 'pending')
               ON CONFLICT (tile_z, tile_x, tile_y, year, price_classification) DO NOTHING`,
              [NEW_ZOOM, centerTile.x + dx, centerTile.y + dy, currentYear, cls]
            );
            inserted++;
          } catch {}
        }
      }
    }
  }
  console.log(`  新規エントリ: ${inserted} 件（pending）`);

  // 確認
  const stats = await sql.query(
    "SELECT status, count(*) as cnt FROM batch_progress GROUP BY status"
  );
  console.log('  batch_progress 状態:');
  stats.forEach(r => console.log(`    ${r.status}: ${r.cnt}件`));

  console.log('\n=== 完了 ===');
}

run().catch(e => { console.error(e.message); process.exit(1); });
