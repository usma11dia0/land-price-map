/**
 * Vercel Serverless Function - 地名検索API
 * DB内の地価ポイントを地名（place_name）で検索
 *
 * 正規化テーブル対応: land_price_masters から検索
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

const getDatabaseUrl = () => process.env.DATABASE_URL || process.env.POSTGRES_URL || '';

/** 遅延初期化: handler呼び出し時に環境変数が確実に利用可能 */
let _sql: ReturnType<typeof neon> | null = null;
function getSQL() {
  if (!_sql) _sql = neon(getDatabaseUrl());
  return _sql;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { q } = req.query;

  if (!q || typeof q !== 'string' || q.trim().length === 0) {
    res.status(400).json({ error: 'Query parameter "q" is required' });
    return;
  }

  const query = q.trim();
  const searchPattern = `%${query}%`;

  try {
    const sql = getSQL();

    // land_price_masters から検索し、最新年度の価格を yearly から取得
    const rows = await sql`
      SELECT
        m.point_id, m.lat, m.lon, m.place_name, m.prefecture_name,
        m.city_name, m.address_display, m.standard_lot_number,
        m.price_classification, m.latest_year,
        y.price as current_price
      FROM land_price_masters m
      LEFT JOIN land_price_yearly y
        ON m.point_id = y.point_id AND y.year = m.latest_year
      WHERE m.place_name ILIKE ${searchPattern}
         OR m.address_display ILIKE ${searchPattern}
         OR m.standard_lot_number ILIKE ${searchPattern}
         OR m.city_name ILIKE ${searchPattern}
      ORDER BY m.prefecture_name, m.city_name
      LIMIT 20
    `;

    const results = rows.map((row) => ({
      pointId: row.point_id,
      lat: row.lat,
      lon: row.lon,
      placeName: row.place_name,
      prefectureName: row.prefecture_name,
      cityName: row.city_name,
      addressDisplay: row.address_display,
      standardLotNumber: row.standard_lot_number,
      priceClassification: row.price_classification,
      year: row.latest_year,
      currentPrice: row.current_price != null ? Number(row.current_price).toLocaleString() : null,
    }));

    res.status(200).json({ results });
  } catch (error) {
    console.error('Search land price error:', error);
    // DB未接続時は空結果を返す
    res.status(200).json({ results: [] });
  }
}
