/**
 * z=13 の安全性テスト
 * 全国各地のタイルで HTTP 400 が返らないことを確認
 */
const fs = require('fs');
const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.+)$/);
  if (match) env[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '');
});

const API_KEY = env.REINFOLIB_API_KEY;
const API_BASE = 'https://www.reinfolib.mlit.go.jp/ex-api/external/XPT002';

function latLonToTile(lat, lon, zoom) {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y };
}

const TEST_LOCATIONS = [
  // 主要都市
  { name: '東京駅', lat: 35.6812, lon: 139.7671 },
  { name: '新宿', lat: 35.6896, lon: 139.6922 },
  { name: '渋谷', lat: 35.6580, lon: 139.7016 },
  { name: '池袋', lat: 35.7295, lon: 139.7109 },
  { name: '品川', lat: 35.6284, lon: 139.7387 },
  { name: '大阪', lat: 34.6937, lon: 135.5023 },
  { name: '名古屋', lat: 35.1815, lon: 136.9066 },
  { name: '札幌', lat: 43.0618, lon: 141.3545 },
  { name: '福岡', lat: 33.5904, lon: 130.4017 },
  { name: '仙台', lat: 38.2682, lon: 140.8694 },
  // エッジケース
  { name: '離島(奄美)', lat: 28.3794, lon: 129.4946 },
  { name: '海上付近(東京湾)', lat: 35.5500, lon: 139.8500 },
  { name: '山間部(奥多摩)', lat: 35.8300, lon: 139.0800 },
  { name: '北海道北部(稚内)', lat: 45.4157, lon: 141.6731 },
  { name: '沖縄', lat: 26.3344, lon: 127.8010 },
];

async function testTile(location) {
  const zoom = 13;
  const tile = latLonToTile(location.lat, location.lon, zoom);

  for (const cls of [0, 1]) {
    const params = new URLSearchParams({
      response_format: 'geojson',
      z: String(zoom),
      x: String(tile.x),
      y: String(tile.y),
      year: '2025',
      priceClassification: String(cls),
    });

    try {
      const res = await fetch(`${API_BASE}?${params}`, {
        headers: { 'Ocp-Apim-Subscription-Key': API_KEY },
      });
      const clsName = cls === 0 ? '公示' : '調査';
      if (!res.ok) {
        console.log(`  ❌ ${location.name} [${clsName}] tile(${tile.x},${tile.y}): HTTP ${res.status}`);
        try {
          const body = await res.text();
          console.log(`     応答: ${body.substring(0, 200)}`);
        } catch {}
      } else {
        const data = await res.json();
        const cnt = data.features ? data.features.length : 0;
        console.log(`  ✅ ${location.name} [${clsName}] tile(${tile.x},${tile.y}): ${cnt}件`);
      }
    } catch (e) {
      console.log(`  ❌ ${location.name}: エラー - ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 300));
  }
}

async function run() {
  console.log('=== z=13 安全性テスト（全国15地点 × 2区分 = 30リクエスト） ===\n');
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const loc of TEST_LOCATIONS) {
    await testTile(loc);
  }

  console.log('\n=== テスト完了 ===');
}

run();
