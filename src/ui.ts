/**
 * UI操作モジュール
 * モーダル表示、通知メッセージ、検索結果リストの管理を担当
 */

import type { SearchResult } from './types.js';
import { getUsageData, getUsageLimit } from './storage.js';
import { getCurrentMarkerPosition } from './map.js';

/** DOM要素 */
let settingsModal: HTMLElement;
let streetViewModal: HTMLElement;
let streetViewImage: HTMLImageElement;
let streetViewLoading: HTMLElement;
let streetViewError: HTMLElement;
let streetViewDate: HTMLElement;
let streetViewHeading: HTMLInputElement;
let streetViewHeadingValue: HTMLElement;
let usageCurrentEl: HTMLElement;
let usageLimitEl: HTMLElement;
let usageRemainingEl: HTMLElement;
let usageTotalEl: HTMLElement;
let usageBarFill: HTMLElement;
let searchResultsEl: HTMLElement;

/** 現在のStreet View座標 */
let currentStreetViewLat: number = 0;
let currentStreetViewLon: number = 0;

/** 結果選択時のコールバック */
let onResultSelectCallback: ((result: SearchResult) => void) | null = null;

/**
 * UI要素を初期化
 */
export function initUI(): void {
  settingsModal = document.getElementById('settings-modal')!;
  streetViewModal = document.getElementById('streetview-modal')!;
  streetViewImage = document.getElementById('streetview-image') as HTMLImageElement;
  streetViewLoading = document.getElementById('streetview-loading')!;
  streetViewError = document.getElementById('streetview-error')!;
  streetViewDate = document.getElementById('streetview-date')!;
  streetViewHeading = document.getElementById('streetview-heading') as HTMLInputElement;
  streetViewHeadingValue = document.getElementById('streetview-heading-value')!;
  usageCurrentEl = document.getElementById('usage-current')!;
  usageLimitEl = document.getElementById('usage-limit')!;
  usageRemainingEl = document.getElementById('usage-remaining')!;
  usageTotalEl = document.getElementById('usage-total')!;
  usageBarFill = document.getElementById('usage-bar-fill')!;
  searchResultsEl = document.getElementById('search-results')!;

  // グローバル関数を設定（HTMLからのonclick用）
  window.hideResults = hideSearchResults;
  window.selectResultByIndex = selectResultByIndex;
  window.closeSettingsModal = closeSettingsModal;
  window.closeStreetViewModal = closeStreetViewModal;
  window.openStreetViewFromPopup = openStreetViewModal;

  // Street View方角スライダーのイベント
  streetViewHeading.addEventListener('input', () => {
    const heading = streetViewHeading.value;
    streetViewHeadingValue.textContent = `${heading}°`;
    updateStreetViewImage(Number(heading));
  });
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
 * ストリートビューモーダルを開く
 */
export function openStreetViewModal(): void {
  const position = getCurrentMarkerPosition();
  currentStreetViewLat = position.lat;
  currentStreetViewLon = position.lon;

  // 初期状態をリセット
  streetViewHeading.value = '0';
  streetViewHeadingValue.textContent = '0°';
  streetViewImage.style.display = 'none';
  streetViewError.style.display = 'none';
  streetViewDate.style.display = 'none';
  streetViewLoading.style.display = 'block';

  streetViewModal.classList.add('show');

  // Street View画像を取得
  loadStreetViewImage(0);
}

/**
 * ストリートビューモーダルを閉じる
 */
export function closeStreetViewModal(): void {
  streetViewModal.classList.remove('show');
}

/**
 * Street View画像を読み込む
 * @param heading 方角（0-360）
 */
async function loadStreetViewImage(heading: number): Promise<void> {
  const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
  
  try {
    let captureDate: string | null = null;

    if (isProduction) {
      // 本番環境: Vercel Serverless Functionを使用
      // まずメタデータをチェック
      const metadataUrl = `/api/streetview-metadata?lat=${currentStreetViewLat}&lon=${currentStreetViewLon}`;
      const metadataResponse = await fetch(metadataUrl);
      const metadata = await metadataResponse.json();

      if (metadata.status !== 'OK') {
        // Street Viewが利用できない
        streetViewLoading.style.display = 'none';
        streetViewImage.style.display = 'none';
        streetViewDate.style.display = 'none';
        streetViewError.style.display = 'block';
        return;
      }

      // 撮影日を取得（例: "2023-05" → "2023年5月"）
      if (metadata.date) {
        captureDate = formatCaptureDate(metadata.date);
      }

      // 画像を取得
      const imageUrl = `/api/streetview?lat=${currentStreetViewLat}&lon=${currentStreetViewLon}&heading=${heading}`;
      streetViewImage.src = imageUrl;
    } else {
      // 開発環境: 直接Google APIを使用
      const { CONFIG } = await import('./config.js');
      
      // 開発環境でもメタデータを取得して撮影日を表示
      const metadataUrl = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${currentStreetViewLat},${currentStreetViewLon}&key=${CONFIG.GOOGLE_API_KEY}`;
      const metadataResponse = await fetch(metadataUrl);
      const metadata = await metadataResponse.json();
      
      if (metadata.status !== 'OK') {
        streetViewLoading.style.display = 'none';
        streetViewImage.style.display = 'none';
        streetViewDate.style.display = 'none';
        streetViewError.style.display = 'block';
        return;
      }

      if (metadata.date) {
        captureDate = formatCaptureDate(metadata.date);
      }

      const imageUrl = `https://maps.googleapis.com/maps/api/streetview?size=600x400&location=${currentStreetViewLat},${currentStreetViewLon}&heading=${heading}&key=${CONFIG.GOOGLE_API_KEY}`;
      streetViewImage.src = imageUrl;
    }

    // 画像読み込み完了時
    streetViewImage.onload = () => {
      streetViewLoading.style.display = 'none';
      streetViewError.style.display = 'none';
      streetViewImage.style.display = 'block';
      
      // 撮影日を表示
      if (captureDate) {
        streetViewDate.textContent = `📅 ${captureDate}`;
        streetViewDate.style.display = 'block';
      }
    };

    // 画像読み込みエラー時
    streetViewImage.onerror = () => {
      streetViewLoading.style.display = 'none';
      streetViewImage.style.display = 'none';
      streetViewDate.style.display = 'none';
      streetViewError.style.display = 'block';
    };
  } catch (error) {
    console.error('Street View error:', error);
    streetViewLoading.style.display = 'none';
    streetViewImage.style.display = 'none';
    streetViewDate.style.display = 'none';
    streetViewError.style.display = 'block';
  }
}

/**
 * 撮影日をフォーマット（例: "2023-05" → "2023年5月撮影"）
 * @param dateStr APIから返される日付文字列（YYYY-MM形式）
 * @returns フォーマットされた日付文字列
 */
function formatCaptureDate(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length >= 2) {
    const year = parts[0];
    const month = parseInt(parts[1], 10);
    return `${year}年${month}月撮影`;
  }
  return `${dateStr} 撮影`;
}

/**
 * Street View画像を更新（方角変更時）
 * @param heading 方角（0-360）
 */
function updateStreetViewImage(heading: number): void {
  // デバウンス処理のため、少し遅延させて画像を更新
  const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
  
  if (isProduction) {
    streetViewImage.src = `/api/streetview?lat=${currentStreetViewLat}&lon=${currentStreetViewLon}&heading=${heading}`;
  } else {
    import('./config.js').then(({ CONFIG }) => {
      streetViewImage.src = `https://maps.googleapis.com/maps/api/streetview?size=600x400&location=${currentStreetViewLat},${currentStreetViewLon}&heading=${heading}&key=${CONFIG.GOOGLE_API_KEY}`;
    });
  }
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
  usageTotalEl.textContent = String(data.totalCount || 0);

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

  // 住所検索（Google Geocoding/国土地理院）で1件の場合は直接選択
  // 施設検索（Google Places）の場合は1件でも候補リストを表示（位置確認のため）
  const isPlacesResult = results.some((r) => r.source === 'Google Places');
  if (results.length === 1 && !isPlacesResult) {
    onSelect(results[0]);
    return;
  }

  // 結果を一覧表示（施設検索の場合は1件でも表示）
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

  // 設定モーダル背景クリックで閉じる
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      closeSettingsModal();
    }
  });

  // ストリートビューモーダル背景クリックで閉じる
  streetViewModal.addEventListener('click', (e) => {
    if (e.target === streetViewModal) {
      closeStreetViewModal();
    }
  });

  // ESCキーでモーダルを閉じる
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (settingsModal.classList.contains('show')) {
        closeSettingsModal();
      }
      if (streetViewModal.classList.contains('show')) {
        closeStreetViewModal();
      }
    }
  });
}

/**
 * 外部リンクボタンのイベントリスナーを設定
 */
export function setupExternalLinkButtons(): void {
  const btnChikamap = document.getElementById('btn-chikamap')!;
  const btnGoogleMaps = document.getElementById('btn-google-maps')!;

  // 固定資産税路線価（全国地価マップ）
  btnChikamap.addEventListener('click', () => {
    openExternalLink('chikamap');
  });

  // Googleマップ
  btnGoogleMaps.addEventListener('click', () => {
    openExternalLink('google-maps');
  });
}

/**
 * WGS84座標を日本測地系（Tokyo Datum）に変換
 * 全国地価マップは日本測地系を使用している可能性があるため
 * @param lat WGS84緯度
 * @param lon WGS84経度
 * @returns 日本測地系の座標
 */
function convertWGS84ToTokyo(lat: number, lon: number): { lat: number; lon: number } {
  // 国土地理院の簡易変換式（逆変換）
  // 参考: https://www.gsi.go.jp/LAW/G2000-g2000faq-1.htm
  const latTokyo = lat + lat * 0.00010695 - lon * 0.000017464 - 0.0046017;
  const lonTokyo = lon + lat * 0.000046038 + lon * 0.000083043 - 0.010040;
  return { lat: latTokyo, lon: lonTokyo };
}

/**
 * 外部サイトを新しいタブで開く
 * @param site サイト識別子
 */
function openExternalLink(site: 'chikamap' | 'google-maps'): void {
  const position = getCurrentMarkerPosition();
  let url: string;

  switch (site) {
    case 'chikamap':
      // 全国地価マップ（固定資産税路線価）
      // mid=325: 固定資産税路線価, mpx: 経度, mpy: 緯度, mps: スケール（大きいほどズームイン）
      // 全国地価マップは日本測地系を使用している可能性があるため変換を適用
      const tokyoCoord = convertWGS84ToTokyo(position.lat, position.lon);
      url = `https://www.chikamap.jp/chikamap/Map?mid=325&mpx=${tokyoCoord.lon.toFixed(6)}&mpy=${tokyoCoord.lat.toFixed(6)}&mps=1000`;
      break;

    case 'google-maps':
      // Googleマップ（query形式でピンを表示）
      url = `https://www.google.com/maps?q=${position.lat.toFixed(6)},${position.lon.toFixed(6)}`;
      break;

    default:
      return;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
}
