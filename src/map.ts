/**
 * 地図操作モジュール
 * Leafletを使用した地図の初期化・操作を担当
 */

import type { SearchResult, Coordinates } from './types.js';
import type { UrlState } from './urlState.js';
import { updateUrlState } from './urlState.js';

/** Leaflet型の簡易定義 */
declare const L: typeof import('leaflet');

/** 検索/クリック用マーカーの緑色SVGアイコン（小さめサイズ） */
function createGreenPinIcon(): L.DivIcon {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 34" width="24" height="34">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 8.4 12 22 12 22s12-13.6 12-22C24 5.37 18.63 0 12 0z" fill="#2ecc71" stroke="white" stroke-width="1.5"/>
    <circle cx="12" cy="11.5" r="4.5" fill="white"/>
  </svg>`;
  return L.divIcon({
    className: 'search-pin-marker',
    html: svg,
    iconSize: [24, 34],
    iconAnchor: [12, 34],
    popupAnchor: [0, -34],
  });
}

/** 登録地点UIからのインポート（遅延） */
let openRegisterDialogFromMap: ((lat: number, lon: number) => void) | null = null;

/**
 * 登録地点UIの関数を設定（循環参照を避けるため）
 */
export function setRegisterDialogHandler(handler: (lat: number, lon: number) => void): void {
  openRegisterDialogFromMap = handler;
  // ポップアップ内のボタンからも呼べるようにグローバルに公開
  (window as unknown as Record<string, unknown>).__registerFromSearchMarker = handler;
}

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
 * @param initialState URLパラメータから取得した初期状態（オプション）
 * @returns 地図インスタンス
 */
export function initMap(containerId: string, initialState?: UrlState): L.Map {
  const initLat = initialState?.lat ?? DEFAULT_LOCATION.lat;
  const initLon = initialState?.lon ?? DEFAULT_LOCATION.lon;
  const initZoom = initialState?.zoom ?? DEFAULT_ZOOM;

  // 地図を初期化（デフォルトのズームコントロールを無効化）
  map = L.map(containerId, {
    zoomControl: false,
  }).setView([initLat, initLon], initZoom);

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

  // 右クリックでカスタムマーカー追加
  map.on('contextmenu', (e: L.LeafletMouseEvent) => {
    if (openRegisterDialogFromMap) {
      openRegisterDialogFromMap(e.latlng.lat, e.latlng.lng);
    }
  });

  // 地図移動時にURLを更新
  map.on('moveend', () => {
    const center = map.getCenter();
    updateUrlState(center.lat, center.lng, map.getZoom());
  });

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

  // 新しいマーカーを追加（緑色のカスタムピン）
  searchMarker = L.marker([result.lat, result.lon], { icon: createGreenPinIcon() }).addTo(map);
  
  const popupContent = `
    <b>${result.name}</b><br>
    <small>${result.source}</small><br>
    <small class="marker-hint">※ 地図をクリックでピン移動</small>
    <div class="search-popup-actions">
      <button class="search-popup-register-btn" onclick="window.__registerFromSearchMarker(${result.lat}, ${result.lon})">地点を登録</button>
    </div>
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

  // 新しいマーカーを追加（緑色のカスタムピン）
  searchMarker = L.marker([lat, lon], { icon: createGreenPinIcon() }).addTo(map);
  
  const popupContent = `
    <b>選択した地点</b><br>
    <small class="marker-hint">※ 地図をクリックでピン移動</small>
    <div class="search-popup-actions">
      <button class="search-popup-register-btn" onclick="window.__registerFromSearchMarker(${lat}, ${lon})">地点を登録</button>
    </div>
  `;
  searchMarker.bindPopup(popupContent).openPopup();
}

/**
 * 検索マーカーを削除
 * 登録地点に登録された場合など、メインマーカーが不要になった時に呼び出す
 */
export function removeSearchMarker(): void {
  if (searchMarker) {
    map.removeLayer(searchMarker);
    searchMarker = null;
  }
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
