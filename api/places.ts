/**
 * Vercel Serverless Function - Google Places API (Text Search) Proxy
 * 施設名・建物名の検索用
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkRateLimit, getClientIp } from './_rateLimit.js';

interface PlacesResponse {
  places?: Array<{
    id: string;
    displayName: {
      text: string;
      languageCode: string;
    };
    formattedAddress: string;
    location: {
      latitude: number;
      longitude: number;
    };
    types?: string[];
  }>;
  error?: {
    code: number;
    message: string;
    status: string;
  };
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // CORSヘッダー
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // CDNキャッシュ
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

  // OPTIONSリクエストの処理
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // GETリクエストのみ許可
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // レート制限
  const ip = getClientIp(req);
  const rateCheck = checkRateLimit(ip, 30, 60000);
  res.setHeader('X-RateLimit-Remaining', String(rateCheck.remaining));
  if (!rateCheck.allowed) {
    res.status(429).json({ error: 'Too many requests. Please try again later.' });
    return;
  }

  const { query } = req.query;

  if (!query || typeof query !== 'string') {
    res.status(400).json({ error: 'Query parameter is required' });
    return;
  }

  const apiKey = process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    console.error('GOOGLE_API_KEY is not set');
    res.status(500).json({ error: 'Server configuration error' });
    return;
  }

  try {
    // Places API (New) - Text Search
    const url = 'https://places.googleapis.com/v1/places:searchText';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.types',
      },
      body: JSON.stringify({
        textQuery: query,
        languageCode: 'ja',
        regionCode: 'JP',
        maxResultCount: 5,
      }),
    });

    const data: PlacesResponse = await response.json();

    // エラーチェック
    if (data.error) {
      console.error('Places API error:', data.error);
      res.status(response.status).json(data);
      return;
    }

    res.status(200).json(data);
  } catch (error) {
    console.error('Places API error:', error);
    res.status(500).json({ error: 'Failed to fetch places data' });
  }
}
