/**
 * API呼び出しモジュール
 * Google Geocoding API、国土地理院API、Nominatim APIによる住所検索を担当
 */

import type {
  SearchResult,
  GSISearchItem,
  NominatimSearchItem,
  GoogleGeocodingResponse,
} from './types.js';
import { CONFIG } from './config.js';
import { canUseApi, incrementUsage } from './storage.js';

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

  const response = await fetch(url);
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
 * 住所を検索
 * 優先順位: Google Geocoding API > 国土地理院API > Nominatim API
 * @param address 検索する住所
 * @returns 検索結果の配列
 */
export async function searchAddress(address: string): Promise<SearchResult[]> {
  // 1. まずGoogle Geocoding APIで検索
  try {
    console.log('Google Geocoding APIで検索中...');
    const googleResults = await searchWithGoogle(address);
    if (googleResults.length > 0) {
      console.log('Google Geocoding APIの結果:', googleResults.length, '件');
      return googleResults;
    }
    console.log('Google Geocoding API: 結果なし');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.log('Google Geocoding APIエラー:', errorMessage, '- フォールバックします');
  }

  // 2. 国土地理院APIで検索
  try {
    console.log('国土地理院APIで検索中...');
    const gsiResults = await searchWithGSI(address);
    if (gsiResults.length > 0) {
      console.log('国土地理院APIの結果:', gsiResults.length, '件');
      return gsiResults;
    }
    console.log('国土地理院API: 結果なし');
  } catch (error) {
    console.log('国土地理院APIエラー - Nominatimにフォールバックします');
  }

  // 3. 最終手段: Nominatim APIで検索
  try {
    console.log('Nominatim APIで検索中...');
    const nominatimResults = await searchWithNominatim(address);
    console.log('Nominatim APIの結果:', nominatimResults.length, '件');
    return nominatimResults;
  } catch (error) {
    console.error('すべてのAPIで検索に失敗しました');
    return [];
  }
}
