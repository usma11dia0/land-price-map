import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Street View Static API のプロキシ
 * APIキーを保護しつつ、Street View画像を取得
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { lat, lon, heading = '0', pitch = '0', fov = '90' } = req.query;
  const apiKey = process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  if (!lat || !lon) {
    return res.status(400).json({ error: 'lat and lon parameters are required' });
  }

  // Street View Static API URL
  const size = '600x400';
  const apiUrl = `https://maps.googleapis.com/maps/api/streetview?size=${size}&location=${lat},${lon}&heading=${heading}&pitch=${pitch}&fov=${fov}&key=${apiKey}`;

  try {
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch Street View image' });
    }

    // 画像データをそのまま返す
    const imageBuffer = await response.arrayBuffer();
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 1日キャッシュ
    return res.send(Buffer.from(imageBuffer));
  } catch (error) {
    console.error('Error proxying Street View API:', error);
    return res.status(500).json({ error: 'Failed to fetch from Google Street View API' });
  }
}
