/**
 * API使用量管理モジュール
 * Neon DB 経由で使用量を管理（サーバーサイドで月次リセット）
 * DB接続不可時はフォールバックとしてローカルのメモリ内データを使用
 */

import type { UsageData } from './types.js';

/** メモリ内キャッシュ（DBから取得した最新値を保持） */
let cachedUsageData: UsageData = {
  count: 0,
  date: getCurrentMonth(),
  totalCount: 0,
  usageLimit: 9000,
  placesCount: 0,
  placesTotalCount: 0,
  placesUsageLimit: 5000,
};

/** DBからの初回読み込みが完了したか */
let isInitialized = false;

/**
 * 現在の年月文字列を取得
 * @returns 年月文字列（例: "2025-01"）
 */
function getCurrentMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * DBから使用量データを取得してキャッシュを更新
 */
async function fetchUsageFromDB(): Promise<UsageData> {
  try {
    const response = await fetch('/api/api-usage');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    cachedUsageData = {
      count: data.monthlyCount ?? 0,
      date: data.currentMonth ?? getCurrentMonth(),
      totalCount: data.totalCount ?? 0,
      usageLimit: data.usageLimit ?? 9000,
      placesCount: data.placesMonthlyCount ?? 0,
      placesTotalCount: data.placesTotalCount ?? 0,
      placesUsageLimit: data.placesUsageLimit ?? 5000,
    };
    isInitialized = true;
    return cachedUsageData;
  } catch (error) {
    console.warn('DB使用量取得エラー - キャッシュを使用:', error);
    return cachedUsageData;
  }
}

/**
 * 使用量データを初期化（アプリ起動時に1回呼び出す）
 */
export async function initUsageData(): Promise<UsageData> {
  return fetchUsageFromDB();
}

/**
 * API使用量データを取得（同期版 - キャッシュを返す）
 * @returns 使用量データ
 */
export function getUsageData(): UsageData {
  return cachedUsageData;
}

/**
 * API使用量データを取得（非同期版 - DBから最新を取得）
 * @returns 使用量データ
 */
export async function getUsageDataAsync(): Promise<UsageData> {
  return fetchUsageFromDB();
}

/**
 * API使用量データを保存（互換性のため残すが、DB側で管理）
 * @param data 保存する使用量データ
 */
export function saveUsageData(data: UsageData): void {
  cachedUsageData = data;
}

/**
 * API使用量をインクリメント（DB経由）
 * @returns 更新後の今月の使用回数
 */
export async function incrementUsageAsync(): Promise<number> {
  try {
    const response = await fetch('/api/api-usage', { method: 'POST' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    cachedUsageData = {
      count: data.monthlyCount ?? cachedUsageData.count + 1,
      date: data.currentMonth ?? getCurrentMonth(),
      totalCount: data.totalCount ?? (cachedUsageData.totalCount ?? 0) + 1,
      usageLimit: data.usageLimit ?? cachedUsageData.usageLimit ?? 9000,
      placesCount: data.placesMonthlyCount ?? cachedUsageData.placesCount ?? 0,
      placesTotalCount: data.placesTotalCount ?? cachedUsageData.placesTotalCount ?? 0,
      placesUsageLimit: data.placesUsageLimit ?? cachedUsageData.placesUsageLimit ?? 5000,
    };

    return cachedUsageData.count;
  } catch (error) {
    console.warn('DB使用量更新エラー - ローカルカウントを更新:', error);
    cachedUsageData.count++;
    cachedUsageData.totalCount = (cachedUsageData.totalCount ?? 0) + 1;
    return cachedUsageData.count;
  }
}

/**
 * API使用量をインクリメント（同期互換 - 内部で非同期実行）
 * @returns キャッシュ上の使用回数（DB反映は非同期）
 */
export function incrementUsage(): number {
  // 非同期でDBに反映、即座にキャッシュを更新して返す
  cachedUsageData.count++;
  cachedUsageData.totalCount = (cachedUsageData.totalCount ?? 0) + 1;

  // バックグラウンドでDB更新
  fetch('/api/api-usage', { method: 'POST' }).catch((err) => {
    console.warn('DB使用量バックグラウンド更新エラー:', err);
  });

  return cachedUsageData.count;
}

/**
 * Geocoding API使用量の上限を取得
 * @returns 使用量上限
 */
export function getUsageLimit(): number {
  return cachedUsageData.usageLimit ?? 9000;
}

/**
 * Places API使用量の上限を取得
 * @returns 使用量上限
 */
export function getPlacesUsageLimit(): number {
  return cachedUsageData.placesUsageLimit ?? 5000;
}

/**
 * Geocoding APIを使用可能かどうかをチェック
 * @returns 使用可能な場合はtrue
 */
export function canUseApi(): boolean {
  return cachedUsageData.count < getUsageLimit();
}

/**
 * Places APIを使用可能かどうかをチェック
 * @returns 使用可能な場合はtrue
 */
export function canUsePlacesApi(): boolean {
  return (cachedUsageData.placesCount ?? 0) < getPlacesUsageLimit();
}

/**
 * Places API使用量をインクリメント（非同期版 - DB経由）
 * @returns 更新後の今月の使用回数
 */
export async function incrementPlacesUsageAsync(): Promise<number> {
  try {
    const response = await fetch('/api/api-usage?type=places', { method: 'POST' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    cachedUsageData = {
      count: data.monthlyCount ?? cachedUsageData.count,
      date: data.currentMonth ?? getCurrentMonth(),
      totalCount: data.totalCount ?? cachedUsageData.totalCount ?? 0,
      usageLimit: data.usageLimit ?? cachedUsageData.usageLimit ?? 9000,
      placesCount: data.placesMonthlyCount ?? (cachedUsageData.placesCount ?? 0) + 1,
      placesTotalCount: data.placesTotalCount ?? (cachedUsageData.placesTotalCount ?? 0) + 1,
      placesUsageLimit: data.placesUsageLimit ?? cachedUsageData.placesUsageLimit ?? 5000,
    };

    return cachedUsageData.placesCount ?? 0;
  } catch (error) {
    console.warn('DB Places使用量更新エラー - ローカルカウントを更新:', error);
    cachedUsageData.placesCount = (cachedUsageData.placesCount ?? 0) + 1;
    cachedUsageData.placesTotalCount = (cachedUsageData.placesTotalCount ?? 0) + 1;
    return cachedUsageData.placesCount;
  }
}

/**
 * Places API使用量をインクリメント（同期互換 - 内部で非同期実行）
 * @returns キャッシュ上の使用回数（DB反映は非同期）
 */
export function incrementPlacesUsage(): number {
  cachedUsageData.placesCount = (cachedUsageData.placesCount ?? 0) + 1;
  cachedUsageData.placesTotalCount = (cachedUsageData.placesTotalCount ?? 0) + 1;

  // バックグラウンドでDB更新
  fetch('/api/api-usage?type=places', { method: 'POST' }).catch((err) => {
    console.warn('DB Places使用量バックグラウンド更新エラー:', err);
  });

  return cachedUsageData.placesCount;
}

/**
 * API使用量をリセット（キャッシュのみ。DBリセットは月次自動）
 */
export function resetUsageData(): void {
  cachedUsageData = {
    count: 0,
    date: getCurrentMonth(),
    totalCount: cachedUsageData.totalCount,
    usageLimit: cachedUsageData.usageLimit ?? 9000,
    placesCount: 0,
    placesTotalCount: cachedUsageData.placesTotalCount,
    placesUsageLimit: cachedUsageData.placesUsageLimit ?? 5000,
  };
}
