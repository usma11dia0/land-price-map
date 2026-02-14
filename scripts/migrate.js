/**
 * DBマイグレーションスクリプト（Node.js直接実行用）
 * 使い方: node scripts/migrate.js
 *
 * 新テーブル構造:
 *   - land_price_masters: 地点マスター（地点ごとに1行、最新年度のフルプロパティ）
 *   - land_price_yearly:  年度別価格（地点×年度ごとに1行、価格と変動率のみ）
 *   - batch_progress:     バッチ処理進捗
 *   - api_freshness_state: API鮮度管理（シングルトン）
 *
 * 旧テーブル land_price_points が存在する場合は自動的にデータを移行する。
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

const databaseUrl = env.DATABASE_URL || env.POSTGRES_URL;
if (!databaseUrl) {
  console.error('ERROR: DATABASE_URL not found in .env.local');
  process.exit(1);
}

const sql = neon(databaseUrl);

async function migrate() {
  console.log('=== Database Migration Start ===\n');

  // ----------------------------------------------------------
  // 1. pg_trgm extension
  // ----------------------------------------------------------
  console.log('1. pg_trgm extension...');
  await sql.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
  console.log('   OK');

  // ----------------------------------------------------------
  // 2. land_price_masters テーブル
  // ----------------------------------------------------------
  console.log('2. land_price_masters table...');
  await sql.query(`
    CREATE TABLE IF NOT EXISTS land_price_masters (
      point_id TEXT PRIMARY KEY,
      lat DOUBLE PRECISION NOT NULL,
      lon DOUBLE PRECISION NOT NULL,
      tile_z INTEGER NOT NULL,
      tile_x INTEGER NOT NULL,
      tile_y INTEGER NOT NULL,
      price_classification INTEGER NOT NULL,
      standard_lot_number TEXT,
      prefecture_name TEXT,
      city_name TEXT,
      address_display TEXT,
      place_name TEXT,
      properties JSONB NOT NULL,
      latest_year INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log('   OK');

  // ----------------------------------------------------------
  // 3. land_price_yearly テーブル
  // ----------------------------------------------------------
  console.log('3. land_price_yearly table...');
  await sql.query(`
    CREATE TABLE IF NOT EXISTS land_price_yearly (
      point_id TEXT NOT NULL REFERENCES land_price_masters(point_id) ON DELETE CASCADE,
      year INTEGER NOT NULL,
      price INTEGER,
      change_rate REAL,
      created_at TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (point_id, year)
    )
  `);
  console.log('   OK');

  // ----------------------------------------------------------
  // 4. batch_progress テーブル
  // ----------------------------------------------------------
  console.log('4. batch_progress table...');
  await sql.query(`
    CREATE TABLE IF NOT EXISTS batch_progress (
      id SERIAL PRIMARY KEY,
      tile_z INTEGER NOT NULL,
      tile_x INTEGER NOT NULL,
      tile_y INTEGER NOT NULL,
      year INTEGER NOT NULL,
      price_classification INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      processed_at TIMESTAMP,
      UNIQUE(tile_z, tile_x, tile_y, year, price_classification)
    )
  `);
  console.log('   OK');

  // ----------------------------------------------------------
  // 5. api_freshness_state テーブル（シングルトン）
  // ----------------------------------------------------------
  console.log('5. api_freshness_state table...');
  await sql.query(`
    CREATE TABLE IF NOT EXISTS api_freshness_state (
      id INTEGER PRIMARY KEY DEFAULT 1,
      latest_year INTEGER NOT NULL DEFAULT 2025,
      probe_count INTEGER NOT NULL DEFAULT 0,
      probe_date DATE NOT NULL DEFAULT CURRENT_DATE,
      updated_at TIMESTAMP DEFAULT NOW(),
      CHECK (id = 1)
    )
  `);
  // 初期行を挿入（既に存在する場合は何もしない）
  await sql.query(`
    INSERT INTO api_freshness_state (id, latest_year, probe_count, probe_date)
    VALUES (1, 2025, 0, CURRENT_DATE)
    ON CONFLICT (id) DO NOTHING
  `);
  console.log('   OK');

  // ----------------------------------------------------------
  // 6. インデックス
  // ----------------------------------------------------------
  console.log('6. Creating indexes...');

  console.log('   - idx_masters_tile...');
  await sql.query('CREATE INDEX IF NOT EXISTS idx_masters_tile ON land_price_masters(tile_z, tile_x, tile_y, price_classification)');

  console.log('   - idx_masters_place_trgm...');
  await sql.query('CREATE INDEX IF NOT EXISTS idx_masters_place_trgm ON land_price_masters USING gin(place_name gin_trgm_ops)');

  console.log('   - idx_masters_coords...');
  await sql.query('CREATE INDEX IF NOT EXISTS idx_masters_coords ON land_price_masters(lat, lon)');

  console.log('   - idx_yearly_point...');
  await sql.query('CREATE INDEX IF NOT EXISTS idx_yearly_point ON land_price_yearly(point_id, year DESC)');

  console.log('   OK');

  // ----------------------------------------------------------
  // 7. 旧テーブルからのデータ移行
  // ----------------------------------------------------------
  const oldTableExists = await sql.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'land_price_points'
    ) as exists
  `);

  if (oldTableExists[0].exists) {
    const oldCount = await sql.query('SELECT count(*) as cnt FROM land_price_points');
    const count = parseInt(oldCount[0].cnt, 10);

    if (count > 0) {
      console.log(`\n7. Migrating data from old table (${count} rows)...`);

      // 7a. マスターテーブルに最新年度の行を挿入
      console.log('   - Inserting into land_price_masters (latest year per point)...');
      const masterResult = await sql.query(`
        INSERT INTO land_price_masters (
          point_id, lat, lon, tile_z, tile_x, tile_y,
          price_classification, standard_lot_number, prefecture_name,
          city_name, address_display, place_name, properties, latest_year
        )
        SELECT DISTINCT ON (point_id)
          point_id, lat, lon, tile_z, tile_x, tile_y,
          price_classification, standard_lot_number, prefecture_name,
          city_name, address_display, place_name, properties, year
        FROM land_price_points
        ORDER BY point_id, year DESC
        ON CONFLICT (point_id) DO NOTHING
      `);
      console.log(`   Inserted ${masterResult.length || 'N/A'} master records`);

      // 7b. 年度別価格テーブルにデータを挿入
      console.log('   - Inserting into land_price_yearly (all years)...');
      await sql.query(`
        INSERT INTO land_price_yearly (point_id, year, price, change_rate)
        SELECT
          point_id,
          year,
          CASE
            WHEN properties->>'u_current_years_price_ja' IS NOT NULL
            THEN NULLIF(REGEXP_REPLACE(properties->>'u_current_years_price_ja', '[^0-9]', '', 'g'), '')::INTEGER
            ELSE NULL
          END,
          (properties->>'year_on_year_change_rate')::REAL
        FROM land_price_points
        ON CONFLICT (point_id, year) DO NOTHING
      `);
      console.log('   OK');

      // 7c. 旧テーブルをリネーム（バックアップ）
      console.log('   - Renaming old table to land_price_points_old...');
      await sql.query('ALTER TABLE land_price_points RENAME TO land_price_points_old');
      console.log('   OK');

      console.log('   Data migration completed!');
    } else {
      console.log('\n7. Old table exists but is empty, dropping...');
      await sql.query('DROP TABLE land_price_points');
      console.log('   OK');
    }
  } else {
    console.log('\n7. No old table found, skipping migration.');
  }

  // ----------------------------------------------------------
  // 完了
  // ----------------------------------------------------------
  console.log('\n=== Migration completed successfully! ===');

  // 確認クエリ
  const tables = await sql.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' ORDER BY table_name
  `);
  console.log('\nExisting tables:');
  tables.forEach(t => console.log('  -', t.table_name));

  // 各テーブルの行数
  for (const t of tables) {
    if (t.table_name.startsWith('land_price_') || t.table_name === 'batch_progress' || t.table_name === 'api_freshness_state') {
      try {
        const cnt = await sql.query(`SELECT count(*) as cnt FROM "${t.table_name}"`);
        console.log(`    ${t.table_name}: ${cnt[0].cnt} rows`);
      } catch {
        // skip
      }
    }
  }
}

migrate().catch(err => {
  console.error('\nMigration FAILED:', err.message);
  process.exit(1);
});
