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

export interface StyleOption {
  value: string;
  /** 中文對照：介面顯示用，實際 prompt 仍使用 value（英文）。 */
  label?: string;
  provides?: string[];
  requires?: string[];
  unconstrained?: boolean;
}

export interface StyleVariable {
  /** 中文對照變量名，顯示用。 */
  label?: string;
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
  };
}

export interface PresetTestResult {
  name: string;
  passed: boolean;
  failures: string[];
  prompt: string;
}

export interface StylePreset {
  schema_version: 2;
  id: string;
  name: string;
  english: string;
  description: string;
  is_builtin: boolean;
  template: TemplateBlock[];
  variables: Record<string, StyleVariable>;
  tests: PresetTest[];
  randomize_variables: boolean;
  aspect_ratio: string;
}

export type StyleField = "name" | "description" | "aspect_ratio";

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
  resolvedVariables: ResolvedPromptVariable[];
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
