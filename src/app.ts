/**
 * メインアプリケーション
 * アプリケーションの初期化を担当
 */

import { initMap, moveMarkerTo, getMapCenter, getMapZoom } from './map.js';
import { initSearch } from './search.js';
import { initUI, setupModalEventListeners, hideSearchResults } from './ui.js';
import { initLandPriceUI } from './landPriceUI.js';
import { initSavedLocationUI } from './savedLocationUI.js';
import { getUrlState } from './urlState.js';

/** Leaflet型の簡易定義 */
declare const L: typeof import('leaflet');

/**
 * アプリケーションを初期化
 */
function initApp(): void {
  console.log('地価情報マップを初期化中...');

  // URLパラメータを解析
  const urlState = getUrlState();

  // 地図を初期化（URLパラメータがあればその座標を使用）
  const map = initMap('map', urlState);

  // URLに座標が指定されていればマーカーを配置
  if (urlState.lat !== null && urlState.lon !== null) {
    moveMarkerTo(urlState.lat, urlState.lon);
  }

  // UI要素を初期化
  initUI();

  // モーダルのイベントリスナーを設定
  setupModalEventListeners();

  // 検索機能を初期化
  initSearch();

  // 地価情報UIを初期化
  initLandPriceUI();

  // 登録地点UIを初期化
  initSavedLocationUI();

  // 地図クリックでピンを移動
  map.on('click', (e: L.LeafletMouseEvent) => {
    moveMarkerTo(e.latlng.lat, e.latlng.lng);
    hideSearchResults();
  });

  // 外部リンクボタン（画面中央の座標を使用）
  initExternalLinkButtons();

  console.log('初期化完了');
}

/**
 * WGS84座標を日本測地系（Tokyo Datum）に簡易変換
 */
function convertWGS84ToTokyo(lat: number, lon: number): { lat: number; lon: number } {
  const latTokyo = lat + lat * 0.00010695 - lon * 0.000017464 - 0.0046017;
  const lonTokyo = lon + lat * 0.000046038 + lon * 0.000083043 - 0.010040;
  return { lat: latTokyo, lon: lonTokyo };
}

/**
 * 外部リンクボタンを初期化（画面中央の座標を使用）
 */
function initExternalLinkButtons(): void {
  const btnChikamap = document.getElementById('btn-chikamap');
  const btnGoogleMaps = document.getElementById('btn-google-maps');

  if (btnChikamap) {
    btnChikamap.addEventListener('click', () => {
      const center = getMapCenter();
      const tokyoCoord = convertWGS84ToTokyo(center.lat, center.lon);
      const url = `https://www.chikamap.jp/chikamap/Map?mid=325&mpx=${tokyoCoord.lon.toFixed(6)}&mpy=${tokyoCoord.lat.toFixed(6)}&mps=1000`;
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  }

  if (btnGoogleMaps) {
    btnGoogleMaps.addEventListener('click', () => {
      const center = getMapCenter();
      const url = `https://www.google.com/maps?q=${center.lat.toFixed(6)},${center.lon.toFixed(6)}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  }

  const btnHazardmap = document.getElementById('btn-hazardmap');
  if (btnHazardmap) {
    btnHazardmap.addEventListener('click', () => {
      const center = getMapCenter();
      const zoom = getMapZoom();
      const url = `https://disaportal.gsi.go.jp/hazardmap/maps/index.html?ll=${center.lat.toFixed(6)},${center.lon.toFixed(6)}&z=${zoom}&base=pale&vs=c1j0l0u0t0h0z0`;
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  }
}

// DOMContentLoadedイベントでアプリケーションを初期化
document.addEventListener('DOMContentLoaded', initApp);
