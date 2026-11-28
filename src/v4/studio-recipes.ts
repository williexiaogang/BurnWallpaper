import type { LocalizedText } from "./engine.ts";

type PromptChoice = readonly [label: string, value: string, valueZh?: string];
type PromptChoices = readonly [PromptChoice, ...PromptChoice[]];

export const studioFields = [
  ["SUBJECT", "subject", "主体", "Subject"],
  ["CAMERA", "camera", "镜头", "Camera"],
  ["COMPOSITION", "composition", "构图", "Composition"],
  ["LIGHT", "light", "光线", "Lighting"],
  ["SCENE", "background", "背景", "Background"],
  ["PALETTE", "palette", "配色", "Palette"],
  ["DETAIL", "detail", "细节", "Detail"],
] as const;

export interface StudioRecipe {
  fullId: string;
  slug: string;
  name: string;
  colors: readonly string[];
  art: LocalizedText;
  subject: PromptChoices;
  camera: PromptChoices;
  composition: PromptChoices;
  light: PromptChoices;
  background: PromptChoices;
  palette: PromptChoices;
  detail: PromptChoices;
}

export const studioRecipes: StudioRecipe[] = [
  {
    "fullId": "builtin_visual_styles/three_d:soft_fiber_character",
    "slug": "soft-fiber-character",
    "name": "软绒布偶质感",
    "colors": [
      "#44332a",
      "#d39b47",
      "#f4e7ce"
    ],
    "art": {
      "en": "dense short fibers on rounded plush-like volumes, softly broken contours, diffuse shading and restrained fiber sheen",
      "zh": "圆润布偶体积上覆盖密集短纤维，轮廓柔和断续，采用漫射明暗与克制的纤维光泽"
    },
    "subject": [
      [
        "圆身奶白猫布偶",
        "one round cream-colored plush cat with tiny dot eyes and short paws",
        "一只圆润的奶白色布偶猫，带小圆点眼睛和短爪"
      ],
      [
        "圆身兔布偶",
        "one round plush rabbit with short upright ears and tiny dot eyes",
        "一只圆润布偶兔，短耳竖立，带小圆点眼睛"
      ]
    ],
    "camera": [
      [
        "平视近景",
        "eye-level close portrait with the whole silhouette visible",
        "平视近景"
      ],
      [
        "轻微俯拍",
        "slightly elevated three-quarter view",
        "轻微俯拍"
      ]
    ],
    "composition": [
      [
        "中央单主体",
        "a single large centered figure with clear margins and a small contact shadow",
        "单个大型主体居中，四周留白清晰，脚下带小接触阴影"
      ],
      [
        "偏左留白",
        "one figure placed left of center with wide open space on the right",
        "单个主体位于中线偏左，右侧保留宽阔空间"
      ]
    ],
    "light": [
      [
        "柔和漫射光",
        "broad diffused light with gentle shadows",
        "柔和漫射光"
      ],
      [
        "柔侧光",
        "soft directional light from the left with gentle fill",
        "柔侧光"
      ]
    ],
    "background": [
      [
        "奶黄色影棚",
        "a clean seamless golden-yellow studio backdrop with a matching floor",
        "干净无缝的金黄色影棚背景，地面与背景同色"
      ],
      [
        "淡蓝影棚",
        "a plain powder-blue seamless studio with a matte floor",
        "淡蓝影棚"
      ],
      [
        "奶油雪地",
        "a flat softly textured snowfield with a hazy cream horizon",
        "奶油雪地"
      ]
    ],
    "palette": [
      [
        "奶油与蜂蜜黄",
        "warm cream fur and muted honey-yellow accents coordinated with the background",
        "暖奶油色毛发与低饱和蜂蜜黄点缀，并与背景协调"
      ],
      [
        "奶白与淡杏",
        "soft ivory and pale apricot on the main figure",
        "奶白与淡杏"
      ]
    ],
    "detail": [
      [
        "黄色小帽",
        "a small pale-yellow cap with a simple stitched patch",
        "黄色小帽"
      ],
      [
        "短针织围巾",
        "a short knitted scarf with a visible ribbed edge",
        "短针织围巾"
      ],
      [
        "一点侧头",
        "a subtle head tilt and a tiny stitched smile",
        "一点侧头"
      ]
    ]
  },
  {
    "fullId": "builtin_visual_styles/illustration:opt0001",
    "slug": "gouache-storybook",
    "name": "哑光色块与干笔",
    "colors": [
      "#41434a",
      "#9ca9a4",
      "#e1c3a9"
    ],
    "art": {
      "en": "opaque matte color planes with irregular edge breakup, short directional dry-looking fur marks and crisp details over larger soft shadow planes",
      "zh": "不透明哑光色块，边缘呈不规则破碎感，短促定向的干笔毛发纹理与清晰细节覆盖在更大的柔和阴影色块上"
    },
    "subject": [
      [
        "托腮白猫",
        "a shaggy white cat propping both cheeks on its front paws",
        "托腮白猫"
      ],
      [
        "托腮小熊",
        "a soft round bear resting its chin on its front paws",
        "托腮小熊"
      ]
    ],
    "camera": [
      [
        "正面脸部近景",
        "a direct eye-level face close-up",
        "正面脸部近景"
      ],
      [
        "三分侧脸",
        "a tight three-quarter face portrait",
        "三分侧脸"
      ]
    ],
    "composition": [
      [
        "脸与双爪居中",
        "an almost symmetrical head and paw silhouette filling the center",
        "近乎对称的头部与爪子剪影占据画面中心"
      ],
      [
        "主体偏右",
        "the oversized face on the right with clean space to the left",
        "主体偏右"
      ]
    ],
    "light": [
      [
        "柔光与灰蓝阴影",
        "even diffuse light with blue-gray planar shadows",
        "柔光与灰蓝阴影"
      ],
      [
        "暖色侧光",
        "a warm diffuse sidelight with soft muted shadows",
        "暖色侧光"
      ]
    ],
    "background": [
      [
        "橙色哑光底",
        "a flat burnt-orange matte field with uneven pigment-like texture",
        "平坦的焦橙哑光背景，带不均匀的颜料质感"
      ],
      [
        "暖白留白",
        "a wide warm-white field with lightly mottled edges",
        "暖白留白"
      ]
    ],
    "palette": [
      [
        "冷白毛色与深色镜片",
        "white fur, cool blue-gray shadows and dark amber accents",
        "冷白毛色与深色镜片"
      ],
      [
        "淡杏与墨蓝",
        "pale apricot highlights with restrained navy accents",
        "淡杏与墨蓝"
      ]
    ],
    "detail": [
      [
        "圆形深色墨镜",
        "oversized round dark glasses with narrow warm rims",
        "圆形深色墨镜"
      ],
      [
        "琥珀色镜片",
        "round glasses with translucent amber lenses",
        "琥珀色镜片"
      ],
      [
        "半眯眼",
        "a relaxed squint and a few crisp whiskers",
        "半眯眼"
      ]
    ]
  },
  {
    "fullId": "builtin_visual_styles/anime:hand_painted_theatrical",
    "slug": "hand-painted-theatrical",
    "name": "硬边分层动画感",
    "colors": [
      "#30444e",
      "#8694bc",
      "#f0ab9f"
    ],
    "art": {
      "en": "clean dark contours and stepped hard-edged shadows on foreground figures, with broad simplified color shapes layered behind them",
      "zh": "前景角色带干净深色轮廓和阶梯式硬边阴影，后方层叠宽大简化的色块"
    },
    "subject": [
      [
        "同车的两位犬科旅人",
        "two original pointed-eared canine travelers in sunglasses, seated at different depths",
        "两位原创尖耳犬科旅人戴墨镜，分别坐在前后不同景深位置"
      ],
      [
        "并坐的两位狐形旅人",
        "two original fox-like travelers seated next to each other",
        "并坐的两位狐形旅人"
      ]
    ],
    "camera": [
      [
        "车内平视中景",
        "an eye-level medium shot looking across the pair",
        "车内平视中景"
      ],
      [
        "贴近侧脸",
        "a closer three-quarter view of the pair from the side",
        "贴近侧脸"
      ]
    ],
    "composition": [
      [
        "双主体与斜向窗框",
        "the larger figure on the left and the smaller figure farther back, framed by strong diagonal lines",
        "较大人物位于左侧，较小人物处在后方，画面由有力的对角线框定"
      ],
      [
        "人物靠右",
        "both figures to the right, with an open patch of scenery to the left",
        "两个人物都位于右侧，左侧保留开阔景色"
      ]
    ],
    "light": [
      [
        "低角度夕照",
        "warm low-angle light with deep teal shade",
        "低角度夕照"
      ],
      [
        "日落余晖",
        "soft coral rim light against cool ambient fill",
        "日落余晖"
      ],
      ["树影斑驳光", "leaf-shaped sunlight patches crossing the figures, with cool fill in between", "叶形阳光斑驳地落在人物身上，光斑之间保留冷色填光"]
    ],
    "background": [
      [
        "夕阳车窗",
        "a car interior framed by dark window pillars, with a teal evening sky and coral clouds through the glass",
        "汽车内部由深色窗柱框景，玻璃外可见青蓝傍晚天空与珊瑚色云层"
      ],
      [
        "黄昏列车",
        "a softly shaded passenger train interior looking out on a peach-colored dusk sky",
        "柔和明暗的客运列车内部，望向窗外桃色黄昏天空"
      ],
      ["窗外层叠树冠", "a window framing sunlit foliage, with sharp near leaves and a pale distant canopy", "窗框围住受日照的枝叶，近处叶形清楚，远处树冠淡化"]
    ],
    "palette": [
      [
        "珊瑚色与青蓝阴影",
        "warm amber faces, coral highlights and muted teal shadows",
        "珊瑚色与青蓝阴影"
      ],
      [
        "淡紫与蜜橙",
        "dusty violet shadows with honey-orange highlights",
        "淡紫与蜜橙"
      ],
      ["嫩黄叶光与青绿暗部", "yellow-green highlights, olive midtones and cool jade shadows", "嫩黄绿高光、橄榄色中间调与冷青绿阴影"]
    ],
    "detail": [
      [
        "镜片映出晚霞",
        "small warm reflections in dark sunglasses",
        "镜片映出晚霞"
      ],
      [
        "半扇窗倒影",
        "a thin soft window reflection near the edge",
        "半扇窗倒影"
      ],
      [
        "亮色边缘",
        "a small warm highlight on the nearer silhouette",
        "亮色边缘"
      ],
      ["窗前透亮叶缘", "a few backlit leaf edges visible through the window", "窗外露出几片被逆光照透的叶缘"]
    ]
  },
  {
    "fullId": "builtin_visual_styles/graphic:modernist_geometric",
    "slug": "modernist-geometric",
    "name": "锐角几何色块",
    "colors": [
      "#142d3b",
      "#08a39b",
      "#efb54d"
    ],
    "art": {
      "en": "hard-edged triangular facets and flat opaque color blocks on both figure and surroundings, with visibly separated light and shadow planes",
      "zh": "人物与环境都由硬边三角切面和平面不透明色块构成，明暗面清楚分离"
    },
    "subject": [
      [
        "戴反光镜的金虎",
        "a golden tiger with bold angular stripes and reflective sunglasses",
        "一只金色老虎，带粗重棱角斑纹和反光墨镜"
      ],
      [
        "戴墨镜的黑豹",
        "a black panther in angular sunglasses with a sharply defined muzzle",
        "一只黑豹，戴棱角分明的墨镜，吻部轮廓锐利清晰"
      ]
    ],
    "camera": [
      [
        "三分侧脸近景",
        "a three-quarter head-and-shoulders portrait",
        "三分侧脸近景"
      ],
      [
        "正面近景",
        "a tight frontal head portrait",
        "正面近景"
      ]
    ],
    "composition": [
      [
        "斜向切面聚焦脸部",
        "a large central head framed by diagonal geometric shapes",
        "斜向切面聚焦脸部"
      ],
      [
        "右侧切面留白",
        "a strong right-aligned silhouette with a sparse left margin",
        "右侧切面留白"
      ]
    ],
    "light": [
      [
        "硬边明暗分面",
        "bold flat light and shadow separated by crisp straight edges",
        "硬边明暗分面"
      ],
      [
        "高反差侧光",
        "hard graphic side lighting with a narrow highlight plane",
        "高反差侧光"
      ]
    ],
    "background": [
      [
        "靛蓝几何叶影",
        "a deep indigo backdrop with angular tropical leaves in dark teal and vivid golden yellow",
        "深靛蓝背景，带棱角分明的热带叶片，叶片使用深青绿与鲜金黄色"
      ],
      [
        "矿物色几何底",
        "a flat slate backdrop with sparse rust and teal polygons",
        "矿物色几何底"
      ]
    ],
    "palette": [
      [
        "金黄与靛蓝",
        "golden yellow against indigo and teal, with tiny magenta accents",
        "金黄色与靛蓝、青绿相对，点缀少量品红"
      ],
      [
        "铜色与墨绿",
        "burnished copper accents with ink-green and ivory planes",
        "铜色与墨绿"
      ]
    ],
    "detail": [
      [
        "紫红反光镜片",
        "magenta reflections cut into angular shapes across the lenses",
        "镜片上的品红反光被切割成棱角形状"
      ],
      [
        "红橙细边",
        "thin coral highlight facets on the silhouette",
        "红橙细边"
      ],
      [
        "琥珀反光镜片",
        "amber reflection shapes cutting across the lenses",
        "琥珀反光镜片"
      ]
    ]
  },
  {
    "fullId": "builtin_visual_styles/anime:opt0005",
    "slug": "bold-ink-manga",
    "name": "浓黑剪影与点色",
    "colors": [
      "#211c24",
      "#bf3e34",
      "#eee1cc"
    ],
    "art": {
      "en": "heavy near-black contour strokes, large solid shadow masses and a few crisp narrow edge highlights, with color concentrated in small focal regions",
      "zh": "粗重近黑轮廓线、大面积实色阴影和少量清晰窄边高光，颜色集中在小面积焦点区域"
    },
    "subject": [
      [
        "红帽衫黑猫",
        "an original black cat in a red hooded jacket with headphones and dark glasses",
        "一只原创黑猫，穿红色连帽外套，戴耳机和墨镜"
      ],
      [
        "黑狼街头外套",
        "an original charcoal wolf in a red streetwear jacket with dark glasses",
        "一只原创炭灰色狼，穿红色街头外套并戴墨镜"
      ]
    ],
    "camera": [
      [
        "低角度上半身",
        "a slight low-angle upper-body portrait",
        "低角度上半身"
      ],
      [
        "平视侧脸",
        "an eye-level tight side portrait",
        "平视侧脸"
      ]
    ],
    "composition": [
      [
        "单主体低位留白",
        "one large figure rising from the lower half with broad clear space overhead",
        "一个大型主体从画面下半部升起，头顶保留宽阔干净空间"
      ],
      [
        "主体居左",
        "a cropped upper body on the left with open space to the right",
        "左侧为裁切的上半身，右侧保留开放空间"
      ]
    ],
    "light": [
      [
        "冷色边光",
        "a narrow cool rim light with dense black central shadows",
        "冷色边光"
      ],
      [
        "暖侧光",
        "strong warm sidelight and solid black cut shadows",
        "暖侧光"
      ]
    ],
    "background": [
      [
        "纯黑背景",
        "a seamless jet-black backdrop without background objects",
        "纯黑背景"
      ],
      [
        "灰黑网点底",
        "a deep charcoal field with sparse halftone grain",
        "灰黑网点底"
      ]
    ],
    "palette": [
      [
        "墨黑与朱红",
        "ink black with a saturated vermilion garment and tiny cold-blue highlights",
        "墨黑为主，搭配饱和朱红衣衫和少量冷蓝高光"
      ],
      [
        "墨黑与钴蓝",
        "dense black with a single saturated cobalt accent",
        "墨黑与钴蓝"
      ]
    ],
    "detail": [
      [
        "圆镜与耳机",
        "small hard glints on round lenses and headphone rings",
        "圆镜与耳机"
      ],
      [
        "拉链金属光",
        "a small metallic zipper highlight",
        "拉链金属光"
      ],
      [
        "细蓝毛束边光",
        "a few cold blue strokes defining the fur edge",
        "细蓝毛束边光"
      ]
    ]
  },
  {
    "fullId": "builtin_visual_styles/illustration:scratchboard_engraving",
    "slug": "scratchboard-engraving",
    "name": "密排线与局部亮色",
    "colors": [
      "#292b29",
      "#a99a7a",
      "#a8302b"
    ],
    "art": {
      "en": "dense narrow intersecting hatch marks following the forms, silver-looking highlights cut out of dark gray masses, and saturated color confined to distinct areas",
      "zh": "密集细窄排线沿形体交织，银色高光从深灰色块中刻出，饱和颜色仅限于明确局部"
    },
    "subject": [
      [
        "红针织帽黑犬",
        "an original black dog in a red ribbed knit hat, round dark glasses and over-ear headphones",
        "一只原创黑狗，戴红色罗纹针织帽、圆形墨镜和包耳式耳机"
      ],
      [
        "戴针织帽的狼",
        "an original dark wolf wearing a chunky knit cap and round glasses",
        "一只原创深色狼，戴粗针织帽和圆框眼镜"
      ]
    ],
    "camera": [
      [
        "仰头侧脸近景",
        "a close side profile looking upward",
        "仰头侧脸近景"
      ],
      [
        "三分侧脸",
        "a slightly elevated three-quarter face close-up",
        "三分侧脸"
      ]
    ],
    "composition": [
      [
        "大头像与纯色留白",
        "a large angled head silhouette framed by clean open space",
        "大头像与纯色留白"
      ],
      [
        "偏右头像",
        "the profile placed on the right with a broad left margin",
        "偏右头像"
      ]
    ],
    "light": [
      [
        "黑白强反差",
        "sharp silver highlights against deep charcoal shadows",
        "黑白强反差"
      ],
      [
        "偏侧窄高光",
        "a narrow side highlight with dense shadow on the far side",
        "偏侧窄高光"
      ]
    ],
    "background": [
      [
        "亮红纯色底",
        "a saturated bright-red uninterrupted background",
        "亮红纯色底"
      ],
      [
        "暗青印刷底",
        "a flat deep-teal ink field with subtle paper grain",
        "暗青印刷底"
      ]
    ],
    "palette": [
      [
        "灰阶与朱红",
        "charcoal and ivory on the figure with selective scarlet textile accents",
        "人物采用炭灰与象牙白，织物局部选择性点缀猩红色"
      ],
      [
        "灰阶与浅金",
        "charcoal and paper white with small muted gold accents",
        "灰阶与浅金"
      ]
    ],
    "detail": [
      [
        "罗纹帽沿",
        "short parallel marks defining the ribbed cap edge",
        "罗纹帽沿"
      ],
      [
        "镜片细亮线",
        "a narrow fine-line glint across one lens",
        "镜片细亮线"
      ],
      [
        "耳机刻纹",
        "fine circular grooves on the headphones",
        "耳机刻纹"
      ]
    ]
  },
  {
    "fullId": "builtin_visual_styles/three_d:opt0002",
    "slug": "soft-animation-cgi",
    "name": "细毛边光与粗纹",
    "colors": [
      "#18394b",
      "#569d9b",
      "#f1ad7e"
    ],
    "art": {
      "en": "individually lit hair tips on soft rounded volumes against a much coarser surface, clear overlap between planes and glossy catchlights",
      "zh": "柔软圆润体积上的毛尖被逐一点亮，与更粗糙表面形成对比，平面遮挡关系清楚，带光泽眼神光"
    },
    "subject": [
      [
        "探头灰浣熊",
        "a small gray raccoon peeking forward, its two front paws visible",
        "一只小灰浣熊向前探头，两只前爪可见"
      ],
      [
        "探头小狐狸",
        "a small tan fox leaning forward with both front paws visible",
        "探头小狐狸"
      ]
    ],
    "camera": [
      [
        "低位脸肩特写",
        "a close face-and-shoulders view at eye level",
        "低位脸肩特写"
      ],
      [
        "三分侧脸特写",
        "a tight three-quarter portrait from slightly above",
        "三分侧脸特写"
      ]
    ],
    "composition": [
      [
        "窄缝竖向框景",
        "foreground surfaces framing the figure tightly from both sides",
        "前景表面从两侧紧密框住人物"
      ],
      [
        "单侧遮挡",
        "one foreground edge overlapping the figure with open space on the other side",
        "一侧前景边缘遮挡人物，另一侧保留开放空间"
      ]
    ],
    "light": [
      [
        "冷漫射与毛尖边光",
        "cool diffuse light and soft backlighting on individual fur strands",
        "冷色漫射光与柔和背光逐根照亮毛发"
      ],
      [
        "暖柔侧光",
        "warm diffuse sidelight against soft cool shadows",
        "暖柔侧光"
      ]
    ],
    "background": [
      [
        "青蓝岩壁裂缝",
        "a coarse turquoise rock wall with a deep narrow vertical fissure and cool blue shadows",
        "粗糙绿松石色岩壁，带深窄垂直裂缝和冷蓝阴影"
      ],
      [
        "雨后木栏",
        "a weathered wooden fence with a narrow opening and soft foliage behind it",
        "风化木栅栏带一道窄开口，后方是柔和植物"
      ]
    ],
    "palette": [
      [
        "暖眼色与青蓝",
        "cool gray fur with warm amber glints and restrained teal accents",
        "冷灰毛发带暖琥珀色闪光，点缀克制的青色"
      ],
      [
        "淡杏与石蓝",
        "pale apricot fur highlights against slate-blue shadow tones",
        "淡杏与石蓝"
      ]
    ],
    "detail": [
      [
        "宽眼与小笑",
        "round amber eyes and a small friendly smile",
        "宽眼与小笑"
      ],
      [
        "歪头探看",
        "a slight curious head tilt",
        "歪头探看"
      ],
      [
        "细毛高光",
        "individual soft highlights on the cheek fur",
        "细毛高光"
      ]
    ]
  },
  {
    "fullId": "builtin_visual_styles/graphic:torn_paper_collage",
    "slug": "torn-paper-collage",
    "name": "磨损印刷拼贴",
    "colors": [
      "#23262e",
      "#ba926b",
      "#e15c4f"
    ],
    "art": {
      "en": "scuffed overlapping print shapes with torn-looking edges and scattered ink loss, contrasting with smoother rounded highlights on the focal figure",
      "zh": "磨损印刷图形相互交叠，边缘似撕裂并散布油墨脱落，与焦点人物较平滑圆润的高光形成对比"
    },
    "subject": [
      [
        "大耳街装角色",
        "an original big-eared mouse in layered streetwear and high-top shoes",
        "一只原创大耳鼠，穿多层街头服饰和高帮鞋"
      ],
      [
        "小狐狸街装角色",
        "an original fox in an oversized street jacket and high-top shoes",
        "一只原创狐狸，穿oversize街头夹克和高帮鞋"
      ]
    ],
    "camera": [
      [
        "正面全身",
        "a frontal full-body portrait",
        "正面全身"
      ],
      [
        "轻微低机位",
        "a low-angle three-quarter full-body view",
        "轻微低机位"
      ]
    ],
    "composition": [
      [
        "中央竖向群块",
        "one clear vertical silhouette in the center, layered shapes clustered around the edges",
        "中央是一道清晰竖向剪影，层叠形体聚集于四周"
      ],
      [
        "偏左拼贴构图",
        "an offset figure with heavier layers to the lower left",
        "偏左拼贴构图"
      ]
    ],
    "light": [
      [
        "暗底窄亮边",
        "dim ambient light with a narrow warm outline and shallow paper shadows",
        "环境光昏暗，带窄暖色轮廓光和浅纸张阴影"
      ],
      [
        "柔暖侧光",
        "warm sidelight that picks out the edges of the layered paper",
        "柔暖侧光"
      ]
    ],
    "background": [
      [
        "做旧街头海报墙",
        "an urban wall layered with scuffed torn posters in charcoal, cream and burnt orange, with no readable lettering",
        "城市墙面层叠磨损撕破的海报，采用炭黑、奶油色和焦橙色，无可读文字"
      ],
      [
        "旧纸拼贴墙",
        "a layered wall of aged newsprint shapes with no readable lettering on faded kraft paper",
        "由陈旧新闻纸图形层叠的墙面，褪色牛皮纸上没有可读文字"
      ]
    ],
    "palette": [
      [
        "焦橙与煤灰",
        "burnt orange, charcoal black and warm paper white",
        "焦橙与煤灰"
      ],
      [
        "酒红与卡其",
        "muted wine-red accents and warm kraft neutrals",
        "酒红与卡其"
      ]
    ],
    "detail": [
      [
        "印刷磨损",
        "little flakes of worn ink near the paper seams",
        "印刷磨损"
      ],
      [
        "浅色纸纤维",
        "loose pale paper fibers tracing a few torn edges",
        "浅色纸纤维"
      ],
      [
        "细斜线划痕",
        "fine angled scuffs across a few small color blocks",
        "细斜线划痕"
      ]
    ]
  },
  {
    "fullId": "builtin_visual_styles/anime:sticker_on_photographic_scene",
    "slug": "sticker-on-photographic-scene",
    "name": "白边贴纸与写实景深",
    "colors": [
      "#243a37",
      "#71876a",
      "#eccb69"
    ],
    "art": {
      "en": "flat character color with a crisp off-white contour, realistic soft-focus depth in the surroundings and a small contact shadow joining the two treatments",
      "zh": "角色采用平面填色和清晰米白轮廓，环境呈真实柔焦景深，小接触阴影连接两种表现方式"
    },
    "subject": [
      [
        "穿黄雨衣的小旅人",
        "an original small hiker in a yellow rain jacket and an olive cap, taking a step",
        "一位原创小旅人，穿黄色雨衣、戴橄榄绿帽子，正在迈步"
      ],
      [
        "穿雨衣的小熊",
        "an original little bear hiker in a short raincoat, taking a step",
        "一位原创小熊旅人，穿短雨衣，正在迈步"
      ]
    ],
    "camera": [
      [
        "低机位全身",
        "a low eye-level full-body view with soft depth of field",
        "低机位全身"
      ],
      [
        "斜侧全身",
        "a three-quarter full-body view from slightly above",
        "斜侧全身"
      ]
    ],
    "composition": [
      [
        "小主体与深纵深",
        "a small figure in the lower third with strong receding perspective behind it",
        "小主体位于下三分之一，身后具有强烈的远退透视"
      ],
      [
        "角落小主体",
        "a small figure in the lower-right corner with open space across the frame",
        "小主体位于右下角，画面其余空间开阔"
      ]
    ],
    "light": [
      [
        "阴天漫射光",
        "cool overcast ambient light and soft reflections",
        "阴天漫射光"
      ],
      [
        "背后微亮",
        "soft backlighting with restrained ambient reflections",
        "背后微亮"
      ]
    ],
    "background": [
      [
        "雨中林荫小径",
        "a rain-soaked tree-lined path in overcast daylight with shallow puddles, wet reflections and soft green foliage",
        "阴天日光下被雨水浸湿的林荫小径，带浅水洼、湿润反光和柔和绿植"
      ],
      [
        "薄雾步道",
        "a quiet garden path with morning mist and soft distant foliage",
        "宁静花园小径，晨雾弥漫，远处植物柔和"
      ]
    ],
    "palette": [
      [
        "黄衣与灰绿环境",
        "warm yellow and muted olive on the character, coordinated with the surroundings",
        "角色采用暖黄与低饱和橄榄绿，并与环境协调"
      ],
      [
        "淡珊瑚与墨青",
        "pale coral and dark teal accents on the character",
        "淡珊瑚与墨青"
      ]
    ],
    "detail": [
      [
        "雨珠与接地影",
        "a few rain droplets and a close grounding shadow beneath the feet",
        "少量雨滴，以及脚下贴近主体的接地阴影"
      ],
      [
        "鞋边反光",
        "a small reflected light along the sole of one shoe",
        "鞋边反光"
      ],
      [
        "轮廓留细白边",
        "a narrow clean white edge around the silhouette",
        "轮廓留细白边"
      ]
    ]
  },
  {
    "fullId": "builtin_visual_styles/anime:opt0002",
    "slug": "painterly-anime",
    "name": "叠色笔面与深影",
    "colors": [
      "#263d39",
      "#748f58",
      "#e88f65"
    ],
    "art": {
      "en": "overlapping opaque brush-like planes, broad pooled shadows and crisp fine directional marks around a much smaller bright focal area",
      "zh": "不透明笔触感色块交叠，宽阔沉积阴影，在更小的高亮焦点周围带清晰细定向笔触"
    },
    "subject": [
      [
        "探头橘白猫",
        "a small orange-and-white cat peeking forward, wide eyes clearly visible",
        "一只橘白小猫向前探头，双眼圆睁且清晰可见"
      ],
      [
        "探头灰白小兔",
        "a small gray-and-white rabbit looking forward with a curious expression",
        "一只灰白小兔向前看，表情好奇"
      ]
    ],
    "camera": [
      [
        "平视脸部近景",
        "an eye-level face close-up",
        "平视脸部近景"
      ],
      [
        "侧面近景",
        "a tight three-quarter view of the face",
        "侧面近景"
      ]
    ],
    "composition": [
      [
        "大前景包围小焦点",
        "layered foreground forms partially hiding one small central face",
        "层叠前景形体遮住中央小脸的一部分"
      ],
      [
        "偏侧窗口",
        "a small opening to one side with most of the frame occupied by layered forms",
        "一侧留出小开口，画面大部分由层叠形体占据"
      ]
    ],
    "light": [
      [
        "深阴影与暖色点光",
        "deep pooled shadows with a restrained warm highlight on the face",
        "深沉积阴影，面部带克制的暖色高光"
      ],
      [
        "清晨柔侧光",
        "soft warm sidelight with a broad cool shadow side",
        "清晨柔侧光"
      ]
    ],
    "background": [
      [
        "深绿巨叶",
        "oversized dark-green leaves layered in depth with visible veins and deep shade",
        "巨大深绿叶片沿纵深交叠，叶脉清晰，阴影深浓"
      ],
      [
        "深色藤蔓",
        "an overlapping thicket of tall forest vines and cool-green fronds",
        "高大森林藤蔓与冷绿蕨叶交织成层叠密丛"
      ]
    ],
    "palette": [
      [
        "深绿与橘白",
        "deep forest greens with soft orange and warm-ivory facial accents",
        "深森林绿为主，面部带柔和橙色与暖象牙白点缀"
      ],
      [
        "松绿与淡杏",
        "pine-green shadows with pale apricot accents",
        "松绿与淡杏"
      ]
    ],
    "detail": [
      [
        "细叶脉",
        "a few fine veins along the nearest shapes",
        "细叶脉"
      ],
      [
        "边缘水珠",
        "small bright droplets on the nearest forms",
        "边缘水珠"
      ],
      [
        "亮色眼神光",
        "a pair of tiny warm eye catchlights",
        "亮色眼神光"
      ]
    ]
  },
  {
    "fullId": "builtin_visual_styles/illustration:embroidered_illustration",
    "slug": "embroidered-illustration",
    "name": "条纹针织布偶",
    "colors": [
      "#574153",
      "#be6f63",
      "#e2bd88"
    ],
    "art": {
      "en": "short yarn-like fibers and visible knit-like loops in broad repeating color bands, rounded soft edges and a different coarse texture on the background",
      "zh": "短线状纤维与清晰针织线圈组成宽大重复色带，边缘圆润柔软，背景采用不同的粗糙纹理"
    },
    "subject": [
      [
        "条纹长耳布偶",
        "an original long-eared donkey puppet with a nubby pale muzzle and a striped body",
        "一只原创长耳驴布偶，浅色吻部带颗粒感，身体有条纹"
      ],
      [
        "针织衣绒面白鸭",
        "an original white duck-shaped puppet in a coarse navy ribbed sweater",
        "一只原创白色鸭形布偶，穿粗质藏青罗纹毛衣"
      ]
    ],
    "camera": [
      [
        "平视正面全身",
        "a frontal eye-level view with the full figure visible",
        "平视正面全身"
      ],
      [
        "三分侧面",
        "an eye-level three-quarter portrait with the fabric edge in view",
        "平视三分侧面肖像，布料边缘可见"
      ]
    ],
    "composition": [
      [
        "直立主体中央",
        "one upright figure centered with the silhouette framed by clear side margins",
        "单个直立主体居中，剪影两侧留白清晰"
      ],
      [
        "主体偏左",
        "one large off-center figure with breathing room on the right",
        "主体偏左"
      ]
    ],
    "light": [
      [
        "柔光呈现纤维",
        "diffuse studio lighting that picks out tiny fibers and shallow texture",
        "漫射影棚光突出细纤维和浅表纹理"
      ],
      [
        "纤维侧光",
        "gentle sidelighting that emphasizes raised stitches",
        "纤维侧光"
      ]
    ],
    "background": [
      [
        "粗纹彩条墙",
        "a coarse textured wall with broad vertical indigo, pink-red, mustard and orange bands",
        "粗糙纹理墙面，带宽阔竖向靛蓝、粉红、芥末黄和橙色条纹"
      ],
      [
        "燕麦织布底",
        "a plain oatmeal fabric backdrop with faint woven ridges",
        "燕麦织布底"
      ]
    ],
    "palette": [
      [
        "金黄与蓝红条纹",
        "mustard yellow, indigo and dusty red in broad but distinct bands",
        "芥末黄、靛蓝与灰红形成宽大但分明的色带"
      ],
      [
        "淡紫与铜绿",
        "muted lavender and verdigris accents against warm neutrals",
        "淡紫与铜绿"
      ]
    ],
    "detail": [
      [
        "小滚筒与细绒边",
        "a small roller at the figure's side and a few loose short fibers along the silhouette",
        "人物身侧有一个小滚筒，剪影边缘带少许松散短纤维"
      ],
      [
        "小块粗线圈",
        "a small area where the yarn-like loops catch the light",
        "小块粗线圈"
      ],
      [
        "纤维毛边",
        "a few loose yarn fibers along the silhouette",
        "纤维毛边"
      ]
    ]
  },
  {
    "fullId": "builtin_visual_styles/illustration:palette_knife_oil",
    "slug": "palette-knife-oil",
    "name": "厚颜料脊与擦痕",
    "colors": [
      "#46535f",
      "#e28348",
      "#e6dfcb"
    ],
    "art": {
      "en": "raised-looking pigment ridges, broken scrape-like marks and irregular dry edges on the broad surface, contrasted with fine fur at the small focal point",
      "zh": "宽阔表面上隆起颜料棱线、断续刮擦痕和不规则干边，与小焦点处的细腻毛发形成对比"
    },
    "subject": [
      [
        "橙帽小兽",
        "an original small fine-furred animal in an orange cap, peeking over an edge",
        "一只原创细毛小动物，戴橙色帽子，从边缘探头"
      ],
      [
        "露头小狗",
        "a small shaggy puppy in a muted rust cap, peeking forward",
        "露头小狗"
      ]
    ],
    "camera": [
      [
        "小主体中近景",
        "an eye-level mid-close view that keeps the surroundings visible",
        "平视中近景，保留可见的周围环境"
      ],
      [
        "略低视线",
        "a slightly low angle with the small face close to the frame edge",
        "略微低角度，小脸靠近画面边缘"
      ]
    ],
    "composition": [
      [
        "斜线与大片留白",
        "one small figure offset to the right, with generous open space and a diagonal leading line",
        "一个小主体偏向右侧，保留大面积开放空间和一条对角引导线"
      ],
      [
        "中央留白",
        "one small figure near the center surrounded by an open field",
        "中央留白"
      ]
    ],
    "light": [
      [
        "表面凸纹与柔阴影",
        "soft light picking out raised texture and small shadows beneath the figure",
        "柔光突出隆起纹理，并在人物下方形成小阴影"
      ],
      [
        "均匀柔光",
        "soft even light with small glints on raised pigment ridges",
        "均匀柔光"
      ]
    ],
    "background": [
      [
        "米白底与橙色斜笔",
        "an off-white textured paint field crossed by a single diagonal band of bright orange pigment",
        "米白纹理颜料底上，横贯一条亮橙色对角颜料带"
      ],
      [
        "浅灰底与青色斜笔",
        "a pale gray textured ground crossed by one broad muted teal paint stroke",
        "浅灰纹理底上，横贯一笔宽阔低饱和青色笔触"
      ]
    ],
    "palette": [
      [
        "米白与亮橙",
        "ivory neutrals with a compact vivid orange accent",
        "米白与亮橙"
      ],
      [
        "暖白与氧化红",
        "warm off-white and a single muted oxide-red accent",
        "暖白与氧化红"
      ]
    ],
    "detail": [
      [
        "粗漆边缘",
        "a few visibly raised white pigment ridges near the main shape",
        "主体附近有几条明显隆起的白色颜料棱线"
      ],
      [
        "断续刮痕",
        "short broken scrape marks along an edge",
        "断续刮痕"
      ],
      [
        "帽沿暖高光",
        "a small warm highlight on the edge of the cap",
        "帽沿暖高光"
      ]
    ]
  },
  {
    "fullId": "builtin_visual_styles/illustration:semi_realistic_digital_painting",
    "slug": "semi-realistic-digital-painting",
    "name": "近镜广角与暖侧光",
    "colors": [
      "#4e3c4b",
      "#7b8d9c",
      "#dca87b"
    ],
    "art": {
      "en": "strong near-to-far scale change, crisp selectively detailed foreground features, softened dark edges and visibly simplified distant forms",
      "zh": "近远尺度变化强烈，前景特征清晰且有选择地刻画细节，深色边缘柔化，远处形体明显简化"
    },
    "subject": [
      [
        "歪头近镜小狗",
        "an original tan dog with a curious head tilt approaching the camera",
        "一只原创棕褐色狗好奇地歪头走近镜头"
      ],
      [
        "歪头小狐狸",
        "an original little fox leaning toward the camera with a curious head tilt",
        "一只原创小狐狸好奇地歪头倾向镜头"
      ]
    ],
    "camera": [
      [
        "贴近镜头的广角",
        "an exaggerated close wide-angle view with the nose near the lens",
        "夸张广角近景，鼻子靠近镜头"
      ],
      [
        "低视线中近景",
        "a low eye-level medium close-up with mild perspective",
        "低视线中近景"
      ]
    ],
    "composition": [
      [
        "大脸与街景纵深",
        "the face dominates the near frame while diagonals recede behind it",
        "脸部占据近景主体，对角线在其后向远处退去"
      ],
      [
        "小幅偏右近景",
        "the head sits to the right with a clear open area to the left",
        "头部位于右侧，左侧保留清晰开放区域"
      ]
    ],
    "light": [
      [
        "暖斜照与深阴影",
        "warm grazing late-afternoon light with deep soft shadows",
        "暖斜照与深阴影"
      ],
      [
        "暖轮廓与冷反光",
        "warm rim light and gentle cooler fill on the face",
        "暖轮廓与冷反光"
      ]
    ],
    "background": [
      [
        "暖光旧街",
        "a narrow old street at dusk with golden light between weathered buildings and receding shaded facades",
        "黄昏狭窄老街，金色光线穿过风化建筑之间，阴影立面逐渐远去"
      ],
      [
        "暖光砖墙小巷",
        "a quiet brick alley with deep perspective and muted evening light",
        "宁静砖巷，纵深深远，傍晚光线低饱和"
      ]
    ],
    "palette": [
      [
        "暖沙色与深褐",
        "warm tan midtones, honey highlights and deep brown shadows",
        "暖沙色与深褐"
      ],
      [
        "灰蓝与柔橙",
        "slate-blue shadow tones and soft orange highlights",
        "灰蓝与柔橙"
      ]
    ],
    "detail": [
      [
        "鼻尖亮点",
        "one controlled bright highlight on the tip of the nose",
        "鼻尖亮点"
      ],
      [
        "目光好奇",
        "a small clear catchlight and an inquisitive gaze",
        "目光好奇"
      ],
      [
        "细短毛边",
        "fine short hairs visible along a lit contour",
        "细短毛边"
      ]
    ]
  },
  {
    "fullId": "studio:samples/selective_color_comic_reveal:core",
    "slug": "selective-color-comic-reveal",
    "name": "黑白分镜与局部彩色",
    "colors": [
      "#26252b",
      "#eae4d9",
      "#c94737"
    ],
    "art": {
      "en": "black-and-white comic-like linework and fine halftone marks around one full-color focal area, edged by a jagged tear with visible fibers",
      "zh": "黑白漫画式线条与细腻网点围绕一个全彩焦点区域，边缘为带可见纤维的锯齿裂口"
    },
    "subject": [
      [
        "琥珀色原创旅人",
        "an original adventurer with an amber cloak, face and upper body visible through a paper opening",
        "一位原创冒险者披琥珀色斗篷，脸和上半身透过纸张开口露出"
      ],
      [
        "青蓝原创旅人",
        "an original traveler in a blue rain cape appearing through a paper opening",
        "一位原创旅人穿蓝色雨披，从纸张开口中显现"
      ]
    ],
    "camera": [
      [
        "斜侧上半身",
        "a three-quarter upper-body close-up",
        "斜侧上半身"
      ],
      [
        "低角度半身",
        "a dramatic low-angle half-body view",
        "低角度半身"
      ]
    ],
    "composition": [
      [
        "中央斜向撕口",
        "a diagonal tear opens across the middle, with a single clear focal silhouette inside",
        "一道对角裂口横贯中央，内部有单个清晰焦点剪影"
      ],
      [
        "右侧斜向撕口",
        "one strong diagonal opening on the right with a quieter margin to the left",
        "右侧是一道醒目对角开口，左侧边缘较安静"
      ]
    ],
    "light": [
      [
        "裂边窄暖光",
        "thin warm light along the tear with deep shadow outside it",
        "裂边窄暖光"
      ],
      [
        "裂边冷光",
        "a small cool glow on the torn edge with a subdued surrounding tone",
        "撕裂边缘带小片冷色微光，周围色调低调"
      ]
    ],
    "background": [
      [
        "黑白漫画分镜墙",
        "overlapping black-and-white comic panels with halftone shadows and no readable lettering",
        "黑白漫画分镜交叠，带网点阴影，无可读文字"
      ],
      [
        "灰阶纸页",
        "overlapping neutral-gray printed sheets with abstract halftone patterns",
        "中性灰印刷纸张交叠，带抽象网点图案"
      ]
    ],
    "palette": [
      [
        "灰阶与琥珀焦点",
        "amber and burnt orange concentrated on the focal figure",
        "灰阶与琥珀焦点"
      ],
      [
        "灰阶与青蓝焦点",
        "cyan and cobalt concentrated on the focal figure",
        "灰阶与青蓝焦点"
      ]
    ],
    "detail": [
      [
        "细发光线",
        "a few fine glowing strokes tracing the torn edge",
        "细发光线"
      ],
      [
        "露出撕纸纤维",
        "small pale paper fibers along the torn edge",
        "露出撕纸纤维"
      ],
      [
        "细密网点",
        "subtle halftone dots around the edge of the image",
        "细密网点"
      ]
    ]
  },
  {
    "fullId": "studio:samples/offset_color_sticker_outline:core",
    "slug": "offset-color-sticker-outline",
    "name": "错位彩线贴纸",
    "colors": [
      "#31a6bc",
      "#a6c930",
      "#c83885"
    ],
    "art": {
      "en": "flat opaque figure colors, thick black contours and deliberately offset thin color strokes hugging selected edges over more directional background texture",
      "zh": "人物采用不透明平色、粗黑轮廓，选定边缘紧贴刻意错位的细色线，背景纹理更具方向性"
    },
    "subject": [
      [
        "躺下的原创小旅人",
        "an original round-faced little hiker lying back with arms spread",
        "一位原创圆脸小旅人向后躺，双臂展开"
      ],
      [
        "躺下的原创小动物",
        "an original small round animal resting on its back with paws spread",
        "一只原创圆润小动物仰卧，爪子展开"
      ]
    ],
    "camera": [
      [
        "正上方俯拍",
        "a straight overhead full-body view",
        "正上方俯拍"
      ],
      [
        "斜上方俯拍",
        "a slightly tilted top-down view",
        "斜上方俯拍"
      ]
    ],
    "composition": [
      [
        "小主体斜向置中",
        "one small figure in the central lit area, with a strong diagonal across the frame",
        "一个小主体位于中央亮区，一道醒目对角线横贯画面"
      ],
      [
        "主体偏下斜置",
        "one small diagonal figure below center with open space above",
        "主体偏下斜置"
      ]
    ],
    "light": [
      [
        "斜向日照与树影",
        "a diagonal band of warm sunlight contrasted with deep cool shade",
        "一条对角暖阳光带与深冷阴影形成对比"
      ],
      [
        "柔和树隙光",
        "broken soft sunlight with patchy shaded edges",
        "柔和树隙光"
      ]
    ],
    "background": [
      [
        "斜阳草地",
        "rich green grass with directional strokes, diagonal sunlight, shaded edges and no horizon",
        "浓绿草地带定向笔触、对角阳光和阴影边缘，不出现地平线"
      ],
      [
        "林地碎叶",
        "a textured forest floor of moss and scattered leaves, seen from above",
        "俯视有纹理的森林地表，覆盖苔藓与散落的叶子"
      ]
    ],
    "palette": [
      [
        "青柠与粉青描边",
        "mint, navy and soft yellow on the figure, with cyan and magenta offset accents",
        "人物采用薄荷绿、藏青和柔黄色，带青色与品红错位点缀"
      ],
      [
        "淡杏与电蓝描边",
        "a compact apricot, violet and electric-blue outline palette",
        "淡杏与电蓝描边"
      ]
    ],
    "detail": [
      [
        "彩线紧贴轮廓",
        "thin playful colored strokes just outside the dark outline",
        "彩线紧贴轮廓"
      ],
      [
        "淡色鞋边",
        "a small pale accent at the edge of the footwear",
        "淡色鞋边"
      ],
      [
        "少量短彩线",
        "a few tiny bright dashes near the silhouette",
        "少量短彩线"
      ]
    ]
  },
  {
    "fullId": "studio:samples/minimal_paper_relief:core",
    "slug": "minimal-paper-relief",
    "name": "渐层纸纹与剪影",
    "colors": [
      "#214566",
      "#7ba4bf",
      "#e38b51"
    ],
    "art": {
      "en": "smooth cut-like silhouette edges, very shallow contact shadows and fine paper-like grain, with one warm focus among closely related cool forms",
      "zh": "剪影边缘如平滑切割，接触阴影极浅，带细纸纹；一组相近冷色形体中有一个暖色焦点"
    },
    "subject": [
      [
        "蓝色小鱼群",
        "a school of small blue fish silhouettes with one orange-and-white focal fish",
        "一群蓝色小鱼剪影中，有一条橙白色焦点鱼"
      ],
      [
        "漂浮纸叶",
        "a cluster of small cut-paper leaves with one warm-colored focal leaf",
        "一簇剪纸小叶中，有一片暖色焦点叶"
      ]
    ],
    "camera": [
      [
        "正俯视平面",
        "a direct overhead view with no horizon or perspective distortion",
        "正俯视，无地平线或透视畸变"
      ],
      [
        "轻斜俯视",
        "a slightly oblique overhead view revealing thin paper edges",
        "轻斜俯视"
      ]
    ],
    "composition": [
      [
        "斜向聚集与大片留白",
        "a diagonal cluster toward the lower right with wide negative space to the left",
        "形体向右下方沿对角线聚集，左侧保留大面积留白"
      ],
      [
        "沿边弧形聚集",
        "a loose arc of shapes along one edge with open space in the center",
        "形体沿一侧形成松散弧线，中央留白开放"
      ]
    ],
    "light": [
      [
        "柔和浅层接触影",
        "soft diffuse light casting faint shallow shadows around the cut shapes",
        "柔和漫射光在剪纸形体周围投下浅淡阴影"
      ],
      [
        "偏侧软光",
        "gentle side lighting with delicate paper relief shadows",
        "偏侧软光"
      ]
    ],
    "background": [
      [
        "蓝色渐层纸面",
        "an open finely textured paper field with a pale-blue-to-deep-indigo gradient",
        "开阔细纸纹底面，带淡蓝到深靛蓝渐变"
      ],
      [
        "灰紫渐层纸面",
        "a fine paper field with a muted lavender-to-plum gradient",
        "灰紫渐层纸面"
      ]
    ],
    "palette": [
      [
        "深浅蓝与一点橙",
        "closely related cool silhouettes and a single small warm orange focal accent",
        "相近冷色剪影中，点缀一个小型暖橙焦点"
      ],
      [
        "灰紫与一点浅金",
        "muted violet silhouettes and one small pale-gold accent",
        "灰紫与一点浅金"
      ]
    ],
    "detail": [
      [
        "一枚反向剪影",
        "one small focal shape turned against the flow",
        "一枚反向剪影"
      ],
      [
        "疏密略有变化",
        "slightly uneven gaps between the smallest shapes",
        "疏密略有变化"
      ],
      [
        "细纸边高光",
        "a few delicate pale highlights along selected paper edges",
        "细纸边高光"
      ]
    ]
  },
  {
    "fullId": "studio:samples/dense_rounded_collage:core",
    "slug": "dense-rounded-collage",
    "name": "圆形叠层满版拼贴",
    "colors": [
      "#242b32",
      "#d05765",
      "#61a5a1"
    ],
    "art": {
      "en": "rounded overlapping forms with clean dark contours, soft highlights and saturated local fills, kept readable by scale contrast and clear occlusion",
      "zh": "圆润形体交叠，深色轮廓干净，高光柔和，局部填色饱和，通过尺度对比和清晰遮挡保持可读性"
    },
    "subject": [
      [
        "大脸冒险者",
        "one original round-faced adventurer in a plum jacket and warm ochre cap",
        "一位原创圆脸冒险者，穿梅紫夹克，戴暖赭色帽子"
      ],
      [
        "圆脸小动物",
        "one original round-faced small animal with a bright scarf",
        "圆脸小动物"
      ]
    ],
    "camera": [
      [
        "近距离正视",
        "a frontal medium-close view",
        "近距离正视"
      ],
      [
        "轻微俯拍",
        "a slightly elevated view into the overlapping forms",
        "轻微俯拍"
      ]
    ],
    "composition": [
      [
        "中央大脸与满版小物",
        "a large central face remains readable among much smaller forms reaching all four edges",
        "中央大脸保持清晰，周围更小形体延伸至四边"
      ],
      [
        "偏侧主角与满版层叠",
        "a large offset focal form with dense smaller shapes filling the remaining frame",
        "一个大型偏心焦点形体，其余画面填满密集小形状"
      ]
    ],
    "light": [
      [
        "圆润亮部与叠层阴影",
        "soft rounded highlights and short darker shadows between touching shapes",
        "柔和圆润高光，以及相互接触形体之间的短深阴影"
      ],
      [
        "明亮平光",
        "even bright light with controlled contact shadows",
        "明亮平光"
      ]
    ],
    "background": [
      [
        "满版彩色图形与叶片",
        "a dense field of abstract emblems, foliage and small rounded accessories, without logos or legible text",
        "密集排布抽象徽记、植物和小型圆润饰物，不含标志或可读文字"
      ],
      [
        "满版圆形玩具和花朵",
        "a packed field of rounded toy-like shapes and abstract flowers, with no text",
        "画面挤满圆润玩具形体与抽象花朵，不含文字"
      ]
    ],
    "palette": [
      [
        "莓红与青蓝多色",
        "distributed berry-red, teal, ochre and plum fills over dark seams",
        "莓红、青绿、赭色和梅紫填色分布开来，缝隙为深色"
      ],
      [
        "珊瑚与薄荷多色",
        "coral, mint and sunflower-yellow accents with a dark navy base",
        "珊瑚色、薄荷绿和葵花黄点缀，基底为深藏青"
      ]
    ],
    "detail": [
      [
        "小标记与叠边",
        "a few tiny painted symbols and softly lit overlapping edges",
        "小标记与叠边"
      ],
      [
        "亮色圆点",
        "a handful of small bright dots tucked between the forms",
        "亮色圆点"
      ],
      [
        "细叶片遮挡",
        "a few narrow leaves overlapping nearby rounded forms",
        "细叶片遮挡"
      ]
    ]
  },
  {
    "fullId": "studio:samples/fine_line_flat_streetwear:core",
    "slug": "fine-line-flat-streetwear",
    "name": "细线平涂街装",
    "colors": [
      "#ef8c23",
      "#626e4c",
      "#25352d"
    ],
    "art": {
      "en": "thin slightly irregular contours, mostly flat local color and short directional ink-like strokes concentrated on fur or fabric folds",
      "zh": "轮廓细而略不规则，以平面固有色为主，短促定向墨线集中于毛发或衣料褶皱"
    },
    "subject": [
      [
        "圆镜虎斑猫",
        "an original tabby with round tinted glasses, a rust-colored hood and an olive coat",
        "一只原创虎斑猫，戴圆形有色眼镜、锈红色兜帽和橄榄绿外套"
      ],
      [
        "长耳街装犬",
        "an original droop-eared dog wearing a bright jacket and dark hoodie",
        "一只原创垂耳狗，穿亮色夹克和深色连帽衫"
      ],
      ["短发街装青年", "a short-haired adult with a collared shirt, layered knitwear and silver hair clips", "一位短发成年人，叠穿翻领衬衣与针织外套，戴银色发夹"]
    ],
    "camera": [
      [
        "平视正面半身",
        "a frontal eye-level waist-up portrait",
        "平视正面半身"
      ],
      [
        "低视线街装肖像",
        "a slight low-angle portrait with the jacket clearly visible",
        "低视线街装肖像"
      ],
      ["低机位全身", "a low-angle full-body view with the entire outfit and footwear inside the frame", "低机位全身视角，完整呈现穿搭与鞋履"]
    ],
    "composition": [
      [
        "单主体中央",
        "a single upright centered silhouette with tidy open side margins",
        "单个直立剪影居中，两侧留白整洁"
      ],
      [
        "单主体偏右",
        "one figure just right of center with clear negative space on the left",
        "一个主体略偏中线右侧，左侧留白清晰"
      ]
    ],
    "light": [
      [
        "平光与少量暗面",
        "broad flat light with only narrow shadow patches in folds",
        "平光与少量暗面"
      ],
      [
        "轻微暖侧光",
        "a restrained warm side highlight with simple shadow shapes",
        "轻微暖侧光"
      ]
    ],
    "background": [
      [
        "纯橘色底",
        "a clean flat saffron-orange field",
        "纯橘色底"
      ],
      [
        "天蓝纯色底",
        "a clean flat cyan field",
        "天蓝纯色底"
      ],
      ["白底与简笔地线", "a plain white field with a short pale ground line when the feet are visible", "纯白背景，鞋履入画时以浅色短线提示地面"]
    ],
    "palette": [
      [
        "橄榄绿与赤陶",
        "olive green and terracotta on the figure, with subdued dark edges",
        "人物采用橄榄绿与陶土色，深色边缘克制"
      ],
      [
        "桃红与海军蓝",
        "warm pink clothing against dark navy shapes and small cream marks",
        "暖粉衣物衬托于深藏青形体和小块奶油色标记"
      ],
      ["炭灰与暖色高光", "charcoal shadow blocks with warm peach highlights and small silver accents", "炭灰色阴影块、暖桃色高光与少量银色点缀"],
      ["冷灰、象牙白与珊瑚色", "cool blue-gray shadows, ivory lights and a small coral accent", "冷蓝灰阴影、象牙白亮部与少量珊瑚色点缀"]
    ],
    "detail": [
      [
        "毛流与衣褶细排线",
        "short narrow hatching following fur and a few prominent clothing folds",
        "短细排线沿毛发走向排列，并刻画少量明显衣褶"
      ],
      [
        "织带细纹",
        "small dark ticks along a bag strap or garment seam",
        "织带细纹"
      ],
      [
        "原创小布标",
        "one small unlettered fabric patch",
        "原创小布标"
      ],
      ["针织袖口与格纹下摆", "ribbed cuffs and a few thin check lines on the visible hem", "罗纹袖口和可见衣摆上的几道细格纹"]
    ]
  },
  {
    "fullId": "studio:samples/iris_vignette:core",
    "slug": "iris-vignette",
    "name": "虹膜微景与反光",
    "colors": [
      "#ce7932",
      "#658c60",
      "#243a2c"
    ],
    "art": {
      "en": "layered broken strokes on the warm fur around a sharply defined glossy iris, with miniature shapes held inside the iris and bright reflections over them",
      "zh": "暖色毛发使用层叠断续笔触，环绕清晰光亮的虹膜，虹膜内包含微型图形，其上覆盖明亮反光"
    },
    "subject": [
      [
        "橘猫的眼睛",
        "one eye and part of the face of an orange cat",
        "橘猫的眼睛"
      ],
      [
        "橙褐色小兽的眼睛",
        "one eye and part of the face of a small tawny animal",
        "橙褐色小兽的眼睛"
      ]
    ],
    "camera": [
      [
        "极近单眼特写",
        "an extreme macro close-up of one eye",
        "极近单眼特写"
      ],
      [
        "斜侧单眼特写",
        "a tight three-quarter macro view of one glossy eye",
        "斜侧单眼特写"
      ]
    ],
    "composition": [
      [
        "单眼主导与半脸裁切",
        "one iris fills the central area, the rest of the face partly cropped",
        "一只虹膜填满中央区域，其余脸部被局部裁切"
      ],
      [
        "眼睛偏侧与暗边",
        "one eye slightly offset with dark space along the nearest outer edge",
        "一只眼睛略偏中心，最近的外缘保留深色空间"
      ]
    ],
    "light": [
      [
        "白色眼神光与暖毛边",
        "bright white iris reflections and warm light on nearby fur, fading into surrounding shadow",
        "虹膜带亮白反光，附近毛发受暖光照射，并逐渐没入周围阴影"
      ],
      [
        "窄侧光和短高光",
        "narrow warm edge light and small pointed reflections on the eye",
        "窄暖色轮廓光，以及眼睛上的小点状反射"
      ]
    ],
    "background": [
      [
        "暗色近景边缘",
        "a nearly black field visible only around the close-cropped face",
        "近黑色底仅在紧贴裁切的脸部周围露出"
      ],
      [
        "深绿柔暗底",
        "a dim softly blurred green field along the cropped edge",
        "深绿柔暗底"
      ]
    ],
    "palette": [
      [
        "橘色毛与青绿虹膜",
        "warm orange and cream fur around a deep green iris with a few golden accents",
        "深绿虹膜周围是暖橙与奶油色毛发，带少量金色点缀"
      ],
      [
        "金褐毛与冷蓝虹膜",
        "honey-brown fur around a blue-green iris and small coral accents",
        "蓝绿虹膜周围是蜜棕色毛发，带少量珊瑚色点缀"
      ]
    ],
    "detail": [
      [
        "虹膜里的小鱼",
        "small orange fish shapes and green plant-like marks layered beneath the eye highlights",
        "橙色小鱼形与绿色植物状纹理层叠在眼部高光下方"
      ],
      [
        "虹膜里的细叶",
        "tiny drifting leaf shapes inside the iris",
        "虹膜里的细叶"
      ],
      [
        "虹膜里的亮点",
        "a handful of tiny warm light shapes below the glossy reflections",
        "少量微小暖光形状位于光亮反射下方"
      ]
    ]
  },
  {
    "fullId": "studio:samples/saturated_studio_microtexture:core",
    "slug": "saturated-studio-microtexture",
    "name": "微观材质与高饱和棚拍",
    "colors": ["#f48009", "#ffc225", "#268b7b"],
    "art": {
      "en": "tactile 3D rendering with individually defined pebbled skin scales, visible knit loops, smooth glossy acetate and crisp material separation within softly modeled volumes",
      "zh": "有触感的三维渲染，逐颗刻画颗粒状鳞片和可见的针织线圈，镜架光滑亮泽，柔和的立体明暗下依然能清楚区分不同材质"
    },
    "subject": [
      ["针织围巾变色龙", "a chameleon with oversized sunglasses and a thick knitted scarf", "一只变色龙，戴超大墨镜，围着厚实的针织围巾"],
      ["针织围巾守宫", "a spotted gecko with chunky sunglasses and a rib-knit scarf", "一只带斑点的守宫，戴粗框墨镜，围着罗纹针织围巾"]
    ],
    "camera": [
      ["三分侧脸近景", "a tight three-quarter portrait at eye level", "平视三分侧脸近景"],
      ["正面半身近景", "a front-facing chest-up portrait with the eyes in sharp focus", "正面胸像近景，焦点落在双眼"]
    ],
    "composition": [
      ["头像占满画面", "one large head above overlapping scarf folds, with clean space around the silhouette", "单个大头像位于层叠的围巾褶皱上方，轮廓周围保留干净空间"],
      ["主体偏右留白", "a single figure on the right with broad clean space to the left", "单主体位于画面右侧，左侧保留大片干净留白"]
    ],
    "light": [
      ["暖柔侧光", "a broad warm key from above and to one side, with a clean glint on the frames", "宽阔暖光从斜上方照下，在镜架上留下清楚的亮斑"],
      ["柔光与窄边光", "diffused frontal light with a narrow bright edge along the silhouette", "正面漫射光搭配沿主体轮廓的一道窄亮边"]
    ],
    "background": [
      ["纯橙影棚", "a seamless saturated orange studio backdrop", "无缝的高饱和纯橙色影棚背景"],
      ["纯钴蓝影棚", "a seamless cobalt-blue backdrop with a subtle falloff", "无缝钴蓝影棚背景，亮度略有渐变"]
    ],
    "palette": [
      ["青绿与金黄", "turquoise skin and saturated golden-yellow accessories", "青绿色皮肤搭配饱和的金黄色配饰"],
      ["黄绿与莓红", "yellow-green skin and saturated raspberry-red accessories", "黄绿色皮肤搭配饱和的莓红色配饰"]
    ],
    "detail": [
      ["透镜映出眼睛", "one eye clearly visible through translucent tinted lenses", "一只眼睛透过半透明有色镜片清晰可见"],
      ["围巾外缘纤维", "a few loose fibers catching light along the scarf edge", "围巾边缘几根散开的纤维微微发亮"],
      ["镜框细亮边", "a thin highlight along the curved rims", "弯曲的镜框边缘带一道细高光"]
    ]
  },
  {
    "fullId": "studio:samples/clear_sky_ink_and_color:core",
    "slug": "clear-sky-ink-and-color",
    "name": "晴空线描与旧墙色块",
    "colors": ["#137fa6", "#155069", "#eacb94", "#d56535"],
    "art": {
      "en": "color comic illustration with tapered broken ink lines on fur and masonry, crisp block-shaped shadows and broad fields of flat color with softly painted cloud edges",
      "zh": "彩色漫画插画，用逐渐收细的断续墨线描画毛发与砌墙纹理，搭配轮廓清晰的阴影色块和大面积平涂，云边用柔和笔触过渡"
    },
    "subject": [
      ["系领巾的长毛狗", "a shaggy cream-and-black dog with a bandana tied around its neck, sitting and gazing upward", "一只奶白与黑色相间的长毛狗，颈上系着三角领巾，坐着向上看"],
      ["抬头的虎斑猫", "a scruffy tabby cat sitting alert with its chin raised", "一只毛发蓬乱的虎斑猫，警觉地坐着，微微抬起下巴"]
    ],
    "camera": [
      ["贴近墙沿仰拍", "a low-angle view from just below the ledge", "从墙沿下方近处仰拍"],
      ["斜侧略仰", "a slightly upward three-quarter view with the ledge visible", "略微仰视的斜侧视角，露出墙沿"]
    ],
    "composition": [
      ["左下主体与大片天空", "the subject low on the left, with masonry framing that side and broad open sky above and right", "主体位于左下，墙体沿左侧形成框景，上方与右侧留出大片天空"],
      ["右侧框景与左侧留白", "the subject near the lower right, balanced by an open sky field to the left", "主体位于右下，左侧留出开阔天空"]
    ],
    "light": [
      ["晴天直射与蓝影", "clear sunlight, pale warm lit surfaces and sharply defined blue shadows", "晴天直射光，受光面浅暖，阴影呈边界清晰的蓝色"],
      ["午后斜光", "slanting afternoon sun with distinct shadow shapes under the ledge", "午后斜射日光，墙沿下方形成清晰的阴影块"]
    ],
    "background": [
      ["旧砖墙沿与蓝天", "a chipped turquoise-plaster brick ledge under a saturated blue sky, with sparse clouds at the edges", "高饱和蓝天下，青色灰泥剥落，露出砖墙沿，云朵零星分布在画面边缘"],
      ["旧石窗台与晴空", "a weathered stone sill against clear sky with a few high clouds", "风化的石窗台衬着晴空，远处有几朵高云"]
    ],
    "palette": [
      ["青蓝、奶白与砖红", "cyan-blue surroundings, warm cream highlights and a small brick-red accent", "环境以青蓝为主，配暖奶白高光和少量砖红点缀"],
      ["钴蓝、浅沙色与赭橙", "cobalt blue, pale sand and restrained ochre-orange accents", "钴蓝搭配浅沙色与少量赭橙点缀"]
    ],
    "detail": [
      ["墙沿裂纹与碎毛", "fine cracks along the ledge and stray ink strokes at the fur tips", "墙沿带有细裂纹，毛尖留几笔散开的墨线"],
      ["剥落灰泥", "small chips of plaster exposing rough masonry", "小块灰泥剥落，露出粗糙的砌墙表面"],
      ["耳缘短墨线", "a few short tapered strokes along the lit ear edge", "受光的耳缘带几笔逐渐收细的短墨线"]
    ]
  },
  {
    "fullId": "studio:samples/neon_rim_digital_painting:core",
    "slug": "neon-rim-digital-painting",
    "name": "霓虹边光与半写实厚涂",
    "colors": ["#35164d", "#e948b0", "#a96347", "#d7b5e5"],
    "art": {
      "en": "semi-realistic digital painting with sculpted volumes, directional fur brushwork, angular fabric shadow planes and a sharp colored rim along selected contours",
      "zh": "半写实数字厚涂，体积如雕塑般明确，毛发以有方向的笔触叠出，布料阴影分割成利落的折面，局部轮廓勾出锐利的有色边光"
    },
    "subject": [
      ["倚栏的羊人", "a broad-shouldered anthropomorphic ram in a pale T-shirt, leaning on a railing", "一位宽肩羊人穿浅色 T 恤，双臂倚在栏杆上"],
      ["倚栏的野牛人", "a broad-shouldered anthropomorphic bison in a light streetwear top, leaning on a balustrade", "一位宽肩野牛人穿浅色街装上衣，倚在护栏上"]
    ],
    "camera": [
      ["微仰半身像", "a slight low-angle waist-up portrait", "略微仰视的半身像"],
      ["平视斜侧半身", "an eye-level three-quarter portrait from the waist up", "平视斜侧半身像"]
    ],
    "composition": [
      ["宽肩居中与横栏", "a centered broad silhouette, forearms crossing a horizontal rail, with breathing room above", "宽肩剪影居中，前臂搭在横栏上，头顶留出呼吸空间"],
      ["人像偏侧与暗部留白", "the figure left of center with a quieter open area on the right", "主体位于中线偏左，右侧保留较安静的开放区域"]
    ],
    "light": [
      ["粉紫反打边光", "hot pink backlighting along the shoulders and ears, with violet ambient fill", "亮粉色背光勾勒肩部与耳缘，辅以紫色环境填光"],
      ["珊瑚与冷蓝边光", "a sharp coral rim on one side and cool blue fill on the other", "一侧带鲜明的珊瑚色边光，另一侧补冷蓝光"]
    ],
    "background": [
      ["多层工业连廊", "a dim industrial atrium with curving walkways, metal rails and glowing distant windows", "幽暗的工业中庭，带弧形连廊、金属护栏和远处发亮的窗格"],
      ["夜间天桥", "an elevated walkway at night with dark structural beams and distant illuminated windows", "夜间的高架步道，带暗色结构梁和远处有灯光的窗格"]
    ],
    "palette": [
      ["深紫、亮粉与暖褐", "deep violet shadows, hot pink accents, warm brown fur and pale lavender fabric", "深紫暗部，配亮粉点缀、暖褐毛发和淡紫布料"],
      ["墨蓝、珊瑚与暖灰", "ink-blue shadows with coral accents, warm dark fur and light gray fabric", "墨蓝暗部，配珊瑚色点缀、暖调深毛与浅灰布料"]
    ],
    "detail": [
      ["额上亮面运动镜", "mirrored sports goggles resting on the forehead, with a thin highlight along the frame", "亮面运动护目镜推到额上，镜框边缘带一线高光"],
      ["金属栏杆擦痕", "a few paint scuffs catching the light on the foreground rail", "近处栏杆上的几道漆面擦痕被光照亮"],
      ["袖口折线与毛尖", "crisp sleeve folds and a few stray hairs along the lit arm", "袖口清楚的折线与受光手臂边缘的几缕细毛"]
    ]
  },
  {
    "fullId": "studio:samples/stained_glass_cast_light:core",
    "slug": "stained-glass-cast-light",
    "name": "彩窗透光与碎彩投影",
    "colors": ["#171a23", "#279bcd", "#df552f", "#ffe4a0"],
    "art": {
      "en": "fine anime contours against irregular glass panes divided by dark leading, with saturated transmitted light breaking into colored patches across matte surfaces",
      "zh": "人物以细线勾勒，彩窗由深色嵌条分隔成不规则玻璃片，饱和彩光穿过玻璃，在哑光表面投下碎片状色斑"
    },
    "subject": [
      ["花衣人像", "an adult in a floral robe with small blossoms pinned in their hair", "一位身穿花纹长袍的成年人，发间别着几朵小花"],
      ["植物纹长外套", "an adult in a long coat patterned with leaves and seedpods", "一位身穿长外套的成年人，衣料印有叶片和种荚纹样"]
    ],
    "camera": [
      ["回眸半身", "a three-quarter waist-up portrait looking back over one shoulder", "斜侧半身肖像，人物越过肩头回望"],
      ["平视肩部近景", "an eye-level head-and-shoulders portrait", "平视头肩近景"]
    ],
    "composition": [
      ["圆窗与近景花瓣", "a round window arcs behind the head, with large petals framing the near edge", "圆窗在头后围出一段弧形，近处的大花瓣形成框景"],
      ["侧窗与暗部留白", "the figure beside a window on one side, with deep shaded space opposite", "人物靠近一侧窗户，另一侧保留深色留白"]
    ],
    "light": [
      ["暖色透光与碎彩光斑", "warm backlight through glass, casting broken cyan, red and gold patches across face and fabric", "暖色逆光穿过彩玻璃，在脸和布料上投下不连续的青、红、金色光斑"],
      ["横穿人物的窄光束", "a narrow beam through colored glass crossing the cheek and garment folds", "穿过彩玻璃的窄光束横过脸颊与衣褶"]
    ],
    "background": [
      ["暗室圆形花窗", "a dark interior behind a round floral stained-glass window", "暗色室内，带圆形花卉彩玻璃窗"],
      ["温室拱形彩窗", "an arched stained-glass panel in a shaded conservatory", "背阴温室里的拱形彩玻璃窗"]
    ],
    "palette": [
      ["墨黑、青蓝与金橙", "ink-dark surroundings, turquoise glass, amber and vermilion", "环境近墨黑，玻璃用青蓝、琥珀与朱红"],
      ["靛蓝、翡翠与淡紫", "indigo shadows with emerald and lilac panes", "靛蓝阴影搭配翡翠绿与淡紫色玻璃"]
    ],
    "detail": [
      ["花瓣上的彩色亮片", "small colored light fragments spilling across petal edges", "花瓣边缘散落细碎彩色光斑"],
      ["衣褶间的断光", "projected light breaking at the ridges of fabric folds", "投影在布料褶脊处断开"],
      ["玻璃细纹与嵌条", "subtle ripples in the backlit glass beside dark leading", "逆光玻璃在深色嵌条旁显出轻微波纹"]
    ]
  },
  {
    "fullId": "studio:samples/retro_cel_film_grain:core",
    "slug": "retro-cel-film-grain",
    "name": "复古赛璐璐与胶片颗粒",
    "colors": ["#141e2c", "#354c80", "#ea4a44", "#dbcedd"],
    "art": {
      "en": "retro cel-animation look with hand-inked contours, broad opaque fills and single-step shadow blocks, softened slightly by fine even film grain and gentle highlight bloom",
      "zh": "复古赛璐璐动画感，保留手绘墨线、大面积不透明平涂和单阶阴影色块，叠加均匀细密的胶片颗粒与轻微高光晕染"
    },
    "subject": [
      ["深色短发赛车手", "a dark-haired adult race driver in a graphic suit with goggles on the forehead", "一位深色短发成年赛车手，穿带色块图案的赛车服，护目镜推到额上"],
      ["复古测试飞行员", "an adult test pilot in a high-collar jacket with vintage flight goggles", "一位成年试飞员，穿高领夹克，配复古飞行护目镜"]
    ],
    "camera": [
      ["斜侧胸像", "a tight three-quarter chest-up portrait", "紧凑的斜侧胸像"],
      ["正面头肩近景", "a direct head-and-shoulders view at eye level", "平视正面头肩近景"]
    ],
    "composition": [
      ["眼睛居中与斜向色块", "the eyes near the center, framed by bold diagonals from gear and collar", "双眼接近中央，由配件与衣领形成醒目的斜向色块"],
      ["人物居右与暗色留白", "the portrait pushed to the right with open dark space to the left", "人像位于右侧，左侧留出暗色空间"]
    ],
    "light": [
      ["暗场冷蓝反光", "low light with broad blue reflections and a soft warm cast across the face", "暗光下有宽阔的蓝色反光，面部略带柔和暖色"],
      ["暖色掠光", "warm grazing light with a clearly bounded shadow on the far side", "暖光掠过形体，背光侧留下边界清楚的阴影"]
    ],
    "background": [
      ["深蓝暗底", "a deep blue-black backdrop with a few distant specks of light", "深蓝黑背景上带几处遥远的微光"],
      ["暗场维修间", "a dim service bay reduced to soft rectilinear shapes", "昏暗维修间简化为几块柔和的矩形"]
    ],
    "palette": [
      ["朱红、冷白与深蓝", "vermilion and cool white against midnight blue, with warm rose skin tones", "朱红与冷白搭配午夜蓝，肤色偏暖玫瑰色"],
      ["麦黄、灰蓝与炭黑", "muted wheat yellow, slate blue and charcoal", "低饱和麦黄、灰蓝与炭黑"]
    ],
    "detail": [
      ["镜片蓝色宽反光", "a broad blue reflection across the dark goggle lens", "深色护目镜片上横过一片宽阔的蓝色反光"],
      ["衣领拼色", "a clean contrast stripe following the collar", "沿衣领边缘保留一道清楚的对比色条"],
      ["稀疏发丝亮线", "a few painted highlight strokes outlining the dark hair", "深色头发边缘留几笔稀疏的手绘亮线"]
    ]
  },
  {
    "fullId": "studio:samples/daylight_lens_reflections:core",
    "slug": "daylight-lens-reflections",
    "name": "晴日高光与镜片映色",
    "colors": ["#62c4dd", "#dd9b51", "#f3c7a3", "#f2d52d"],
    "art": {
      "en": "fine sweeping linework, sharply bounded light shapes over softly shaded skin and layered reflections on tinted eyewear that leave the eyes visible",
      "zh": "以细长流畅的线条勾形，在柔和肤色明暗上叠加硬边高光，有色镜片叠映环境，同时让眼睛透在反光下"
    },
    "subject": [
      ["花丛旁的圆镜人像", "an adult in round tinted sunglasses and a striped shirt, with loose strands escaping a bun", "一位成年人戴圆框有色墨镜、穿条纹衬衣，几缕碎发从发髻散出"],
      ["护目镜与机能夹克", "a short-haired adult in wraparound tinted goggles and a glossy technical jacket", "一位短发成年人戴环绕式有色护目镜，穿带光泽的机能夹克"]
    ],
    "camera": [
      ["微仰侧脸近景", "a tight three-quarter facial close-up from just below eye level", "略低于视线的斜侧脸部特写"],
      ["斜侧贴近镜片", "a tight side portrait with the nearest lens sharply in focus", "贴近脸侧拍摄，近处镜片清晰对焦"]
    ],
    "composition": [
      ["眼镜居中与前景点色", "eyewear near the center, with small out-of-focus color shapes along the near edge", "眼镜位于中央附近，近景边缘留少量虚焦色块"],
      ["对角脸部与硬边轮廓", "the face follows a diagonal, overlapped by one crisp foreground shape", "面部沿对角线排布，近处有一道清晰的形状与之交叠"]
    ],
    "light": [
      ["晴天暖光与利落亮斑", "warm direct daylight with crisp highlights splitting into narrow strands across the hair", "暖日照在头发上分成一束束边缘利落的高光"],
      ["冷蓝硬光与窄反光", "hard cool light with narrow specular bands on eyewear and glossy surfaces", "冷色硬光在眼镜和亮面材质上形成窄条反光"]
    ],
    "background": [
      ["遮阳篷与蓝天", "a pale awning against clear cyan sky, with blurred flowers low in frame", "淡色遮阳篷衬着澄澈青蓝天空，画面下方是虚化花朵"],
      ["纯钴蓝底", "a flat saturated cobalt field around the silhouette", "高饱和钴蓝纯色背景衬出人物轮廓"]
    ],
    "palette": [
      ["青蓝、暖杏与花黄", "cyan reflections, warm apricot skin tones and petal-yellow accents", "青蓝反光、暖杏色肤色与花瓣黄点缀"],
      ["钴蓝、琥珀与蓝黑", "cobalt blue and blue-black with warm amber as a small focal accent", "钴蓝与蓝黑为主，少量暖琥珀色作为视觉焦点"]
    ],
    "detail": [
      ["镜片叠映花丛", "small flower reflections on the lens with the iris still visible beneath them", "小朵花形倒映在镜片上，虹膜仍透在倒影下"],
      ["光带映过镜片", "a slender reflected light band crossing the lens without obscuring the eye", "一道细长反光横过镜片，眼睛依然可见"],
      ["亮面衣褶与金属边", "a hard reflection tracing a glossy fold or a brushed metal edge", "硬朗的反光沿着亮面褶皱或拉丝金属边缘延伸"]
    ]
  }
];
