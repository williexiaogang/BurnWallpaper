export type View = "now" | "favorites" | "studio" | "styles" | "history" | "settings";

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
  prompt?: string;
  originalImage?: string;
  /** Absolute path on disk for backend-generated wallpapers. */
  localPath?: string;
  resolution: string;
  subject: string;
  tone: "暖色" | "原色" | "冷色";
  light: "明亮" | "暗色";
  ratio: "wide" | "standard" | "portrait";
}

export interface PendingPrompt extends PromptSubmitSettings {
  prompt: string;
  styleName: string;
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

