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

/**
 * 变量作用域约束：让构图变量（如 FRAMING）决定其他变量（姿势/服装/表情）的可用范围，
 * 避免「面部特写 + 展示球鞋姿势」这类冲突组合。
 *
 * 区域是语义标签（face / torso / legs），只在这套规则内部比对，不与其他系统耦合。
 */
export interface ScopeRules {
  /** 主变量名（如 FRAMING）：它的取值决定画面可见范围。 */
  master: string;
  /** 主变量选项 → 可见区域。未列出的选项视为全身可见（不构成约束）。 */
  visible?: Record<string, string[]>;
  /** 变量级默认需求：该变量的所有选项默认要求这些区域可见（如 EXPRESSION → face）。 */
  variable_requires?: Record<string, string[]>;
  /** 选项级需求，覆盖变量级默认（如 POSE 的「抬脚展示球鞋」→ legs）。两者都未标注的选项与任何构图兼容。 */
  option_requires?: Record<string, Record<string, string[]>>;
}

/**
 * 通用标签约束（scope_rules 的泛化）：任意变量/选项可「提供」标签或「需要」标签，
 * 引擎只比对标签集合，不理解标签语义——face / torso / legs 或 cold / hot 都只是字符串。
 * 新增变量、新增约束维度时只改 JSON 数据，程序无需改动。
 */
export interface TagRules {
  /** 提供者变量（按此顺序先解析，其选中值供给标签）。 */
  resolve_order?: string[];
  /** 变量 → 选项 → 提供的标签。提供者变量建议覆盖全部选项（未标注的选项不提供标签）。 */
  provides?: Record<string, Record<string, string[]>>;
  /** 变量级默认需求：该变量的所有选项都需要这些标签。 */
  variable_requires?: Record<string, string[]>;
  /** 选项级需求，覆盖变量级默认。两者都未标注的选项不构成约束。 */
  option_requires?: Record<string, Record<string, string[]>>;
}

export interface StylePreset {
  id: string;
  name: string;
  english: string;
  description: string;
  is_builtin: boolean;
  prompt_template: string;
  variables: Record<string, string[]>;
  optional_variables?: Record<string, number>;
  tag_rules?: TagRules;
  /** 旧版单主变量格式，导入旧导出文件时兼容；新预设请用 tag_rules。 */
  scope_rules?: ScopeRules;
  randomize_variables: boolean;
  aspect_ratio: string;
}

export type StyleField = "name" | "description" | "prompt_template" | "aspect_ratio";

/** 單個變量在本次解析中實際填入的值（供確認框高亮顯示）。 */
export interface ResolvedPromptVariable {
  variable: string;
  value: string;
  source: "manual" | "random";
}

export interface PendingPrompt {
  prompt: string;
  styleName: string;
  styleId: string;
  description: string;
  selections: Record<string, string>;
  modelId: string;
  aspectRatio: string;
  resolution: string;
  modelName: string;
  /** 本次實際展開的變量值（非空）；free 風格為空數組。 */
  resolvedVariables: ResolvedPromptVariable[];
  /** 本次被省略的變量名（作用域衝突 / 概率跳過 / 自動省略）。 */
  omittedVariables: string[];
}

/** 確認對話框裡可調整的出圖設置（草稿態，確認後生效並同步全局）。 */
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
