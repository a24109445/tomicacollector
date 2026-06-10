# TomicaCollector

Windows 11 上開發、iPhone 透過 Expo Go 測試的 Tomica 收藏管理 App。

## 1. Windows 環境安裝步驟

1. 安裝 Node.js LTS：<https://nodejs.org/>
2. 安裝 VS Code：<https://code.visualstudio.com/>
3. 開啟 PowerShell，確認版本：

   ```powershell
   node -v
   npm -v
   ```

4. iPhone 從 App Store 安裝 Expo Go。
5. Windows 電腦與 iPhone 連到同一個 Wi-Fi。

本專案不需要 Xcode、不需要 Swift、不需要雲端、不需要登入。

## 2. Expo 專案建立指令

如果要從零建立專案，可執行：

```powershell
npx create-expo-app@latest TomicaCollector
cd TomicaCollector
npx expo install expo-camera expo-sqlite expo-status-bar react-native-safe-area-context
npm install
```

本工作區已經放好第一版程式碼，可直接執行：

```powershell
npm install
npx expo start
```

如果 iPhone 掃不到或連不上：

```powershell
npx expo start --tunnel
```

## 3. 專案資料夾架構

```text
TomicaCollector/
  App.tsx
  app.json
  package.json
  tsconfig.json
  README.md
  src/
    TomicaCollectorApp.tsx
    types.ts
    database/
      schema.ts
      tomicaRepository.ts
  web/
    index.html
    app.js
    styles.css
    manifest.webmanifest
    sw.js
```

## 4. 每個檔案用途

- `package.json`：Expo、React Native、TypeScript、Camera、SQLite 套件與啟動指令。
- `app.json`：App 名稱、iOS 設定、相機權限文字、barcode scanner 設定。
- `tsconfig.json`：TypeScript 嚴格模式設定。
- `App.tsx`：App 入口，掛上 `SQLiteProvider` 並初始化本機資料庫。
- `src/types.ts`：Tomica 資料欄位、表單草稿型別、簡易畫面狀態型別。
- `src/database/schema.ts`：建立 `tomicas` SQLite table 與搜尋索引。
- `src/database/tomicaRepository.ts`：列表、搜尋、查詢條碼、新增、編輯、刪除資料。
- `src/TomicaCollectorApp.tsx`：收藏列表、新增/編輯表單、刪除確認、條碼掃描流程與 UI。
- `web/`：網頁版 TomicaCollector，使用 IndexedDB 保存收藏資料，支援 PWA 離線快取。

## 5. 第一版功能

- 收藏列表
- 新增、編輯、刪除 Tomica 資料
- 搜尋車名、編號、條碼、系列
- 使用 iPhone 相機掃描條碼
- 拍攝並查看收藏照片
- 系列下拉選單支援一般紅盒、Dream Tomica、會場車、舊藍標、舊紅標、日制舊紅標、TLV、Tomica Premium、Boxset、Tomica Shop、聯名限定、其他
- 掃描後查詢 SQLite
- 條碼存在時顯示「已收藏」與車輛資料
- 條碼不存在時顯示「尚未收藏」與「新增收藏」按鈕

SQLite 欄位：

```text
id, barcode, number, name, series, version, madeIn, year,
ownedCount, hasSticker, photoUri, note, createdAt, updatedAt
```

## 6. 如何用 iPhone 的 Expo Go 測試

1. 在 Windows PowerShell 進入專案資料夾。
2. 執行：

   ```powershell
   npm install
   npx expo start
   ```

3. iPhone 開啟 Expo Go。
4. 掃描 PowerShell 或瀏覽器中顯示的 QR code。
5. 第一次進入掃描頁時，允許相機權限。
6. 用 Tomica 外盒條碼測試：
   - 已存在：會看到「已收藏」與資料。
   - 不存在：會看到「尚未收藏」，可按「新增收藏」帶入條碼。

## 7. 更新 App 時保留收藏資料

這個 App 的資料存在 iPhone 本機 SQLite。一般情況下，只要只是更新 JavaScript/TypeScript 程式碼、重新執行 `npx expo start`、或在 Expo Go 裡重新載入 App，收藏資料都會保留。

請避免用下面方式測試正式資料，因為這些動作可能清掉 Expo Go 的本機資料：

- 刪除 iPhone 上的 Expo Go
- 清除 Expo Go App 資料
- 更換 `SQLiteProvider` 的 `databaseName`
- 在程式碼中 drop table 或刪除 database file

資料庫升級採用只新增欄位的 migration，例如 `photoUri`、`hasSticker`，不會重建 `tomicas` table。

## 8. 做成 iPhone 可離線使用的 App

目前用 `npx expo start` 是開發模式，所以 PowerShell 關掉後 iPhone 就不能再從 Expo Go 載入 App。要變成 iPhone 上可直接開啟、可離線使用的 App，需要用 EAS Build 建出正式的 iOS App。

重要限制：

- Windows 不需要 Xcode，也不用 Swift。
- App 資料仍然只存在 iPhone 本機 SQLite，不會做雲端資料同步。
- 但 iOS 實機安裝獨立 App 需要 Apple 簽名。一般做法需要 Apple Developer Program。
- 若用 `preview` internal distribution，iPhone 需要先註冊 UDID，安裝完成後 App 可離線使用。
- 若上架 App Store 或 TestFlight，使用 `production` build。

第一次設定：

```powershell
npm install --global eas-cli
eas login
eas build:configure
```

建立可安裝在指定 iPhone 的測試版：

```powershell
eas device:create
npm run build:ios:preview
```

建置完成後，EAS 會提供安裝網址或 QR code。用已註冊的 iPhone 開啟該網址安裝。安裝完成後，TomicaCollector 就會像一般 App 一樣出現在 iPhone 主畫面，不需要 PowerShell 開著。

建立 App Store / TestFlight 版本：

```powershell
npm run build:ios:production
```

更新注意事項：

- 每次改 App 後需要重新 build 並安裝新版。
- 不要更改 `ios.bundleIdentifier`，否則 iPhone 會把它視為另一個 App，原本 SQLite 收藏資料不會跟著過去。
- 不要更改 `SQLiteProvider` 的 `databaseName`，否則會開到新的空資料庫。
- 不要在 migration 裡 drop table，避免洗掉收藏資料。

## 9. 網頁版 TomicaCollector

網頁版放在 `web/`，不依賴 Expo Go。功能包含收藏列表、新增/編輯/刪除、搜尋、條碼查詢、ZXing 自動條碼辨識、相機掃描、拍攝照片、系列下拉選單、持有數量下拉選單、車貼勾選、匯出 JSON 備份、匯入 JSON 備份。

本機測試：

```powershell
npm run web:static
```

然後用瀏覽器開啟：

```text
http://localhost:4173
```

網頁版資料存在瀏覽器的 IndexedDB。只要沒有清除瀏覽器網站資料，收藏會保留。

備份方式：

- 點「匯出備份」會下載 `tomicacollector-backup-日期.json`，照片也會一起以 Data URL 存在 JSON 裡。
- 點「匯入備份」選擇 JSON 檔，系統會用條碼合併資料；同條碼會更新，不同條碼會新增。
- 匯入不會先清空資料，避免誤洗收藏。

iPhone 使用注意：

- iPhone Safari 的相機功能需要 HTTPS 網址，不能只用一般區網 HTTP。
- 部署到 GitHub Pages、Netlify、Vercel 等 HTTPS 靜態網站後，iPhone 才能使用網頁相機掃描/拍照。
- 條碼自動辨識使用本機快取的 ZXing library，不依賴 Safari 原生 `BarcodeDetector`。
- 開啟 HTTPS 網址後，可在 Safari 分享選單選「加入主畫面」，之後能像 App 一樣從主畫面打開。
- Service Worker 會快取網頁檔案；載入過一次後，基本頁面可離線開啟。

## 參考官方文件

- Expo 建立專案：<https://docs.expo.dev/get-started/create-a-project/>
- Expo 開始開發與 QR code 測試：<https://docs.expo.dev/get-started/start-developing/>
- expo-camera：<https://docs.expo.dev/versions/latest/sdk/camera/>
- expo-sqlite：<https://docs.expo.dev/versions/latest/sdk/sqlite/>
