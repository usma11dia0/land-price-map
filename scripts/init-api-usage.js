/**
 * api_usage テーブルを作成し、初期値を登録するスクリプト
 *
 * 使い方:
 *   node scripts/init-api-usage.js [monthlyCount] [totalCount]
 *
 * 例:
 *   node scripts/init-api-usage.js          # テーブル作成のみ（0, 0で初期化）
 *   node scripts/init-api-usage.js 15 150   # 今月15回、累計150回で初期化
 */

import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// .env.local から DATABASE_URL を読み取り
function loadEnv() {
  try {
    const envPath = resolve(__dirname, '..', '.env.local');
    const content = readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.substring(0, eqIdx).trim();
      let value = trimmed.substring(eqIdx + 1).trim();
      value = value.replace(/^"|"$/g, '');
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env.local がなくても環境変数があればOK
  }
}

loadEnv();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL が設定されていません');
  process.exit(1);
}

const sql = neon(databaseUrl);

async function main() {
  const monthlyCount = parseInt(process.argv[2] || '0', 10);
  const totalCount = parseInt(process.argv[3] || '0', 10);

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  console.log('=== api_usage テーブル初期化 ===\n');

  // テーブル作成
  console.log('1. テーブル作成...');
  await sql`
    CREATE TABLE IF NOT EXISTS api_usage (
      id INTEGER PRIMARY KEY DEFAULT 1,
      monthly_count INTEGER NOT NULL DEFAULT 0,
      total_count INTEGER NOT NULL DEFAULT 0,
      current_month TEXT NOT NULL DEFAULT to_char(CURRENT_DATE, 'YYYY-MM'),
      usage_limit INTEGER NOT NULL DEFAULT 9000,
      updated_at TIMESTAMP DEFAULT NOW(),
      CHECK (id = 1)
    );
  `;
  console.log('   ✓ テーブル作成完了\n');

  // データ登録（UPSERT）
  console.log(`2. 初期データ登録...`);
  console.log(`   今月の使用回数: ${monthlyCount}`);
  console.log(`   累計使用回数:   ${totalCount}`);
  console.log(`   現在の月:       ${currentMonth}`);

  await sql`
    INSERT INTO api_usage (id, monthly_count, total_count, current_month, usage_limit)
    VALUES (1, ${monthlyCount}, ${totalCount}, ${currentMonth}, 9000)
    ON CONFLICT (id) DO UPDATE SET
      monthly_count = ${monthlyCount},
      total_count = ${totalCount},
      current_month = ${currentMonth},
      updated_at = NOW()
  `;
  console.log('   ✓ データ登録完了\n');

  // 確認
  console.log('3. 登録データ確認...');
  const rows = await sql`SELECT * FROM api_usage WHERE id = 1`;
  console.log('   ', rows[0]);

  console.log('\n=== 完了 ===');
}

main().catch((err) => {
  console.error('エラー:', err);
  process.exit(1);
});
