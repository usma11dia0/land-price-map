/**
 * 設定ファイルのテンプレート
 *
 * 使用方法:
 * 1. このファイルをコピーして config.ts を作成
 *    cp src/config.example.ts src/config.ts
 * 2. config.ts を編集してAPIキーを設定
 *
 * 注意: config.ts は .gitignore に追加されており、
 *       リポジトリにはコミットされません
 */

import type { AppConfig } from './types.js';

/**
 * アプリケーション設定
 */
export const CONFIG: AppConfig = {
  /**
   * Google Maps Platform APIキー
   * https://console.cloud.google.com/ で取得できます
   */
  GOOGLE_API_KEY: 'YOUR_GOOGLE_API_KEY_HERE',

  /**
   * 不動産情報ライブラリAPIキー
   * https://www.reinfolib.mlit.go.jp/ で取得できます
   * 開発環境でのみ使用（本番環境はVercel環境変数を使用）
   */
  REINFOLIB_API_KEY: 'YOUR_REINFOLIB_API_KEY_HERE',

  /**
   * API使用量の上限（月間の最大使用回数）
   * Google Geocoding APIの無料枠は月間約28,500リクエスト
   * 安全マージンを考慮して9,000に設定
   */
  API_USAGE_LIMIT: 9000,
};
