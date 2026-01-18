/**
 * UI操作モジュール
 * モーダル表示、通知メッセージ、検索結果リストの管理を担当
 */

import type { SearchResult } from './types.js';
import { getUsageData, getUsageLimit, resetUsageData } from './storage.js';

/** DOM要素 */
let settingsModal: HTMLElement;
let usageCurrentEl: HTMLElement;
let usageLimitEl: HTMLElement;
let usageRemainingEl: HTMLElement;
let usageBarFill: HTMLElement;
let searchResultsEl: HTMLElement;

/** 結果選択時のコールバック */
let onResultSelectCallback: ((result: SearchResult) => void) | null = null;

/**
 * UI要素を初期化
 */
export function initUI(): void {
  settingsModal = document.getElementById('settings-modal')!;
  usageCurrentEl = document.getElementById('usage-current')!;
  usageLimitEl = document.getElementById('usage-limit')!;
  usageRemainingEl = document.getElementById('usage-remaining')!;
  usageBarFill = document.getElementById('usage-bar-fill')!;
  searchResultsEl = document.getElementById('search-results')!;

  // グローバル関数を設定（HTMLからのonclick用）
  window.hideResults = hideSearchResults;
  window.selectResultByIndex = selectResultByIndex;
  window.closeSettingsModal = closeSettingsModal;
  window.resetUsage = resetUsage;
}

/**
 * 設定モーダルを開く
 */
export function openSettingsModal(): void {
  updateUsageDisplay();
  settingsModal.classList.add('show');
}

/**
 * 設定モーダルを閉じる
 */
export function closeSettingsModal(): void {
  settingsModal.classList.remove('show');
}

/**
 * 使用量表示を更新
 */
export function updateUsageDisplay(): void {
  const data = getUsageData();
  const limit = getUsageLimit();
  const remaining = Math.max(0, limit - data.count);
  const percentage = (data.count / limit) * 100;

  usageCurrentEl.textContent = String(data.count);
  usageLimitEl.textContent = String(limit);
  usageRemainingEl.textContent = String(remaining);

  usageBarFill.style.width = Math.min(percentage, 100) + '%';

  // 警告レベルの設定
  usageRemainingEl.classList.remove('warning', 'danger');
  usageBarFill.classList.remove('warning', 'danger');

  if (percentage >= 90) {
    usageRemainingEl.classList.add('danger');
    usageBarFill.classList.add('danger');
  } else if (percentage >= 70) {
    usageRemainingEl.classList.add('warning');
    usageBarFill.classList.add('warning');
  }
}

/**
 * 使用量をリセット
 */
export function resetUsage(): void {
  if (confirm('使用量をリセットしますか？')) {
    resetUsageData();
    updateUsageDisplay();
  }
}

/**
 * 検索結果を表示
 * @param results 検索結果の配列
 * @param onSelect 結果選択時のコールバック
 */
export function showSearchResults(
  results: SearchResult[],
  onSelect: (result: SearchResult) => void
): void {
  onResultSelectCallback = onSelect;

  if (results.length === 0) {
    searchResultsEl.innerHTML = '<div class="no-results">住所が見つかりませんでした</div>';
    searchResultsEl.classList.add('show');
    return;
  }

  if (results.length === 1) {
    // 結果が1件の場合は直接選択
    onSelect(results[0]);
    return;
  }

  // 複数の結果がある場合は一覧表示
  let html = `
    <div class="result-header">
      <span>検索結果（${results.length}件）</span>
      <button class="result-close" onclick="hideResults()">&times;</button>
    </div>
  `;

  results.forEach((result, index) => {
    html += `
      <div class="result-item" onclick="selectResultByIndex(${index})">
        ${result.name}
        <div class="result-source">データソース: ${result.source}</div>
      </div>
    `;
  });

  searchResultsEl.innerHTML = html;
  searchResultsEl.classList.add('show');

  // 結果をグローバルに保存
  window.currentResults = results;
}

/**
 * 検索結果一覧を非表示
 */
export function hideSearchResults(): void {
  searchResultsEl.classList.remove('show');
}

/**
 * インデックスで結果を選択
 * @param index 選択するインデックス
 */
function selectResultByIndex(index: number): void {
  if (window.currentResults && window.currentResults[index] && onResultSelectCallback) {
    onResultSelectCallback(window.currentResults[index]);
  }
}

/**
 * 検索ボタンの状態を設定
 * @param button ボタン要素
 * @param isLoading ローディング中かどうか
 */
export function setSearchButtonState(button: HTMLButtonElement, isLoading: boolean): void {
  button.disabled = isLoading;
  button.textContent = isLoading ? '検索中...' : '検索';
}

/**
 * モーダル用のイベントリスナーを設定
 */
export function setupModalEventListeners(): void {
  const settingsButton = document.getElementById('settings-button')!;

  // 設定ボタンのクリックイベント
  settingsButton.addEventListener('click', openSettingsModal);

  // モーダル背景クリックで閉じる
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      closeSettingsModal();
    }
  });

  // ESCキーでモーダルを閉じる
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && settingsModal.classList.contains('show')) {
      closeSettingsModal();
    }
  });
}
