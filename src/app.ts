/**
 * メインアプリケーション
 * アプリケーションの初期化を担当
 */

import { initMap } from './map.js';
import { initSearch } from './search.js';
import { initUI, setupModalEventListeners } from './ui.js';

/**
 * アプリケーションを初期化
 */
function initApp(): void {
  console.log('地価情報マップを初期化中...');

  // 地図を初期化
  initMap('map');

  // UI要素を初期化
  initUI();

  // モーダルのイベントリスナーを設定
  setupModalEventListeners();

  // 検索機能を初期化
  initSearch();

  console.log('初期化完了');
}

// DOMContentLoadedイベントでアプリケーションを初期化
document.addEventListener('DOMContentLoaded', initApp);
