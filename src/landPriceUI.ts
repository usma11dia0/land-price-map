/**
 * 地価情報UI管理モジュール
 * コントロールパネル、マーカー、モーダルの管理を担当
 */

import type { LandPricePoint, LandPriceControlState, PriceHistory } from './landPriceTypes.js';
import { fetchLandPriceData, calculateSearchBounds } from './landPrice.js';
import { getMap, getMapCenter } from './map.js';

/** Leaflet型の簡易定義 */
declare const L: typeof import('leaflet');

/** Chart.js型の簡易定義 */
declare const Chart: any;

/** DOM要素 */
let showKojiCheckbox: HTMLInputElement;
let showChosaCheckbox: HTMLInputElement;
let searchBtn: HTMLButtonElement;
let loadingEl: HTMLElement;
let countEl: HTMLElement;
let countValueEl: HTMLElement;
let landPriceModal: HTMLElement;

/** 地価マーカーのレイヤーグループ */
let landPriceLayerGroup: L.LayerGroup | null = null;

/** 現在表示中の地価ポイントデータ */
let currentLandPricePoints: LandPricePoint[] = [];

/** 現在のモーダルに表示中のポイント */
let currentModalPoint: LandPricePoint | null = null;

/** Chart.jsのインスタンス */
let priceChart: any = null;

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
  landPriceModal = document.getElementById('land-price-modal')!;

  // レイヤーグループを作成
  const map = getMap();
  landPriceLayerGroup = L.layerGroup().addTo(map);

  // イベントリスナーを設定
  setupEventListeners();

  // グローバル関数を設定
  window.closeLandPriceModal = closeLandPriceModal;

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

  // モーダル背景クリックで閉じる
  landPriceModal.addEventListener('click', (e) => {
    if (e.target === landPriceModal) {
      closeLandPriceModal();
    }
  });

  // ESCキーでモーダルを閉じる
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && landPriceModal.classList.contains('show')) {
      closeLandPriceModal();
    }
  });
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

  // ローディング状態にする
  controlState.isLoading = true;
  updateSearchButtonState();
  showLoading(true);
  hideCount();

  try {
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

    // データを取得
    const points = await fetchLandPriceData(
      searchBounds,
      controlState.showKoji,
      controlState.showChosa
    );

    // マーカーを表示
    displayLandPriceMarkers(points);

    // 件数を表示
    showCount(points.length);
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
 * ローディング表示の切り替え
 */
function showLoading(show: boolean): void {
  loadingEl.style.display = show ? 'flex' : 'none';
}

/**
 * 件数表示
 */
function showCount(count: number): void {
  countValueEl.textContent = String(count);
  countEl.style.display = 'block';
}

/**
 * 件数を非表示
 */
function hideCount(): void {
  countEl.style.display = 'none';
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
 * 地価情報モーダルを開く
 */
function openLandPriceModal(point: LandPricePoint): void {
  currentModalPoint = point;

  // タイトルを設定
  const titleEl = document.getElementById('land-price-modal-title')!;
  const typeLabel = point.priceClassification === 0 ? '【地価公示】' : '【都道府県地価調査】';
  titleEl.textContent = `${typeLabel} ${point.standardLotNumber}`;

  // 基本情報
  setText('lp-standard-lot-number', point.standardLotNumber);
  setText('lp-location-number', point.locationNumber);
  setText('lp-residence-display', point.residenceDisplay);

  // 価格情報
  setText('lp-current-price', point.currentPriceDisplay);

  // 変動率の表示
  const changeRateEl = document.getElementById('lp-change-rate')!;
  if (point.yearOnYearChangeRate !== null) {
    const rate = point.yearOnYearChangeRate;
    const sign = rate > 0 ? '+' : '';
    changeRateEl.textContent = `${sign}${rate.toFixed(1)}%`;
    changeRateEl.className = 'change-value';
    if (rate > 0) {
      changeRateEl.classList.add('positive');
    } else if (rate < 0) {
      changeRateEl.classList.add('negative');
    } else {
      changeRateEl.classList.add('zero');
    }
  } else {
    changeRateEl.textContent = '-';
    changeRateEl.className = 'change-value';
  }

  // 価格履歴テーブル
  updatePriceHistoryTable(point.priceHistory);

  // 価格推移グラフ
  updatePriceChart(point.priceHistory);

  // 土地情報
  setText('lp-use-category', point.useCategory);
  setText('lp-cadastral', point.cadastral);
  setText('lp-usage-status', point.usageStatus);
  setText('lp-surrounding-usage', point.surroundingUsageStatus);

  // 道路情報
  setText(
    'lp-front-road-width',
    point.frontRoadWidth !== null ? `${point.frontRoadWidth}m` : '-'
  );
  setText('lp-front-road-azimuth', point.frontRoadAzimuth);
  setText('lp-front-road-pavement', point.frontRoadPavement);
  setText(
    'lp-side-road',
    point.sideRoad !== '-' ? `${point.sideRoadAzimuth} ${point.sideRoad}` : '-'
  );

  // 交通情報
  setText('lp-nearest-station', point.nearestStation);
  setText('lp-distance-to-station', point.distanceToStation);
  setText('lp-proximity-transportation', point.proximityToTransportation);

  // 法規制情報
  setText('lp-regulations-use-category', point.regulationsUseCategory);
  setText('lp-building-coverage', point.buildingCoverageRatio);
  setText('lp-floor-area-ratio', point.floorAreaRatio);
  setText('lp-fireproof', point.fireproofArea);
  setText('lp-altitude-district', point.altitudeDistrict);

  // モーダルを表示
  landPriceModal.classList.add('show');
}

/**
 * テキストを設定（ヘルパー関数）
 */
function setText(elementId: string, value: string): void {
  const el = document.getElementById(elementId);
  if (el) {
    el.textContent = value;
  }
}

/**
 * 価格履歴テーブルを更新
 */
function updatePriceHistoryTable(history: PriceHistory[]): void {
  const tbody = document.getElementById('lp-price-history')!;
  tbody.innerHTML = '';

  history.forEach((item) => {
    const tr = document.createElement('tr');

    // 年度
    const tdYear = document.createElement('td');
    tdYear.textContent = String(item.year);
    tr.appendChild(tdYear);

    // 価格
    const tdPrice = document.createElement('td');
    tdPrice.textContent = item.price !== null ? item.price.toLocaleString() : '-';
    tr.appendChild(tdPrice);

    // 変動率
    const tdChange = document.createElement('td');
    if (item.changeRate !== null) {
      const sign = item.changeRate > 0 ? '+' : '';
      tdChange.textContent = `${sign}${item.changeRate.toFixed(1)}%`;
      if (item.changeRate > 0) {
        tdChange.style.color = '#e74c3c';
      } else if (item.changeRate < 0) {
        tdChange.style.color = '#3498db';
      }
    } else {
      tdChange.textContent = '-';
    }
    tr.appendChild(tdChange);

    tbody.appendChild(tr);
  });
}

/**
 * 価格推移グラフを更新
 */
function updatePriceChart(history: PriceHistory[]): void {
  const canvas = document.getElementById('lp-price-chart') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d');

  if (!ctx) return;

  // 既存のチャートを破棄
  if (priceChart) {
    priceChart.destroy();
  }

  const labels = history.map((item) => String(item.year));
  const data = history.map((item) => item.price);

  priceChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: '価格（円/㎡）',
          data: data,
          borderColor: '#667eea',
          backgroundColor: 'rgba(102, 126, 234, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.3,
          pointBackgroundColor: '#667eea',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          callbacks: {
            label: function (context: any) {
              const value = context.parsed.y;
              return value !== null ? `${value.toLocaleString()} 円/㎡` : 'データなし';
            },
          },
        },
      },
      scales: {
        x: {
          grid: {
            display: false,
          },
        },
        y: {
          beginAtZero: false,
          ticks: {
            callback: function (value: number) {
              return value.toLocaleString();
            },
          },
        },
      },
    },
  });
}

/**
 * 地価情報モーダルを閉じる
 */
export function closeLandPriceModal(): void {
  landPriceModal.classList.remove('show');
  currentModalPoint = null;
}

/**
 * グローバルWindow拡張
 */
declare global {
  interface Window {
    closeLandPriceModal?: () => void;
  }
}
