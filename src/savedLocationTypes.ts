/**
 * 登録地点の型定義
 */

/** 登録地点マーカー */
export interface SavedLocation {
  /** 一意のID（UUID） */
  id: string;
  /** マーカー種別 */
  type: 'landprice' | 'custom';
  /** 緯度 */
  lat: number;
  /** 経度 */
  lon: number;
  /** ユーザーが付けた名前 */
  name: string;
  /** メモ（任意） */
  memo?: string;
  /** マーカー色（#hex形式） */
  color: string;
  /** 作成日時（ISO 8601形式） */
  createdAt: string;
  /** 地価マーカーの場合の追加情報 */
  landPriceData?: LandPriceLocationData;
}

/** 地価マーカーから登録した場合の追加データ */
export interface LandPriceLocationData {
  /** 標準地/基準地番号 */
  standardLotNumber: string;
  /** 当年価格表示 */
  currentPrice: string;
  /** 価格分類（0: 地価公示, 1: 都道府県地価調査） */
  priceClassification: number;
  /** 所在及び地番 */
  locationNumber?: string;
}

/** カラーパレット（プリセット色） */
export const COLOR_PALETTE = [
  { name: '赤', color: '#e74c3c' },
  { name: 'オレンジ', color: '#e67e22' },
  { name: '黄', color: '#f1c40f' },
  { name: '緑', color: '#2ecc71' },
  { name: '青', color: '#3498db' },
  { name: '紫', color: '#9b59b6' },
  { name: 'ピンク', color: '#e91e63' },
  { name: 'グレー', color: '#95a5a6' },
] as const;

/** デフォルト色 */
export const DEFAULT_COLOR = '#3498db';
