/**
 * Vercel Serverless Function - Google API使用量管理
 *
 * エンドポイント:
 *   GET  /api/api-usage          - 現在の使用量を取得
 *   POST /api/api-usage          - 使用量をインクリメント（+1）
 *
 * テーブル: api_usage（シングルトン、id=1 固定）
 *   - monthly_count: 今月の使用回数
 *   - total_count:   累計使用回数
 *   - current_month: 記録月（"YYYY-MM"形式）
 *   - usage_limit:   月間上限
 *
 * 月が変わった場合、自動的に monthly_count をリセットする
 *
 * 注意: このエンドポイントは DATABASE_URL_SHARED を使用し、
 *       本番/開発環境で同じDBを共有する（GCP課金は環境共通のため）
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { checkRateLimit, getClientIp } from './_rateLimit.js';

/** 共有DB接続: 本番・開発共通で同じDBを参照（API使用量は環境横断で共有） */
const getDatabaseUrl = () =>
  process.env.DATABASE_URL_SHARED || process.env.DATABASE_URL || process.env.POSTGRES_URL || '';

let _sql: ReturnType<typeof neon> | null = null;
function getSQL() {
  if (!_sql) _sql = neon(getDatabaseUrl());
  return _sql;
}

/** 許可するオリジン一覧 */
const ALLOWED_ORIGINS = [
  'https://land-price-map.vercel.app',
  'http://localhost:3000',
  'http://localhost:8080',
];

function getAllowedOrigin(req: VercelRequest): string {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  if (origin.endsWith('.vercel.app')) return origin;
  return ALLOWED_ORIGINS[0];
}

/** 現在の年月文字列を取得（UTC基準） */
function getCurrentMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // CORSヘッダー
  const allowedOrigin = getAllowedOrigin(req);
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');

  // キャッシュ無効化（使用量データは常に最新を返す）
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // レート制限（60秒あたり120リクエスト/IP — 使用量の取得・更新は高頻度）
  const ip = getClientIp(req);
  const rateCheck = checkRateLimit(ip, 120, 60000);
  res.setHeader('X-RateLimit-Remaining', String(rateCheck.remaining));
  if (!rateCheck.allowed) {
    res.status(429).json({ error: 'Too many requests' });
    return;
  }

  try {
    const sql = getSQL();
    const currentMonth = getCurrentMonth();

    if (req.method === 'GET') {
      // ── 使用量を取得 ──
      const rows = await sql`SELECT * FROM api_usage WHERE id = 1` as Record<string, any>[];

      if (rows.length === 0) {
        // テーブルが空の場合は初期値を返す
        res.status(200).json({
          monthlyCount: 0,
          totalCount: 0,
          currentMonth,
          usageLimit: 9000,
        });
        return;
      }

      const row = rows[0];

      // 月が変わっていたらリセット
      if (row.current_month !== currentMonth) {
        await sql`
          UPDATE api_usage
          SET monthly_count = 0, current_month = ${currentMonth}, updated_at = NOW()
          WHERE id = 1
        `;
        res.status(200).json({
          monthlyCount: 0,
          totalCount: Number(row.total_count),
          currentMonth,
          usageLimit: Number(row.usage_limit),
        });
        return;
      }

      res.status(200).json({
        monthlyCount: Number(row.monthly_count),
        totalCount: Number(row.total_count),
        currentMonth: row.current_month,
        usageLimit: Number(row.usage_limit),
      });
      return;
    }

    if (req.method === 'POST') {
      // ── 使用量をインクリメント ──
      // まず月チェック＆リセット後にインクリメント
      const rows = await sql`SELECT * FROM api_usage WHERE id = 1` as Record<string, any>[];

      if (rows.length === 0) {
        // テーブルが空なら初期行を挿入してカウント1に
        await sql`
          INSERT INTO api_usage (id, monthly_count, total_count, current_month, usage_limit)
          VALUES (1, 1, 1, ${currentMonth}, 9000)
          ON CONFLICT (id) DO UPDATE SET
            monthly_count = 1, total_count = api_usage.total_count + 1,
            current_month = ${currentMonth}, updated_at = NOW()
        `;
        res.status(200).json({
          monthlyCount: 1,
          totalCount: 1,
          currentMonth,
          usageLimit: 9000,
          canUse: true,
        });
        return;
      }

      const row = rows[0];
      const isNewMonth = row.current_month !== currentMonth;
      const currentMonthlyCount = isNewMonth ? 0 : Number(row.monthly_count);
      const usageLimit = Number(row.usage_limit);

      // 上限チェック
      if (currentMonthlyCount >= usageLimit) {
        res.status(200).json({
          monthlyCount: currentMonthlyCount,
          totalCount: Number(row.total_count),
          currentMonth,
          usageLimit,
          canUse: false,
        });
        return;
      }

      // インクリメント（月が変わっていたらリセット込み）
      if (isNewMonth) {
        await sql`
          UPDATE api_usage
          SET monthly_count = 1,
              total_count = total_count + 1,
              current_month = ${currentMonth},
              updated_at = NOW()
          WHERE id = 1
        `;
      } else {
        await sql`
          UPDATE api_usage
          SET monthly_count = monthly_count + 1,
              total_count = total_count + 1,
              updated_at = NOW()
          WHERE id = 1
        `;
      }

      const newMonthlyCount = isNewMonth ? 1 : currentMonthlyCount + 1;
      res.status(200).json({
        monthlyCount: newMonthlyCount,
        totalCount: Number(row.total_count) + 1,
        currentMonth,
        usageLimit,
        canUse: newMonthlyCount < usageLimit,
      });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API usage error:', error);
    // DBエラー時はフォールバック値を返す（使用を止めない）
    res.status(200).json({
      monthlyCount: 0,
      totalCount: 0,
      currentMonth: getCurrentMonth(),
      usageLimit: 9000,
      canUse: true,
      error: 'DB unavailable, using fallback',
    });
  }
}
