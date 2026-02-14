/**
 * DB内データの統計確認スクリプト
 * 使い方: node scripts/db-stats.js
 *
 * 正規化テーブル対応:
 *   - land_price_masters: 地点マスター
 *   - land_price_yearly:  年度別価格
 *   - api_freshness_state: プローブ状態
 */
const fs = require('fs');
const { neon } = require('@neondatabase/serverless');

// .env.local から環境変数を読み込み
const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.+)$/);
  if (match) env[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '');
});

const sql = neon(env.DATABASE_URL);

async function run() {
  console.log('=== NEON DB データ統計 ===\n');

  // ──────────────────────────────────
  // マスターテーブル
  // ──────────────────────────────────
  try {
    const masterTotal = await sql.query('SELECT count(*) as cnt FROM land_price_masters');
    console.log('--- land_price_masters ---');
    console.log('全地点数:', masterTotal[0].cnt);

    // 都道府県別
    const byPref = await sql.query(
      'SELECT prefecture_name, count(*) as cnt FROM land_price_masters GROUP BY prefecture_name ORDER BY cnt DESC LIMIT 10'
    );
    console.log('\n  都道府県別 (上位10):');
    byPref.forEach(r => console.log('    ' + (r.prefecture_name || '(null)') + ': ' + r.cnt + ' 件'));

    // 区分別
    const byClass = await sql.query(
      'SELECT price_classification, count(*) as cnt FROM land_price_masters GROUP BY price_classification ORDER BY price_classification'
    );
    const classNames = { 0: '地価公示', 1: '都道府県地価調査' };
    console.log('\n  区分別:');
    byClass.forEach(r => {
      const name = classNames[r.price_classification] || '不明';
      console.log('    区分 ' + r.price_classification + ' (' + name + '): ' + r.cnt + ' 件');
    });
  } catch (e) {
    console.log('land_price_masters テーブルが存在しません:', e.message);
  }

  // ──────────────────────────────────
  // 年度別価格テーブル
  // ──────────────────────────────────
  try {
    const yearlyTotal = await sql.query('SELECT count(*) as cnt FROM land_price_yearly');
    console.log('\n--- land_price_yearly ---');
    console.log('全価格レコード数:', yearlyTotal[0].cnt);

    const byYear = await sql.query(
      'SELECT year, count(*) as cnt FROM land_price_yearly GROUP BY year ORDER BY year DESC'
    );
    console.log('\n  年度別:');
    byYear.forEach(r => console.log('    ' + r.year + ' 年: ' + r.cnt + ' 件'));
  } catch (e) {
    console.log('land_price_yearly テーブルが存在しません:', e.message);
  }

  // ──────────────────────────────────
  // 東京都の詳細
  // ──────────────────────────────────
  try {
    const tokyoTotal = await sql.query(
      "SELECT count(*) as cnt FROM land_price_masters WHERE prefecture_name LIKE '%東京%'"
    );
    console.log('\n--- 東京都 ---');
    console.log('東京都 地点数: ' + tokyoTotal[0].cnt + ' 件');

    const tokyo = await sql.query(
      "SELECT city_name, count(*) as cnt FROM land_price_masters WHERE prefecture_name LIKE '%東京%' GROUP BY city_name ORDER BY cnt DESC LIMIT 20"
    );
    if (tokyo.length > 0) {
      console.log('\n  市区町村別:');
      tokyo.forEach(r => console.log('    ' + (r.city_name || '(null)') + ': ' + r.cnt + ' 件'));
    }

    // サンプルデータ
    const tokyoSample = await sql.query(`
      SELECT m.place_name, m.address_display, m.city_name, m.price_classification, m.latest_year,
             y.price
      FROM land_price_masters m
      LEFT JOIN land_price_yearly y ON m.point_id = y.point_id AND y.year = m.latest_year
      WHERE m.prefecture_name LIKE '%東京%'
      ORDER BY m.latest_year DESC
      LIMIT 5
    `);
    if (tokyoSample.length > 0) {
      console.log('\n  サンプルデータ (東京都 最新5件):');
      tokyoSample.forEach(r => {
        const type = r.price_classification === 0 ? '公示' : '調査';
        const priceStr = r.price ? Number(r.price).toLocaleString() + ' 円/m²' : '不明';
        console.log('    [' + type + ' ' + r.latest_year + '] ' + (r.city_name || '') + ' ' + (r.place_name || r.address_display || '') + ' - ' + priceStr);
      });
    }
  } catch (e) {
    console.log('東京都データ取得エラー:', e.message);
  }

  // ──────────────────────────────────
  // API鮮度管理
  // ──────────────────────────────────
  try {
    const freshness = await sql.query('SELECT * FROM api_freshness_state WHERE id = 1');
    console.log('\n--- API鮮度管理 ---');
    if (freshness.length > 0) {
      const f = freshness[0];
      console.log('  検出済み最新年度: ' + f.latest_year);
      console.log('  当日プローブ回数: ' + f.probe_count);
      console.log('  プローブ日付:     ' + f.probe_date);
      console.log('  最終更新:         ' + f.updated_at);
    } else {
      console.log('  (未初期化)');
    }
  } catch (e) {
    console.log('api_freshness_state テーブルが存在しません:', e.message);
  }

  // ──────────────────────────────────
  // バッチ進捗
  // ──────────────────────────────────
  try {
    const batch = await sql.query(
      'SELECT status, count(*) as cnt FROM batch_progress GROUP BY status ORDER BY status'
    );
    console.log('\n--- バッチ進捗 ---');
    if (batch.length === 0) {
      console.log('  (バッチ未実行)');
    } else {
      batch.forEach(r => console.log('  ' + r.status + ': ' + r.cnt + ' 件'));
    }
  } catch (e) {
    console.log('batch_progress テーブルが存在しません:', e.message);
  }

  // ──────────────────────────────────
  // 旧テーブル確認
  // ──────────────────────────────────
  try {
    const oldExists = await sql.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name IN ('land_price_points', 'land_price_points_old')
      ) as exists
    `);
    if (oldExists[0].exists) {
      console.log('\n--- 旧テーブル ---');
      try {
        const old = await sql.query('SELECT count(*) as cnt FROM land_price_points_old');
        console.log('  land_price_points_old: ' + old[0].cnt + ' 行 (バックアップ)');
      } catch {
        // skip
      }
      try {
        const old2 = await sql.query('SELECT count(*) as cnt FROM land_price_points');
        console.log('  land_price_points: ' + old2[0].cnt + ' 行 (未移行)');
      } catch {
        // skip
      }
    }
  } catch {
    // skip
  }

  // ──────────────────────────────────
  // ストレージ見積もり
  // ──────────────────────────────────
  try {
    const sizes = await sql.query(`
      SELECT
        relname as table_name,
        pg_size_pretty(pg_total_relation_size(c.oid)) as total_size,
        pg_total_relation_size(c.oid) as total_bytes
      FROM pg_class c
      LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY pg_total_relation_size(c.oid) DESC
    `);
    console.log('\n--- ストレージ使用量 ---');
    let totalBytes = 0;
    sizes.forEach(r => {
      console.log('  ' + r.table_name + ': ' + r.total_size);
      totalBytes += parseInt(r.total_bytes, 10);
    });
    console.log('  合計: ' + (totalBytes / 1024 / 1024).toFixed(2) + ' MB');
    console.log('  Neon無料枠: 512 MB (' + (totalBytes / 1024 / 1024 / 512 * 100).toFixed(1) + '% 使用)');
  } catch (e) {
    console.log('ストレージ情報取得エラー:', e.message);
  }

  console.log('\n=== 完了 ===');
}

run().catch(err => {
  console.error('エラー:', err.message);
  process.exit(1);
});
