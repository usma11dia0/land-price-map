/**
 * 登録地点UI管理モジュール
 * マーカー表示、ダイアログ、リストパネルの管理を担当
 */

import type { SavedLocation, LandPriceLocationData } from './savedLocationTypes.js';
import { COLOR_PALETTE, DEFAULT_COLOR } from './savedLocationTypes.js';
import {
  getSavedLocations,
  addSavedLocation,
  updateSavedLocation,
  removeSavedLocation,
} from './savedLocationStorage.js';
import { getMap, setRegisterDialogHandler } from './map.js';

/** Leaflet型の簡易定義 */
declare const L: typeof import('leaflet');

/** DOM要素 */
let savedLocationPanel: HTMLElement;
let savedLocationList: HTMLElement;
let registerDialog: HTMLElement;

/** 登録地点マーカーのレイヤーグループ */
let savedLocationLayerGroup: L.LayerGroup | null = null;

/** マーカーのマップ（id -> marker） */
const markerMap: Map<string, L.Marker> = new Map();

/** ダイアログモード */
type DialogMode = 'register' | 'edit';
let currentDialogMode: DialogMode = 'register';

/** 編集中の登録地点ID */
let editingLocationId: string | null = null;

/** ダイアログ用の一時データ（新規登録時のみ使用） */
let pendingLocationData: {
  lat: number;
  lon: number;
  type: 'landprice' | 'custom';
  defaultName: string;
  landPriceData?: LandPriceLocationData;
} | null = null;

/**
 * 登録地点UIを初期化
 */
export function initSavedLocationUI(): void {
  // DOM要素を取得
  savedLocationPanel = document.getElementById('saved-location-panel')!;
  savedLocationList = document.getElementById('saved-location-list')!;
  registerDialog = document.getElementById('register-location-dialog')!;

  // レイヤーグループを作成
  const map = getMap();
  savedLocationLayerGroup = L.layerGroup().addTo(map);

  // イベントリスナーを設定
  setupEventListeners();

  // 保存済みの登録地点を読み込み
  loadSavedLocations();

  // グローバル関数を設定
  window.closeRegisterDialog = closeRegisterDialog;
  window.submitRegisterDialog = submitRegisterDialog;
  window.toggleSavedLocationPanel = toggleSavedLocationPanel;
  window.removeSavedLocationFromList = removeSavedLocationFromList;
  window.goToSavedLocation = goToSavedLocation;
  window.editSavedLocation = editSavedLocation;

  // 右クリックでカスタムマーカー追加のハンドラを設定
  setRegisterDialogHandler(openRegisterDialogFromMap);

  console.log('登録地点UI初期化完了');
}

/**
 * イベントリスナーを設定
 */
function setupEventListeners(): void {
  // パネルヘッダーのクリックで折りたたみ
  const panelHeader = savedLocationPanel.querySelector('.saved-location-panel-header');
  if (panelHeader) {
    panelHeader.addEventListener('click', () => {
      toggleSavedLocationPanel();
    });
  }

  // ダイアログ背景クリックで閉じる
  registerDialog.addEventListener('click', (e) => {
    if (e.target === registerDialog) {
      closeRegisterDialog();
    }
  });

  // ESCキーでダイアログを閉じる
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && registerDialog.classList.contains('show')) {
      closeRegisterDialog();
    }
  });

  // 色選択のイベント
  const colorOptions = registerDialog.querySelectorAll('.color-option');
  colorOptions.forEach((option) => {
    option.addEventListener('click', () => {
      colorOptions.forEach((o) => o.classList.remove('selected'));
      option.classList.add('selected');
    });
  });
}

/**
 * 保存済みの登録地点を読み込み表示
 */
function loadSavedLocations(): void {
  const locations = getSavedLocations();
  
  // マーカーを表示
  locations.forEach((location) => {
    addMarkerToMap(location);
  });
  
  // リストを更新
  updateLocationList();
}

/**
 * マーカーをマップに追加
 */
function addMarkerToMap(location: SavedLocation): void {
  const marker = createSavedLocationMarker(location);
  
  if (savedLocationLayerGroup) {
    marker.addTo(savedLocationLayerGroup);
  }
  
  markerMap.set(location.id, marker);
}

/**
 * マーカーを更新
 */
function updateMarkerOnMap(location: SavedLocation): void {
  // 既存のマーカーを削除
  const existingMarker = markerMap.get(location.id);
  if (existingMarker && savedLocationLayerGroup) {
    savedLocationLayerGroup.removeLayer(existingMarker);
  }
  
  // 新しいマーカーを作成して追加
  const newMarker = createSavedLocationMarker(location);
  if (savedLocationLayerGroup) {
    newMarker.addTo(savedLocationLayerGroup);
  }
  markerMap.set(location.id, newMarker);
}

/**
 * 登録地点マーカーを作成
 */
function createSavedLocationMarker(location: SavedLocation): L.Marker {
  // 表示名：マーカー名（name）を使用
  const displayName = location.name;
  
  // カスタムアイコンを作成（地価マーカーと同じ形式）
  const icon = L.divIcon({
    className: 'saved-location-marker',
    html: `<div class="marker-icon" style="--marker-color: ${location.color};"></div><div class="marker-label">${escapeHtml(displayName)}</div>`,
    iconSize: [24, 34],
    iconAnchor: [12, 34],
  });

  const marker = L.marker([location.lat, location.lon], { icon });

  // クリックでポップアップ表示
  marker.bindPopup(createPopupContent(location));

  return marker;
}

/**
 * ポップアップ内容を作成
 */
function createPopupContent(location: SavedLocation): string {
  let content = `
    <div class="saved-location-popup">
      <div class="popup-header" style="border-left: 4px solid ${location.color};">
        <strong>${escapeHtml(location.name)}</strong>
      </div>
  `;

  if (location.type === 'landprice' && location.landPriceData) {
    content += `
      <div class="popup-info">
        <div>${escapeHtml(location.landPriceData.standardLotNumber)}</div>
        <div class="popup-price">${escapeHtml(location.landPriceData.currentPrice)}</div>
      </div>
    `;
  }

  if (location.memo) {
    content += `<div class="popup-memo">${escapeHtml(location.memo)}</div>`;
  }

  content += `
      <div class="popup-actions">
        <button onclick="editSavedLocation('${location.id}')" class="popup-btn">編集</button>
        <button onclick="removeSavedLocationFromList('${location.id}')" class="popup-btn popup-btn-danger">削除</button>
      </div>
    </div>
  `;

  return content;
}

/**
 * リストを更新
 */
function updateLocationList(): void {
  const locations = getSavedLocations();
  
  if (locations.length === 0) {
    savedLocationList.innerHTML = '<div class="saved-location-empty">右クリックで地点を登録</div>';
    return;
  }

  savedLocationList.innerHTML = locations.map((location) => {
    // 表示名：マーカー名（name）を使用
    const displayName = location.name;
    // 詳細表示：地価マーカーの場合は価格、メモがあればメモ
    let detailText = '';
    if (location.type === 'landprice' && location.landPriceData) {
      detailText = location.landPriceData.currentPrice;
    } else if (location.memo) {
      detailText = location.memo;
    }
    
    return `
    <div class="saved-location-item" data-id="${location.id}">
      <div class="saved-location-color" style="background-color: ${location.color};"></div>
      <div class="saved-location-info" onclick="editSavedLocation('${location.id}')">
        <div class="saved-location-name">${escapeHtml(displayName)}</div>
        ${detailText ? `<div class="saved-location-detail">${escapeHtml(detailText)}</div>` : ''}
      </div>
      <button class="saved-location-delete" onclick="event.stopPropagation(); removeSavedLocationFromList('${location.id}')" title="削除">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
      </button>
    </div>
  `;
  }).join('');
}

/**
 * パネルの折りたたみ切り替え
 */
export function toggleSavedLocationPanel(): void {
  savedLocationPanel.classList.toggle('collapsed');
}

/**
 * 地価ポイントから登録ダイアログを開く
 */
export function openRegisterDialogFromLandPrice(
  lat: number,
  lon: number,
  landPriceData: LandPriceLocationData
): void {
  pendingLocationData = {
    lat,
    lon,
    type: 'landprice',
    defaultName: landPriceData.standardLotNumber,
    landPriceData,
  };

  openRegisterDialog(landPriceData.standardLotNumber);
}

/**
 * カスタム地点から登録ダイアログを開く
 */
export function openRegisterDialogFromMap(lat: number, lon: number): void {
  pendingLocationData = {
    lat,
    lon,
    type: 'custom',
    defaultName: `地点 (${lat.toFixed(5)}, ${lon.toFixed(5)})`,
  };

  openRegisterDialog(pendingLocationData.defaultName);
}

/**
 * 登録ダイアログを開く
 */
function openRegisterDialog(defaultName: string): void {
  currentDialogMode = 'register';
  editingLocationId = null;
  
  // タイトルとボタンを設定
  const titleEl = document.getElementById('register-dialog-title');
  const submitBtn = document.getElementById('register-submit-btn');
  if (titleEl) titleEl.textContent = '地点を登録';
  if (submitBtn) submitBtn.textContent = '登録';
  
  // 入力フィールドをリセット
  const nameInput = document.getElementById('register-name') as HTMLInputElement;
  const memoInput = document.getElementById('register-memo') as HTMLTextAreaElement;
  
  nameInput.value = defaultName;
  memoInput.value = '';
  
  // 色選択をリセット（デフォルト色を選択）
  const colorOptions = registerDialog.querySelectorAll('.color-option');
  colorOptions.forEach((option) => {
    const color = option.getAttribute('data-color');
    if (color === DEFAULT_COLOR) {
      option.classList.add('selected');
    } else {
      option.classList.remove('selected');
    }
  });

  // ダイアログを表示
  registerDialog.classList.add('show');
}

/**
 * 編集ダイアログを開く
 */
export function editSavedLocation(id: string): void {
  const locations = getSavedLocations();
  const location = locations.find((loc) => loc.id === id);
  
  if (!location) return;
  
  currentDialogMode = 'edit';
  editingLocationId = id;
  pendingLocationData = null;
  
  // タイトルとボタンを設定
  const titleEl = document.getElementById('register-dialog-title');
  const submitBtn = document.getElementById('register-submit-btn');
  if (titleEl) titleEl.textContent = '地点を編集';
  if (submitBtn) submitBtn.textContent = '更新';
  
  // 入力フィールドに現在の値を設定
  const nameInput = document.getElementById('register-name') as HTMLInputElement;
  const memoInput = document.getElementById('register-memo') as HTMLTextAreaElement;
  
  nameInput.value = location.name;
  memoInput.value = location.memo || '';
  
  // 色選択を設定
  const colorOptions = registerDialog.querySelectorAll('.color-option');
  colorOptions.forEach((option) => {
    const color = option.getAttribute('data-color');
    if (color === location.color) {
      option.classList.add('selected');
    } else {
      option.classList.remove('selected');
    }
  });

  // ダイアログを表示
  registerDialog.classList.add('show');
}

/**
 * 登録ダイアログを閉じる
 */
export function closeRegisterDialog(): void {
  registerDialog.classList.remove('show');
  pendingLocationData = null;
  editingLocationId = null;
  currentDialogMode = 'register';
}

/**
 * 登録ダイアログを送信
 */
export function submitRegisterDialog(): void {
  const nameInput = document.getElementById('register-name') as HTMLInputElement;
  const memoInput = document.getElementById('register-memo') as HTMLTextAreaElement;
  const selectedColor = registerDialog.querySelector('.color-option.selected');
  
  const color = selectedColor?.getAttribute('data-color') || DEFAULT_COLOR;
  const memo = memoInput.value.trim() || undefined;
  
  if (currentDialogMode === 'edit' && editingLocationId) {
    // 編集モード
    const locations = getSavedLocations();
    const location = locations.find((loc) => loc.id === editingLocationId);
    
    if (!location) {
      closeRegisterDialog();
      return;
    }
    
    const name = nameInput.value.trim() || location.name;
    
    // 登録地点を更新
    const updatedLocation = updateSavedLocation(editingLocationId, {
      name,
      memo,
      color,
    });
    
    if (updatedLocation) {
      // マーカーを更新
      updateMarkerOnMap(updatedLocation);
      
      // リストを更新
      updateLocationList();
    }
  } else if (pendingLocationData) {
    // 新規登録モード
    const name = nameInput.value.trim() || pendingLocationData.defaultName;
    
    // 登録地点を保存
    const newLocation = addSavedLocation({
      type: pendingLocationData.type,
      lat: pendingLocationData.lat,
      lon: pendingLocationData.lon,
      name,
      memo,
      color,
      landPriceData: pendingLocationData.landPriceData,
    });

    // マーカーを追加
    addMarkerToMap(newLocation);

    // リストを更新
    updateLocationList();

    // パネルを開く
    savedLocationPanel.classList.remove('collapsed');
  }

  // ダイアログを閉じる
  closeRegisterDialog();
}

/**
 * 登録地点を削除
 */
export function removeSavedLocationFromList(id: string): void {
  // マーカーを削除
  const marker = markerMap.get(id);
  if (marker && savedLocationLayerGroup) {
    savedLocationLayerGroup.removeLayer(marker);
    markerMap.delete(id);
  }

  // ストレージから削除
  removeSavedLocation(id);

  // リストを更新
  updateLocationList();
}

/**
 * 登録地点に移動
 */
export function goToSavedLocation(id: string): void {
  const locations = getSavedLocations();
  const location = locations.find((loc) => loc.id === id);
  
  if (!location) return;

  const map = getMap();
  map.setView([location.lat, location.lon], 17);

  // マーカーのポップアップを開く
  const marker = markerMap.get(id);
  if (marker) {
    marker.openPopup();
  }
}

/**
 * HTMLエスケープ
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * グローバルWindow拡張
 */
declare global {
  interface Window {
    closeRegisterDialog?: () => void;
    submitRegisterDialog?: () => void;
    toggleSavedLocationPanel?: () => void;
    removeSavedLocationFromList?: (id: string) => void;
    goToSavedLocation?: (id: string) => void;
    editSavedLocation?: (id: string) => void;
  }
}
