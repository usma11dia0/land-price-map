/**
 * 地価情報取得モジュール
 * 不動産情報ライブラリAPIからデータを取得し、整形する
 */

import type {
  LandPriceApiResponse,
  LandPriceFeature,
  LandPricePoint,
  PriceClassification,
  PriceHistory,
  SearchBounds,
  TileCoordinate,
} from './landPriceTypes.js';

/** APIのズームレベル（13-15が有効） */
const API_ZOOM_LEVEL = 15;

/** 検索結果の上限件数 */
export const MAX_SEARCH_RESULTS = 100;

/** 検索タイル数の上限（これ以上は事前に警告） */
export const MAX_TILES_WARNING = 20;

/**
 * 緯度経度からXYZタイル座標を計算
 * @param lat 緯度
 * @param lon 経度
 * @param zoom ズームレベル
 * @returns タイル座標
 */
export function latLonToTile(lat: number, lon: number, zoom: number): TileCoordinate {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y, z: zoom };
}

/**
 * 検索範囲内のタイル座標リストを取得
 * @param bounds 検索範囲
 * @param zoom ズームレベル
 * @returns タイル座標の配列
 */
function getTilesInBounds(bounds: SearchBounds, zoom: number): TileCoordinate[] {
  const tiles: TileCoordinate[] = [];

  const nw = latLonToTile(bounds.north, bounds.west, zoom);
  const se = latLonToTile(bounds.south, bounds.east, zoom);

  for (let x = nw.x; x <= se.x; x++) {
    for (let y = nw.y; y <= se.y; y++) {
      tiles.push({ x, y, z: zoom });
    }
  }

  return tiles;
}

/**
 * 検索範囲のタイル数を事前計算
 * @param bounds 検索範囲
 * @returns タイル数
 */
export function estimateTileCount(bounds: SearchBounds): number {
  const tiles = getTilesInBounds(bounds, API_ZOOM_LEVEL);
  return tiles.length;
}

/**
 * 画面中心から40%の範囲を計算
 * @param centerLat 中心緯度
 * @param centerLon 中心経度
 * @param mapBounds 地図の表示範囲
 * @returns 検索範囲
 */
export function calculateSearchBounds(
  centerLat: number,
  centerLon: number,
  mapBounds: { north: number; south: number; east: number; west: number }
): SearchBounds {
  const latRange = mapBounds.north - mapBounds.south;
  const lonRange = mapBounds.east - mapBounds.west;

  const latOffset = latRange * 0.2; // 40%の半分
  const lonOffset = lonRange * 0.2;

  return {
    north: centerLat + latOffset,
    south: centerLat - latOffset,
    east: centerLon + lonOffset,
    west: centerLon - lonOffset,
  };
}

/**
 * 建蔽率・容積率の値をクリーンアップ
 * APIから返される値が「-800(%)」のような形式の場合：
 * - 先頭のハイフンは「指定容積率を上回る容積率を使用して価格を決定した地点」を示す
 * - ハイフンを削除し、末尾に★を追加
 * @param value APIから返される値
 * @returns クリーンアップされた値（指定超過の場合は★付き）
 */
function cleanRatioValue(value: string | undefined): string {
  if (!value) return '-';
  
  let cleaned = value.trim();
  
  // 先頭のハイフンがある場合は、指定容積率を超過した地点
  if (cleaned.startsWith('-')) {
    cleaned = cleaned.substring(1) + '★';
  }
  
  return cleaned || '-';
}

/**
 * 最新年を取得
 * @returns 最新年（年度）
 */
function getLatestYear(): number {
  const now = new Date();
  // 地価公示は1月1日時点、3月に公表
  // 都道府県地価調査は7月1日時点、9月に公表
  // 安全のため前年を最新とする
  return now.getFullYear() - 1;
}

/**
 * 単一タイルのデータを取得
 * @param tile タイル座標
 * @param year 年度
 * @param priceClassification 地価区分（指定しない場合は両方取得）
 * @returns APIレスポンス
 * 
 * 注意: ローカル開発時は `vercel dev` を使用してください。
 * 通常の http-server では CORS エラーが発生します。
 */
async function fetchTileData(
  tile: TileCoordinate,
  year: number,
  priceClassification?: PriceClassification
): Promise<LandPriceApiResponse | null> {
  // 常にプロキシAPI経由でアクセス（本番でも開発でも同じ）
  // ローカル開発時は `vercel dev` を使用することで /api/landprice が動作する
  const params = new URLSearchParams({
    z: String(tile.z),
    x: String(tile.x),
    y: String(tile.y),
    year: String(year),
  });
  if (priceClassification !== undefined) {
    params.append('priceClassification', String(priceClassification));
  }
  const url = `/api/landprice?${params.toString()}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`API error: ${response.status}`);
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch tile data:', error);
    return null;
  }
}

/**
 * APIレスポンスのFeatureをUIで使用する形式に変換
 * @param feature APIレスポンスのFeature
 * @param priceClassification 地価区分
 * @returns 整形されたデータ
 */
function featureToLandPricePoint(
  feature: LandPriceFeature,
  priceClassification: PriceClassification
): LandPricePoint {
  const props = feature.properties;
  const [lon, lat] = feature.geometry.coordinates;

  // 価格を数値に変換
  let currentPrice: number | null = null;
  if (props.u_current_years_price_ja) {
    const priceStr = props.u_current_years_price_ja.replace(/,/g, '');
    currentPrice = parseInt(priceStr, 10);
    if (isNaN(currentPrice)) currentPrice = null;
  }

  // point_idを数値に変換
  let pointId: number | null = null;
  if (props.point_id) {
    const parsed = typeof props.point_id === 'string' ? parseInt(props.point_id, 10) : props.point_id;
    if (!isNaN(parsed)) pointId = parsed;
  }

  return {
    id: props.point_id || `${lat}-${lon}-${priceClassification}`,
    pointId,
    lat,
    lon,
    priceClassification,

    // 基本情報
    standardLotNumber: props.standard_lot_number_ja || '-',
    locationNumber: props.location_number_ja || '-',
    residenceDisplay: props.residence_display_name_ja || '-',
    prefectureName: props.prefecture_name_ja || '-',
    cityName: `${props.city_county_name_ja || ''}${props.ward_town_village_name_ja || ''}`,

    // 価格情報
    currentPrice,
    currentPriceDisplay: props.u_current_years_price_ja || '-',
    yearOnYearChangeRate: props.year_on_year_change_rate ?? null,
    priceHistory: [], // 後で追加

    // 土地情報
    useCategory: props.use_category_name_ja || '-',
    cadastral: props.u_cadastral_ja || '-',
    usageStatus: props.usage_status_name_ja || '-',
    surroundingUsageStatus: props.current_usage_status_of_surrounding_land_name_ja || '-',

    // 道路情報
    frontRoadWidth: props.front_road_width ?? null,
    frontRoadAzimuth: props.front_road_azimuth_name_ja || '-',
    frontRoadPavement: props.front_road_pavement_condition || '-',
    sideRoadAzimuth: props.side_road_azimuth_name_ja || '-',
    sideRoad: props.side_road_name_ja || '-',

    // 交通情報
    nearestStation: props.nearest_station_name_ja || '-',
    proximityToTransportation: props.proximity_to_transportation_facilities || '-',
    distanceToStation: props.u_road_distance_to_nearest_station_name_ja || '-',

    // 法規制情報
    regulationsUseCategory: props.regulations_use_category_name_ja || '-',
    buildingCoverageRatio: cleanRatioValue(props.u_regulations_building_coverage_ratio_ja),
    floorAreaRatio: cleanRatioValue(props.u_regulations_floor_area_ratio_ja),
    fireproofArea: props.regulations_fireproof_name_ja || '-',
    altitudeDistrict: props.regulations_altitude_district_name_ja || '-',
  };
}

/**
 * 指定範囲の地価データを取得
 * @param bounds 検索範囲
 * @param showKoji 地価公示を取得するか
 * @param showChosa 都道府県地価調査を取得するか
 * @param onProgress 進捗コールバック
 * @returns 地価ポイントの配列
 */
export async function fetchLandPriceData(
  bounds: SearchBounds,
  showKoji: boolean,
  showChosa: boolean,
  onProgress?: (current: number, total: number) => void
): Promise<LandPricePoint[]> {
  const latestYear = getLatestYear();
  const tiles = getTilesInBounds(bounds, API_ZOOM_LEVEL);

  // 取得する分類のリスト
  const classifications: PriceClassification[] = [];
  if (showKoji) classifications.push(0);
  if (showChosa) classifications.push(1);

  if (classifications.length === 0) {
    return [];
  }

  // ポイントをIDでマップ（重複排除用）
  const pointsMap = new Map<string, LandPricePoint>();

  // 最新年のデータを取得
  const totalRequests = tiles.length * classifications.length;
  let completedRequests = 0;

  const fetchPromises: Promise<void>[] = [];

  for (const tile of tiles) {
    for (const classification of classifications) {
      const promise = (async () => {
        const data = await fetchTileData(tile, latestYear, classification);
        completedRequests++;
        onProgress?.(completedRequests, totalRequests);

        if (data && data.features) {
          for (const feature of data.features) {
            const point = featureToLandPricePoint(feature, classification);
            // 検索範囲内のみ追加
            if (
              point.lat >= bounds.south &&
              point.lat <= bounds.north &&
              point.lon >= bounds.west &&
              point.lon <= bounds.east
            ) {
              pointsMap.set(point.id, point);
            }
          }
        }
      })();
      fetchPromises.push(promise);
    }
  }

  await Promise.all(fetchPromises);

  // 過去データの取得を削除（高速化のため、モーダル表示時に遅延取得）
  const points = Array.from(pointsMap.values());

  return points;
}

/** 取得する過去年数 */
const HISTORY_YEARS = 5;

/**
 * 単一ポイントの価格履歴を遅延取得
 * モーダル表示時に呼び出される
 * @param point 地価ポイント
 * @returns 価格履歴の配列
 */
export async function fetchPointPriceHistory(
  point: LandPricePoint
): Promise<PriceHistory[]> {
  const latestYear = getLatestYear();
  const tile = latLonToTile(point.lat, point.lon, API_ZOOM_LEVEL);
  
  // 価格履歴を格納するMap
  const priceByYear = new Map<number, { price: number | null; changeRate: number | null }>();
  
  // 最新年のデータを追加
  priceByYear.set(latestYear, {
    price: point.currentPrice,
    changeRate: point.yearOnYearChangeRate,
  });

  // 過去4年分を並列で取得
  const fetchPromises: Promise<void>[] = [];
  
  for (let i = 1; i < HISTORY_YEARS; i++) {
    const year = latestYear - i;
    const promise = (async () => {
      const data = await fetchTileData(tile, year, point.priceClassification);
      
      if (data && data.features) {
        for (const feature of data.features) {
          if (feature.properties.point_id === point.id) {
            let price: number | null = null;
            if (feature.properties.u_current_years_price_ja) {
              const priceStr = feature.properties.u_current_years_price_ja.replace(/,/g, '');
              price = parseInt(priceStr, 10);
              if (isNaN(price)) price = null;
            }
            priceByYear.set(year, {
              price,
              changeRate: feature.properties.year_on_year_change_rate ?? null,
            });
            break;
          }
        }
      }
    })();
    fetchPromises.push(promise);
  }

  await Promise.all(fetchPromises);

  // 年度順にソートして配列に変換（降順：最新が上）
  const history: PriceHistory[] = [];
  for (let i = 0; i < HISTORY_YEARS; i++) {
    const year = latestYear - i;
    const data = priceByYear.get(year);
    history.push({
      year,
      price: data?.price ?? null,
      changeRate: data?.changeRate ?? null,
    });
  }

  return history;
}

