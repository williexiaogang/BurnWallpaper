# 主題與畫風 JSON（schema v5）

主題是完整的 JSON 方案，可搭配 App 內置畫風、自訂畫風庫，或在主題內定義畫風。v3 不支援；v4 會在匯入時轉換為 v5，並以選項標籤作為舊資料的中文值。可在「風格」頁匯入、匯出或編輯 JSON；內置資料若要修改，先匯出並更換 ID 再導入。首頁與托盤出圖使用目前選擇的主題與畫風。

內置主題位於 `src/v4/themes/`，畫風庫位於 `src/v4/default-styles.json`；較小的完整範例見 `design/prompt-scheme-v4.example.json` 和 `design/style-library-v4.example.json`。未選畫風時，從全部可用畫風隨機；單選後固定在該畫風內隨機，再次點擊可取消選擇。獨立主題使用 `style.mode: "embedded"`，不套用外部畫風。

「AJ 系列」已合入「通用」，可在「鞋款」變量中選擇 Air Jordan 鞋款，並搭配強調球鞋的構圖。「角色壁紙」原是內置示例，格式示例可在 `design/` 找到。新版應用會將這兩個舊的內置主題選擇讀作「通用」。

首頁 Prompt 預覽可以選擇場景分類。預設從全部場景隨機，選中分類後只在該分類內抽取，再點一次回到全部。托盤出圖沿用已儲存的範圍。當分類與已固定的選項沒有相容組合時，預覽會提示調整選擇。

內置主題共用 `src/v4/scene-library.json`。在此維護場景文案、分類和局部裝飾。內置主題來源的 `SCENE.aliases` 保留原有選項 ID，打包時會把共享候選展開成 `SCENE.options`。應用內匯出的主題和官方預設包都帶有完整候選，可直接匯入。

在「風格 → 方案管理」可匯出 Markdown 格式的 v5 AI 模板，或複製指令與兩份完整示例。示例依序匯入畫風庫和主題即可使用。請 AI 修改或新增主題時，可在模板的「用户需求」欄填寫要保留的構圖、姿勢或畫風。

## 官方預設更新

在「風格 → 方案管理」按「检查预设更新」即可從 GitHub 取得新版主題、畫風庫及工作室內置預設。工作室的配方和 WebP 縮圖隨同一預設包下載，應用校驗後一併保存在本機，離線時也能讀取。首次使用或遇到沒有工作室資料的舊預設包，工作室會載入安裝包內附的配方和縮圖。自訂包和出圖歷史沿用原有資料。

發布時編輯 `src/v4/` 下的來源，新增主題時也將它加入 `src/v4/bundled-presets.ts`。工作室配方來自 `src/v4/studio-recipes.ts`，匯出時會把 `public/style-previews/` 裡對應的 WebP 編入預設包的 `studio` 欄位。請保留現有主題、畫風庫、畫風和工作室配方的 ID，讓已儲存的選擇能對應到新版。將 `src/v4/preset-revision.json` 的 `revision` 加一，再執行：

```bash
npm run validate:presets
npm run export:presets
```

將來源修改和產出的 `presets/presets-v4.json` 一起合入公開倉庫的 `main` 分支。之後使用者可在應用內取得新版預設。修改 schema 或生成程式碼時，需要發布新的安裝包。

## 格式

主題 `kind` 為 `prompt_scheme`，必填 `schema_version: 5`、`id`、`name`、`aspect_ratio`、`template` 和 `variables`。畫風庫 `kind` 為 `style_library`，包含 `id`、`name`、`styles`。每個畫風擁有獨立的 `id`、`name`、`template`、`variables`。ID 使用小寫英文開頭及小寫英文、數字、下劃線或連字號；畫風全名為 `library_id/style_id`。

變量名使用大寫英文、數字、下劃線且以英文開頭；變量指定 `label`、`required` 和 `options`，可選變量可指定 0–1 的 `probability`。選項包含穩定的 `id`、介面顯示用的 `label`、多语言 `value`、非負 `weight`（預設 1）。`value` 必須包含 `en`，並可提供 `zh` 或其他小寫語言代碼，例如 `"value": {"en": "full body", "zh": "全身"}`。內置方案提供完整英文與中文文本，長描述不得以短 `label` 代替。僅提供條件的選項可將各語言值設為空字串。模板依序拼接，`{VARIABLE}` 替換成對應語言的選項值；片段的 `if` 以英文值是否非空決定是否輸出。

自訂主題用 `variables.SCENE.options[].categories` 指定場景分類。內置分類 ID 為 `indoor`、`outdoor`、`transitional`、`fantasy`、`minimal`、`abstract` 和 `pattern`。同一選項可提供多個分類 ID，在全部場景中仍只計一次。用 `tags` 描述可供相容性檢查的場景條件。裝飾可以寫為可選的 `DECORATION` 變量。

模板片段的 `text` 同樣是語言到完整文本的物件，例如 `"text": {"en": ", wearing {CLOTHING}", "zh": "，身穿{CLOTHING}"}`。兩種預覽共用同一組變量與選項 ID，點擊其中的變量可編輯該選項。生成器同時產生 `prompts.en` 和 `prompts.zh`，預覽與輸出共用渲染器。使用者在出圖工具列選擇英文或中文送出，預設為英文；缺少所選語言時回退到英文。

任何選項均可提供 `tags`，格式為 `namespace:value`。`requires_all` 全部命中、`requires_any` 至少命中一項、`excludes` 無一命中才相容。所有已選主題和畫風選項及畫風本身的標籤共同參與檢查。`prefer` 是標籤到正數倍率的映射，由其他選項提供該標籤時調整候選權重，不改變硬約束。畫風的模板和變量有獨立命名空間，與主題模板分別渲染後拼接；畫風不應固定場景以免覆蓋主題。

`style.recommended` 用 `library_id/style_id` 記錄建議搭配。當選擇「全部畫風」時，應用從可用畫風中抽取。首頁可鎖定主題變量，單選畫風時也可鎖定畫風變量。有相容性衝突時，預覽會提示調整選擇。

Prompt 預覽的可編輯變量提供「自訂填寫」。輸入值會鎖定在當次預覽，重抽時保留，提交出圖後隨 Prompt 記錄。可長期復用的值以正式選項加入 JSON。

「工作室」的內置預設各有完整的參考圖配方。頁面只顯示預設網格，點擊預設後在彈窗中載入 Prompt 編輯器，避免隨預設數量增加而反覆長距離滾動。選定後會直接載入該配方的第一組主體、鏡頭、構圖、光線、背景、配色及細節。畫法固定，其餘變量可逐項選擇或自訂。「换一组」只重抽細節，「自由变奏」可重抽畫面變量並保留手動設定，「恢复参考」會載入原始起稿。工作室沿用 v5 Prompt 編輯與出圖流程，候選由工作室配方提供。

內置畫法用可見的線條、明暗、材質和色彩分區編寫。本機樣圖的完整逐張反推保存在 `.sample/STUDIO-REFERENCE-PROMPTS.md`，代表圖、共同規律與可變項記在 `.sample/STYLE-STUDIO.md`。

工作室內置預設的縮圖放在 `public/style-previews/`。替換時沿用同名 WebP（384 × 288，4:3），並可在 `src/v4/studio-recipes.ts` 更新同名配方的畫法和各變量的第一個候選。背景的第一個候選在編輯器標為「缩略图背景」。

頁面上的「添加画风」會將名稱、英文與中文畫法、預設配色儲存為 v5 `style_library`，中文畫法留空時使用名稱；可在「風格 → 方案管理」匯出和編輯。工作室為自訂畫風提供一組可編輯的通用起稿，匯入的畫風若定義了 `ART_STYLE`，其中每個可用畫法會顯示為獨立入口。

## 抽樣、歷史與限制

生成器依選項權重和可選概率獨立提出候選，檢查完整候選的硬約束；未鎖定且不相容的可選項會被省略。最多嘗試 20,000 次以取得 `sampling.candidate_count` 個合法候選（預設 24，最多 100）；依軟偏好和近期重複懲罰從合法候選抽取。若搜尋耗盡仍無候選，顯示錯誤；這不一定代表無解。手動選項衝突若能靜態證明則立即報錯。畫風先等機率選出，再檢查與主題相容性，因此相容率也會影響最終畫風分布。

`sampling.history_window`、`repeat_penalty`（0–1）與 `diversity_keys` 控制近期避重；`STYLE` 表示畫風，`style.VARIABLE` 指畫風變量。預覽不記錄歷史，出圖請求被接受後才記錄方案、選項、雙語 prompts、實際送出的 prompt 與語言、生成設定及 JSON 快照；舊記錄的單一英文 prompt 仍可讀取。歷史存在本機 WebView 的 localStorage，空間不足時保留現有記錄並提示新記錄保存失敗；清除應用網站資料會刪除歷史及自訂包。記錄的是提交的方案，圖片生成模型的輸出仍可能不同。

`tests` 可以指定 `name`、`select`（變量到選項 ID）及 `expect`：`selected`、`include`、`omit`、`prompt_contains`、`prompt_excludes` 或 `error: "incompatible_selection"`。可在「風格 → 方案管理」手動執行測試。抽樣搜尋耗盡不代表衝突已被證明。

```bash
npm run validate:presets
npm run test:prompts
npm run build
```
