# .sample 樣本圖台帳

版本 v1.1 ｜ 更新日期 2026-11-22 ｜ 唯一真相源

**這份表是「哪些圖已經處理過」的唯一依據。** `scripts/scan-samples.mjs` 會掃描 `.sample/` 下所有圖片、計算內容 `sha256` 前 12 位，再與本表「逐圖明細」第一欄比對：比對得到就跳過，比對不到就標為 🆕 新圖。

> 檔名不可靠：本批檔名雖然是 32 位 hex，但實測並非內容哈希（例如 `0c67ffc8…jpg` 的內容 md5 是 `593d5f2b…`）。**只用 sha12 當去重鍵。**

---

## 狀態機

| 狀態 | 含義 |
|---|---|
| `pending` | 已登記 hash，尚未寫 PROMPT |
| `prompted` | PROMPT 已寫入該批次 `PROMPTS.md` |
| `landed` | 變量建議已併入 `src/style-presets.json` |
| `verified` | 已通過 `validate:presets` 與 `build`，這批做完 |
| `excluded` | 已分析但**整張完全不採用**（連風格層都無可取），同屬結案；僅風格層可用者照常記 `landed`／`verified` |

`verified` 與 `excluded` 皆為結案，但含義不同：**`verified` ≠ 該圖所有建議都實作了**，只代表整批處理完畢並通過校驗；「哪些建議沒落地」記錄在該批 `PROMPTS.md` 的「未落地清單」。只有 `pending`／`prompted`／`landed` 下次盤點會被提醒。

---

## 批次總表

| 批次 | 日期 | 張數 | PROMPT | 狀態 | 落地到 |
|---|---|---|---|---|---|
| `2026-11-22-anime` | 2026-11-22 | 17 | `batches/2026-11-22-anime/PROMPTS.md` | verified | `general` v2.1（三層解耦）＋v2.2（無主體風格補齊）＋`concept` v2.3（無主體預設）／2026-11-22 |
<!-- APPEND_BATCHES_HERE -->

---

## 逐圖明細

| sha12 | 檔案 | 批次 | 狀態 | PROMPT 錨點 | 落地版本 |
|---|---|---|---|---|---|
| `dc1785dbe88d` | `0c67ffc8c96656220f3fa1e51eae560a.jpg` | `2026-11-22-anime` | verified | 01 | `general` v2.1 |
| `4ef79cf624e2` | `0df259e238642dc738b31af50f43c216.jpg` | `2026-11-22-anime` | verified | 02 | `general` v2.1 |
| `4178cf2d1ed2` | `3057d6ef062934651d7b69c32d0a27b4.jpg` | `2026-11-22-anime` | verified | 03 | `general` v2.1 |
| `79f2a2626330` | `364585a009e7c7dc7c3882d7068048b0.jpg` | `2026-11-22-anime` | verified | 04 | `general` v2.1 |
| `2b859ff7c01f` | `3a285a1d91e010dd56ea729adb453e0f.jpg` | `2026-11-22-anime` | verified | 05 | `general` v2.1 |
| `7d478c6b19b2` | `3b86d3ec6a88317f1182e16242bd7af6.jpg` | `2026-11-22-anime` | verified | 06 | `general` v2.1 |
| `d2beb6e9bf7e` | `4353377213327c0a096228b8ba755456.jpg` | `2026-11-22-anime` | verified | 07 | `general` v2.1 |
| `cbc0ed281b7a` | `5c7a2d895856d1d1698120e569ec4df4.jpg` | `2026-11-22-anime` | verified | 08 | `general` v2.2（style／presentation）＋`concept` v2.3（母題／場景） |
| `deab6e2b387e` | `6e0a5489a3e19266e2bfd60d9e4f1f28.jpg` | `2026-11-22-anime` | verified | 09 | `general` v2.1 |
| `546b81ca704c` | `6f87a6fb92f74c310849c714eca0463e.jpg` | `2026-11-22-anime` | verified | 10 | `general` v2.1 |
| `d312907e46fd` | `826cfd32757cb53a269476b946f5a9c9.jpg` | `2026-11-22-anime` | verified | 11 | `general` v2.1 |
| `308b46cfb7b1` | `9111c5da761af8dbc6a4ab3744aa96cc.jpg` | `2026-11-22-anime` | verified | 12 | `general` v2.1 |
| `ad93c65dfd22` | `a0c01ee1174325a2746381b7db09794a.jpg` | `2026-11-22-anime` | verified | 13 | `general` v2.1 |
| `73f99ee308ec` | `b2e5ab8e1c166e94473e8107ee7397b5.jpg` | `2026-11-22-anime` | verified | 14 | `general` v2.1 |
| `c1b7e92095ee` | `c47310412acb6cd1b47edd53631e2cef.jpg` | `2026-11-22-anime` | verified | 15 | `general` v2.1 |
| `c6259b2bb408` | `dba4575b9fa05f62263f9aa0f792543f.jpg` | `2026-11-22-anime` | verified | 16 | `general` v2.1 |
| `3212e91426f8` | `f5f00b8bf325f2418e7b7c5d1b95072c.jpg` | `2026-11-22-anime` | verified | 17 | `general` v2.1 |
<!-- APPEND_ROWS_HERE -->

---

## 掃描腳本讀取規則

- 只讀本檔；表格中以反引號包住、位於行首第一欄的 **12 位小寫 hex** 視為已登記 hash。
- `<!-- APPEND_ROWS_HERE -->` 是 `--register` 的插入點，**不要刪除或改名**。
- `<!-- APPEND_BATCHES_HERE -->` 是批次總表的插入點，同上。
- 手動改狀態時只改「狀態／PROMPT 錨點／落地版本」三欄，**不要動 sha12 欄** —— 它是去重鍵。

---

## 已知限制（首批）

- 4 張與知名 IP 相似（錨點 01／03／05／10），PROMPT 已泛化處理，正式出圖保持泛化描述。
- 全部為 9:16 豎版，APP 預設 16:9；新增畫風時需注意裁切損失。
- 錨點 08（逆流小魚）無角色，**不進 `general` 的 content 層**；其極簡畫風、紙紋、漸變疊紙紋、單色＋補色、單角柔光、對角群集留白已提取進 style／presentation 層（新增 4 個選項），並成為 `concept` 預設的 `MOTIF`「逆流小魚群」與場景靈感，狀態 `verified`。
- **「17 張已結案」不等於「17 張的建議全數進了預設」**：圖片本身從不進預設（純文字 JSON），進的是反推出的變量選項；3.7 兩個按角色類型拆的預設刻意不建（另按畫面形態新增了 `concept` 無主體預設）、3.6 漏 1 項針織帽、3.2 少數渲染細節被重組泛化。逐節清單見 `PROMPTS.md` 第五節「未落地清單」。

詳見 `batches/2026-11-22-anime/PROMPTS.md` 第四、五節。
