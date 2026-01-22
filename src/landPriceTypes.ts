/**
 * 地価情報の型定義
 * 不動産情報ライブラリAPIのレスポンスとUI用の型を定義
 */

/**
 * 地価情報の区分
 */
export type PriceClassification = 0 | 1; // 0: 地価公示, 1: 都道府県地価調査

/**
 * 地価ポイントのプロパティ（APIレスポンス）
 */
export interface LandPriceProperties {
  // 基本情報
  point_id?: string;
  prefecture_code?: string;
  prefecture_name_ja?: string;
  city_code?: string;
  city_county_name_ja?: string;
  ward_town_village_name_ja?: string;
  place_name_ja?: string;
  standard_lot_number_ja?: string;
  location_number_ja?: string;
  residence_display_name_ja?: string;

  // 価格情報
  target_year_name_ja?: string;
  u_current_years_price_ja?: string;
  last_years_price?: number;
  year_on_year_change_rate?: number;
  land_price_type?: number;

  // 土地情報
  use_category_name_ja?: string;
  u_cadastral_ja?: string;
  building_structure_name_ja?: string;
  u_ground_hierarchy_ja?: string;
  u_underground_hierarchy_ja?: string;
  frontage_ratio?: number;
  depth_ratio?: number;
  usage_status_name_ja?: string;
  current_usage_status_of_surrounding_land_name_ja?: string;

  // 道路情報
  front_road_name_ja?: string;
  front_road_azimuth_name_ja?: string;
  front_road_width?: number;
  front_road_pavement_condition?: string;
  side_road_azimuth_name_ja?: string;
  side_road_name_ja?: string;

  // 交通情報
  nearest_station_name_ja?: string;
  proximity_to_transportation_facilities?: string;
  u_road_distance_to_nearest_station_name_ja?: string;

  // 法規制情報
  area_division_name_ja?: string;
  regulations_use_category_name_ja?: string;
  regulations_altitude_district_name_ja?: string;
  regulations_fireproof_name_ja?: string;
  u_regulations_building_coverage_ratio_ja?: string;
  u_regulations_floor_area_ratio_ja?: string;
  regulations_forest_law_name_ja?: string;
  regulations_park_law_name_ja?: string;

  // インフラ情報
  gas_supply_availability?: string;
  water_supply_availability?: string;
  sewer_supply_availability?: string;

  // その他
  pause_flag?: number;
}

/**
 * GeoJSONのジオメトリ（Point）
 */
export interface PointGeometry {
  type: 'Point';
  coordinates: [number, number]; // [lon, lat]
}

/**
 * 地価ポイントのFeature
 */
export interface LandPriceFeature {
  type: 'Feature';
  geometry: PointGeometry;
  properties: LandPriceProperties;
}

/**
 * APIレスポンス（GeoJSON FeatureCollection）
 */
export interface LandPriceApiResponse {
  type: 'FeatureCollection';
  features: LandPriceFeature[];
}

/**
 * 価格履歴（年度ごと）
 */
export interface PriceHistory {
  year: number;
  price: number | null;
  changeRate: number | null;
}

/**
 * 地価ポイントデータ（UI用に整形済み）
 */
export interface LandPricePoint {
  id: string;
  lat: number;
  lon: number;
  priceClassification: PriceClassification;

  // 基本情報
  standardLotNumber: string;
  locationNumber: string;
  residenceDisplay: string;
  prefectureName: string;
  cityName: string;

  // 価格情報
  currentPrice: number | null;
  currentPriceDisplay: string;
  yearOnYearChangeRate: number | null;
  priceHistory: PriceHistory[];

  // 土地情報
  useCategory: string;
  cadastral: string;
  usageStatus: string;
  surroundingUsageStatus: string;

  // 道路情報
  frontRoadWidth: number | null;
  frontRoadAzimuth: string;
  frontRoadPavement: string;
  sideRoadAzimuth: string;
  sideRoad: string;

  // 交通情報
  nearestStation: string;
  proximityToTransportation: string;
  distanceToStation: string;

  // 法規制情報
  regulationsUseCategory: string;
  buildingCoverageRatio: string;
  floorAreaRatio: string;
  fireproofArea: string;
  altitudeDistrict: string;
}

/**
 * タイル座標
 */
export interface TileCoordinate {
  x: number;
  y: number;
  z: number;
}

/**
 * 検索範囲
 */
export interface SearchBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

/**
 * 地価情報コントロールの状態
 */
export interface LandPriceControlState {
  showKoji: boolean; // 地価公示を表示
  showChosa: boolean; // 都道府県地価調査を表示
  isLoading: boolean;
}

/**
 * APIエラーレスポンス
 */
export interface LandPriceApiError {
  error: string;
}
