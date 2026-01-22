/**
 * メインアプリケーション
 * アプリケーションの初期化を担当
 */

import { initMap, moveMarkerTo } from './map.js';
import { initSearch } from './search.js';
import { initUI, setupModalEventListeners, setupExternalLinkButtons, hideSearchResults } from './ui.js';
import { initLandPriceUI } from './landPriceUI.js';

/** Leaflet型の簡易定義 */
declare const L: typeof import('leaflet');

/**
 * アプリケーションを初期化
 */
function initApp(): void {
  console.log('地価情報マップを初期化中...');

  // 地図を初期化
  const map = initMap('map');

  // UI要素を初期化
  initUI();

  // モーダルのイベントリスナーを設定
  setupModalEventListeners();

  // 外部リンクボタンのイベントリスナーを設定
  setupExternalLinkButtons();

  // 検索機能を初期化
  initSearch();

  // 地価情報UIを初期化
  initLandPriceUI();

  // 地図クリックでピンを移動
  map.on('click', (e: L.LeafletMouseEvent) => {
    moveMarkerTo(e.latlng.lat, e.latlng.lng);
    hideSearchResults();
  });

  console.log('初期化完了');
}

// DOMContentLoadedイベントでアプリケーションを初期化
document.addEventListener('DOMContentLoaded', initApp);
