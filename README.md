# BurnWallpaper

燃 BURN — RunComfy 驅動的 Windows 動漫桌布工具（Tauri 2 + React 19 + Rust）。

## 功能

- RunComfy 出圖全鏈路：提交 → 輪詢 → 下載 → 入庫 → 上牆
- API Key 存於 Windows Credential Manager（DPAPI），記憶體用完即清零
- `IDesktopWallpaper` 真機上牆，多螢幕可選全部或單屏
- SQLite 持久化：作品記錄、收藏、設定
- 定時輪換桌布（預設每 30 分鐘）
- 系統代理自動偵測（Clash / V2ray 類工具）
- Color Thief 自適應配色、風格預設隨機變量、JSON 匯入匯出
- 錯誤 Toast + 一鍵複製日誌

## 開發

```bash
npm install
npm run tauri dev      # 開發模式
npm run tauri build    # 打包安裝程式
```

## 技術棧

Vite · React 19 · TypeScript · Tailwind CSS 4 · daisyUI · Tauri 2 · reqwest · rusqlite · keyring · windows-rs
