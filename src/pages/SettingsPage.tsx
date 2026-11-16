import { useEffect, useState, type ReactNode } from "react";
import { Check, ClipboardCopy, Eye, EyeOff, FolderOpen, RefreshCw, Trash2 } from "lucide-react";
import { modelOptions } from "../data";
import type { StylePreset } from "../types";
import { backend, isTauri, type GenerationError, type StorageDirInfo } from "../backend";
import { CUTOUT_MODELS, cutoutModelInfo, type CutoutModel } from "../utils/cutout-models";
import { copyLogs, logError } from "../utils/logger";
import { disable as autostartDisable, enable as autostartEnable, isEnabled as autostartIsEnabled } from "@tauri-apps/plugin-autostart";

function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="settings-section"><h2>{title}</h2><div className="settings-rows">{children}</div></section>;
}

function SettingRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <div className="setting-row"><div><span className="setting-label">{label}</span>{hint && <small>{hint}</small>}</div><div className="setting-control">{children}</div></div>;
}

interface SettingsPageProps {
  presets: StylePreset[];
  model: string;
  aspectRatio: string;
  resolution: string;
  cutoutEnabled: boolean;
  cutoutModel: string;
  cutoutDownloaded: Set<string>;
  cutoutSettingsLoaded: boolean;
  cutoutDownloadRequest: string | null;
  cutoutDownloading: string | null;
  onModelChange: (model: string) => void;
  onAspectRatioChange: (ratio: string) => void;
  onResolutionChange: (resolution: string) => void;
  onManageStyles: () => void;
  onToggleCutout: (enabled: boolean) => void;
  onCutoutModelChange: (model: string) => void;
  onConfirmCutoutDownload: () => void;
  onCancelCutoutDownload: () => void;
  onToast: (text: string, detail?: string, error?: boolean) => void;
}

export function SettingsPage({ presets, model, aspectRatio, resolution, cutoutEnabled, cutoutModel, cutoutDownloaded, cutoutSettingsLoaded, cutoutDownloadRequest, cutoutDownloading, onModelChange, onAspectRatioChange, onResolutionChange, onManageStyles, onToggleCutout, onCutoutModelChange, onConfirmCutoutDownload, onCancelCutoutDownload, onToast }: SettingsPageProps) {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [keySaved, setKeySaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connected, setConnected] = useState<null | boolean>(null);
  const [connDetail, setConnDetail] = useState("");
  const [balanceUsd, setBalanceUsd] = useState<number | null>(null);
  const [defaultStyle, setDefaultStyle] = useState(presets[0].id);
  const [autoUpscale, setAutoUpscale] = useState(true);
  const [storage, setStorage] = useState<StorageDirInfo | null>(null);
  const [launch, setLaunch] = useState(false);
  const [tray, setTray] = useState(true);
  const selectedModel = modelOptions.find((option) => option.id === model) ?? modelOptions[0];

  useEffect(() => {
    if (!isTauri) return;
    backend.hasApiKey()
      .then(async (saved) => {
        setKeySaved(saved);
        if (!saved) return;
        // 已有 Key 時靜默拉一次餘額，順便驗證 Key 仍有效
        try {
          const balance = await backend.testConnection();
          setConnected(true);
          setBalanceUsd(balance.balanceUsd);
        } catch {
          setConnected(null);
        }
      })
      .catch(() => {});
    backend.getStorageDir()
      .then((info) => setStorage(info))
      .catch((error) => logError("settings", "读取存储位置失败", String(error)));
    if (isTauri) {
      autostartIsEnabled()
        .then((enabled) => setLaunch(enabled))
        .catch((error) => logError("settings", "读取开机启动状态失败", String(error)));
    }
  }, []);

  const saveKey = async () => {
    const key = apiKey.trim();
    if (!key) return;
    try {
      await backend.saveApiKey(key);
      setKeySaved(true);
      setApiKey("");
      setConnected(null);
      onToast("Key 已存进系统凭据");
    } catch (error) {
      logError("settings", "保存 Key 失败", String(error));
      onToast("存 Key 失败", String(error), true);
    }
  };

  const removeKey = async () => {
    try {
      await backend.deleteApiKey();
      setKeySaved(false);
      setConnected(null);
      setConnDetail("");
      onToast("Key 已移除");
    } catch (error) {
      logError("settings", "移除 Key 失败", String(error));
      onToast("移除 Key 失败", String(error), true);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setConnected(null);
    try {
      const balance = await backend.testConnection();
      setConnected(true);
      setConnDetail("");
      setBalanceUsd(balance.balanceUsd);
    } catch (error) {
      const message = (error as GenerationError)?.message ?? String(error);
      logError("settings", "测试连接失败", message);
      setConnected(false);
      setConnDetail(message);
      onToast("连不上", message, true);
    } finally {
      setTesting(false);
    }
  };

  const pickStorage = async () => {
    try {
      const previous = storage?.path;
      const info = await backend.pickStorageDir();
      setStorage(info);
      if (info.path === previous) {
        onToast("未更改存储位置");
      } else {
        onToast("存储位置已更新", info.path);
      }
    } catch (error) {
      logError("settings", "选择存储位置失败", String(error));
      onToast("选择目录失败", String(error), true);
    }
  };

  const resetStorage = async () => {
    try {
      const info = await backend.resetStorageDir();
      setStorage(info);
      onToast("已恢复默认存储位置", info.path);
    } catch (error) {
      logError("settings", "恢复默认存储位置失败", String(error));
      onToast("恢复默认失败", String(error), true);
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
      logError("settings", "设置开机启动失败", String(error));
      onToast("设置开机启动失败", String(error), true);
    }
  };

  return (
    <main id="main-content" className="settings-page page-enter">
      <div className="page-heading"><div><h1>设置</h1><p>接上图源，调好你的主场。</p></div><span className="prototype-badge">核心服务版</span></div>
      <div className="settings-layout">
        <SettingsSection title="SOURCE 图源">
          <SettingRow label="服务商"><select className="select" aria-label="服务商"><option>RunComfy</option></select></SettingRow>
          <SettingRow label="模型" hint={`支持 ${selectedModel.resolutions.join(" / ")}`}>
            <select className="select" aria-label="模型" value={model} onChange={(event) => onModelChange(event.target.value)}>{modelOptions.map((option) => <option value={option.id} key={option.id}>{option.name}</option>)}</select>
          </SettingRow>
          <SettingRow label="画面比例" hint={`此模型提供 ${selectedModel.ratios.length} 种比例`}>
            <select className="select" aria-label="画面比例" value={aspectRatio} onChange={(event) => onAspectRatioChange(event.target.value)}>{selectedModel.ratios.map((ratio) => <option value={ratio} key={ratio}>{ratio}</option>)}</select>
          </SettingRow>
          <SettingRow label="输出分辨率" hint="选项随模型切换">
            <select className="select" aria-label="输出分辨率" value={resolution} onChange={(event) => onResolutionChange(event.target.value)}>{selectedModel.resolutions.map((item) => <option value={item} key={item}>{item}</option>)}</select>
          </SettingRow>
          <SettingRow label="API Key" hint={keySaved ? "已存入 Windows 凭据管理器" : "输入后保存进系统凭据"}>
            <div className="key-field"><input className="input" aria-label="API Key" type={showKey ? "text" : "password"} value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={keySaved ? "已保存，输入可覆盖" : "输入你的 Key"} autoComplete="off" /><button aria-label={showKey ? "隐藏 API Key" : "显示 API Key"} onClick={() => setShowKey((value) => !value)}>{showKey ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
          </SettingRow>
          <SettingRow label="Key 操作">
            <div className="action-row">
              <button className="btn ghost-button" onClick={() => { void saveKey(); }} disabled={!apiKey.trim()}><Check size={16} /> 保存到系统</button>
              {keySaved && <button className="btn ghost-button" onClick={() => { void removeKey(); }}><Trash2 size={16} /> 移除</button>}
            </div>
          </SettingRow>
          <SettingRow label="连接状态">
            {connected === null
              ? <span className="connection-status"><i /> {keySaved ? "还没测试" : "尚未存 Key"}</span>
              : connected
                ? <span className="connection-status is-connected"><i /> 已接上</span>
                : <span className="connection-status is-failed"><i /> 连不上 · {connDetail}</span>}
          </SettingRow>
          <SettingRow label="账户余额" hint="所有 RunComfy 产品共用">
            <span className="setting-data">{balanceUsd === null ? "—" : `$${balanceUsd.toFixed(2)}`}</span>
          </SettingRow>
          <SettingRow label="测试连接" hint="用已保存的 Key 探一下">
            <button className="btn ghost-button" onClick={() => { void testConnection(); }} disabled={testing || !keySaved}>{testing ? "试探中…" : "测试连接"}</button>
          </SettingRow>
        </SettingsSection>
        <SettingsSection title="STYLE 画风">
          <SettingRow label="默认风格"><select className="select" aria-label="默认风格" value={defaultStyle} onChange={(event) => setDefaultStyle(event.target.value)}>{presets.map((preset) => <option value={preset.id} key={preset.id}>{preset.name}</option>)}</select></SettingRow>
          <SettingRow label="风格内容" hint="每个标签分别设置"><button className="btn ghost-button" onClick={onManageStyles}>管理风格</button></SettingRow>
        </SettingsSection>
        <SettingsSection title="DISPLAY 显示">
          <SettingRow label="多显示器"><select className="select" aria-label="多显示器"><option>每屏一张</option><option>跨屏连续</option></select></SettingRow>
          <SettingRow label="分辨率"><select className="select" aria-label="分辨率"><option>跟随显示器</option><option>3840×2160</option><option>2560×1440</option></select></SettingRow>
          <SettingRow label="自动放大" hint="不足原生分辨率时补足"><input className="toggle" type="checkbox" checked={autoUpscale} onChange={(event) => setAutoUpscale(event.target.checked)} aria-label="自动放大" /></SettingRow>
          <SettingRow label="人物抠像" hint="标题与 TAG 压到人物后面，更有层次"><input className="toggle" type="checkbox" checked={cutoutEnabled} onChange={(event) => onToggleCutout(event.target.checked)} aria-label="人物抠像" /></SettingRow>
          <SettingRow label="抠像模型" hint="MODNet 会自动下载。大模型切换后要点下载，取消则回到当前可用模型">
            <select className="select" aria-label="抠像模型" value={cutoutDownloadRequest ?? cutoutModel} disabled={!cutoutEnabled || !cutoutSettingsLoaded || cutoutDownloading !== null} onChange={(event) => onCutoutModelChange(event.target.value)}>
              {CUTOUT_MODELS.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}{item.id === "modnet" ? "（默认·小模型）" : cutoutDownloaded.has(item.id) ? "" : "（需下载）"}
                </option>
              ))}
            </select>
          </SettingRow>
          {cutoutDownloadRequest && (() => {
            const info = cutoutModelInfo(cutoutDownloadRequest as CutoutModel);
            return (
              <SettingRow label={`下载 ${info.name}`} hint={`${info.sizeLabel} · ${info.hint}`}>
                <div className="action-row">
                  <button className="btn primary-button" onClick={onConfirmCutoutDownload} disabled={cutoutDownloading !== null}>
                    {cutoutDownloading ? "下载中…" : "下载并切换"}
                  </button>
                  <button className="btn ghost-button" onClick={onCancelCutoutDownload} disabled={cutoutDownloading !== null}>取消</button>
                </div>
              </SettingRow>
            );
          })()}
        </SettingsSection>
        <SettingsSection title="SYSTEM 系统">
          <SettingRow label="开机启动" hint="登录 Windows 后自动运行"><input className="toggle" type="checkbox" checked={launch} onChange={(event) => { void toggleLaunch(event.target.checked); }} aria-label="开机启动" /></SettingRow>
          <SettingRow label="关闭后留在托盘"><input className="toggle" type="checkbox" checked={tray} onChange={(event) => setTray(event.target.checked)} aria-label="关闭后留在托盘" /></SettingRow>
          <SettingRow label="存储位置" hint={storage ? `${storage.isDefault ? "默认 · " : ""}${storage.path}` : "应用数据目录"}>
            <div className="action-row">
              <button className="btn ghost-button" onClick={() => { void pickStorage(); }}><FolderOpen size={16} /> 选择位置</button>
              {storage && !storage.isDefault && <button className="btn ghost-button" onClick={() => { void resetStorage(); }}>恢复默认</button>}
            </div>
          </SettingRow>
          <SettingRow label="缓存"><button className="btn ghost-button" disabled title="尚未产生缓存">清理缓存</button></SettingRow>
        </SettingsSection>
        <SettingsSection title="ABOUT 关于">
          <SettingRow label="燃 BURN"><span className="setting-data">v0.1.0 · CORE SERVICE</span></SettingRow>
          <SettingRow label="日志" hint="排障用，复制后可直接贴给开发者">
            <button className="btn ghost-button" onClick={() => { void copyLogs().then((ok) => onToast(ok ? "日志已复制" : "复制失败", undefined, !ok)); }}>
              <ClipboardCopy size={16} /> 复制 LOG
            </button>
          </SettingRow>
          <SettingRow label="更新"><button className="btn ghost-button" disabled title="发布版本接入后开放"><RefreshCw size={16} /> 检查更新</button></SettingRow>
          <SettingRow label="设计规范"><span className="spec-ready"><Check size={15} /> 已锁定</span></SettingRow>
        </SettingsSection>
      </div>
    </main>
  );
}
