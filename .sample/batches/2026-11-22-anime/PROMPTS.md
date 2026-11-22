# anime 樣本圖 PROMPT 手冊

- **批次 ID**：`2026-11-22-anime`（首個歸檔批次）
- **圖片目錄**：`.sample/batches/2026-11-22-anime/images/`，共 17 張；已歸檔，不再變動。下節標題中的檔名即指向此目錄。
- **台帳**：`.sample/INDEX.md` —— sha12 去重鍵、狀態 `verified`、PROMPT 錨點 01–17。
- **工作流**：`.sample/README.md`（投放／歸檔／落地 SOP）｜**JSON 契約**：`STYLE-JSON.md`
- **日期**：2026-11-22（分析）／2026-11-22（落地 `general` v2.1、v2.2 補非主體要素、v2.3 新增 `concept` 無主體預設）
- **狀態**：`verified` — 第三節變量建議已併入 `src/style-presets/`；v2.2 補了錨點 08 的非主體風格要素，v2.3 新增 `concept` 無主體預設，`validate:presets` 17/17（general 11 + concept 6）與 `build` 通過；詳情見第五節。
- **用途**：
  1. 逐圖反推可直接出圖的完整英文 PROMPT（兼容 Seedream 文生圖）；
  2. 提煉整批樣本的風格規律；
  3. 給出可直接併入 `src/style-presets/`（schema_version 2）的新變量與選項。
- **注意**：全部樣本均為 9:16 豎版（手機壁紙比例），與 APP 預設 16:9 不同；IP 相似圖（水管工、老鼠、粉色小惡魔、耳狐）一律用泛化描述，PROMPT 中不出現 IP 名稱。

---

## 一、逐圖 PROMPT

### 01 `0c67ffc8c96656220f3fa1e51eae560a.jpg`｜3D 耳狐探頭

```
An adorable anthropomorphic fennec fox with oversized ears, cream and russet fur and big glossy amber eyes, peeking playfully sideways from behind a cracked teal-blue rock wall, head tilted with a curious mischievous expression, soft diffused front lighting with warm highlights on the fur, fluffy 3D animated-film CGI style with fine fur grooming and shallow depth of field, warm orange and cream tones against a deep teal background, vertical portrait composition with the subject on the left two-thirds and negative space above, no text
```

| 要素 | 內容 |
|---|---|
| 主體 | 擬人耳狐，大耳、橘奶油毛色、琥珀大眼 |
| 姿勢 | 從岩壁後歪頭偷看，好奇頑皮 |
| 背景 | 龜裂青藍岩壁（佔右側與下方） |
| 光線 | 前側柔光，毛髮暖高光 |
| 畫風 | 3D 動畫電影 CGI，毛髮細緻、淺景深 |
| 構圖 | 豎版，主體佔左 2/3，上方留白 |

---

### 02 `0df259e238642dc738b31af50f43c216.jpg`｜迷幻小丑狐

```
A stylized anthropomorphic fox in a psychedelic harlequin style, teal fur covered in red and cream diamond-checker patterns with crescent moons and stars, one glowing red-orange eye with a slit pupil and a sly smile, wearing a tilted harlequin top hat and a striped ruffled cravat, one paw raised showing red claws, looking back over the shoulder, against a solid black starry sky packed with glowing geometric shapes, flat cel-shaded vector poster art with thick outlines, vivid red gold teal and cream palette, vertical portrait composition, no text
```

| 要素 | 內容 |
|---|---|
| 主體 | 擬人狐，幾何紋樣毛皮、發光豎瞳 |
| 姿勢 | 回眸、抬爪示爪尖 |
| 服裝 | 小丑格紋禮帽＋荷葉領巾 |
| 背景 | 純黑夜空滿佈發光幾何星月 |
| 畫風 | 平面賽璐璐向量海報、迷幻熒光 |
| 色彩 | 黑底＋紅金青白高對比 |

---

### 03 `3057d6ef062934651d7b69c32d0a27b4.jpg`｜塗鴉拼貼卡通水管工

```
A cartoon plumber-style character with a pink cap, big round nose and thick mustache, reclining relaxed inside a maximalist graffiti doodle collage of spotted mushrooms, hearts, flowers, game controllers and bubble letters filling the entire frame, bold graphic cel-shaded cartoon style with thick black outlines and hard-edged highlights, vibrant magenta orange teal and cream palette with a dark vignette, vertical portrait composition with the character's head as the focal point upper-center, no readable text
```

| 要素 | 內容 |
|---|---|
| 主體 | 卡通水管工形象（泛化描述，不出 IP 名） |
| 姿勢 | 後仰斜躺，嵌在拼貼元素中 |
| 背景 | 滿版塗鴉貼紙拼貼：蘑菇、愛心、遊戲機、氣泡字 |
| 畫風 | 厚描邊卡通＋街頭貼紙 pop-surrealism |
| 構圖 | 頭部居上中為焦點，密度極高、少留白 |

---

### 04 `364585a009e7c7dc7c3882d7068048b0.jpg`｜紅底街頭獵犬

```
An anthropomorphic black-and-white hound with a confident aloof expression, chin raised looking up and off-frame, wearing a slouchy red knit beanie, round dark sunglasses, DJ headphones around the neck and a black bomber jacket with a red collar, against a flat solid vivid red background, high-contrast screen-print poster style with fine line hatching texture in the fur, strictly red black and white palette, vertical chest-up portrait with the subject offset left, no text
```

| 要素 | 內容 |
|---|---|
| 主體 | 黑白獵犬，下巴上揚、傲視斜上方 |
| 服裝 | 紅針織帽＋墨鏡＋頸掛 DJ 耳機＋黑轟炸機夾克 |
| 背景 | 純艷紅平塗 |
| 光線 | 高對比圖形化陰影，無自然光源 |
| 畫風 | 絲印海報＋細排線毛髮質感 |
| 色彩 | 紅黑白三色限定 |

---

### 05 `3a285a1d91e010dd56ea729adb453e0f.jpg`｜街潮老鼠海報

```
A cheerful anthropomorphic mouse rendered in semi-realistic 3D CGI, big ears and a confident grin, standing in a streetwear model stance wearing an oversized black-and-orange patch-covered bomber jacket over a white graphic hoodie, baggy black cargo pants, chunky high-top sneakers and a gold chain, hands tucked in pockets, against a layered urban poster collage of graffiti, torn posters and paint splatters, dramatic high-contrast lighting with warm highlights, bold burnt orange black and white poster palette, vertical full-body composition with a slight low angle, no readable text
```

| 要素 | 內容 |
|---|---|
| 主體 | 擬人老鼠（泛化），3D 渲染＋街拍姿態 |
| 服裝 | 黑橙拼貼轟炸機夾克＋白色圖案帽衫＋寬鬆工裝褲＋厚底球鞋＋金鏈 |
| 背景 | 城市海報拼貼牆：塗鴉、撕角海報、噴濺 |
| 畫風 | 3D 角色合成平面海報版式 |
| 構圖 | 豎版全身、輕微仰角 |

---

### 06 `3b86d3ec6a88317f1182e16242bd7af6.jpg`｜叢林老虎絲印海報

```
An anthropomorphic tiger bust portrait with a sleek angular build and a confident smirk, wearing pink gradient sunglasses, an open-collar blue shirt and a red-and-black striped tie, framed by flat silhouetted tropical palm and monstera leaves on a deep navy background, flat mid-century screen-print poster illustration with visible textured brush strokes, vivid navy orange cream and hot pink palette, vertical close-up composition with overlapping foreground leaves, no text
```

| 要素 | 內容 |
|---|---|
| 主體 | 擬人虎，稜角分明、微揚嘴角 |
| 服裝 | 粉漸變墨鏡＋藍開領襯衫＋紅黑條紋領帶 |
| 背景 | 深藏青底＋平面剪影熱帶葉片四面包框 |
| 畫風 | 復古絲印海報、幾何形狀、筆觸紋理 |
| 色彩 | 藏青×橙黃×奶油×桃紅互補 |

---

### 07 `4353377213327c0a096228b8ba755456.jpg`｜橙底街頭橘貓

```
An anthropomorphic orange tabby cat standing upright with a calm confident expression, wearing round teal-tinted sunglasses, a silver chain necklace, a rust-orange hoodie and an oversized dark green quilted puffer jacket with hands tucked in pockets, long white whiskers flaring out, against a flat solid vivid orange backdrop, comic illustration with bold black linework and heavy ink hatching, warm monochromatic orange and green palette, vertical centered chest-up portrait, no text
```

| 要素 | 內容 |
|---|---|
| 主體 | 橘貓，正面放鬆站姿 |
| 服裝 | 青色墨鏡＋銀鏈＋鏽橙帽衫＋墨綠羽絨外套 |
| 背景 | 純艷橙平塗 |
| 畫風 | 漫畫插畫，粗黑線＋重排線 |
| 色彩 | 橙色單色系＋墨綠點綴 |

---

### 08 `5c7a2d895856d1d1698120e569ec4df4.jpg`｜逆流小魚極簡插畫

```
A minimalist conceptual illustration of a dense school of small blue-gray fish swimming toward the upper left, with a single orange-and-white fish swimming the opposite direction against the current, abstract deep-blue gradient underwater scene with a subtle paper texture, soft diffuse light brightest at the top-left corner, flat simplified shapes with no outlines, monochromatic blues with one warm orange accent, vertical composition with a strong diagonal school and generous negative space, no text
```

| 要素 | 內容 |
|---|---|
| 主體 | 無角色；魚群＋一條逆向橙白小魚 |
| 背景 | 極簡深海藍漸變＋紙紋 |
| 畫風 | 極簡平面圖形、無描邊 |
| 概念 | 逆向而行的「與眾不同」敘事 |
| 構圖 | 對角線魚群，左上留白點題 |

**非主體要素的落地（v2.2 補）**：本圖無角色，不適合當「角色模板」樣本，但風格與背景要素已全部提取進 `general`：

| 要素 | 落點 |
|---|---|
| 極簡平面、無描邊 | `ART_STYLE` = `minimalist flat conceptual illustration`、`BRUSH` = `no visible outlines`（皆原有） |
| 細紙紋顆粒 | `MATERIAL` 新增 `a subtle paper grain texture with fine fiber detail` |
| 深海藍漸變疊紙紋 | `BACKDROP` 新增 `with a deep-blue gradient washed over a textured paper surface` |
| 單色系＋單一暖色點綴 | `BACKDROP` 新增 `with a monochromatic color field and a single contrasting warm accent` |
| 左上角漫射光 | `LIGHTING` 新增 `soft diffuse light falling from one corner` |
| 對角群集＋大留白 | `COMPOSITION` 新增 `clustered elements swept along a diagonal, leaving generous negative space in one corner` |
| 安靜克制情緒 | `MOOD` = `quiet conceptual minimalism`（原有） |
| 無主體畫面本身 | 新增 `concept` 預設（v2.3）：模板不含角色，`MOTIF` 首項即「逆流小魚群」，style 層與 `general` 同源 |

---

### 09 `6e0a5489a3e19266e2bfd60d9e4f1f28.jpg`｜黑貓喝飲料（水粉）

```
A chubby fluffy black cat with a grumpy half-lidded expression and mustard-yellow eyes, wearing oversized brown sunglasses, sipping an orange iced drink through a pale green straw from a large glass mug held with both paws, against a minimal cream background with warm orange-brown hints at the corners, loose painterly gouache illustration with sketchy expressive brushwork and rough unfinished edges, warm limited palette of black cream and vivid orange, centered close-up composition, no text
```

| 要素 | 內容 |
|---|---|
| 主體 | 圓胖黑貓，不爽半闔眼＋超墨鏡 |
| 動作 | 雙爪捧玻璃杯、綠吸管喝橙飲 |
| 背景 | 極簡奶油白＋角落暖色 |
| 畫風 | 鬆散水粉手繪、筆觸外露 |
| 情緒 | 慵懶喪萌 |

---

### 10 `6f87a6fb92f74c310849c714eca0463e.jpg`｜粉色小惡魔街潮拼貼

```
A pink-skinned humanoid anime imp character with a bald rounded head and a single long antenna, narrow red eyes and a confident smirk, standing full-body with hands in jacket pockets, wearing an oversized hot-pink bomber jacket open over a white hoodie, a skull patch and a teal kanji patch, baggy charcoal drop-crotch pants and mismatched chunky sneakers, a long tail curling behind, cut out with a thick white sticker outline against a collage of black-and-white manga panels with torn typographic shapes and ink splatter, bold cel-shaded streetwear sticker aesthetic with thick black outlines, hot pink white black and orange palette, vertical full-body composition with a slight low angle, no readable text
```

| 要素 | 內容 |
|---|---|
| 主體 | 粉膚小惡魔系角色（泛化），紅眼觸角＋長尾 |
| 服裝 | 熱粉 oversize 轟炸機＋白帽衫＋炭灰垮褲＋左右異色球鞋 |
| 背景 | 黑白漫畫格拼貼＋撕裂字塊＋墨點 |
| 畫風 | 賽璐璐＋貼紙描邊街潮海報 |
| 構圖 | 豎版全身居中、微仰角 |

---

### 11 `826cfd32757cb53a269476b946f5a9c9.jpg`｜紅底熊貓大佬

```
A muscular anthropomorphic panda with a broad build, heavy shoulders and a confident smirk, wearing gold wire aviator sunglasses and a dark teal open-collar jacket with bold red and black brush-stroke slashes, against a flat solid vivid red background, strong directional light with hard-edged shadows, cel-shaded painterly poster illustration with bold angular shapes, striking palette of crimson dark teal and near-black with pale fur highlights, dramatic low-angle chest-up portrait, no text
```

| 要素 | 內容 |
|---|---|
| 主體 | 壯碩熊貓，低頭壓場、微壞笑 |
| 服裝 | 金絲飛行墨鏡＋墨青開領夾克（潑墨筆劃） |
| 背景 | 純艷紅平塗 |
| 光線 | 左上強定向光、硬邊陰影 |
| 畫風 | 賽璐璐＋筆繪色塊海報 |
| 構圖 | 仰角胸像，肩部撐滿右下 |

---

### 12 `9111c5da761af8dbc6a4ab3744aa96cc.jpg`｜3D 黑貓探頭賣萌

```
An adorable fluffy black cat with huge glossy amber eyes and a curious innocent expression, peeking up from the bottom of the frame toward the viewer, subtle orange rim light tracing the fur edges, against a flat warm orange-yellow gradient studio backdrop, fluffy 3D animated-film CGI render with soft fur shading and glossy eye shaders, warm amber and charcoal two-tone palette, vertical extreme close-up with generous negative space above, no text
```

| 要素 | 內容 |
|---|---|
| 主體 | 蓬鬆黑貓，巨眼上望賣萌 |
| 背景 | 暖橙黃漸變棚底 |
| 光線 | 柔光＋橙色輪廓光勾毛邊 |
| 畫風 | 3D 動畫電影 CGI、絨毛與眼球高光 |
| 構圖 | 下緣探頭、上半部大量留白 |

---

### 13 `a0c01ee1174325a2746381b7db09794a.jpg`｜大笑黑貓＋濃彩漩渦

```
A cartoon black cat with an exaggerated long fluffy body, enormous bulbous yellow eyes and a massive toothy grin, one furry arm raised in a wave, against a swirling thick impasto background of magenta orange teal and yellow paint strokes, 3D character render over a Van Gogh-style painterly background, bright even lighting with hyper-saturated colors, whimsical psychedelic mood, centered vertical portrait composition, no text
```

| 要素 | 內容 |
|---|---|
| 主體 | 長身黑貓，巨大牙齒笑容＋凸眼 |
| 動作 | 舉爪打招呼 |
| 背景 | 梵谷式厚塗漩渦、多色油彩 |
| 畫風 | 3D 角色＋濃彩油畫背景混搭 |
| 情緒 | 童趣迷幻 |

---

### 14 `b2e5ab8e1c166e94473e8107ee7397b5.jpg`｜叢林橘貓捉迷藏

```
A plump orange tabby-and-white cat peeking out from dense tropical jungle foliage, big round eyes looking upward with a curious alert expression, framed by overlapping banana and monstera leaves, soft dappled light with deep forest-green shadows, painterly storybook illustration with visible brush texture on the leaves, emerald and lime greens contrasting warm ginger and cream, vertical eye-level close-up with a hide-and-seek framing, no text
```

| 要素 | 內容 |
|---|---|
| 主體 | 胖橘白貓，從葉叢中探頭 |
| 背景 | 芭蕉葉＋龜背芋滿框，深綠縱深 |
| 光線 | 斑駁柔光，前景亮後景暗 |
| 畫風 | 繪本水粉插本水粉插畫、筆觸可見 |
| 構圖 | 葉片遮擋式「捉迷藏」框景 |

---

### 15 `c47310412acb6cd1b47edd53631e2cef.jpg`｜藍底比格街潮

```
An anthropomorphic beagle with a long neck and a smug half-lidded gaze, hands tucked in jacket pockets, wearing an oversized hot-pink bomber jacket covered in assorted patches over a navy hoodie, a tan crossbody sling bag and a studded leather collar, against a flat solid sky-blue background with subtle texture, hand-drawn illustration with rough sketchy linework and grainy shading, vivid complementary palette of cyan pink navy and orange, vertical medium shot with a slight low angle emphasizing the haughty upward gaze, no text
```

| 要素 | 內容 |
|---|---|
| 主體 | 比格犬，長頸上揚、傲慢半闔眼 |
| 服裝 | 熱粉貼布轟炸機＋藏青帽衫＋斜挎包＋釘扣項圈 |
| 背景 | 純天藍平塗＋細顆粒 |
| 畫風 | 手繪粗糙線稿＋顆粒排線 |
| 色彩 | 青×粉×藏青×橙互補 |

---

### 16 `dba4575b9fa05f62263f9aa0f792543f.jpg`｜驚呆動物＋星夜

```
A group of five animals, a scruffy black cat, a fluffy orange tabby, a grey kitten, a grey owl and a red parrot, all with comically shocked expressions, huge round eyes and gaping mouths, gazing upward from the lower frame beneath a swirling Van Gogh-style night sky in deep teal and black with a glowing pale-yellow full moon, pen-and-ink engraving texture over gouache with rough paper grain, muted vintage palette of teal burnt orange cream and mustard, clustered low-angle composition filling the lower two-thirds, no text
```

| 要素 | 內容 |
|---|---|
| 主體 | 五隻動物群像：黑貓、橘貓、小貓、貓頭鷹、鸚鵡 |
| 表情 | 統一誇張驚呆：圓瞪眼＋張嘴 |
| 背景 | 梵谷漩渦星夜＋淡黃滿月 |
| 畫風 | 鋼筆蝕刻排線＋水粉＋紙紋 |
| 構圖 | 蟲視仰角，群像擠滿下 2/3 |

---

### 17 `f5f00b8bf325f2418e7b7c5d1b95072c.jpg`｜彩虹斑馬刷牆

```
A chubby cartoon zebra with fluffy fur painted in horizontal stripes of teal mustard cream and deep purple, holding an orange paint roller and standing before a stucco wall it just painted in vertical rainbow bands of teal purple magenta orange and yellow, soft even studio lighting, fluffy 3D animated-film CGI render with fuzzy fur texture, highly saturated rainbow palette unified across character and wall, centered full-body vertical composition, no text
```

| 要素 | 內容 |
|---|---|
| 主體 | 圓胖斑馬，身上被刷成彩虹橫紋 |
| 道具 | 橙色滾筒刷 |
| 背景 | 彩虹豎條紋灰泥牆（呼應主體） |
| 畫風 | 3D 動畫電影 CGI、絨毛質感 |
| 概念 | 「剛刷完牆」的敘事閉環 |

---

## 二、整體風格規律

### 2.1 主體類型分布

| 類型 | 數量 | 對應圖 |
|---|---|---|
| 軟萌寵物（貓/狐/斑馬，無擬人服裝或輕擬人） | 7 | 01 08 09 12 13 14 17 |
| 街頭潮服擬人動物 | 6 | 04 05 06 07 11 15 |
| 迷幻/拼貼角色 | 2 | 02 10 |
| 卡通拼貼群像 | 2 | 03 16 |

### 2.2 畫風分布

| 畫風 | 數量 | 對應圖 |
|---|---|---|
| 3D 動畫電影 CGI（Pixar 系） | 5 | 01 05 12 13 17 |
| 平面海報/絲印/排線插畫 | 6 | 04 06 07 11 15 02 |
| 手繪水粉/繪本/蝕刻 | 3 | 09 14 16 |
| 極簡概念插畫 | 1 | 08 |
| 貼紙拼貼街潮 | 2 | 03 10 |

### 2.3 可復用規律

1. **背景三策略**：① 純色平塗撞色（04/07/11/15）；② 滿版紋樣拼貼（03/10/16）；③ 漸變棚拍留白（01/12/09）。這批樣本大量使用「純色高飽和底＋單主體」的海報公式。
2. **撞色公式**：主體暖色（橘/粉）× 底色冷色（青/藍/綠），或反過來（07 橙貓配綠外套）。
3. **角色態度譜系**：樣本核心魅力不在肌肉力量感（現有 general 預設），而在「傲慢街拍 / 不爽喪萌 / 無辜賣萌 / 驚呆喜劇」四種情緒人設。
4. **敘事道具**：吸管飲料、滾筒刷、貼布夾克等小道具撐起畫面故事感，現有 PROP 變量可擴充。
5. **豎版比例**：全部為 9:16；若進 APP 建議新預設直接綁 `aspect_ratio: "9:16"` 或在比例下拉中提示用戶。

### 2.4 與現有 general 預設的差異

| 維度 | general（現有） | anime 樣本 |
|---|---|---|
| 體格 | 寬肩厚臂肌肉猛獸 | 圓胖/精瘦/幼態比例 |
| 情緒 | 臨戰、凱旋、桀驁 | 傲萌、喪萌、無辜、驚呆 |
| 畫風 | 動漫厚塗/賽璐璐為主 | 3D CGI、絲印海報、水粉繪本、蝕刻 |
| 背景 | 環境場景為主 | 純色底、拼貼底、紋樣底為主 |
| 服裝 | 運動/工裝 | oversize 街潮、貼布夾克 |

---

## 三、建議新增的 APP 變量（對齊 schema_version 2）

以下選項均為 `{value, label}` 格式，可直接併入 `src/style-presets/`；`provides`/`requires` 沿用現有 provider 約束機制。

### 3.1 ART_STYLE 新增選項（擴充現有變量）

```json
[
  { "value": "fluffy 3D animated-film CGI", "provides": ["cgi"], "label": "3D動畫電影質感" },
  { "value": "storybook gouache illustration", "provides": ["storybook"], "label": "繪本水粉插畫" },
  { "value": "flat mid-century screen-print poster illustration", "provides": ["screenprint"], "label": "復古絲印海報" },
  { "value": "pen-and-ink engraving illustration over gouache", "provides": ["engraving"], "label": "鋼筆蝕刻＋水粉" },
  { "value": "psychedelic flat vector poster art", "provides": ["psychedelic"], "label": "迷幻平面向量海報" },
  { "value": "streetwear sticker-poster illustration", "provides": ["sticker"], "label": "街潮貼紙海報" },
  { "value": "minimalist flat conceptual illustration", "provides": ["minimal"], "label": "極簡概念插畫" }
]
```

### 3.2 RENDERING 對應選項（配合上方 provides 標籤）

```json
[
  { "value": "soft fuzzy fur shading, glossy eye shaders, cinematic quality", "requires": ["cgi"], "label": "絨毛柔光·眼球高光·電影質感" },
  { "value": "fine fur grooming, shallow depth of field", "requires": ["cgi"], "label": "細緻毛細緻毛髮·淺景深" },
  { "value": "loose sketchy brushwork, rough unfinished edges, hand-painted warmth", "requires": ["storybook"], "label": "鬆散筆觸·手繪溫度" },
  { "value": "flat color blocks, hard-edged shadows, limited palette", "requires": ["screenprint"], "label": "平塗色塊·硬邊陰影·限色" },
  { "value": "dense cross-hatching, rough paper grain, muted vintage tones", "requires": ["engraving"], "label": "密集排線·紙紋·復古調" },
  { "value": "glowing colors on black, repeating geometric patterns, thick outlines", "requires": ["psychedelic"], "label": "黑底熒光·幾何紋樣·粗描邊" },
  { "value": "thick white sticker outline, halftone print texture, ink splatter", "requires": ["sticker"], "label": "白邊貼紙·網點印刷·墨點" },
  { "value": "simplified shapes, no outlines, subtle paper texture", "requires": ["minimal"], "label": "簡化圖形·無描邊·紙紋" }
]
```

### 3.3 BACKGROUND 新增選項

```json
[
  { "value": "solid vivid sky-blue backdrop", "label": "純天藍底" },
  { "value": "warm orange-yellow gradient studio backdrop", "label": "暖橙黃漸變棚底" },
  { "value": "swirling impasto paint strokes in saturated colors", "label": "濃彩漩渦油畫底" },
  { "value": "Van Gogh-style swirling night sky with a glowing moon", "label": "梵谷漩渦星夜" },
  { "value": "dense graffiti doodle collage filling the frame", "label": "滿版塗鴉拼貼" },
  { "value": "layered manga panel collage with torn typographic shapes and ink splatter", "label": "漫畫格拼貼·墨點" },
  { "value": "flat silhouetted tropical foliage framing the subject", "label": "平面剪影熱帶葉框景" },
  { "value": "dark jungle foliage with dappled light", "label": "斑駁光影叢林" },
  { "value": "minimalist deep-blue gradient underwater scene", "label": "極簡深海藍漸變" }
]
```

### 3.4 EXPRESSION 新增選項（requires: ["face"]）

```json
[
  { "value": "huge glossy eyes gazing up innocently", "requires": ["face"], "label": "大眼無辜上望" },
  { "value": "grumpy half-lidded stare", "requires": ["face"], "label": "不爽半闔眼" },
  { "value": "comically shocked gaping mouth", "requires": ["face"], "label": "誇張驚呆張嘴" },
  { "value": "playful mischievous smirk", "requires": ["face"], "label": "頑皮壞笑" },
  { "value": "sassy aloof half-lidded gaze looking off-frame", "requires": ["face"], "label": "傲慢斜視" }
]
```

### 3.5 MOOD 新增選項

```json
[
  { "value": "whimsical heartwarming mood", "label": "童趣治愈" },
  { "value": "sassy streetwear attitude", "label": "街頭痞氣" },
  { "value": "surreal psychedelic wonderland", "label": "迷幻奇境" },
  { "value": "lazy cozy comfort", "label": "慵懶鬆弛" },
  { "value": "quiet conceptual minimalism", "label": "極簡概念" }
]
```

### 3.6 CLOTHING / FOOTWEAR / PROP 新增選項（街潮向）

```json
[
  { "value": "an oversized patch-covered bomber jacket", "requires": ["torso"], "label": "oversize貼布轟炸機" },
  { "value": "a slouchy knit beanie", "requires": ["face"], "label": "鬆垮針織帽" },
  { "value": "DJ headphones around the neck", "requires": ["torso"], "label": "頸掛DJ耳機" },
  { "value": "chunky mismatched sneakers", "requires": ["feet"], "label": "厚底異色球鞋" },
  { "value": "sipping a drink through a straw from a glass mug", "requires": ["torso"], "label": "捧杯吸管喝飲料" },
  { "value": "holding an orange paint roller", "requires": ["torso"], "label": "手握滾筒刷" }
]
```

### 3.7 建議新增預設（新 preset 條目）

1. **「街潮動物」STREET**：擬人動物 × oversize 街潮服 × 純色/拼貼底 × 絲印或貼紙畫風；`aspect_ratio: "9:16"`；復用現有 ANIMAL、POSE、COMPOSITION 變量＋上方 3.3/3.4/3.6 新選項。
2. **「軟萌寵物」CUTE**：幼態比例寵物 × 無服裝或輕配飾（墨鏡/飲料）× 漸變棚底或繪本叢林 × 3D CGI 或水粉畫風；`aspect_ratio: "9:16"`；EXPRESSION 限定 3.4 中的萌系選項。

---

## 四、待辦與限制

- 樣本中 4 張與知名 IP 形象相似（01 耳狐、03 水管工、05 老鼠、10 粉色小惡魔），PROMPT 已全部泛化處理；正式出圖時建議保持泛化描述，避免版權風險。
- 全部樣本為 9:16 豎版；APP 目前預設 16:9（桌面壁紙）。新增預設時需決定：直接綁 9:16，或出圖後交由 `object-fit: cover` 裁切（桌面端會損失上下構圖，樣本的「上方留白」構圖在 16:9 裁切下仍可用）。
- `5c7a2d89`（逆流小魚）為無角色概念插畫，不適配「角色模板」；已於 v2.2 提取風格要素、v2.3 新增 `concept` 無主體預設承載（見第一節 08 與第五節）。

---

## 五、落地狀態（2026-11-22 更新）

第三部分的變量建議已落地。**沒有按角色類型拆成兩個新預設**——改為直接改造 `general` 一個預設，靠「內容層不鎖風格 + 風格層自由組合」讓任意角色配任意畫風（那樣拆反而會把角色和風格綁死）。但「有無主體」是畫面形態差異，v2.3 另新增了 `concept` 無主體預設，兩者共用同一套 style 層選項。

- 已併入 `src/style-presets/`：`ART_STYLE` 16 種（含 3D CGI／繪本水粉／絲印／蝕刻／迷幻／貼紙／極簡，且每種提供 2–3 個標籤）、`MATERIAL`／`BRUSH`／`FINISH` 三層質感、`SCENE`＋`BACKDROP` 背景拆分、萌系體型／表情／情緒／道具擴池。
- 代碼層補了通用能力（可選字段，無硬編碼）：`group` 分層、`any_of`／`excludes`／`weight` 約束、`tests` 的 `values`／`prompt_contains`／`prompt_excludes`／`group_excludes`／`compare` 斷言。
- 新增 `scripts/validate-presets.mjs`（`npm run validate:presets`）做零額度校驗；`STYLE-JSON.md` 為後續新增風格的契約文件。
- 本文件 3.7 的兩個**角色類型**預設建議仍不實作（會把角色與畫風綁死）；改以 `concept` 無主體預設承接「畫面形態」差異，非角色類預設。
- v2.3 新增 `concept` 預設（13 變量／10 段模板／6 條 tests）：模板不含角色，content 層為 `MOTIF`＋`SCENE`，style 層與 `general` 同源；契約見 `STYLE-JSON.md` §9。

### 未落地清單（2026-11-22 逐節核對）

「已併入 `general`」指的是**從圖反推的變量選項**，不是圖片本身 —— 預設是純文字 JSON，不含任何圖片路徑或 base64。逐節核對結果：

| 章節 | 狀態 |
|---|---|
| 3.1 ART_STYLE 7 項 | 全部落地，且 `ART_STYLE` 由 9 種擴到 16 種 |
| 3.2 RENDERING 8 項 | 語義重組進 `MATERIAL`／`BRUSH`／`FINISH` 三變量，非逐條照搬；「黑底熒光幾何」「極簡紙紋」等少數細節被泛化或合併 |
| 3.3 BACKGROUND 9 項 | 拆分進 `SCENE`＋`BACKDROP`，9 項皆覆蓋（部分泛化，並額外補了純紅／純橙底、網點、速度線等） |
| 3.4 EXPRESSION 5 項 | 全部落地（`glossy` 等材質詞依 content 層禁詞表去除） |
| 3.5 MOOD 5 項 | 全部落地（1 項措辭微調） |
| 3.6 服裝／配件 6 項 | **5 項落地，漏 `a slouchy knit beanie`（鬆垮針織帽）** |
| 3.7 兩個角色類型新預設 | **刻意不實作**：拆預設會把角色與畫風重新綁死；改以單一 `general` 自由組合，另用 `concept` 處理無主體形態 |
| 錨點 08 逆流小魚 | 無角色概念插畫，**不進 `general` 的 content 層**；風格與背景要素已全部提取（見第一節 08 後「非主體要素的落地」），補了 4 個新選項 + 2 個原有項，並催生 `concept` 預設 |

另：4 張 IP 相似圖（01／03／05／10）的 PROMPT 已泛化處理，並非原樣照搬。
