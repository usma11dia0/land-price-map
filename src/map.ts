/**
 * 地図操作モジュール
 * Leafletを使用した地図の初期化・操作を担当
 */

import type { SearchResult, Coordinates } from './types.js';

/** Leaflet型の簡易定義 */
declare const L: typeof import('leaflet');

/** 地図インスタンス */
let map: L.Map;

/** 検索結果のマーカー */
let searchMarker: L.Marker | null = null;

/** 東京駅の座標（デフォルト位置） */
const DEFAULT_LOCATION: Coordinates = {
  lat: 35.6812,
  lon: 139.7671,
};

/** デフォルトのズームレベル */
const DEFAULT_ZOOM = 15;

/** 検索結果選択時のズームレベル */
const SEARCH_ZOOM = 17;

/**
 * 地図を初期化
 * @param containerId 地図を表示するコンテナのID
 * @returns 地図インスタンス
 */
export function initMap(containerId: string): L.Map {
  // 地図を初期化（東京駅を中心にズームレベル15で表示）
  map = L.map(containerId).setView([DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lon], DEFAULT_ZOOM);

  // OpenStreetMapのタイルレイヤーを追加
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  // 東京駅にマーカーを追加
  searchMarker = L.marker([DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lon]).addTo(map);
  searchMarker.bindPopup('<b>東京駅</b>').openPopup();

  return map;
}

/**
 * 地図インスタンスを取得
 * @returns 地図インスタンス
 */
export function getMap(): L.Map {
  return map;
}

/**
 * 検索結果の地点に地図を移動しマーカーを設置
 * @param result 検索結果
 */
export function moveToSearchResult(result: SearchResult): void {
  // 既存のマーカーを削除
  if (searchMarker) {
    map.removeLayer(searchMarker);
  }

  // 地図を移動
  map.setView([result.lat, result.lon], SEARCH_ZOOM);

  // 新しいマーカーを追加
  searchMarker = L.marker([result.lat, result.lon]).addTo(map);
  searchMarker.bindPopup(`<b>${result.name}</b><br><small>${result.source}</small>`).openPopup();
}

/**
 * 地図のクリックイベントを設定
 * @param callback クリック時に呼び出されるコールバック
 */
export function onMapClick(callback: () => void): void {
  map.on('click', callback);
}
