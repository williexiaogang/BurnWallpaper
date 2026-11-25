# v4 方案示例

正式格式、抽樣與歷史行為見 [STYLE-JSON.md](../STYLE-JSON.md)。

本目錄的 `prompt-scheme-v4.example.json` 和 `style-library-v4.example.json` 是相互搭配的自訂主題和畫風庫示例。先匯入畫風庫，再匯入主題，即可使用示例的雙語預覽和相容性測試。「風格 → 方案管理」可匯出含兩份示例的 v4 AI 模板。

內置主題位於 `src/v4/themes/`，共享場景在 `src/v4/scene-library.json`，五個內置畫風分類在 `src/v4/default-styles.json`。首頁、主題管理頁和托盤出圖均使用 v4。自訂主題可用 `SCENE` 選項的 `categories` 欄位支援按分類抽取。

主題示例含完整的場景候選、可選裝飾、必選褲裝和可選職業。畫面方向透過 `prefer` 影響場景偏好。雨衣的天氣與取景要求由硬約束檢查。畫風庫用 `ART_STYLE` 和 `PALETTE` 分別示範畫法與相容配色。

每個方案的 `candidate_count` 是合法候選的抽樣目標；生成器最多嘗試 20,000 次，不會因搜尋次數耗盡而斷言方案必定無解。選項權重僅在候選提出時使用一次，偏好與避重只在合法候選評分時使用。可選項若自身約束不成立會被省略。詳細限制與本地歷史策略見正式格式文檔。
