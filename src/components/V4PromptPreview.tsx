import { useEffect, useState } from "react";
import { Check, Copy, Shuffle } from "lucide-react";
import { renderPromptParts, type PromptLanguage, type PromptLocks, type Result } from "../v4/engine";

interface Props {
  preview: Result | null;
  active: string;
  locks: PromptLocks;
  variablePickerId: string;
  outputLanguage: PromptLanguage;
  onEdit: (key: string) => void;
  onReroll: () => void;
  fixedArtStyle?: boolean;
  requiresStyle?: boolean;
}

export function V4PromptPreview({ preview, active, locks, variablePickerId, outputLanguage, onEdit, onReroll, fixedArtStyle, requiresStyle }: Props) {
  const [language, setLanguage] = useState<PromptLanguage>("zh");
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const emptyPrompt = requiresStyle ? "选定上方画风后即可预览 Prompt。" : "抽取后在这里查看 Prompt。";
  const outputLanguageLabel = outputLanguage === "zh" ? "中文" : "英文";
  const copyText = preview ? preview.prompts[outputLanguage] ?? preview.prompt : "";

  useEffect(() => setCopyStatus("idle"), [copyText, outputLanguage]);

  const copyPrompt = async () => {
    if (!copyText) return;
    try {
      await navigator.clipboard.writeText(copyText);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
  };

  return (
    <div className="live-prompt-panel">
      <div className="live-prompt-language">
        <div className="prompt-language-options" role="group" aria-label="预览语言">
          <button className="btn ghost-button prompt-language-toggle" type="button" aria-pressed={language === "zh"} onClick={() => setLanguage("zh")}>中文</button>
          <button className="btn ghost-button prompt-language-toggle" type="button" aria-pressed={language === "en"} onClick={() => setLanguage("en")}>英文</button>
        </div>
        <div className="prompt-preview-actions">
          <button className="btn ghost-button prompt-preview-action" type="button" disabled={!copyText} onClick={() => { void copyPrompt(); }}
            title={`复制实际出图使用的${outputLanguageLabel} Prompt`}>
            {copyStatus === "copied" ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            <span aria-live="polite">{copyStatus === "copied" ? "已复制" : copyStatus === "error" ? "复制失败" : `复制${outputLanguageLabel}`}</span>
          </button>
          <button className="btn ghost-button prompt-preview-action" type="button" disabled={requiresStyle} onClick={onReroll}
            title={fixedArtStyle ? "只重抽细节，保留画面和手动设置" : "保留已固定的变量，重新抽取随机项"}>
            <Shuffle size={14} aria-hidden="true" /> {preview ? "换一组" : "抽取预览"}
          </button>
        </div>
      </div>
      <div className="live-prompt-text" lang={preview && language === "en" ? "en" : "zh-CN"}>
        {!preview ? emptyPrompt : renderPromptParts(preview, language).map(({ text, variable, title }, index) => (
          variable && !(fixedArtStyle && variable === "style.ART_STYLE") ? (
            <a
              className={"prompt-token" + (variable in locks ? " is-manual" : "") + (active === variable ? " is-active" : "")}
              key={index}
              href={`#${variablePickerId}`}
              title={title}
              aria-current={active === variable ? "true" : undefined}
              onClick={(event) => {
                event.preventDefault();
                onEdit(variable);
              }}
            >{text}</a>
          ) : <span key={index}>{text}</span>
        ))}
      </div>
      {preview && <p className="live-prompt-omitted">点击高亮词编辑变量。</p>}
    </div>
  );
}
