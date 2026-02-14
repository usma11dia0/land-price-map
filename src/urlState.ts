/**
 * URL状態管理モジュール
 * URLパラメータによるディープリンク機能を提供
 */

export interface UrlState {
  lat: number | null;
  lon: number | null;
  zoom: number | null;
}

/**
 * URLパラメータを解析
 * @returns 解析された状態
 */
export function getUrlState(): UrlState {
  const params = new URLSearchParams(window.location.search);

  const latStr = params.get('lat');
  const lonStr = params.get('lon');
  const zoomStr = params.get('zoom');

  const lat = latStr !== null ? parseFloat(latStr) : null;
  const lon = lonStr !== null ? parseFloat(lonStr) : null;
  const zoom = zoomStr !== null ? parseInt(zoomStr, 10) : null;

  return {
    lat: lat !== null && !isNaN(lat) ? lat : null,
    lon: lon !== null && !isNaN(lon) ? lon : null,
    zoom: zoom !== null && !isNaN(zoom) ? zoom : null,
  };
}

/** デボウンス用タイマー */
let updateTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * URLパラメータを更新（history.replaceState）
 * 500msデボウンスで実行
 * @param lat 緯度
 * @param lon 経度
 * @param zoom ズームレベル
 */
export function updateUrlState(lat: number, lon: number, zoom: number): void {
  if (updateTimer) {
    clearTimeout(updateTimer);
  }

  updateTimer = setTimeout(() => {
    const params = new URLSearchParams();
    params.set('lat', lat.toFixed(6));
    params.set('lon', lon.toFixed(6));
    params.set('zoom', String(zoom));

    const newUrl = `${window.location.pathname}?${params.toString()}`;
    history.replaceState(null, '', newUrl);
  }, 500);
}
