import { test, expect } from '@playwright/test';

test.describe('地価情報マップ', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('ページが正常に読み込まれる', async ({ page }) => {
    // タイトルを確認
    await expect(page).toHaveTitle('地価情報マップ');

    // ヘッダーが表示されている
    await expect(page.locator('h1')).toHaveText('地価情報マップ');

    // 地図が表示されている
    await expect(page.locator('#map')).toBeVisible();

    // 検索入力欄が表示されている
    await expect(page.locator('#search-input')).toBeVisible();
  });

  test('地価情報コントロールパネルが表示される', async ({ page }) => {
    // コントロールパネルが表示されている
    await expect(page.locator('#land-price-control')).toBeVisible();

    // チェックボックスラベルが存在する（input自体はCSSで非表示）
    await expect(page.locator('label:has(#show-koji)')).toBeVisible();
    await expect(page.locator('label:has(#show-chosa)')).toBeVisible();

    // 検索ボタンが存在する（初期状態は無効）
    const searchBtn = page.locator('#land-price-search-btn');
    await expect(searchBtn).toBeVisible();
    await expect(searchBtn).toBeDisabled();
  });

  test('チェックボックスをONにすると検索ボタンが有効になる', async ({ page }) => {
    const searchBtn = page.locator('#land-price-search-btn');

    // 初期状態は無効
    await expect(searchBtn).toBeDisabled();

    // 地価公示のラベルをクリック（input自体はCSSで非表示のため）
    await page.locator('label:has(#show-koji)').click();

    // 検索ボタンが有効になる
    await expect(searchBtn).toBeEnabled();
  });

  test('検索入力欄に入力できる', async ({ page }) => {
    const searchInput = page.locator('#search-input');

    // 入力
    await searchInput.fill('東京都千代田区丸の内1丁目');

    // 入力値を確認
    await expect(searchInput).toHaveValue('東京都千代田区丸の内1丁目');
  });

  test('外部リンクボタンが存在する', async ({ page }) => {
    // 路線価ボタン
    await expect(page.locator('#btn-chikamap')).toBeVisible();

    // Googleマップボタン
    await expect(page.locator('#btn-google-maps')).toBeVisible();
  });

  test('設定ボタンをクリックするとモーダルが表示される', async ({ page }) => {
    // 設定ボタンをクリック
    await page.locator('#settings-button').click();

    // モーダルが表示される
    await expect(page.locator('#settings-modal')).toBeVisible();

    // API使用状況のテキストが表示される
    await expect(page.locator('#settings-modal')).toContainText('API使用状況');
  });

  test('地図上をクリックできる', async ({ page }) => {
    // 地図要素を取得
    const map = page.locator('#map');

    // 地図の中央をクリック
    await map.click();

    // エラーが発生しないことを確認（ページがクラッシュしない）
    await expect(page).toHaveTitle('地価情報マップ');
  });
});

test.describe('モーダル操作', () => {
  test('設定モーダルを閉じることができる', async ({ page }) => {
    await page.goto('/');

    // モーダルを開く
    await page.locator('#settings-button').click();
    await expect(page.locator('#settings-modal')).toBeVisible();

    // 閉じるボタンをクリック
    await page.locator('#settings-modal .modal-close').click();

    // モーダルが非表示になる
    await expect(page.locator('#settings-modal')).not.toBeVisible();
  });
});

test.describe('地価情報機能', () => {
  test('地価情報を検索できる', async ({ page }) => {
    await page.goto('/');

    // 地価公示チェックボックスをON
    await page.locator('label:has(#show-koji)').click();

    // 検索ボタンが有効になるのを待つ
    const searchBtn = page.locator('#land-price-search-btn');
    await expect(searchBtn).toBeEnabled({ timeout: 10000 });

    // 検索を実行
    await searchBtn.click();

    // 件数表示が表示されるのを待つ
    await expect(page.locator('#land-price-count')).toBeVisible({ timeout: 30000 });
  });

  test('地価マーカーをクリックするとモーダルが表示される', async ({ page }) => {
    await page.goto('/');

    // 地価公示チェックボックスをON
    await page.locator('label:has(#show-koji)').click();

    // 検索ボタンが有効になるのを待つ
    const searchBtn = page.locator('#land-price-search-btn');
    await expect(searchBtn).toBeEnabled({ timeout: 10000 });

    // 検索を実行
    await searchBtn.click();

    // 検索完了を待つ
    await expect(page.locator('#land-price-count')).toBeVisible({ timeout: 30000 });

    // マーカーが存在するか確認
    const markerCount = await page.locator('.land-price-marker').count();
    
    // マーカーが存在する場合のみテストを続行
    if (markerCount > 0) {
      const marker = page.locator('.land-price-marker').first();
      
      // マーカーをクリック
      await marker.click();

      // モーダルが表示される
      await expect(page.locator('#land-price-modal')).toBeVisible({ timeout: 10000 });

      // モーダルにタイトルが表示されている
      await expect(page.locator('#land-price-modal-title')).not.toBeEmpty();

      // モーダルを閉じる
      await page.locator('#land-price-modal .modal-close').click();
      await expect(page.locator('#land-price-modal')).not.toBeVisible();
    }
  });
});
