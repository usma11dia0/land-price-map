/**
 * Vercel Serverless Function - Google Geocoding API Proxy
 * APIキーをサーバー側で保持し、フロントエンドに露出させない
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

interface GoogleGeocodingResponse {
  status: string;
  results: Array<{
    formatted_address: string;
    geometry: {
      location: {
        lat: number;
        lng: number;
      };
    };
  }>;
  error_message?: string;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // CORSヘッダー
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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

  const { address } = req.query;

  if (!address || typeof address !== 'string') {
    res.status(400).json({ error: 'Address parameter is required' });
    return;
  }

  const apiKey = process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    console.error('GOOGLE_API_KEY is not set');
    res.status(500).json({ error: 'Server configuration error' });
    return;
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}&language=ja&region=jp`;

    const response = await fetch(url);
    const data: GoogleGeocodingResponse = await response.json();

    // Google APIのレスポンスをそのまま返す
    res.status(200).json(data);
  } catch (error) {
    console.error('Geocoding API error:', error);
    res.status(500).json({ error: 'Failed to fetch geocoding data' });
  }
}
