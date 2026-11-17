# BurnWallpaper

燃 BURN — RunComfy 驅動的 Windows 動漫桌布工具（Tauri 2 + React 19 + Rust）。

## 功能

- ✅ RunComfy 出圖全鏈路：提交 → 輪詢 → 下載 → 入庫 → 上牆
- ✅ API Key 存於 Windows Credential Manager（DPAPI），記憶體用完即清零
- ✅ `IDesktopWallpaper` 真機上牆，多螢幕可選全部或單屏
- ✅ SQLite 持久化：作品記錄、收藏、設定、文件夾、待取回請求
- ✅ 定時輪換桌布（固定時段 / 隨機間隔 / 每日一張）
- ✅ 系統代理自動偵測（Clash / V2ray 類工具）
- ✅ Color Thief 自適應配色、風格預設隨機變量、JSON 匯入匯出
- ✅ 錯誤 Toast + 一鍵複製日誌
- ✅ 人物摳像分層（Web Worker + transformers.js / ONNX Runtime）
- ✅ 桌面預覽與手動裁切（模擬桌面）

## 待完善

- ⏳ 首次啟動三步引導
- ⏳ 開機自動來一張
- 🚧 系統托盤完整菜單（僅基本托盤已接入）
- 🚧 多顯示器「跨屏連續」策略
- ⏳ 原生 BiRefNet 高解析度摳像

## 開發

```bash
npm install
npm run tauri dev      # 開發模式
npm run tauri build    # 打包安裝程式
```

## 技術棧

Vite · React 19 · TypeScript · Tailwind CSS 4 · daisyUI · Tauri 2 · reqwest · rusqlite · keyring · windows-rs
