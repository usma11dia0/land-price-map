/**
 * 東京エリア集中バッチ
 * z=13 で東京23区を中心に40タイルを生成→バッチ実行
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

const ZOOM = 13;
const YEAR = 2025;
const API_BASE = 'https://www.reinfolib.mlit.go.jp/ex-api/external/XPT002';
const API_KEY = env.REINFOLIB_API_KEY;

function latLonToTile(lat, lon, zoom) {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y };
}

function tileToLatLon(x, y, zoom) {
  const n = Math.pow(2, zoom);
  const lon = x / n * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n)));
  const lat = latRad * 180 / Math.PI;
  return { lat, lon };
}

async function run() {
  // ──────────────────────────────
  // Step 1: 東京エリアのタイルを生成
  // ──────────────────────────────
  console.log('=== Step 1: 東京エリア40タイルを生成 ===\n');

  // 東京23区の中心周辺をカバーする範囲
  // 中心: 東京駅 (35.6812, 139.7671) → tile(7276, 3225) at z=13
  // 23区バウンディングボックス: lat 35.53-35.82, lon 139.56-139.92
  const center = latLonToTile(35.6812, 139.7671, ZOOM);
  console.log(`  東京駅タイル: (${center.x}, ${center.y})`);

  // 8×5 = 40タイルのグリッド（東西8タイル×南北5タイル）
  // 東西: 中心から左に3、右に4  → 8タイル × ~4km = ~32km
  // 南北: 中心から上に2、下に2  → 5タイル × ~4km = ~20km
  const tiles = [];
  for (let dx = -3; dx <= 4; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      const tx = center.x + dx;
      const ty = center.y + dy;
      const nw = tileToLatLon(tx, ty, ZOOM);
      const se = tileToLatLon(tx + 1, ty + 1, ZOOM);
      tiles.push({ x: tx, y: ty, nw, se });
    }
  }

  console.log(`  生成タイル数: ${tiles.length} タイル`);
  console.log(`  カバー範囲:`);
  const minLat = Math.min(...tiles.map(t => t.se.lat));
  const maxLat = Math.max(...tiles.map(t => t.nw.lat));
  const minLon = Math.min(...tiles.map(t => t.nw.lon));
  const maxLon = Math.max(...tiles.map(t => t.se.lon));
  console.log(`    緯度: ${minLat.toFixed(4)}° 〜 ${maxLat.toFixed(4)}°`);
  console.log(`    経度: ${minLon.toFixed(4)}° 〜 ${maxLon.toFixed(4)}°`);
  console.log(`    約 ${((maxLon - minLon) * 111.32 * Math.cos(35.68 * Math.PI / 180)).toFixed(1)}km × ${((maxLat - minLat) * 111.32).toFixed(1)}km\n`);

  // ──────────────────────────────
  // Step 2: batch_progress に登録
  // ──────────────────────────────
  console.log('=== Step 2: batch_progress に登録 ===');

  // 既存の pending をクリア
  await sql.query("DELETE FROM batch_progress WHERE status = 'pending'");
  console.log('  既存 pending エントリ削除完了');

  let inserted = 0;
  for (const tile of tiles) {
    for (const cls of [0, 1]) {
      try {
        await sql.query(
          `INSERT INTO batch_progress (tile_z, tile_x, tile_y, year, price_classification, status)
           VALUES ($1, $2, $3, $4, $5, 'pending')
           ON CONFLICT (tile_z, tile_x, tile_y, year, price_classification) DO NOTHING`,
          [ZOOM, tile.x, tile.y, YEAR, cls]
        );
        inserted++;
      } catch {}
    }
  }
  console.log(`  登録: ${inserted} エントリ（${tiles.length}タイル × 2区分）`);

  // ──────────────────────────────
  // Step 3: バッチ実行
  // ──────────────────────────────
  console.log('\n=== Step 3: バッチ実行開始 ===\n');

  let totalProcessed = 0;
  let totalSaved = 0;
  let batchRun = 0;

  while (true) {
    // pending のタイルを取得
    const pending = await sql.query(
      "SELECT tile_z, tile_x, tile_y, year, price_classification FROM batch_progress WHERE status = 'pending' ORDER BY id LIMIT 10"
    );

    if (pending.length === 0) {
      console.log('  全タイル処理完了！');
      break;
    }

    batchRun++;
    let runSaved = 0;

    for (const tile of pending) {
      const params = new URLSearchParams({
        response_format: 'geojson',
        z: String(tile.tile_z),
        x: String(tile.tile_x),
        y: String(tile.tile_y),
        year: String(tile.year),
        priceClassification: String(tile.price_classification),
      });

      try {
        const res = await fetch(`${API_BASE}?${params}`, {
          headers: { 'Ocp-Apim-Subscription-Key': API_KEY },
        });

        if (res.ok) {
          const data = await res.json();
          const featureCount = data.features ? data.features.length : 0;

          if (featureCount > 0) {
            await saveFeatures(data.features, tile.tile_z, tile.tile_x, tile.tile_y, tile.year, tile.price_classification);
            runSaved += featureCount;
          }
        }

        await sql.query(
          `UPDATE batch_progress SET status = 'completed', processed_at = NOW()
           WHERE tile_z = $1 AND tile_x = $2 AND tile_y = $3 AND year = $4 AND price_classification = $5`,
          [tile.tile_z, tile.tile_x, tile.tile_y, tile.year, tile.price_classification]
        );
        totalProcessed++;
      } catch (err) {
        console.log(`    エラー: tile(${tile.tile_x},${tile.tile_y}) cls=${tile.price_classification}: ${err.message}`);
        await sql.query(
          `UPDATE batch_progress SET status = 'error'
           WHERE tile_z = $1 AND tile_x = $2 AND tile_y = $3 AND year = $4 AND price_classification = $5`,
          [tile.tile_z, tile.tile_x, tile.tile_y, tile.year, tile.price_classification]
        );
      }
    }

    totalSaved += runSaved;
    const remaining = await sql.query("SELECT count(*) as cnt FROM batch_progress WHERE status = 'pending'");
    console.log(`  バッチ ${batchRun}: ${pending.length}タイル処理 → ${runSaved}件保存 | 残り ${remaining[0].cnt} エントリ`);

    // API負荷軽減のため少し待つ
    await new Promise(r => setTimeout(r, 500));
  }

  // ──────────────────────────────
  // 結果サマリー
  // ──────────────────────────────
  console.log('\n=== 結果サマリー ===');
  console.log(`  バッチ実行回数: ${batchRun} 回`);
  console.log(`  処理タイル数: ${totalProcessed}`);
  console.log(`  保存地点数: ${totalSaved}`);

  // DB統計
  const masters = await sql.query('SELECT count(*) as cnt FROM land_price_masters');
  const yearly = await sql.query('SELECT count(*) as cnt FROM land_price_yearly');
  const prefStats = await sql.query(
    "SELECT prefecture_name, count(*) as cnt FROM land_price_masters GROUP BY prefecture_name ORDER BY cnt DESC LIMIT 10"
  );

  console.log(`\n  DB内の総地点数: ${masters[0].cnt}`);
  console.log(`  DB内の年度別価格レコード数: ${yearly[0].cnt}`);
  console.log('\n  都道府県別:');
  prefStats.forEach(r => console.log(`    ${r.prefecture_name}: ${r.cnt}件`));

  const sizes = await sql.query(`
    SELECT relname, pg_size_pretty(pg_total_relation_size(c.oid)) as size,
           pg_total_relation_size(c.oid) as bytes
    FROM pg_class c LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY pg_total_relation_size(c.oid) DESC
  `);
  let total = 0;
  console.log('\n  ストレージ:');
  sizes.forEach(r => { console.log('    ' + r.relname + ': ' + r.size); total += parseInt(r.bytes); });
  console.log(`    合計: ${(total/1024/1024).toFixed(2)} MB / 512 MB`);
}

async function saveFeatures(features, tileZ, tileX, tileY, year, classification) {
  for (const feature of features) {
    const props = feature.properties;
    const [lon, lat] = feature.geometry.coordinates;
    const pointId = props.point_id || `${lat}-${lon}`;

    let price = null;
    const priceStr = props.u_current_years_price_ja;
    if (priceStr) {
      const cleaned = priceStr.replace(/[^0-9]/g, '');
      if (cleaned) { price = parseInt(cleaned, 10); if (isNaN(price)) price = null; }
    }
    const changeRate = props.year_on_year_change_rate ?? null;

    try {
      await sql.query(
        `INSERT INTO land_price_masters (
          point_id, lat, lon, tile_z, tile_x, tile_y,
          price_classification, standard_lot_number, prefecture_name,
          city_name, address_display, place_name, properties, latest_year
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT (point_id) DO UPDATE SET
          properties = CASE WHEN $14 >= land_price_masters.latest_year THEN $13::jsonb ELSE land_price_masters.properties END,
          tile_z = $4, tile_x = $5, tile_y = $6,
          latest_year = GREATEST(land_price_masters.latest_year, $14),
          updated_at = NOW()`,
        [
          pointId, lat, lon, tileZ, tileX, tileY,
          classification,
          props.standard_lot_number_ja || null,
          props.prefecture_name_ja || null,
          (props.city_county_name_ja || '') + (props.ward_town_village_name_ja || ''),
          props.residence_display_name_ja || null,
          props.place_name_ja || null,
          JSON.stringify(props),
          year
        ]
      );

      await sql.query(
        `INSERT INTO land_price_yearly (point_id, year, price, change_rate)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (point_id, year) DO UPDATE SET price = EXCLUDED.price, change_rate = EXCLUDED.change_rate`,
        [pointId, year, price, changeRate]
      );
    } catch {}
  }
}

run().catch(e => { console.error('致命的エラー:', e.message); process.exit(1); });
