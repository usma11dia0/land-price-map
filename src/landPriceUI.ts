/**
 * 地価情報UI管理モジュール
 * コントロールパネル、マーカー、モーダルの管理を担当
 */

import type { LandPricePoint, LandPriceControlState, PriceHistory } from './landPriceTypes.js';
import { 
  fetchLandPriceData, 
  calculateSearchBounds, 
  fetchPointPriceHistory,
  MAX_SEARCH_RESULTS,
} from './landPrice.js';
import { getMap, getMapCenter } from './map.js';
import { openRegisterDialogFromLandPrice } from './savedLocationUI.js';

/** Leaflet型の簡易定義 */
declare const L: typeof import('leaflet');

/** DOM要素 */
let showKojiCheckbox: HTMLInputElement;
let showChosaCheckbox: HTMLInputElement;
let searchBtn: HTMLButtonElement;
let loadingEl: HTMLElement;
let countEl: HTMLElement;
let countValueEl: HTMLElement;
let panelTemplate: HTMLElement;

/** 開いているパネルの管理 */
interface PanelState {
  element: HTMLElement;
  pointId: string;
  isMinimized: boolean;
  isDragging: boolean;
  dragStartX: number;
  dragStartY: number;
  panelStartX: number;
  panelStartY: number;
}

const openPanels: Map<string, PanelState> = new Map();
let panelCounter = 0;
let currentDraggingPanel: PanelState | null = null;

/** 地価マーカーのレイヤーグループ */
let landPriceLayerGroup: L.LayerGroup | null = null;

/** 検索範囲を示す矩形 */
let searchBoundsRectangle: L.Rectangle | null = null;

/** 現在表示中の地価ポイントデータ */
let currentLandPricePoints: LandPricePoint[] = [];

/** コントロールの状態 */
const controlState: LandPriceControlState = {
  showKoji: false,
  showChosa: false,
  isLoading: false,
};

/**
 * 地価情報UIを初期化
 */
export function initLandPriceUI(): void {
  // DOM要素を取得
  showKojiCheckbox = document.getElementById('show-koji') as HTMLInputElement;
  showChosaCheckbox = document.getElementById('show-chosa') as HTMLInputElement;
  searchBtn = document.getElementById('land-price-search-btn') as HTMLButtonElement;
  loadingEl = document.getElementById('land-price-loading')!;
  countEl = document.getElementById('land-price-count')!;
  countValueEl = document.getElementById('land-price-count-value')!;
  panelTemplate = document.getElementById('land-price-panel')!;

  // レイヤーグループを作成
  const map = getMap();
  landPriceLayerGroup = L.layerGroup().addTo(map);

  // イベントリスナーを設定
  setupEventListeners();

  // グローバルドラッグイベントを設定
  setupGlobalDragEvents();

  // グローバル関数を設定
  window.closeLandPricePanel = closeLandPricePanel;
  window.toggleLandPricePanel = toggleLandPricePanel;
  window.closeAllLandPricePanels = closeAllLandPricePanels;

  console.log('地価情報UI初期化完了');
}

/**
 * イベントリスナーを設定
 */
function setupEventListeners(): void {
  // チェックボックスの変更イベント
  showKojiCheckbox.addEventListener('change', () => {
    controlState.showKoji = showKojiCheckbox.checked;
    updateSearchButtonState();
  });

  showChosaCheckbox.addEventListener('change', () => {
    controlState.showChosa = showChosaCheckbox.checked;
    updateSearchButtonState();
  });

  // 検索ボタンのクリックイベント
  searchBtn.addEventListener('click', handleSearch);

  // ESCキーで全パネルを閉じる
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openPanels.size > 0) {
      closeAllLandPricePanels();
    }
  });
}

/**
 * グローバルドラッグイベントを設定
 */
function setupGlobalDragEvents(): void {
  // マウスムーブ - ドラッグ中
  document.addEventListener('mousemove', (e: MouseEvent) => {
    if (!currentDraggingPanel) return;

    const panel = currentDraggingPanel;
    const deltaX = e.clientX - panel.dragStartX;
    const deltaY = e.clientY - panel.dragStartY;

    let newX = panel.panelStartX + deltaX;
    let newY = panel.panelStartY + deltaY;

    // 画面外にはみ出さないように制限
    const panelRect = panel.element.getBoundingClientRect();
    const maxX = window.innerWidth - panelRect.width;
    const maxY = window.innerHeight - panelRect.height;

    newX = Math.max(0, Math.min(newX, maxX));
    newY = Math.max(0, Math.min(newY, maxY));

    panel.element.style.right = 'auto';
    panel.element.style.left = `${newX}px`;
    panel.element.style.top = `${newY}px`;
  });

  // マウスアップ - ドラッグ終了
  document.addEventListener('mouseup', () => {
    if (currentDraggingPanel) {
      currentDraggingPanel.element.classList.remove('dragging');
      currentDraggingPanel.isDragging = false;
      currentDraggingPanel = null;
    }
  });

  // タッチムーブ
  document.addEventListener('touchmove', (e: TouchEvent) => {
    if (!currentDraggingPanel) return;

    const panel = currentDraggingPanel;
    const touch = e.touches[0];
    const deltaX = touch.clientX - panel.dragStartX;
    const deltaY = touch.clientY - panel.dragStartY;

    let newX = panel.panelStartX + deltaX;
    let newY = panel.panelStartY + deltaY;

    const panelRect = panel.element.getBoundingClientRect();
    const maxX = window.innerWidth - panelRect.width;
    const maxY = window.innerHeight - panelRect.height;

    newX = Math.max(0, Math.min(newX, maxX));
    newY = Math.max(0, Math.min(newY, maxY));

    panel.element.style.right = 'auto';
    panel.element.style.left = `${newX}px`;
    panel.element.style.top = `${newY}px`;
  }, { passive: true });

  // タッチエンド
  document.addEventListener('touchend', () => {
    if (currentDraggingPanel) {
      currentDraggingPanel.element.classList.remove('dragging');
      currentDraggingPanel.isDragging = false;
      currentDraggingPanel = null;
    }
  });
}

/**
 * パネルにドラッグ機能を設定
 */
function setupPanelDrag(panelState: PanelState): void {
  const header = panelState.element.querySelector('.floating-panel-header') as HTMLElement;
  if (!header) return;

  // マウスダウン
  header.addEventListener('mousedown', (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;

    panelState.isDragging = true;
    panelState.element.classList.add('dragging');
    currentDraggingPanel = panelState;

    panelState.dragStartX = e.clientX;
    panelState.dragStartY = e.clientY;

    const rect = panelState.element.getBoundingClientRect();
    panelState.panelStartX = rect.left;
    panelState.panelStartY = rect.top;

    // このパネルを最前面に
    bringPanelToFront(panelState);

    e.preventDefault();
  });

  // タッチスタート
  header.addEventListener('touchstart', (e: TouchEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;

    panelState.isDragging = true;
    panelState.element.classList.add('dragging');
    currentDraggingPanel = panelState;

    const touch = e.touches[0];
    panelState.dragStartX = touch.clientX;
    panelState.dragStartY = touch.clientY;

    const rect = panelState.element.getBoundingClientRect();
    panelState.panelStartX = rect.left;
    panelState.panelStartY = rect.top;

    bringPanelToFront(panelState);
  }, { passive: true });

  // パネルクリックで最前面に
  panelState.element.addEventListener('mousedown', () => {
    bringPanelToFront(panelState);
  });
}

/**
 * パネルを最前面に移動
 */
function bringPanelToFront(panelState: PanelState): void {
  const baseZIndex = 1500;
  openPanels.forEach((p) => {
    p.element.style.zIndex = String(baseZIndex);
  });
  panelState.element.style.zIndex = String(baseZIndex + 1);
}

/**
 * 検索ボタンの状態を更新
 */
function updateSearchButtonState(): void {
  const isEnabled = (controlState.showKoji || controlState.showChosa) && !controlState.isLoading;
  searchBtn.disabled = !isEnabled;
}

/**
 * 検索を実行
 */
async function handleSearch(): Promise<void> {
  if (controlState.isLoading) return;

  const map = getMap();
  const center = getMapCenter();
  const bounds = map.getBounds();

  // 検索範囲を計算（画面中心から20%）
  const searchBounds = calculateSearchBounds(center.lat, center.lon, {
    north: bounds.getNorth(),
    south: bounds.getSouth(),
    east: bounds.getEast(),
    west: bounds.getWest(),
  });

  // ローディング状態にする
  controlState.isLoading = true;
  updateSearchButtonState();
  showLoading(true);
  hideCount();
  hideWarning();

  try {
    // 検索範囲を四角形で表示
    displaySearchBoundsRectangle(searchBounds);

    // データを取得
    const points = await fetchLandPriceData(
      searchBounds,
      controlState.showKoji,
      controlState.showChosa
    );

    // 件数が上限を超えている場合
    if (points.length > MAX_SEARCH_RESULTS) {
      // 上限件数までに制限
      const limitedPoints = points.slice(0, MAX_SEARCH_RESULTS);
      
      // マーカーを表示（制限された件数）
      displayLandPriceMarkers(limitedPoints);
      
      // 警告を表示
      showWarning(
        `検索結果が${points.length}件あります。\n` +
        `表示は${MAX_SEARCH_RESULTS}件までに制限されています。\n` +
        `より正確な結果を得るには、地図を拡大してください。`
      );
      
      // 件数を表示（制限表示）
      showCount(MAX_SEARCH_RESULTS, points.length);
    } else {
      // マーカーを表示
      displayLandPriceMarkers(points);

      // 件数を表示
      showCount(points.length);
    }
  } catch (error) {
    console.error('地価データ取得エラー:', error);
    alert('地価データの取得に失敗しました');
  } finally {
    controlState.isLoading = false;
    updateSearchButtonState();
    showLoading(false);
  }
}

/**
 * 検索範囲を四角形で表示
 */
function displaySearchBoundsRectangle(bounds: { north: number; south: number; east: number; west: number }): void {
  const map = getMap();

  // 既存の矩形を削除
  if (searchBoundsRectangle) {
    map.removeLayer(searchBoundsRectangle);
  }

  // 新しい矩形を作成
  searchBoundsRectangle = L.rectangle(
    [
      [bounds.south, bounds.west],
      [bounds.north, bounds.east],
    ],
    {
      color: '#e74c3c',
      weight: 3,
      opacity: 0.8,
      fillColor: '#e74c3c',
      fillOpacity: 0.1,
      dashArray: '8, 4',
    }
  ).addTo(map);
}

/**
 * ローディング表示の切り替え
 */
function showLoading(show: boolean): void {
  loadingEl.style.display = show ? 'flex' : 'none';
}

/**
 * 件数表示
 */
function showCount(count: number, totalCount?: number): void {
  if (totalCount && totalCount > count) {
    countValueEl.textContent = `${count}/${totalCount}`;
  } else {
    countValueEl.textContent = String(count);
  }
  countEl.style.display = 'block';
}

/**
 * 件数を非表示
 */
function hideCount(): void {
  countEl.style.display = 'none';
}

/**
 * 警告メッセージを表示
 */
function showWarning(message: string): void {
  let warningEl = document.getElementById('land-price-warning');
  if (!warningEl) {
    warningEl = document.createElement('div');
    warningEl.id = 'land-price-warning';
    warningEl.className = 'land-price-warning';
    document.body.appendChild(warningEl);
  }
  warningEl.textContent = message;
  warningEl.style.display = 'block';
  
  // 5秒後に自動で非表示
  setTimeout(() => {
    hideWarning();
  }, 8000);
}

/**
 * 警告メッセージを非表示
 */
function hideWarning(): void {
  const warningEl = document.getElementById('land-price-warning');
  if (warningEl) {
    warningEl.style.display = 'none';
  }
}

/**
 * 地価マーカーを表示
 */
function displayLandPriceMarkers(points: LandPricePoint[]): void {
  // 既存のマーカーをクリア
  if (landPriceLayerGroup) {
    landPriceLayerGroup.clearLayers();
  }

  currentLandPricePoints = points;

  points.forEach((point) => {
    const marker = createLandPriceMarker(point);
    if (landPriceLayerGroup) {
      marker.addTo(landPriceLayerGroup);
    }
  });
}

/**
 * 地価マーカーを作成
 */
function createLandPriceMarker(point: LandPricePoint): L.Marker {
  const isKoji = point.priceClassification === 0;
  const className = isKoji ? 'land-price-marker koji' : 'land-price-marker chosa';

  // カスタムアイコンを作成
  const icon = L.divIcon({
    className: className,
    html: `<div class="marker-icon"></div><div class="marker-label">${point.standardLotNumber}</div>`,
    iconSize: [24, 34],
    iconAnchor: [12, 17],
  });

  const marker = L.marker([point.lat, point.lon], { icon });

  // クリックでモーダルを表示
  marker.on('click', () => {
    openLandPriceModal(point);
  });

  return marker;
}

/**
 * 地価情報パネルを開く（複数パネル対応）
 */
function openLandPriceModal(point: LandPricePoint): void {
  // 同じポイントのパネルが既に開いている場合は、そのパネルを前面に
  const existingPanel = openPanels.get(point.id);
  if (existingPanel) {
    bringPanelToFront(existingPanel);
    return;
  }

  // 新しいパネルを作成
  const panelId = `land-price-panel-${++panelCounter}`;
  const panel = createPanelElement(panelId, point);
  
  // パネルの位置を設定（既存パネルとずらす）
  const offset = openPanels.size * 30;
  panel.style.top = `${80 + offset}px`;
  panel.style.right = `${20 + offset}px`;

  // DOMに追加
  document.body.appendChild(panel);

  // パネル状態を作成
  const panelState: PanelState = {
    element: panel,
    pointId: point.id,
    isMinimized: false,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    panelStartX: 0,
    panelStartY: 0,
  };

  // パネルを登録
  openPanels.set(point.id, panelState);

  // ドラッグ機能を設定
  setupPanelDrag(panelState);

  // パネルを表示
  panel.classList.add('show');

  // 最前面に
  bringPanelToFront(panelState);

  // パネル内容を設定
  populatePanelContent(panel, point);

  // 価格履歴を非同期で取得
  loadPriceHistoryForPanel(panel, point);
}

/**
 * パネル要素を作成
 */
function createPanelElement(panelId: string, point: LandPricePoint): HTMLElement {
  const panel = panelTemplate.cloneNode(true) as HTMLElement;
  panel.id = panelId;
  panel.setAttribute('data-point-id', point.id);

  // 閉じるボタンと最小化ボタンのonclickを更新
  const closeBtn = panel.querySelector('.panel-close') as HTMLButtonElement;
  const minimizeBtn = panel.querySelector('.panel-minimize') as HTMLButtonElement;
  const registerBtn = panel.querySelector('.panel-register-btn') as HTMLButtonElement;

  if (closeBtn) {
    closeBtn.removeAttribute('onclick');
    closeBtn.addEventListener('click', () => closeLandPricePanel(point.id));
  }

  if (minimizeBtn) {
    minimizeBtn.removeAttribute('onclick');
    minimizeBtn.addEventListener('click', () => toggleLandPricePanel(point.id));
  }

  // 登録ボタンのイベントリスナー
  if (registerBtn) {
    registerBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // ドラッグ防止
      openRegisterDialogFromLandPrice(point.lat, point.lon, {
        standardLotNumber: point.standardLotNumber,
        currentPrice: point.currentPriceDisplay,
        priceClassification: point.priceClassification,
        locationNumber: point.locationNumber,
      });
    });
  }

  return panel;
}

/**
 * パネルの内容を設定
 */
function populatePanelContent(panel: HTMLElement, point: LandPricePoint): void {
  // タイトル
  const titleEl = panel.querySelector('#land-price-modal-title, .floating-panel-header h2') as HTMLElement;
  if (titleEl) {
    const typeLabel = point.priceClassification === 0 ? '【地価公示】' : '【都道府県地価調査】';
    titleEl.textContent = `${typeLabel} ${point.standardLotNumber}`;
  }

  // 各フィールドを設定するヘルパー
  const setField = (selector: string, value: string) => {
    const el = panel.querySelector(`#${selector}, [data-field="${selector}"]`) as HTMLElement;
    if (el) el.textContent = value;
  };

  // 基本情報
  setField('lp-standard-lot-number', point.standardLotNumber);
  setField('lp-location-number', point.locationNumber);
  setField('lp-residence-display', point.residenceDisplay);

  // 価格情報
  setField('lp-current-price', point.currentPriceDisplay);

  // 変動率
  const changeRateEl = panel.querySelector('#lp-change-rate') as HTMLElement;
  if (changeRateEl) {
    if (point.yearOnYearChangeRate !== null && point.yearOnYearChangeRate !== undefined) {
      const rate = typeof point.yearOnYearChangeRate === 'string' 
        ? parseFloat(point.yearOnYearChangeRate) 
        : point.yearOnYearChangeRate;
      
      if (!isNaN(rate)) {
        const sign = rate > 0 ? '+' : '';
        changeRateEl.textContent = `${sign}${rate.toFixed(1)}%`;
        changeRateEl.className = 'change-value';
        if (rate > 0) changeRateEl.classList.add('positive');
        else if (rate < 0) changeRateEl.classList.add('negative');
        else changeRateEl.classList.add('zero');
      } else {
        changeRateEl.textContent = '-';
        changeRateEl.className = 'change-value';
      }
    } else {
      changeRateEl.textContent = '-';
      changeRateEl.className = 'change-value';
    }
  }

  // 土地情報
  setField('lp-use-category', point.useCategory);
  setField('lp-cadastral', point.cadastral);
  setField('lp-usage-status', point.usageStatus);
  setField('lp-surrounding-usage', point.surroundingUsageStatus);

  // 道路情報
  setField('lp-front-road-width', point.frontRoadWidth !== null ? `${point.frontRoadWidth}m` : '-');
  setField('lp-front-road-azimuth', point.frontRoadAzimuth);
  setField('lp-front-road-pavement', point.frontRoadPavement);

  let sideRoadDisplay = '-';
  if (point.sideRoad !== '-') {
    if (point.sideRoadAzimuth !== '-' && point.sideRoadAzimuth !== '') {
      sideRoadDisplay = `${point.sideRoadAzimuth} ${point.sideRoad}`;
    } else {
      sideRoadDisplay = point.sideRoad;
    }
  }
  setField('lp-side-road', sideRoadDisplay);

  // 交通情報
  setField('lp-nearest-station', point.nearestStation);
  setField('lp-distance-to-station', point.distanceToStation);
  setField('lp-proximity-transportation', point.proximityToTransportation);

  // 法規制情報
  setField('lp-regulations-use-category', point.regulationsUseCategory);
  setField('lp-building-coverage', point.buildingCoverageRatio);
  setField('lp-floor-area-ratio', point.floorAreaRatio);
  setField('lp-fireproof', point.fireproofArea);
  setField('lp-altitude-district', point.altitudeDistrict);

  // ★マーク注記
  const ratioNoteEl = panel.querySelector('#lp-ratio-note') as HTMLElement;
  if (ratioNoteEl) {
    const hasStarMark = point.buildingCoverageRatio.includes('★') || 
                        point.floorAreaRatio.includes('★');
    ratioNoteEl.style.display = hasStarMark ? 'block' : 'none';
  }

  // 鑑定評価書リンク
  const appraisalSection = panel.querySelector('#lp-appraisal-section') as HTMLElement;
  const appraisalLink = panel.querySelector('#lp-appraisal-link') as HTMLAnchorElement;
  
  if (appraisalSection && appraisalLink && point.priceClassification === 0) {
    const appraisalUrl = generateAppraisalUrl(point);
    if (appraisalUrl) {
      appraisalLink.href = appraisalUrl;
      appraisalSection.style.display = 'block';
    } else {
      appraisalSection.style.display = 'none';
    }
  } else if (appraisalSection) {
    appraisalSection.style.display = 'none';
  }
}

/**
 * パネル用の価格履歴を非同期で取得
 */
async function loadPriceHistoryForPanel(panel: HTMLElement, point: LandPricePoint): Promise<void> {
  const loadingEl = panel.querySelector('#lp-history-loading') as HTMLElement;
  const tableEl = panel.querySelector('#lp-history-table') as HTMLElement;
  const tbody = panel.querySelector('#lp-price-history') as HTMLElement;

  if (loadingEl) loadingEl.style.display = 'flex';
  if (tableEl) tableEl.style.display = 'none';
  if (tbody) tbody.innerHTML = '';

  try {
    const history = await fetchPointPriceHistory(point);
    updatePriceHistoryTableInPanel(panel, history);
    if (loadingEl) loadingEl.style.display = 'none';
    if (tableEl) tableEl.style.display = '';
  } catch (error) {
    console.error('Failed to load price history:', error);
    if (loadingEl) loadingEl.style.display = 'none';
    if (tableEl) tableEl.style.display = '';
    if (tbody) tbody.innerHTML = '<tr><td colspan="3">データの取得に失敗しました</td></tr>';
  }
}

/**
 * パネル内の価格履歴テーブルを更新
 */
function updatePriceHistoryTableInPanel(panel: HTMLElement, history: PriceHistory[]): void {
  const tbody = panel.querySelector('#lp-price-history') as HTMLElement;
  if (!tbody) return;
  
  tbody.innerHTML = '';

  history.forEach((item) => {
    const tr = document.createElement('tr');

    const tdYear = document.createElement('td');
    tdYear.textContent = String(item.year);
    tr.appendChild(tdYear);

    const tdPrice = document.createElement('td');
    tdPrice.textContent = item.price !== null ? item.price.toLocaleString() : '-';
    tr.appendChild(tdPrice);

    const tdChange = document.createElement('td');
    if (item.changeRate !== null && item.changeRate !== undefined) {
      const rate = typeof item.changeRate === 'string' 
        ? parseFloat(item.changeRate) 
        : item.changeRate;
      
      if (!isNaN(rate)) {
        const sign = rate > 0 ? '+' : '';
        tdChange.textContent = `${sign}${rate.toFixed(1)}%`;
        if (rate > 0) tdChange.style.color = '#e74c3c';
        else if (rate < 0) tdChange.style.color = '#3498db';
      } else {
        tdChange.textContent = '-';
      }
    } else {
      tdChange.textContent = '-';
    }
    tr.appendChild(tdChange);

    tbody.appendChild(tr);
  });
}

/**
 * 鑑定評価書のURLを生成
 * URL形式: https://www.reinfolib.mlit.go.jp/landPrices_/realEstateAppraisalReport/{year}/{pref_code}/{year}{city_code}{lot_number}.html
 * 例: 中央5-5 → 2025131020505.html
 * @param point 地価ポイント
 * @returns 鑑定評価書URL（生成できない場合はnull）
 */
function generateAppraisalUrl(point: LandPricePoint): string | null {
  // 標準地番号から数字部分を抽出（例: "中央5-28" → "5-28"）
  const lotMatch = point.standardLotNumber.match(/(\d+)-(\d+)/);
  if (!lotMatch) return null;

  const categoryNum = lotMatch[1].padStart(2, '0'); // 用途番号（2桁）
  const pointNum = lotMatch[2].padStart(2, '0');    // 地点番号（2桁）
  const lotNumber = categoryNum + pointNum;         // "0528"

  // 都道府県コード（東京都 = 13）- cityNameから推測は難しいので、既知のコードを使用
  // ここでは簡易的に、東京23区を想定
  const prefCode = '13';
  
  // 市区町村コード（下3桁）- point.idから取得できないため、簡易的に処理
  // 中央区 = 13102 → 102
  // 実際のcity_codeがAPIレスポンスに含まれているはずなので、それを使用
  // 暫定的に、地名から推測
  const cityCodeMap: { [key: string]: string } = {
    '中央': '102',
    '千代田': '101',
    '港': '103',
    '新宿': '104',
    '文京': '105',
    '台東': '106',
    '墨田': '107',
    '江東': '108',
    '品川': '109',
    '目黒': '110',
    '大田': '111',
    '世田谷': '112',
    '渋谷': '113',
    '中野': '114',
    '杉並': '115',
    '豊島': '116',
    '北': '117',
    '荒川': '118',
    '板橋': '119',
    '練馬': '120',
    '足立': '121',
    '葛飾': '122',
    '江戸川': '123',
  };

  // 地名を抽出（例: "中央5-28" → "中央"）
  const placeMatch = point.standardLotNumber.match(/^([^\d]+)/);
  if (!placeMatch) return null;
  
  const placeName = placeMatch[1];
  const cityCode = cityCodeMap[placeName];
  if (!cityCode) return null;

  // 年度（最新の地価公示年度）
  // 地価公示は1月1日時点、3月に公表される
  // 例: 2026年1月現在 → 令和7年（2025年）の地価公示が最新
  const currentYear = new Date().getFullYear();
  const appraisalYear = currentYear - 1;

  // URL生成
  const fileName = `${appraisalYear}${prefCode}${cityCode}${lotNumber}`;
  return `https://www.reinfolib.mlit.go.jp/landPrices_/realEstateAppraisalReport/${appraisalYear}/${prefCode}/${fileName}.html`;
}

/**
 * 特定のパネルを閉じる
 */
export function closeLandPricePanel(pointId: string): void {
  const panelState = openPanels.get(pointId);
  if (!panelState) return;

  // DOMから削除
  panelState.element.remove();
  
  // マップから削除
  openPanels.delete(pointId);
}

/**
 * 全てのパネルを閉じる
 */
export function closeAllLandPricePanels(): void {
  openPanels.forEach((panelState) => {
    panelState.element.remove();
  });
  openPanels.clear();
}

/**
 * パネルの最小化/最大化を切り替え
 */
export function toggleLandPricePanel(pointId: string): void {
  const panelState = openPanels.get(pointId);
  if (!panelState) return;

  panelState.isMinimized = !panelState.isMinimized;
  
  if (panelState.isMinimized) {
    panelState.element.classList.add('minimized');
  } else {
    panelState.element.classList.remove('minimized');
  }
  
  updateMinimizeButtonForPanel(panelState);
}

/**
 * 特定パネルの最小化ボタンを更新
 */
function updateMinimizeButtonForPanel(panelState: PanelState): void {
  const minimizeBtn = panelState.element.querySelector('.panel-minimize');
  if (minimizeBtn) {
    minimizeBtn.textContent = panelState.isMinimized ? '+' : '−';
    minimizeBtn.setAttribute('title', panelState.isMinimized ? '展開' : '最小化');
  }
}

/**
 * グローバルWindow拡張
 */
declare global {
  interface Window {
    closeLandPricePanel?: (pointId: string) => void;
    toggleLandPricePanel?: (pointId: string) => void;
    closeAllLandPricePanels?: () => void;
  }
}
