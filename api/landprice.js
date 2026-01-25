/**
 * Vercel Serverless Function - 不動産情報ライブラリAPI Proxy
 * 地価公示・都道府県地価調査データを取得
 * APIキーをサーバー側で保持し、フロントエンドに露出させない
 */

const API_BASE_URL = 'https://www.reinfolib.mlit.go.jp/ex-api/external/XPT002';

module.exports = async function handler(req, res) {
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

  const { z, x, y, year, priceClassification } = req.query;

  // パラメータバリデーション
  if (!z || !x || !y || !year) {
    res.status(400).json({ error: 'z, x, y, year parameters are required' });
    return;
  }

  const apiKey = process.env.REINFOLIB_API_KEY;

  if (!apiKey) {
    console.error('REINFOLIB_API_KEY is not set');
    res.status(500).json({ error: 'Server configuration error' });
    return;
  }

  try {
    // APIパラメータを構築
    const params = new URLSearchParams({
      response_format: 'geojson',
      z: String(z),
      x: String(x),
      y: String(y),
      year: String(year),
    });

    // priceClassificationが指定されている場合のみ追加
    if (priceClassification !== undefined && priceClassification !== '') {
      params.append('priceClassification', String(priceClassification));
    }

    const url = `${API_BASE_URL}?${params.toString()}`;

    const response = await fetch(url, {
      headers: {
        'Ocp-Apim-Subscription-Key': apiKey,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        console.error('Invalid API key');
        res.status(401).json({ error: 'Invalid API key' });
        return;
      }
      throw new Error(`API responded with status: ${response.status}`);
    }

    // レスポンスがgzip圧縮されている場合も自動で解凍される
    const data = await response.json();

    res.status(200).json(data);
  } catch (error) {
    console.error('Land Price API error:', error);
    res.status(500).json({ error: 'Failed to fetch land price data' });
  }
};
