import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Street View Metadata API のプロキシ
 * 指定地点にStreet View画像が存在するかチェック
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { lat, lon } = req.query;
  const apiKey = process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  if (!lat || !lon) {
    return res.status(400).json({ error: 'lat and lon parameters are required' });
  }

  // Street View Metadata API URL
  const apiUrl = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lon}&key=${apiKey}`;

  try {
    const response = await fetch(apiUrl);
    const data = await response.json();
    
    // メタデータを返す（status: "OK" or "ZERO_RESULTS"）
    res.status(200).json(data);
  } catch (error) {
    console.error('Error proxying Street View Metadata API:', error);
    res.status(500).json({ error: 'Failed to fetch from Google Street View Metadata API' });
  }
}
