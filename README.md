# BurnWallpaper

燃 BURN — RunComfy 驅動的 Windows 動漫桌布工具（Tauri 2 + React 19 + Rust）。

## 功能

- ✅ RunComfy 出圖全鏈路：提交 → 輪詢 → 下載 → 入庫 → 上牆
- ✅ API Key 存於 Windows Credential Manager（DPAPI），記憶體用完即清零
- ✅ `IDesktopWallpaper` 真機上牆，多螢幕可選全部、單屏或跨屏連續拼接
- ✅ SQLite 持久化：作品記錄、收藏、設定、文件夾、待取回請求
- ✅ 定時輪換桌布（固定時段 / 隨機間隔 / 每日一張）
- ✅ 系統代理自動偵測（Clash / V2ray 類工具）
- ✅ Color Thief 自適應配色、風格預設隨機變量、JSON 匯入匯出
- ✅ 錯誤 Toast + 一鍵複製日誌
- ✅ 人物摳像分層（Web Worker + transformers.js / ONNX Runtime）
- ✅ 桌面預覽與手動裁切（模擬桌面）
- ✅ 系統托盤完整菜單（來一張 / 換一張 / 定時輪換 / 開機自動來一張）
- ✅ 開機自動來一張：自啟後隨機出圖並自動上牆，失敗保留上一張
- ✅ 首次啟動三步引導（存 Key → 開機行為 → 首張出圖）
- ✅ 跟隨 Windows「動畫效果」系統開關

## 待完善

- ⏳ 原生 BiRefNet 高解析度摳像
- ⏳ 桌面預覽讀取真實桌面圖示排列與工作列設定

## 開發

```bash
npm install
npm run tauri dev      # 開發模式
npm run tauri build    # 打包安裝程式
```

## 技術棧

Vite · React 19 · TypeScript · Tailwind CSS 4 · daisyUI · Tauri 2 · reqwest · rusqlite · keyring · windows-rs
