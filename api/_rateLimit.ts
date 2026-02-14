/**
 * IPベースのレート制限ユーティリティ
 * メモリ内スライディングウィンドウ方式
 */

interface RateLimitEntry {
  timestamps: number[];
}

const rateLimitStore = new Map<string, RateLimitEntry>();

/** 定期的にメモリをクリーンアップ */
const CLEANUP_INTERVAL = 60000; // 1分
let lastCleanup = Date.now();

function cleanup(windowMs: number): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;

  const cutoff = now - windowMs;
  for (const [key, entry] of rateLimitStore.entries()) {
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
    if (entry.timestamps.length === 0) {
      rateLimitStore.delete(key);
    }
  }
}

/**
 * レート制限をチェック
 * @param ip クライアントIP
 * @param maxRequests ウィンドウ内の最大リクエスト数
 * @param windowMs ウィンドウサイズ（ミリ秒）
 * @returns リクエストが許可される場合はtrue
 */
export function checkRateLimit(
  ip: string,
  maxRequests: number,
  windowMs: number = 60000
): { allowed: boolean; remaining: number; resetMs: number } {
  cleanup(windowMs);

  const now = Date.now();
  const cutoff = now - windowMs;

  let entry = rateLimitStore.get(ip);
  if (!entry) {
    entry = { timestamps: [] };
    rateLimitStore.set(ip, entry);
  }

  // 期限切れのタイムスタンプを除去
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  const remaining = Math.max(0, maxRequests - entry.timestamps.length);

  if (entry.timestamps.length >= maxRequests) {
    const oldestInWindow = entry.timestamps[0];
    const resetMs = oldestInWindow + windowMs - now;
    return { allowed: false, remaining: 0, resetMs };
  }

  entry.timestamps.push(now);
  return { allowed: true, remaining: remaining - 1, resetMs: windowMs };
}

/**
 * VercelリクエストからクライアントIPを取得
 */
export function getClientIp(req: { headers: Record<string, string | string[] | undefined> }): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0].split(',')[0].trim();
  }
  return req.headers['x-real-ip'] as string || 'unknown';
}
