/**
 * 検索機能モジュール
 * 住所検索の実行とUI連携を担当
 */

import type { SearchResult } from './types.js';
import { searchAddress as apiSearchAddress } from './api.js';
import { moveToSearchResult, onMapClick } from './map.js';
import { showSearchResults, hideSearchResults, setSearchButtonState } from './ui.js';

/** DOM要素 */
let searchInput: HTMLInputElement;
let searchButton: HTMLButtonElement;

/**
 * 検索機能を初期化
 */
export function initSearch(): void {
  searchInput = document.getElementById('search-input') as HTMLInputElement;
  searchButton = document.getElementById('search-button') as HTMLButtonElement;

  // 検索ボタンクリック時のイベント
  searchButton.addEventListener('click', () => {
    performSearch(searchInput.value);
  });

  // Enterキー押下時のイベント
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      performSearch(searchInput.value);
    }
  });

  // 地図クリック時に結果一覧を閉じる
  onMapClick(hideSearchResults);

  // 右パネルにホバーで検索結果を非表示にする
  const landPriceControl = document.getElementById('land-price-control');
  const savedLocationPanel = document.getElementById('saved-location-panel');
  const searchResultsEl = document.getElementById('search-results');

  if (landPriceControl) {
    landPriceControl.addEventListener('mouseenter', () => {
      if (searchResultsEl?.classList.contains('show')) {
        searchResultsEl.classList.add('hover-hidden');
      }
    });
    landPriceControl.addEventListener('mouseleave', () => {
      searchResultsEl?.classList.remove('hover-hidden');
    });
  }

  if (savedLocationPanel) {
    savedLocationPanel.addEventListener('mouseenter', () => {
      if (searchResultsEl?.classList.contains('show')) {
        searchResultsEl.classList.add('hover-hidden');
      }
    });
    savedLocationPanel.addEventListener('mouseleave', () => {
      searchResultsEl?.classList.remove('hover-hidden');
    });
  }
}

/**
 * 検索結果を選択した時の処理
 * @param result 選択された検索結果
 */
function handleResultSelect(result: SearchResult): void {
  hideSearchResults();
  moveToSearchResult(result);
}

/**
 * 住所検索を実行
 * @param address 検索する住所
 */
export async function performSearch(address: string): Promise<void> {
  if (!address.trim()) {
    alert('住所を入力してください');
    return;
  }

  // ボタンを無効化
  setSearchButtonState(searchButton, true);
  hideSearchResults();

  try {
    const results = await apiSearchAddress(address);
    showSearchResults(results, handleResultSelect);
  } catch (error) {
    console.error('検索エラー:', error);
    alert('検索中にエラーが発生しました。しばらく待ってから再度お試しください。');
  } finally {
    // ボタンを再度有効化
    setSearchButtonState(searchButton, false);
  }
}
