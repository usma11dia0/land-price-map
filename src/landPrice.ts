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

/** 取得する過去年数 */
const HISTORY_YEARS = 5;

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
export function getTilesInBounds(bounds: SearchBounds, zoom: number): TileCoordinate[] {
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
 * 画面中心から20%の範囲を計算
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

  const latOffset = latRange * 0.1; // 20%の半分
  const lonOffset = lonRange * 0.1;

  return {
    north: centerLat + latOffset,
    south: centerLat - latOffset,
    east: centerLon + lonOffset,
    west: centerLon - lonOffset,
  };
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
 */
async function fetchTileData(
  tile: TileCoordinate,
  year: number,
  priceClassification?: PriceClassification
): Promise<LandPriceApiResponse | null> {
  const isProduction =
    window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

  let url: string;
  if (isProduction) {
    const params = new URLSearchParams({
      z: String(tile.z),
      x: String(tile.x),
      y: String(tile.y),
      year: String(year),
    });
    if (priceClassification !== undefined) {
      params.append('priceClassification', String(priceClassification));
    }
    url = `/api/landprice?${params.toString()}`;
  } else {
    // 開発環境: 直接APIを呼び出し（config.tsからAPIキーを取得）
    const { CONFIG } = await import('./config.js');
    const params = new URLSearchParams({
      response_format: 'geojson',
      z: String(tile.z),
      x: String(tile.x),
      y: String(tile.y),
      year: String(year),
    });
    if (priceClassification !== undefined) {
      params.append('priceClassification', String(priceClassification));
    }
    const apiUrl = `https://www.reinfolib.mlit.go.jp/ex-api/external/XPT002?${params.toString()}`;

    try {
      const response = await fetch(apiUrl, {
        headers: {
          'Ocp-Apim-Subscription-Key': CONFIG.REINFOLIB_API_KEY || '',
        },
      });
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

  return {
    id: props.point_id || `${lat}-${lon}-${priceClassification}`,
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
    buildingCoverageRatio: props.u_regulations_building_coverage_ratio_ja || '-',
    floorAreaRatio: props.u_regulations_floor_area_ratio_ja || '-',
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

  // 過去5年分のデータを取得して履歴を構築
  const points = Array.from(pointsMap.values());

  if (points.length > 0) {
    await fetchPriceHistory(points, latestYear, tiles);
  }

  return points;
}

/**
 * 過去5年分の価格履歴を取得
 * @param points 地価ポイントの配列
 * @param latestYear 最新年
 * @param tiles タイル座標の配列
 */
async function fetchPriceHistory(
  points: LandPricePoint[],
  latestYear: number,
  tiles: TileCoordinate[]
): Promise<void> {
  // ポイントIDから分類を逆引きするマップ
  const pointClassificationMap = new Map<string, PriceClassification>();
  for (const point of points) {
    pointClassificationMap.set(point.id, point.priceClassification);
  }

  // 各年の価格を保存するマップ
  const priceByYearMap = new Map<string, Map<number, { price: number | null; changeRate: number | null }>>();

  // 初期化
  for (const point of points) {
    priceByYearMap.set(point.id, new Map());
    // 最新年のデータを追加
    priceByYearMap.get(point.id)!.set(latestYear, {
      price: point.currentPrice,
      changeRate: point.yearOnYearChangeRate,
    });
  }

  // 過去4年分を取得（最新年は既に取得済み）
  for (let i = 1; i < HISTORY_YEARS; i++) {
    const year = latestYear - i;

    const fetchPromises: Promise<void>[] = [];

    for (const tile of tiles) {
      // 地価公示と都道府県地価調査の両方を取得
      for (const classification of [0, 1] as PriceClassification[]) {
        const promise = (async () => {
          const data = await fetchTileData(tile, year, classification);

          if (data && data.features) {
            for (const feature of data.features) {
              const id = feature.properties.point_id;
              if (id && priceByYearMap.has(id)) {
                let price: number | null = null;
                if (feature.properties.u_current_years_price_ja) {
                  const priceStr = feature.properties.u_current_years_price_ja.replace(/,/g, '');
                  price = parseInt(priceStr, 10);
                  if (isNaN(price)) price = null;
                }
                priceByYearMap.get(id)!.set(year, {
                  price,
                  changeRate: feature.properties.year_on_year_change_rate ?? null,
                });
              }
            }
          }
        })();
        fetchPromises.push(promise);
      }
    }

    await Promise.all(fetchPromises);
  }

  // 価格履歴をポイントに設定
  for (const point of points) {
    const priceMap = priceByYearMap.get(point.id);
    if (priceMap) {
      const history: PriceHistory[] = [];
      for (let i = HISTORY_YEARS - 1; i >= 0; i--) {
        const year = latestYear - i;
        const data = priceMap.get(year);
        history.push({
          year,
          price: data?.price ?? null,
          changeRate: data?.changeRate ?? null,
        });
      }
      point.priceHistory = history;
    }
  }
}
