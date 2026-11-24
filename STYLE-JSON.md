# 主題與畫風 JSON（schema v4）

主題是完整的 JSON 方案，可搭配 App 內置畫風、自訂畫風庫，或在主題內定義畫風。v3 不支援。可在「主題與畫風」頁匯入、匯出或編輯 JSON；內置資料若要修改，先匯出並更換 ID 再導入。首頁與托盤出圖使用目前選擇的主題與畫風。

內置主題位於 `src/v4/themes/`，畫風庫位於 `src/v4/default-styles.json`；較小的完整範例見 `design/prompt-scheme-v4.example.json` 和 `design/style-library-v4.example.json`。畫風可單選固定或多選隨機。獨立主題使用 `style.mode: "embedded"`，不套用外部畫風。

## 格式

主題 `kind` 為 `prompt_scheme`，必填 `schema_version: 4`、`id`、`name`、`aspect_ratio`、`template` 和 `variables`。畫風庫 `kind` 為 `style_library`，包含 `id`、`name`、`styles`。每個畫風擁有獨立的 `id`、`name`、`template`、`variables`。ID 使用小寫英文開頭及小寫英文、數字、下劃線或連字號；畫風全名為 `library_id/style_id`。

變量名使用大寫英文、數字、下劃線且以英文開頭；變量指定 `label`、`required` 和 `options`，可選變量可指定 0–1 的 `probability`。選項包含穩定的 `id`、`label`、英文 `value`、非負 `weight`（預設 1）。空 `value` 可作為只提供條件的選項。模板依序拼接，`{VARIABLE}` 替換成選項值；片段的 `if` 指定變量有非空值時才輸出。

任何選項均可提供 `tags`，格式為 `namespace:value`。`requires_all` 全部命中、`requires_any` 至少命中一項、`excludes` 無一命中才相容。所有已選主題和畫風選項及畫風本身的標籤共同參與檢查。`prefer` 是標籤到正數倍率的映射，由其他選項提供該標籤時調整候選權重，不改變硬約束。畫風的模板和變量有獨立命名空間，與主題模板分別渲染後拼接；畫風不應固定場景以免覆蓋主題。

`style.recommended` 是 `library_id/style_id` 列表，用於切換主題時的預設畫風選擇；不是相容限制。首頁可鎖定主題變量，單選畫風時也可鎖定畫風變量；衝突不會靜默修改手動選項。

## 抽樣、歷史與限制

生成器依選項權重和可選概率獨立提出候選，檢查完整候選的硬約束；未鎖定且不相容的可選項會被省略。最多嘗試 20,000 次以取得 `sampling.candidate_count` 個合法候選（預設 24，最多 100）；依軟偏好和近期重複懲罰從合法候選抽取。若搜尋耗盡仍無候選，顯示錯誤；這不一定代表無解。手動選項衝突若能靜態證明則立即報錯。畫風先等機率選出，再檢查與主題相容性，因此相容率也會影響最終畫風分布。

`sampling.history_window`、`repeat_penalty`（0–1）與 `diversity_keys` 控制近期避重；`STYLE` 表示畫風，`style.VARIABLE` 指畫風變量。預覽不記錄歷史，出圖請求被接受後才記錄方案、選項、最終 prompt、生成設定及 JSON 快照。歷史存在本機 WebView 的 localStorage，空間不足時保留現有記錄並提示新記錄保存失敗；清除應用網站資料會刪除歷史及自訂包。記錄的是提交的方案，圖片生成模型的輸出仍可能不同。

`tests` 可以指定 `name`、`select`（變量到選項 ID）及 `expect`：`selected`、`include`、`omit`、`prompt_contains`、`prompt_excludes` 或 `error: "incompatible_selection"`。在首頁或管理頁可手動執行測試；抽樣搜尋耗盡不代表衝突已被證明。

```bash
npm run validate:presets
npm run test:prompts
npm run build
```
