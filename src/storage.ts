/**
 * ローカルストレージ管理モジュール
 * API使用量の追跡と永続化を担当（月間管理）
 */

import type { UsageData } from './types.js';
import { CONFIG } from './config.js';

/** ストレージキー */
const STORAGE_KEY = 'landPriceMap_apiUsage';

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
 * API使用量データを取得
 * 月が変わっていた場合は自動的にリセット
 * @returns 使用量データ
 */
export function getUsageData(): UsageData {
  const data = localStorage.getItem(STORAGE_KEY);

  if (!data) {
    return { count: 0, date: getCurrentMonth() };
  }

  const parsed: UsageData = JSON.parse(data);

  // 月が変わっていたらリセット
  if (parsed.date !== getCurrentMonth()) {
    return { count: 0, date: getCurrentMonth() };
  }

  return parsed;
}

/**
 * API使用量データを保存
 * @param data 保存する使用量データ
 */
export function saveUsageData(data: UsageData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/**
 * API使用量をインクリメント
 * @returns 更新後の使用回数
 */
export function incrementUsage(): number {
  const data = getUsageData();
  data.count++;
  data.date = getCurrentMonth();
  saveUsageData(data);
  return data.count;
}

/**
 * API使用量の上限を取得
 * @returns 使用量上限
 */
export function getUsageLimit(): number {
  return CONFIG.API_USAGE_LIMIT || 9000;
}

/**
 * APIを使用可能かどうかをチェック
 * @returns 使用可能な場合はtrue
 */
export function canUseApi(): boolean {
  const data = getUsageData();
  return data.count < getUsageLimit();
}

/**
 * API使用量をリセット
 */
export function resetUsageData(): void {
  saveUsageData({ count: 0, date: getCurrentMonth() });
}
