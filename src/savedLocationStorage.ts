/**
 * 登録地点のストレージ管理
 * localStorageを使用してデータを永続化
 */

import type { SavedLocation } from './savedLocationTypes.js';

/** ストレージキー */
const STORAGE_KEY = 'landPriceMap_savedLocations';

/**
 * UUIDを生成
 */
function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * 登録地点一覧を取得
 */
export function getSavedLocations(): SavedLocation[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) {
      return [];
    }
    return JSON.parse(data) as SavedLocation[];
  } catch (error) {
    console.error('Failed to load saved locations:', error);
    return [];
  }
}

/**
 * 登録地点一覧を保存
 */
function saveSavedLocations(locations: SavedLocation[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(locations));
  } catch (error) {
    console.error('Failed to save locations:', error);
    throw new Error('登録地点の保存に失敗しました');
  }
}

/**
 * 新しい登録地点を追加
 */
export function addSavedLocation(
  location: Omit<SavedLocation, 'id' | 'createdAt'>
): SavedLocation {
  const locations = getSavedLocations();
  
  const newLocation: SavedLocation = {
    ...location,
    id: generateId(),
    createdAt: new Date().toISOString(),
  };
  
  locations.push(newLocation);
  saveSavedLocations(locations);
  
  return newLocation;
}

/**
 * 登録地点を更新
 */
export function updateSavedLocation(
  id: string,
  updates: Partial<Pick<SavedLocation, 'name' | 'memo' | 'color'>>
): SavedLocation | null {
  const locations = getSavedLocations();
  const index = locations.findIndex((loc) => loc.id === id);
  
  if (index === -1) {
    return null;
  }
  
  locations[index] = {
    ...locations[index],
    ...updates,
  };
  
  saveSavedLocations(locations);
  return locations[index];
}

/**
 * 登録地点を削除
 */
export function removeSavedLocation(id: string): boolean {
  const locations = getSavedLocations();
  const filteredLocations = locations.filter((loc) => loc.id !== id);
  
  if (filteredLocations.length === locations.length) {
    return false; // 見つからなかった
  }
  
  saveSavedLocations(filteredLocations);
  return true;
}

/**
 * 特定の登録地点を取得
 */
export function getSavedLocationById(id: string): SavedLocation | null {
  const locations = getSavedLocations();
  return locations.find((loc) => loc.id === id) || null;
}

/**
 * 全ての登録地点を削除
 */
export function clearAllSavedLocations(): void {
  localStorage.removeItem(STORAGE_KEY);
}
