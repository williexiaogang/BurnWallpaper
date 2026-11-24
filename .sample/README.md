# .sample — 樣本圖增量工作流

版本 v1.3 ｜ 2026-11-24

這裡只解決一件事：**把「新圖」和「已經分析過的圖」徹底分開**，讓每次進場只處理增量，不重複分析、不漏圖、不把半成品誤當成已落地。

---

## 一句話流程

> 把新圖投放到 `inbox/` → 用 `npm run samples:status` 盤點新圖及未完成記錄 → 確認本批路徑和 sha12 → 分析、歸檔、登記 → 更新 v4 主題或畫風庫 → 校驗並結案。

---

## 目錄職責

| 路徑 | 誰放 | 放什麼 | Git |
|---|---|---|---|
| `inbox/` | 使用者 | **唯一的新圖投放口**，尚未分析的圖 | 本機 |
| `batches/<YYYY-MM-DD-主題>/images/` | AI 歸檔 | 已分析完的原圖，不再變動 | 本機 |
| `batches/<YYYY-MM-DD-主題>/PROMPTS.md` | AI | 該批次的逐圖 PROMPT、風格規律、變量建議、落地狀態 | 本機 |
| `INDEX.md` | 腳本 + AI | 全部圖片的 hash 台帳、狀態、落地去向 | 本機 |
| `README.md` | 維護者 | 本工作流說明 | **入庫** |

> **圖片、台帳和處理記錄只保存在本機。** Git 在 `.sample/` 只跟蹤本 SOP。樣本掃描腳本及 v4 預設仍屬專案原始碼，可透過 Git 同步。要在另一台裝置續跑時，請把本機樣本和台帳一起移轉。

批次命名用 `日期-主題`，例如 `2026-11-22-anime`、`2026-12-03-retro-poster`。同一天多批可加後綴 `-2`。

---

## 狀態機

每張圖在 `INDEX.md` 裡都有一個狀態，**「分析過」不等於「已加進 APP」**，這正是最容易搞混的地方：

| 狀態 | 含義 | 誰改成它 |
|---|---|---|
| `pending` | 已登記 hash，但還沒寫 PROMPT | `samples:status --register` |
| `prompted` | PROMPT 已寫進該批次 `PROMPTS.md` | AI |
| `landed` | 變量建議已併入 `src/v4/` 的主題或畫風庫 | AI |
| `verified` | 已跑過 `validate:presets` / `build`，確認可用 | AI |
| `excluded` | 已分析但**整張完全不採用**（連風格層都無可取），同屬結案；僅風格層可用者照常記 `landed`／`verified` | AI |

`verified` 與 `excluded` 都是結案狀態。校驗通過且處理完畢的樣本記為 `verified`，未採用的建議寫入該批 `PROMPTS.md` 的「未落地清單」。掃描會提醒全部 `pending`、`prompted` 和 `landed` 項目，包含原圖不在本機的記錄。

---

## 完整流程

### Step 0｜使用者：投放
把新圖放進 `.sample/inbox/`。若剛 clone 專案，先建立這個目錄。

腳本掃描 `.sample/` 可見目錄內的 JPG、JPEG、PNG、WebP、GIF、AVIF、BMP 和 TIFF，副檔名大小寫皆可。HEIC、HEIF、SVG、JXL、JP2、ICO、PSD 和 DNG 會列在「略過的圖片格式」。這些素材適合先在本機轉成 JPG 或 PNG，再放進 `inbox/`。

### Step 1｜AI：盤點（必做，不可跳過）
```bash
npm run samples:status
```
盤點會列出未登記圖片、台帳待續跑、重複內容、已登記但仍在 `inbox/` 的檔案，以及略過的格式。先從未登記清單確認本批的**檔案路徑與 sha12**。每個 hash 選一份原圖，後續移檔及登記使用同一份清單。

首次盤點會以空台帳開始。首次成功登記時，腳本會建立本機的 `INDEX.md`。

已登記的工作按狀態續跑：

- `pending`：補完分析。原圖缺失時先找回相同 sha12 的原圖。
- `prompted`：依 `PROMPTS.md` 繼續落地。
- `landed`：核對落地記錄，補跑驗證。
- `verified`／`excluded`：已結案，可以跳過。

### Step 2｜AI：分析 + 寫 PROMPT
決定批次 ID，按照確認的清單逐張分析，在 `batches/<批次>/PROMPTS.md` 寫入當前批次內容（格式見下節）。原圖仍留在原位，直到本批分析內容寫完。

### Step 3｜AI：歸檔 + 登記
以下以 PowerShell 示意。逐個移動本批清單上的原圖並傳入對應的 sha12。

```powershell
$batch = '2026-11-24-example'
$images = Join-Path '.sample/batches' "$batch/images"
New-Item -ItemType Directory -Path $images -Force | Out-Null
Move-Item -LiteralPath '.sample/inbox/example.png' -Destination $images
node scripts/scan-samples.mjs --register $batch 0123456789ab
```
macOS 或 Linux 也可逐個移檔，再以相同批次和 hash 執行 Node 指令。`--register` 核對選中的原圖位於該批 `images/` 下，並把新記錄加入逐圖明細與批次總表，初始狀態為 `pending`。寫完分析後補上對應的 PROMPT 錨點，將逐圖狀態改為 `prompted`。

### Step 4｜落地到內建預設
依 `STYLE-JSON.md` 的 v4 格式，把內容建議併進 `src/v4/themes/` 下相符的主題。無主體和純背景的方案可使用 `concept.json`。畫風、材質與光線則歸入 `src/v4/default-styles.json` 對應的畫風。可從「風格 → 方案管理」取得 v4 AI 模板和示例。

需要在 App 中試用自訂方案時，先準備完整的 v4 JSON。若有獨立畫風庫，依序匯入畫風庫與主題，核對 `style.recommended` 指向已匯入的畫風。合併進內置資料後，記錄實際 v4 檔案、畫風 ID、變量名和選項 ID，再標成 `landed`。

### Step 5｜驗證
```bash
npm run validate:presets -- --samples
npm run test:prompts
npm run build
```
用本批指定的變量組合核對中英文預覽、構圖與畫風相容性。通過後更新逐圖狀態和 `PROMPTS.md` 第五節。逐圖明細全數結案後，才完成批次總表的結案標記。

---

## PROMPT 保存規範

1. **一批一份 `PROMPTS.md`，不拆成單圖檔。** 17 張圖拆成 17 個檔只會讓檢索變碎；批次才是自然的分析單位，也對應一次預設改動。
2. **固定五節**，每次照抄結構：
   - 一、逐圖 PROMPT（每張一節，標題帶 `序號 + 檔名 + 短描述`；一條可直接複製的英文 PROMPT 程式碼塊 + 要素拆解表）
   - 二、整體風格規律（分類分布、可復用公式）
   - 三、建議新增的 APP 變量（**對齊 `schema_version: 4`**，主題和畫風分開，選項片段包含 `id`、中文 `label`、英文 `value` 與適用的標籤和約束）
   - 四、待辦與限制（版權泛化、比例差異、不適配項）
   - 五、落地狀態（什麼併進了 `general`、哪些建議保留為候選）
3. **雙識別**：每張圖用「檔名 + sha12」標識。檔名可能變（實測本批檔名雖是 32 位 hex，但**不是內容哈希**），只有內容 hash 是可靠的去重鍵。
4. **錨點對應**：`PROMPTS.md` 的逐圖序號（`01`…`17`）寫回 `INDEX.md` 的「PROMPT 錨點」欄，日後可從任一張圖反查它變成了哪個變量。
5. **頭部元資訊**：每個 `PROMPTS.md` 開頭標明批次 ID、圖片目錄、台帳位置、狀態與日期。

### 無主體／純背景圖怎麼處理

樣本裡可能出現沒有角色、只有圖形／景物／紋樣的概念圖。**不要因為「沒有角色」就整張丟掉**：

- 跳過 `content` 層（ANIMAL／BODY_BUILD／POSE／EXPRESSION／CLOTHING…），不要為了套模板硬編一個主體；
- 只提取 `style` 層（畫風、材質、背景處理、打光）與 `presentation` 層（構圖、留白、情緒）；
- 這些要素照樣寫進該批 `PROMPTS.md`，並在「未落地清單」註明它是「僅風格層樣本」；
- 狀態按正常流程推進（先 `landed`，整批驗證通過後升 `verified`），**不要記 `excluded`** —— `excluded` 只留給連風格層都無可取、整張完全不用的圖；
- 範例：`batches/2026-11-22-anime/PROMPTS.md` 錨點 08，無角色的魚群插畫貢獻了紙紋、漸變疊紙紋、單色＋補色、單角光共 4 個新選項。
- 這類圖也適合對照 [concept 主題](../src/v4/themes/concept.json)。它以母題、場景和構圖變量描述無角色的背景、紋樣或風景壁紙。

---

## 防重複的三道保險

| # | 機制 | 擋住什麼 |
|---|---|---|
| 1 | **物理隔離**：`inbox` ↔ `batches/*/images` | 一眼看出哪些沒處理；AI 只需看 inbox |
| 2 | **內容 hash 台帳**：`INDEX.md` 記錄 sha256 前 12 位 | 改檔名、複製到別處、重複丟同一張圖都擋得住 |
| 3 | **掃描腳本**：`samples:status` 遍歷全目錄比對 | 圖被亂放、忘了歸檔、或以上兩道失靈時兜底 |

內容 hash 用於確認同一張圖。台帳狀態用於確認下一步，批次路徑則用於核對原圖已歸檔到哪裡。

---

## 指令速查

| 指令 | 用途 |
|---|---|
| `npm run samples:status` | 盤點：列出新圖 / 已處理 / 重複 / 待歸檔（唯讀） |
| `node scripts/scan-samples.mjs --verbose` | 額外列出每張已登記圖的狀態 |
| `node scripts/scan-samples.mjs --json` | 輸出機器可讀 JSON，適合直接交給 AI 消費 |
| `node scripts/scan-samples.mjs --register <批次> <sha12> [...]` | 登記該批已歸檔的明確選中圖片 |
| `npm run validate:presets` | 校驗預設 JSON（零出圖額度） |
| `npm run validate:presets -- --samples` | 執行 v4 校驗並列印四個主要內置主題的 Prompt 範例 |
| `npm run test:prompts` | 驗證 v4 選項約束、抽樣與鎖定 |
| `npm run build` | 型別檢查與打包 |

---

## 常見情況

| 情況 | 處理 |
|---|---|
| 同一張圖換了檔名又丟一次 | sha12 相同 → 腳本標 ⚠️ 重複，台帳不會新增列；直接刪掉副本即可 |
| 想重新分析某張舊圖 | 保留 sha12，將逐圖與批次狀態改為 `pending`，在 `PROMPTS.md` 註記原因，再按盤點的待續跑清單處理 |
| 圖直接丟在 `.sample/` 根目錄 | 在盤點中確認路徑和格式，選進本批清單後照 Step 3 歸檔 |
| 只想看某一批 | `INDEX.md` 的批次總表 + 該批 `PROMPTS.md` 第五節 |
| 新圖和舊圖風格重複 | 照常分析但可只寫「差異」；變量建議若已存在，在第三節標「已覆蓋，無需新增」，避免把同一選項重複加進預設 |
| 同一批次陸續到圖 | 用同批次 ID 和新增圖片的 sha12 登記。腳本會按台帳重計張數，並把批次狀態設為 `pending` |

---

相關文件包括 `INDEX.md`（台帳）、`../STYLE-JSON.md`（v4 JSON 契約）、`../src/v4/`（主題與畫風）和 `../scripts/scan-samples.mjs`（盤點實作）。
