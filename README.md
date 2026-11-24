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
- ✅ 系統托盤菜單（來一張 / 換一張 / 定時輪換）
- ✅ 首次啟動引導（存 Key → 首張出圖）
- ✅ 跟隨系統動畫 / 減少動態效果開關

RunComfy 的生成結果以 JPG 入庫，普通出圖與補領都使用這套流程。下載時從圖片內容辨識格式。JPEG 保留原始編碼，PNG、WebP、BMP、GIF、ICO 或 TIFF 會轉成 JPG。透明區域使用白底，損毀或無法解碼的圖片會顯示錯誤。

## 待完善

- ⏳ 原生 BiRefNet 高解析度摳像
- ⏳ 桌面預覽讀取真實桌面圖示排列與工作列設定

## 風格定義

Prompt 使用 schema v4。每個主題以 JSON 定義場景、構圖與約束，可搭配內置或用戶自訂畫風庫。「風格 → 方案管理」提供 JSON 匯入、匯出與 v4 AI 模板，包含可直接匯入的主題和畫風庫示例。首頁可預覽、鎖定變量並出圖。托盤出圖沿用最近選擇的主題與畫風。完整格式與抽樣限制見 `STYLE-JSON.md`。

```bash
npm run validate:presets
npm run test:prompts
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


可在設定啟用手動上牆時的 AI 放大；首次按需下載並驗證約 5 MB 模型，最大放大 4 倍。定時輪換及托盤自動上牆目前不使用此流程。原圖保留，放大失敗時不更改壁紙。AI 放大使用 [Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN)（BSD-3-Clause），模型採用固定版本的 [ONNX 匯出](https://huggingface.co/thisismert/real-esrgan-onnx)。授權條款位於 `public/licenses/Real-ESRGAN.txt`。

在首页「显示效果」中可选择立体视差或文字装饰。立体视差直接显示在首页壁纸区域，使用本机背景补全减少主体移动时的重影。首次准备时下载并校验约 198 MiB 的模型。模型就绪后，首页会优先准备当前壁纸，再逐张准备近期已抠像的壁纸。背景补全最多缓存 24 张，原图不会修改。此功能使用 [LaMa](https://github.com/advimman/lama)（Apache-2.0）及固定版本的 [ONNX 模型](https://huggingface.co/Carve/LaMa-ONNX)；授权条款位于 `public/licenses/LaMa.txt`。补全效果取决于遮挡面积和图像内容。
