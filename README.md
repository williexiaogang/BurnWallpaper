# BurnWallpaper

燃 BURN — RunComfy 驅動的 Windows / macOS 動漫桌布工具（Tauri 2 + React 19 + Rust）。

## 功能

- ✅ RunComfy 出圖全鏈路：提交 → 輪詢 → 下載 → 入庫 → 上牆
- ✅ API Key 存於 Windows Credential Manager（DPAPI）或 macOS Keychain，記憶體用完即清零
- ✅ Windows `IDesktopWallpaper` / macOS `NSWorkspace` 真機上牆，多螢幕可選全部、單屏或跨屏連續拼接
- ✅ SQLite 持久化：作品記錄、收藏、設定、文件夾、待取回請求
- ✅ 定時輪換桌布（固定時段 / 隨機間隔 / 每日一張）
- ✅ Windows / macOS 系統代理自動偵測（Clash / V2ray 類工具）
- ✅ Color Thief 自適應配色、風格預設隨機變量、JSON 匯入匯出
- ✅ 錯誤 Toast + 一鍵複製日誌
- ✅ 人物摳像分層（Web Worker + transformers.js / ONNX Runtime）
- ✅ 桌面預覽與手動裁切（模擬桌面）
- ✅ 系統托盤完整菜單（來一張 / 換一張 / 定時輪換 / 開機自動來一張）
- ✅ 開機自動來一張：自啟後隨機出圖並自動上牆，失敗保留上一張
- ✅ 首次啟動三步引導（存 Key → 開機行為 → 首張出圖）
- ✅ 跟隨系統動畫 / 減少動態效果開關

## 待完善

- ⏳ 原生 BiRefNet 高解析度摳像
- ⏳ 桌面預覽讀取真實桌面圖示排列與工作列設定

## 風格定義

Prompt 預設採用 schema v3，分為 `content/` 內容包與 `styles/` 畫風包，可獨立匯入、匯出或以 bundle 攜帶兩者。內建 `free`／`general`／`concept`／`asian_male_studio`／`aj_series` 五個內容包，以及 `core`／`studio` 兩個畫風包。畫風包可單選固定或多選隨機，每次出圖只使用抽中的一包。完整契約見 `STYLE-JSON.md`，樣本流程見 `.sample/README.md`。

```bash
npm run samples:status      # 盤點 .sample 新圖，只列出未分析的
npm run validate:presets    # 校驗預設 JSON（零出圖額度）
node scripts/validate-presets.mjs --samples   # 列印 general / concept 各 4 組實際 prompt
```

## 開發

需要 Node.js、目前穩定版 Rust；macOS 還需要 Xcode Command Line Tools。

```bash
npm install
npm run tauri dev      # 開發模式
npm run tauri build    # 打包安裝程式
```

## 技術棧

Vite · React 19 · TypeScript · Tailwind CSS 4 · daisyUI · Tauri 2 · reqwest · rusqlite · keyring · windows-rs · AppKit
