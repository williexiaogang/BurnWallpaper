import { useEffect, useRef, useState } from "react";
import { Check, Zap } from "lucide-react";
import { backend, isTauri, type GenerationError } from "../backend";
import { logError } from "../utils/logger";
import { platformCopy } from "../utils/platform";
import { disable as autostartDisable, enable as autostartEnable, isEnabled as autostartIsEnabled } from "@tauri-apps/plugin-autostart";

interface OnboardingProps {
  bootAutoGenerate: boolean;
  onToggleBootAutoGenerate: (enabled: boolean) => void;
  /** 立即用默认风格随机出一张（不自动上墙，走正常流程） */
  onGenerate: () => void;
  onFinish: () => void;
  onToast: (text: string, detail?: string, error?: boolean) => void;
}

const STEP_TITLES = ["接上电源", "开机即燃", "开打"];

export function Onboarding({ bootAutoGenerate, onToggleBootAutoGenerate, onGenerate, onFinish, onToast }: OnboardingProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState(0);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [launch, setLaunch] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);

  useEffect(() => {
    if (!isTauri) return;
    autostartIsEnabled()
      .then(setLaunch)
      .catch((error) => logError("onboarding", "读取开机启动状态失败", String(error)));
  }, []);

  const saveAndTest = async () => {
    const key = apiKey.trim();
    if (!key || saving) return;
    setSaving(true);
    setConnected(null);
    try {
      await backend.saveApiKey(key);
      await backend.testConnection();
      setConnected(true);
      onToast("Key 已存进系统凭据");
    } catch (error) {
      const message = (error as GenerationError)?.message ?? String(error);
      logError("onboarding", "保存或测试 Key 失败", message);
      setConnected(false);
      onToast("连不上", message, true);
    } finally {
      setSaving(false);
    }
  };

  const toggleLaunch = async (checked: boolean) => {
    setLaunch(checked);
    try {
      if (checked) await autostartEnable();
      else await autostartDisable();
      onToast(checked ? "开机启动已开启" : "开机启动已关闭");
    } catch (error) {
      setLaunch(!checked);
      logError("onboarding", "设置开机启动失败", String(error));
      onToast("设置开机启动失败", String(error), true);
    }
  };

  const finish = () => {
    onFinish();
  };

  const generateAndFinish = () => {
    setGenerating(true);
    onGenerate();
    onFinish();
  };

  return (
    <dialog
      className="modal preset-dialog onboarding-dialog"
      ref={dialog}
      onCancel={(event) => {
        // ESC = 跳过引导，直接进入主场
        event.preventDefault();
        finish();
      }}
      aria-labelledby="onboarding-title"
    >
      <div className="modal-box onboarding-box">
        <div className="onboarding-head">
          <span className="onboarding-issue">入门</span>
          <div className="onboarding-steps" aria-label="引导进度">
            {STEP_TITLES.map((title, index) => (
              <span key={title} className={`onboarding-step${index === step ? " is-current" : ""}${index < step ? " is-done" : ""}`}>
                <i>{String(index + 1).padStart(2, "0")}</i>{title}
              </span>
            ))}
          </div>
        </div>
        {step === 0 && (
          <div className="onboarding-panel">
            <h2 id="onboarding-title">接上电源</h2>
            <p className="prompt-intro">没有 Key 就出不了图。去 RunComfy 领一个，贴在这里，剩下的交给我。</p>
            <div className="key-field onboarding-key">
              <input
                className="input"
                aria-label="API Key"
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="粘贴你的 RunComfy API Key"
                autoComplete="off"
              />
            </div>
            {connected === true && <span className="connection-status is-connected"><i /> 已接上</span>}
            {connected === false && <span className="connection-status is-failed"><i /> 这个 Key 连不上</span>}
            <div className="dialog-actions">
              <button className="btn ghost-button" onClick={() => setStep(1)}>没 Key，先跳过</button>
              <button className="btn primary-button" onClick={() => { void saveAndTest(); }} disabled={!apiKey.trim() || saving}>
                {saving ? "试探中…" : "保存并测试"}
              </button>
            </div>
            {connected === true && (
              <div className="dialog-actions">
                <button className="btn primary-button" onClick={() => setStep(1)}><Check size={16} /> 下一步</button>
              </div>
            )}
          </div>
        )}
        {step === 1 && (
          <div className="onboarding-panel">
            <h2>开机即燃</h2>
            <p className="prompt-intro">{platformCopy.loginIntro}</p>
            <div className="onboarding-toggles">
              <label className="onboarding-toggle">
                <div><span className="setting-label">开机启动</span><small>{platformCopy.loginHint}</small></div>
                <input className="toggle" type="checkbox" checked={launch} onChange={(event) => { void toggleLaunch(event.target.checked); }} aria-label="开机启动" />
              </label>
              <label className="onboarding-toggle">
                <div><span className="setting-label">开机自动来一张</span><small>启动后自动出新图并上墙，失败保留上一张</small></div>
                <input className="toggle" type="checkbox" checked={bootAutoGenerate} onChange={(event) => onToggleBootAutoGenerate(event.target.checked)} aria-label="开机自动来一张" />
              </label>
            </div>
            <div className="dialog-actions">
              <button className="btn ghost-button" onClick={() => setStep(0)}>上一步</button>
              <button className="btn primary-button" onClick={() => setStep(2)}>下一步</button>
            </div>
          </div>
        )}
        {step === 2 && (
          <div className="onboarding-panel">
            <h2>开打</h2>
            <p className="prompt-intro">电源接好了。现在就来一张，还是先进主场逛逛？</p>
            <div className="dialog-actions">
              <button className="btn ghost-button" onClick={finish}>进入主场</button>
              <button className="btn primary-button" onClick={generateAndFinish} disabled={generating}>
                <Zap size={16} /> {generating ? "发招了" : "来一张！"}
              </button>
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
}
