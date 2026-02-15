/**
 * API呼び出しモジュール
 * Google Geocoding API、Places API、国土地理院API、Nominatim APIによる住所検索を担当
 */

import type {
  SearchResult,
  GSISearchItem,
  NominatimSearchItem,
  GoogleGeocodingResponse,
  GooglePlacesResponse,
} from './types.js';
import type { LandPriceSearchResponse } from './landPriceTypes.js';
import { CONFIG } from './config.js';
import { canUseApi, incrementUsage } from './storage.js';

/**
 * fetchをリトライ付きで実行（エクスポネンシャルバックオフ）
 */
async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  maxRetries: number = 3
): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(input, init);
      if (response.ok || response.status < 500) {
        return response;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
    if (attempt < maxRetries - 1) {
      await new Promise((resolve) => setTimeout(resolve, 500 * Math.pow(2, attempt)));
    }
  }
  throw lastError || new Error('Fetch failed');
}

/**
 * 本番環境かどうかを判定
 * @returns 本番環境の場合はtrue
 */
function isProduction(): boolean {
  return (
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1'
  );
}

/**
 * 検索クエリが住所かどうかを判定
 * 住所の特徴: 都道府県名、市区町村、番地（数字-数字）を含む
 * @param query 検索クエリ
 * @returns 住所の場合はtrue
 */
function isAddressQuery(query: string): boolean {
  // 都道府県名のパターン
  const prefecturePattern = /(東京都|北海道|(?:京都|大阪)府|.{2,3}県)/;
  // 市区町村のパターン
  const cityPattern = /(.+?[市区町村郡])/;
  // 番地のパターン（数字-数字、数字丁目など）
  const addressNumberPattern = /(\d+[-−ー]\d+|\d+丁目|\d+番)/;
  
  // 都道府県または市区町村を含み、かつ番地パターンがある場合は住所と判定
  if ((prefecturePattern.test(query) || cityPattern.test(query)) && addressNumberPattern.test(query)) {
    return true;
  }
  
  // 都道府県 + 市区町村の組み合わせがある場合も住所と判定
  if (prefecturePattern.test(query) && cityPattern.test(query)) {
    return true;
  }
  
  return false;
}

/**
 * Google Geocoding APIで住所検索
 * 本番環境: Vercel Serverless Function経由（APIキー保護）
 * 開発環境: 直接Google API呼び出し
 * @param address 検索する住所
 * @returns 検索結果の配列
 * @throws APIエラー時（OVER_QUERY_LIMIT等）はエラーをスロー
 */
export async function searchWithGoogle(address: string): Promise<SearchResult[]> {
  // API使用量をチェック
  if (!canUseApi()) {
    console.warn('API使用量が上限に達しています。国土地理院APIにフォールバックします。');
    throw new Error('API_USAGE_LIMIT_EXCEEDED');
  }

  let url: string;

  if (isProduction()) {
    // 本番環境: Vercel Serverless Function経由
    url = `/api/geocode?address=${encodeURIComponent(address)}`;
  } else {
    // 開発環境: 直接Google API呼び出し
    const apiKey = CONFIG.GOOGLE_API_KEY;
    if (!apiKey || apiKey === 'YOUR_GOOGLE_API_KEY_HERE') {
      console.warn('Google APIキーが設定されていません。国土地理院APIにフォールバックします。');
      throw new Error('API_KEY_NOT_CONFIGURED');
    }
    url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}&language=ja&region=jp`;
  }

  const response = await fetchWithRetry(url);
  const data: GoogleGeocodingResponse = await response.json();

  // ステータスチェック
  if (data.status === 'OVER_QUERY_LIMIT' || data.status === 'OVER_DAILY_LIMIT') {
    console.warn(`Google API制限: ${data.status}`);
    throw new Error(data.status);
  }

  if (data.status === 'REQUEST_DENIED') {
    console.error('Google APIリクエスト拒否:', data.error_message);
    throw new Error('REQUEST_DENIED');
  }

  if (data.status === 'INVALID_REQUEST') {
    console.error('Google API無効なリクエスト:', data.error_message);
    throw new Error('INVALID_REQUEST');
  }

  if (data.status === 'ZERO_RESULTS' || !data.results || data.results.length === 0) {
    return [];
  }

  if (data.status !== 'OK') {
    console.error('Google APIエラー:', data.status, data.error_message);
    throw new Error(data.status);
  }

  // 成功時のみ使用量をインクリメント
  incrementUsage();

  return data.results.map((result) => ({
    name: result.formatted_address,
    lat: result.geometry.location.lat,
    lon: result.geometry.location.lng,
    source: 'Google',
  }));
}

/**
 * Google Places API (Text Search) で施設名検索
 * 本番環境: Vercel Serverless Function経由（APIキー保護）
 * 開発環境: 直接Google API呼び出し
 * @param query 検索する施設名
 * @returns 検索結果の配列
 */
export async function searchWithPlaces(query: string): Promise<SearchResult[]> {
  // API使用量をチェック（Geocodingと共有）
  if (!canUseApi()) {
    console.warn('API使用量が上限に達しています。国土地理院APIにフォールバックします。');
    throw new Error('API_USAGE_LIMIT_EXCEEDED');
  }

  let data: GooglePlacesResponse;

  if (isProduction()) {
    // 本番環境: Vercel Serverless Function経由
    const url = `/api/places?query=${encodeURIComponent(query)}`;
    const response = await fetchWithRetry(url);
    data = await response.json();
  } else {
    // 開発環境: 直接Google API呼び出し
    const apiKey = CONFIG.GOOGLE_API_KEY;
    if (!apiKey || apiKey === 'YOUR_GOOGLE_API_KEY_HERE') {
      console.warn('Google APIキーが設定されていません。国土地理院APIにフォールバックします。');
      throw new Error('API_KEY_NOT_CONFIGURED');
    }

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
    data = await response.json();
  }

  // エラーチェック
  if (data.error) {
    console.error('Places APIエラー:', data.error.message);
    throw new Error(data.error.status || 'PLACES_API_ERROR');
  }

  if (!data.places || data.places.length === 0) {
    return [];
  }

  // 成功時のみ使用量をインクリメント
  incrementUsage();

  return data.places.map((place) => ({
    name: `${place.displayName.text} (${place.formattedAddress})`,
    lat: place.location.latitude,
    lon: place.location.longitude,
    source: 'Google Places',
  }));
}

/**
 * 国土地理院APIで住所検索
 * @param address 検索する住所
 * @returns 検索結果の配列
 */
export async function searchWithGSI(address: string): Promise<SearchResult[]> {
  const url = `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(address)}`;

  const response = await fetch(url);
  const data: GSISearchItem[] = await response.json();

  if (!data || data.length === 0) {
    return [];
  }

  return data.map((item) => ({
    name: item.properties.title,
    lat: item.geometry.coordinates[1],
    lon: item.geometry.coordinates[0],
    source: '国土地理院',
  }));
}

/**
 * Nominatim APIで住所検索（最終フォールバック用）
 * @param address 検索する住所
 * @returns 検索結果の配列
 */
export async function searchWithNominatim(address: string): Promise<SearchResult[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&countrycodes=jp&limit=5`;

  const response = await fetch(url, {
    headers: {
      'Accept-Language': 'ja',
    },
  });
  const data: NominatimSearchItem[] = await response.json();

  if (!data || data.length === 0) {
    return [];
  }

  return data.map((item) => ({
    name: item.display_name,
    lat: parseFloat(item.lat),
    lon: parseFloat(item.lon),
    source: 'OpenStreetMap',
  }));
}

/**
 * DB内の地価ポイントを地名で検索
 * @param query 検索クエリ
 * @returns 検索結果の配列
 */
export async function searchLandPriceByName(query: string): Promise<SearchResult[]> {
  try {
    const url = `/api/search-landprice?q=${encodeURIComponent(query)}`;
    const response = await fetch(url);
    const data: LandPriceSearchResponse = await response.json();

    if (!data.results || data.results.length === 0) {
      return [];
    }

    return data.results.map((item) => {
      const parts: string[] = [];
      if (item.standardLotNumber) parts.push(item.standardLotNumber);
      if (item.cityName) parts.push(item.cityName);
      if (item.currentPrice) parts.push(`${item.currentPrice}円/㎡`);

      const name = parts.length > 0 ? parts.join(' - ') : `地価ポイント (${item.lat.toFixed(5)}, ${item.lon.toFixed(5)})`;

      return {
        name,
        lat: item.lat,
        lon: item.lon,
        source: '地価データベース',
      };
    });
  } catch (error) {
    console.log('地価データベース検索エラー:', error);
    return [];
  }
}

/**
 * 2つの座標間の距離（メートル）を簡易計算（ハバーサイン近似）
 */
function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // 地球の半径（メートル）
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * 複数APIの検索結果を統合し、近接する重複を除去
 * Google系の結果を優先し、200m以内の結果は1つにまとめる
 * @param results 複数APIの結果を結合した配列
 * @returns 重複除去後の配列（最大10件）
 */
function mergeAndDeduplicateResults(results: SearchResult[]): SearchResult[] {
  if (results.length === 0) return [];

  // ソース優先度: Google Places > Google > 国土地理院 > OpenStreetMap > 地価DB
  const sourcePriority: Record<string, number> = {
    'Google Places': 1,
    'Google': 2,
    '国土地理院': 3,
    'OpenStreetMap': 4,
    '地価データベース': 5,
  };

  // 優先度順にソート
  const sorted = [...results].sort(
    (a, b) => (sourcePriority[a.source] || 99) - (sourcePriority[b.source] || 99)
  );

  const merged: SearchResult[] = [];
  const DEDUP_RADIUS_METERS = 200;

  for (const result of sorted) {
    // 既に追加済みの結果と200m以内かチェック
    const isDuplicate = merged.some(
      (existing) => distanceMeters(existing.lat, existing.lon, result.lat, result.lon) < DEDUP_RADIUS_METERS
    );

    if (!isDuplicate) {
      merged.push(result);
    }
  }

  return merged.slice(0, 10);
}

/**
 * 住所または施設名を検索
 *
 * 住所の場合:
 *   Google Geocoding API → 国土地理院API → Nominatim API（順次フォールバック）
 *
 * 施設名の場合:
 *   地価DB → [Places API + Nominatim を並列実行して統合]
 *   → 全て0件なら Geocoding API にフォールバック
 *
 * @param query 検索するクエリ（住所または施設名）
 * @returns 検索結果の配列
 */
export async function searchAddress(query: string): Promise<SearchResult[]> {
  const isAddress = isAddressQuery(query);
  console.log(`検索クエリ "${query}" は${isAddress ? '住所' : '施設名'}として判定`);

  // まずDB内の地価ポイントを検索
  try {
    console.log('地価データベースで検索中...');
    const landPriceResults = await searchLandPriceByName(query);
    if (landPriceResults.length > 0) {
      console.log('地価データベースの結果:', landPriceResults.length, '件');
      return landPriceResults;
    }
    console.log('地価データベース: 結果なし');
  } catch (error) {
    console.log('地価データベース検索エラー - 住所検索にフォールバック');
  }

  // ──────────────────────────────────────────────
  // 施設名の場合: Places + Nominatim を並列実行して統合
  // Places が 0件の場合は Geocoding API で補完
  // ※ GSI（国土地理院）は住所検索用のため施設名検索には使用しない
  // ──────────────────────────────────────────────
  if (!isAddress) {
    console.log('施設名検索: Places + Nominatim を並列実行...');

    const [placesResult, nominatimResult] = await Promise.allSettled([
      searchWithPlaces(query).catch((err) => {
        console.log('Places APIエラー:', err instanceof Error ? err.message : err);
        return [] as SearchResult[];
      }),
      searchWithNominatim(query).catch(() => [] as SearchResult[]),
    ]);

    const placesResults: SearchResult[] =
      placesResult.status === 'fulfilled' ? placesResult.value : [];
    const nominatimResults: SearchResult[] =
      nominatimResult.status === 'fulfilled' ? nominatimResult.value : [];

    console.log('Google Places API:', placesResults.length, '件');
    console.log('Nominatim API:', nominatimResults.length, '件');

    // Places が 0件の場合: Geocoding API で補完
    // （漢字→ひらがな等の曖昧検索はGoogleが内部で処理してくれる）
    let geocodingResults: SearchResult[] = [];
    if (placesResults.length === 0) {
      console.log('Places 0件 → Geocoding APIで補完検索...');
      try {
        geocodingResults = await searchWithGoogle(query);
        console.log('Google Geocoding API:', geocodingResults.length, '件');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.log('Google Geocoding APIエラー:', errorMessage);
      }
    }

    // 全結果を統合（優先度: Places > Geocoding > Nominatim）
    const allResults = [...placesResults, ...geocodingResults, ...nominatimResults];

    if (allResults.length > 0) {
      const merged = mergeAndDeduplicateResults(allResults);
      console.log('統合結果:', merged.length, '件');
      return merged;
    }

    console.log('全API 0件');
    return [];
  }

  // ──────────────────────────────────────────────
  // 住所の場合: 従来通り順次フォールバック
  // ──────────────────────────────────────────────
  try {
    console.log('Google Geocoding APIで検索中...');
    const googleResults = await searchWithGoogle(query);
    if (googleResults.length > 0) {
      console.log('Google Geocoding APIの結果:', googleResults.length, '件');
      return googleResults;
    }
    console.log('Google Geocoding API: 結果なし');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.log('Google Geocoding APIエラー:', errorMessage, '- フォールバックします');
  }

  try {
    console.log('国土地理院APIで検索中...');
    const gsiResults = await searchWithGSI(query);
    if (gsiResults.length > 0) {
      console.log('国土地理院APIの結果:', gsiResults.length, '件');
      return gsiResults;
    }
    console.log('国土地理院API: 結果なし');
  } catch (error) {
    console.log('国土地理院APIエラー - Nominatimにフォールバックします');
  }

  try {
    console.log('Nominatim APIで検索中...');
    const nominatimResults = await searchWithNominatim(query);
    console.log('Nominatim APIの結果:', nominatimResults.length, '件');
    return nominatimResults;
  } catch (error) {
    console.error('すべてのAPIで検索に失敗しました');
    return [];
  }
}
