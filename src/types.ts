export type View = "now" | "favorites" | "styles" | "rotation" | "history" | "settings";

export interface Wallpaper {
  id: string;
  styleId: string;
  accent: string;
  titleColor: string;
  issue: string;
  title: string;
  english: string;
  tags: string[];
  image: string;
  originalImage?: string;
  /** Absolute path on disk for backend-generated wallpapers. */
  localPath?: string;
  resolution: string;
  subject: string;
  tone: "暖色" | "原色" | "冷色";
  light: "明亮" | "暗色";
  ratio: "wide" | "standard" | "portrait";
}

/** 變量語義分層，由 JSON 宣告，UI 依此分組；不寫則歸入未分組。 */
export type VariableGroup = "content" | "style" | "presentation";
export type StyleCategory = "photography" | "anime" | "illustration" | "graphic" | "three_d" | "experimental";
export type PackKind = "content" | "style";
export type ContentType = "anthropomorphic" | "human" | "abstract";

export interface StyleOption {
  value: string;
  /** 中文對照：介面顯示用，實際 prompt 仍使用 value（英文）。 */
  label?: string;
  provides?: string[];
  requires?: string[];
  /** 命中任一標籤即可相容；與 requires 的「全部命中」互補。 */
  any_of?: string[];
  /** provided 中出現任一標籤時，此選項被過濾掉。 */
  excludes?: string[];
  /** 隨機抽取權重，預設 1；僅在隨機模式下生效。 */
  weight?: number;
  /** 畫風選項在 UI 中的分類。 */
  category?: StyleCategory;
  /** 限制此選項可搭配的內容類型；未設定則不限。 */
  content_types?: ContentType[];
  unconstrained?: boolean;
}

export interface StyleVariable {
  /** 中文對照變量名，顯示用。 */
  label?: string;
  /** 語義分層：content 畫什麼、style 怎麼畫、presentation 怎麼擺。 */
  group?: VariableGroup;
  provider?: boolean;
  requires?: string[];
  probability?: number;
  options: StyleOption[];
}

export interface TemplateBlock {
  text: string;
  if?: string;
}

export interface PresetTest {
  name: string;
  select: Record<string, string>;
  random?: number;
  expect: {
    include?: string[];
    omit?: string[];
    /** 變量必須解析為指定值。 */
    values?: Record<string, string>;
    /** 最終 prompt 必須包含的子串（不分大小寫）。 */
    prompt_contains?: string[];
    /** 最終 prompt 不得包含的子串（不分大小寫）。 */
    prompt_excludes?: string[];
    /** 依 group 檢查變量的解析值，用於「內容層禁材質詞」等分層約束。 */
    group_excludes?: { group: VariableGroup; words: string[] }[];
  };
  /** 對比測試：把 vary 變量換成 with 值後，stable 變量的解析值必須不變。 */
  compare?: { vary: string; with: string; stable: string[] };
}

export interface PresetTestResult {
  name: string;
  passed: boolean;
  failures: string[];
  prompt: string;
}

interface BasePack {
  schema_version: 3;
  kind: PackKind;
  id: string;
  name: string;
  english: string;
  description: string;
  is_builtin: boolean;
  template: TemplateBlock[];
  variables: Record<string, StyleVariable>;
  tests: PresetTest[];
  randomize_variables: boolean;
}

export interface ContentPack extends BasePack {
  kind: "content";
  content_type: ContentType;
  aspect_ratio: string;
  preferred_style_ids?: string[];
}

export interface StylePack extends BasePack {
  kind: "style";
  supported_content_types: ContentType[];
}

export type StylePreset = ContentPack | StylePack;

export interface PresetBundle {
  schema_version: 3;
  kind: "bundle";
  content: ContentPack;
  style: StylePack;
}

export type StyleField = "name" | "description" | "aspect_ratio";

/** 單個變量在本次解析中實際填入的值（供預覽高亮顯示）。 */
export interface ResolvedPromptVariable {
  variable: string;
  value: string;
  /** 中文預覽對照；提交時始終使用 value。 */
  label?: string;
  source: "manual" | "random";
}

export interface PendingPrompt {
  prompt: string;
  styleName: string;
  modelId: string;
  aspectRatio: string;
  resolution: string;
  modelName: string;
}

/** 本次送出沿用的出圖設置，確認後同步為全局默認。 */
export interface PromptSubmitSettings {
  modelId: string;
  modelName: string;
  aspectRatio: string;
  resolution: string;
}

export interface ToastMessage {
  id: number;
  text: string;
  detail?: string;
  error?: boolean;
}

export interface GenerationProgress {
  requestId: string;
  label: string;
  state: string;
  startedAt: number;
}
