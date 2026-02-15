/**
 * ズームレベル別のAPI応答テスト
 * 東京駅周辺のタイルで、各ズームレベルのデータ量を確認
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

// 東京駅の座標
const TOKYO_LAT = 35.6812;
const TOKYO_LON = 139.7671;

function latLonToTile(lat, lon, zoom) {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y };
}

// タイルの実面積（km²）を概算
function tileSizeKm(lat, zoom) {
  const n = Math.pow(2, zoom);
  const lonDeg = 360 / n;
  const lonKm = lonDeg * 111.32 * Math.cos(lat * Math.PI / 180);
  // 緯度方向は Mercator なので近似
  const latKm = lonKm; // 東京の緯度ではほぼ同じ
  return { lonKm: lonKm.toFixed(2), latKm: latKm.toFixed(2), areaKm2: (lonKm * latKm).toFixed(1) };
}

async function testZoomLevel(zoom) {
  const tile = latLonToTile(TOKYO_LAT, TOKYO_LON, zoom);
  const size = tileSizeKm(TOKYO_LAT, zoom);
  
  const params = new URLSearchParams({
    response_format: 'geojson',
    z: String(zoom),
    x: String(tile.x),
    y: String(tile.y),
    year: '2025',
    priceClassification: '0',
  });

  const start = Date.now();
  try {
    const res = await fetch(`${API_BASE}?${params}`, {
      headers: { 'Ocp-Apim-Subscription-Key': API_KEY },
    });
    const elapsed = Date.now() - start;

    if (!res.ok) {
      console.log(`  z=${zoom}: HTTP ${res.status} (${elapsed}ms) ❌`);
      return null;
    }

    const data = await res.json();
    const featureCount = data.features ? data.features.length : 0;
    const responseSize = JSON.stringify(data).length;

    console.log(`  z=${zoom}: タイル(${tile.x},${tile.y}) | ${size.lonKm}km × ${size.latKm}km (${size.areaKm2}km²) | ${featureCount}件 | ${(responseSize/1024).toFixed(1)}KB | ${elapsed}ms ✅`);
    return { zoom, featureCount, responseSize, elapsed };
  } catch (e) {
    console.log(`  z=${zoom}: エラー - ${e.message}`);
    return null;
  }
}

async function run() {
  console.log('=== ズームレベル別 API応答テスト（東京駅周辺） ===\n');
  console.log('地価公示 (priceClassification=0):');
  
  for (const z of [15, 14, 13, 12, 11, 10]) {
    await testZoomLevel(z);
    // API負荷軽減のため少し待つ
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('\n--- 東京23区カバレッジ試算 ---');
  for (const z of [15, 14, 13, 12]) {
    const size = tileSizeKm(TOKYO_LAT, z);
    const tilesNeeded = Math.ceil(30 / parseFloat(size.lonKm)) * Math.ceil(32 / parseFloat(size.latKm));
    const batchEntries = tilesNeeded * 2; // ×2区分
    const batchRuns = Math.ceil(batchEntries / 10);
    console.log(`  z=${z}: ${size.lonKm}km/tile → 約${tilesNeeded}タイル → ${batchEntries}エントリ → ${batchRuns}回のバッチ実行`);
  }
}

run();
