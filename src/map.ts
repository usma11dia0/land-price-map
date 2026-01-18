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
  // 地図を初期化（デフォルトのズームコントロールを無効化）
  map = L.map(containerId, {
    zoomControl: false,
  }).setView([DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lon], DEFAULT_ZOOM);

  // 右下にズームコントロールを追加
  L.control
    .zoom({
      position: 'bottomright',
    })
    .addTo(map);

  // OpenStreetMapのタイルレイヤーを追加
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  // 初期状態ではマーカーなし（検索後に表示）
  searchMarker = null;

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
  
  // ポップアップにStreet Viewボタンを含める
  const popupContent = `
    <b>${result.name}</b><br>
    <small>${result.source}</small><br>
    <button class="popup-streetview-btn" onclick="openStreetViewFromPopup()">
      📷 この地点の写真を見る
    </button>
    <small class="marker-hint">※ 地図をクリックでピン移動</small>
  `;
  searchMarker.bindPopup(popupContent).openPopup();
}

/**
 * 指定した座標にマーカーを移動
 * @param lat 緯度
 * @param lon 経度
 */
export function moveMarkerTo(lat: number, lon: number): void {
  // 既存のマーカーを削除
  if (searchMarker) {
    map.removeLayer(searchMarker);
  }

  // 新しいマーカーを追加
  searchMarker = L.marker([lat, lon]).addTo(map);
  
  // ポップアップにStreet Viewボタンを含める
  const popupContent = `
    <b>選択した地点</b><br>
    <button class="popup-streetview-btn" onclick="openStreetViewFromPopup()">
      📷 この地点の写真を見る
    </button>
    <small class="marker-hint">※ 地図をクリックでピン移動</small>
  `;
  searchMarker.bindPopup(popupContent).openPopup();
}

/**
 * 地図のクリックイベントを設定
 * @param callback クリック時に呼び出されるコールバック
 */
export function onMapClick(callback: () => void): void {
  map.on('click', callback);
}

/**
 * 現在のマーカー位置を取得
 * マーカーがない場合は地図の中心座標を返す
 * @returns 座標（緯度・経度）
 */
export function getCurrentMarkerPosition(): Coordinates {
  if (searchMarker) {
    const latLng = searchMarker.getLatLng();
    return { lat: latLng.lat, lon: latLng.lng };
  }
  // マーカーがない場合は地図の中心座標を返す
  return getMapCenter();
}

/**
 * 地図の中心座標を取得
 * @returns 座標（緯度・経度）
 */
export function getMapCenter(): Coordinates {
  const center = map.getCenter();
  return { lat: center.lat, lon: center.lng };
}

/**
 * 現在のズームレベルを取得
 * @returns ズームレベル
 */
export function getMapZoom(): number {
  return map.getZoom();
}
