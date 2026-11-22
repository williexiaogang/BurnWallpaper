# .sample — 樣本圖增量工作流

版本 v1.1 ｜ 2026-11-22

這裡只解決一件事：**把「新圖」和「已經分析過的圖」徹底分開**，讓每次進場只處理增量，不重複分析、不漏圖、不把半成品誤當成已落地。

---

## 一句話流程

> 新圖丟 `inbox/` → 分析前先跑 `npm run samples:status` → **只處理標記 🆕 的圖** → 寫完 PROMPT 後把圖移進 `batches/<批次>/images/`、把 hash 登記進 `INDEX.md` → 最後才改 `src/style-presets/` → 跑校驗。

---

## 目錄職責

| 路徑 | 誰放 | 放什麼 | Git |
|---|---|---|---|
| `inbox/` | 使用者 | **唯一的新圖投放口**，尚未分析的圖 | 忽略（只留 `.gitkeep`） |
| `batches/<YYYY-MM-DD-主題>/images/` | AI 歸檔 | 已分析完的原圖，不再變動 | 忽略 |
| `batches/<YYYY-MM-DD-主題>/PROMPTS.md` | AI | 該批次的逐圖 PROMPT、風格規律、變量建議、落地狀態 | **入庫** |
| `INDEX.md` | 腳本 + AI | 全部圖片的 hash 台帳、狀態、落地去向 | **入庫** |
| `README.md` | 維護者 | 本工作流說明 | **入庫** |

> **圖片只在本地維護，不進 GitHub。** `.gitignore` 以「圖片目錄 + 圖片副檔名」雙重規則排除所有二進位圖片（`inbox/*`、`batches/*/images/` 以及誤放它處的 `.jpg`／`.png`…）；文字產物（本檔、`INDEX.md`、各批 `PROMPTS.md`）預設入庫，讓台帳能跨裝置保留、防重複機制不因換機器而失效。
>
> 若希望**整個 `.sample/` 都只留本地**：把 `.gitignore` 的圖片規則換回一行 `.sample/` 即可。取捨是 clone 後台帳與 PROMPT 會消失，防重複只剩本機有效；工作流要點已另外沉澱在根目錄 `STYLE-JSON.md` §8，不會丟。

批次命名用 `日期-主題`，例如 `2026-11-22-anime`、`2026-12-03-retro-poster`。同一天多批可加後綴 `-2`。

---

## 狀態機

每張圖在 `INDEX.md` 裡都有一個狀態，**「分析過」不等於「已加進 APP」**，這正是最容易搞混的地方：

| 狀態 | 含義 | 誰改成它 |
|---|---|---|
| `pending` | 已登記 hash，但還沒寫 PROMPT | `samples:status --register` |
| `prompted` | PROMPT 已寫進該批次 `PROMPTS.md` | AI |
| `landed` | 變量建議已併入 `src/style-presets/` | AI |
| `verified` | 已跑過 `validate:presets` / `build`，確認可用 | AI |
| `excluded` | 已分析但**整張完全不採用**（連風格層都無可取），同屬結案；僅風格層可用者照常記 `landed`／`verified` | AI |

`verified` 與 `excluded` 都算「這批做完了」，但含義不同：**`verified` ≠ 該圖所有建議都實作了**，只代表整批處理完畢並通過校驗；「哪些建議沒落地」一律記在該批 `PROMPTS.md` 的「未落地清單」。下一批進來時，只有 `pending` / `prompted` / `landed` 會被盤點提醒。

---

## 完整流程

### Step 0｜使用者：投放
把新圖放進 `.sample/inbox/`。**不需要改檔名、不需要分類、不需要先通知**，直接丟即可。

> 萬一直接丟在 `.sample/` 根目錄或其它子目錄也沒關係：掃描腳本會遍歷整個 `.sample/`，不會漏。

### Step 1｜AI：盤點（必做，不可跳過）
```bash
npm run samples:status
```
輸出會分成 🆕 未登記 / ✅ 已登記 / ⚠️ 內容重複 / 📦 已登記但還留在 inbox。
**只把 🆕 清單當成這次要分析的範圍**；✅ 一律跳過，連圖都不用再打開。

### Step 2｜AI：分析 + 寫 PROMPT
決定批次 ID，逐張看圖，在 `batches/<批次>/PROMPTS.md` 寫完整內容（格式見下節）。
此時圖仍留在 `inbox/`。

### Step 3｜AI：歸檔 + 登記
```bash
mkdir -p .sample/batches/<批次>/images
mv .sample/inbox/*.jpg .sample/batches/<批次>/images/
node scripts/scan-samples.mjs --register <批次>
```
`--register` 會自動把新圖的 hash 追加進 `INDEX.md` 的明細表與批次總表（狀態 `pending`）。
接著把該批次明細行的狀態改成 `prompted`／`landed`，並補上 PROMPT 錨點與落地版本。

### Step 4｜落地到內建預設
依 `STYLE-JSON.md` 的 v3 契約，把內容建議併進 `src/style-presets/content/`：有角色的圖進 `general.json`，無主體／純背景圖進 `concept.json`；畫風、材質與光線建議則放進 `src/style-presets/styles/`。內容與畫風可分別測試，新增內建包時另在 `src/style-presets/index.ts` 登記。

### Step 5｜驗證
```bash
npm run validate:presets
node scripts/validate-presets.mjs --samples   # 肉眼檢查層內是否打架
npm run build
```
通過後把 `INDEX.md` 該批次狀態改為 `verified`，並在 `PROMPTS.md` 第五節更新落地說明。

---

## PROMPT 保存規範

1. **一批一份 `PROMPTS.md`，不拆成單圖檔。** 17 張圖拆成 17 個檔只會讓檢索變碎；批次才是自然的分析單位，也對應一次預設改動。
2. **固定五節**，每次照抄結構：
   - 一、逐圖 PROMPT（每張一節，標題帶 `序號 + 檔名 + 短描述`；一條可直接複製的英文 PROMPT 程式碼塊 + 要素拆解表）
   - 二、整體風格規律（分類分布、可復用公式）
   - 三、建議新增的 APP 變量（**對齊 `schema_version: 3`**，內容與畫風建議分開，寫成可直接貼的 `{value, label, provides/any_of}` 片段）
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
- 這類圖還催生了 `concept` 預設（`STYLE-JSON.md` §9）：模板不含角色，content 層只有 `MOTIF`／`SCENE`，專門出純背景／紋樣／風景壁紙。

---

## 防重複的三道保險

| # | 機制 | 擋住什麼 |
|---|---|---|
| 1 | **物理隔離**：`inbox` ↔ `batches/*/images` | 一眼看出哪些沒處理；AI 只需看 inbox |
| 2 | **內容 hash 台帳**：`INDEX.md` 記錄 sha256 前 12 位 | 改檔名、複製到別處、重複丟同一張圖都擋得住 |
| 3 | **掃描腳本**：`samples:status` 遍歷全目錄比對 | 圖被亂放、忘了歸檔、或以上兩道失靈時兜底 |

三道是「或」的關係，任一生效就不會重複分析。

---

## 指令速查

| 指令 | 用途 |
|---|---|
| `npm run samples:status` | 盤點：列出新圖 / 已處理 / 重複 / 待歸檔（唯讀） |
| `node scripts/scan-samples.mjs --verbose` | 額外列出每張已登記圖的狀態 |
| `node scripts/scan-samples.mjs --json` | 輸出機器可讀 JSON，適合直接交給 AI 消費 |
| `node scripts/scan-samples.mjs --register <批次>` | 把新圖登記進 `INDEX.md` |
| `npm run validate:presets` | 校驗預設 JSON（零出圖額度） |
| `node scripts/validate-presets.mjs --samples` | 列印 `general`＋`concept` 各 4 組實際 prompt，肉眼檢查層內是否打架 |
| `npm run build` | 型別檢查與打包 |

---

## 常見情況

| 情況 | 處理 |
|---|---|
| 同一張圖換了檔名又丟一次 | sha12 相同 → 腳本標 ⚠️ 重複，台帳不會新增列；直接刪掉副本即可 |
| 想重新分析某張舊圖 | 把 `INDEX.md` 該行狀態改回 `pending` 並在 PROMPTS.md 註記原因；**不要刪 hash**，否則下次會被當成新圖混進增量 |
| 圖直接丟在 `.sample/` 根目錄 | 腳本仍會掃到並標 🆕；分析完照 Step 3 歸檔 |
| 只想看某一批 | `INDEX.md` 的批次總表 + 該批 `PROMPTS.md` 第五節 |
| 新圖和舊圖風格重複 | 照常分析但可只寫「差異」；變量建議若已存在，在第三節標「已覆蓋，無需新增」，避免把同一選項重複加進預設 |
| 同一批次陸續到圖 | 再跑一次 `--register <同批次>`：腳本會累加總表張數、不重複建總表行；**但總表狀態請手動複核**（有新圖時應回到 `pending`，不要留著 `verified`） |

---

相關文件：`INDEX.md`（台帳）、`../STYLE-JSON.md`（JSON 契約與三層邊界）、`../src/style-presets/`（唯一風格入口）、`../scripts/scan-samples.mjs`（盤點實作）。
