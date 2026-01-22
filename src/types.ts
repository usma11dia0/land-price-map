/**
 * 型定義ファイル
 * アプリケーション全体で使用するインターフェースと型を定義
 */

/**
 * 検索結果の地点情報
 */
export interface SearchResult {
  /** 地点名（住所） */
  name: string;
  /** 緯度 */
  lat: number;
  /** 経度 */
  lon: number;
  /** データソース名 */
  source: string;
}

/**
 * API使用量データ
 */
export interface UsageData {
  /** 今月の使用回数 */
  count: number;
  /** 記録月（年月文字列 例: "2025-01"） */
  date: string;
  /** 累計使用回数（全期間） */
  totalCount?: number;
}

/**
 * アプリケーション設定
 */
export interface AppConfig {
  /** Google APIキー */
  GOOGLE_API_KEY: string;
  /** 不動産情報ライブラリAPIキー */
  REINFOLIB_API_KEY?: string;
  /** API使用量の上限 */
  API_USAGE_LIMIT: number;
}

/**
 * 国土地理院APIのレスポンス項目
 */
export interface GSISearchItem {
  geometry: {
    coordinates: [number, number]; // [lon, lat]
  };
  properties: {
    title: string;
  };
}

/**
 * Nominatim APIのレスポンス項目
 */
export interface NominatimSearchItem {
  display_name: string;
  lat: string;
  lon: string;
}

/**
 * Google Geocoding APIのレスポンス
 */
export interface GoogleGeocodingResponse {
  status: GoogleGeocodingStatus;
  results: GoogleGeocodingResult[];
  error_message?: string;
}

/**
 * Google Geocoding APIのステータス
 */
export type GoogleGeocodingStatus =
  | 'OK'
  | 'ZERO_RESULTS'
  | 'OVER_DAILY_LIMIT'
  | 'OVER_QUERY_LIMIT'
  | 'REQUEST_DENIED'
  | 'INVALID_REQUEST'
  | 'UNKNOWN_ERROR';

/**
 * Google Geocoding APIの結果項目
 */
export interface GoogleGeocodingResult {
  formatted_address: string;
  geometry: {
    location: {
      lat: number;
      lng: number;
    };
    location_type: string;
  };
  place_id: string;
  address_components: {
    long_name: string;
    short_name: string;
    types: string[];
  }[];
}

/**
 * 座標（緯度・経度）
 */
export interface Coordinates {
  lat: number;
  lon: number;
}

/**
 * Google Places API (Text Search) のレスポンス
 */
export interface GooglePlacesResponse {
  places?: GooglePlaceResult[];
  error?: {
    code: number;
    message: string;
    status: string;
  };
}

/**
 * Google Places APIの結果項目
 */
export interface GooglePlaceResult {
  id: string;
  displayName: {
    text: string;
    languageCode: string;
  };
  formattedAddress: string;
  location: {
    latitude: number;
    longitude: number;
  };
  types?: string[];
}

/**
 * Leafletのグローバル型拡張
 */
declare global {
  interface Window {
    /** 現在の検索結果（グローバルアクセス用） */
    currentResults?: SearchResult[];
    /** 検索結果を非表示にする関数 */
    hideResults?: () => void;
    /** インデックスで結果を選択する関数 */
    selectResultByIndex?: (index: number) => void;
    /** 設定モーダルを閉じる関数 */
    closeSettingsModal?: () => void;
    /** ストリートビューモーダルを閉じる関数 */
    closeStreetViewModal?: () => void;
    /** ポップアップからストリートビューを開く関数 */
    openStreetViewFromPopup?: () => void;
  }
}
