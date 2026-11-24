import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { modelOptions, wallpapers as bundledWallpapers } from "./data";
import type { GenerationProgress, PendingPrompt, PromptSubmitSettings, ToastMessage, View, Wallpaper } from "./types";
import { CutoutBadge } from "./components/CutoutBadge";
import { RecoveryBadge } from "./components/RecoveryBadge";
import { TopBar } from "./components/TopBar";
import { Toast } from "./components/Toast";
import { PromptDialog } from "./components/PromptDialog";
import { Onboarding } from "./components/Onboarding";
import { GenerationOverlay } from "./components/GenerationOverlay";
import { NowPage } from "./pages/NowPage";
import { FavoritesPage } from "./pages/FavoritesPage";
import { V4AskBar } from "./components/V4AskBar";
import { RotationPage } from "./pages/RotationPage";
import { HistoryPage } from "./pages/HistoryPage";
import { SettingsPage } from "./pages/SettingsPage";
import { useWallpaperPalette } from "./hooks/useWallpaperPalette";
import { generateV4 } from "./v4/engine";
import type { Result, Theme } from "./v4/engine";
import { recordHistory, readChoice, readHistory, getAllPacks, getTagPresets } from "./v4/storage";
import { convertFileSrc } from "@tauri-apps/api/core";
import { DEFAULT_CUTOUT_MODEL, cutoutModelInfo, cutoutModelReady, isCutoutModel, type CutoutModel } from "./utils/cutout-models";
import { backend, isTauri, recordToWallpaper, type CutoutPreference, type FolderInfo, type GenerationError, type GenRecord, type PendingRequest } from "./backend";
import { ensureModelDownloaded, pruneCutoutSessions } from "./utils/cutout";
import { dropCutoutsFor } from "./utils/cutout-cache";
import { APP_VERSION_LABEL } from "./utils/app-info";
import { dropThumb } from "./utils/thumb-store";
import { prioritizeCutout, syncCutoutQueue } from "./utils/cutout-jobs";
import { logError, logInfo, logWarn } from "./utils/logger";

const SEED_FAVORITES = ["hammer-bear", "forest-guard"];
const reducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
  document.documentElement.classList.contains("reduce-motion");

export default function App() {
  const [view, setView] = useState<View>("now");
  const [items, setItems] = useState<Wallpaper[]>(bundledWallpapers);
  const [activeId, setActiveId] = useState(bundledWallpapers[0].id);
  const [appliedId, setAppliedId] = useState(bundledWallpapers[0].id);
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set(SEED_FAVORITES));
  const [model, setModel] = useState(modelOptions[0].id);
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [resolution, setResolution] = useState(modelOptions[0].defaultResolution);
  const [pendingPrompt, setPendingPrompt] = useState<PendingPrompt | null>(null);
  const v4Pending = useRef<Result | null>(null);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [slashing, setSlashing] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [idle, setIdle] = useState(false);
  const [genRecords, setGenRecords] = useState<GenRecord[]>([]);
  const [pendings, setPendings] = useState<PendingRequest[]>([]);
  const [recoveringId, setRecoveringId] = useState<string | null>(null);
  const [recoveryStartedAt, setRecoveryStartedAt] = useState(0);
  const [rotationEnabled, setRotationEnabled] = useState(true);
  const [displayMode, setDisplayMode] = useState("per-monitor");
  const [autoUpscale, setAutoUpscale] = useState(false);
  const [upscaleProgress, setUpscaleProgress] = useState<number | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [rotationIntervalMin, setRotationIntervalMin] = useState(30);
  const [rotationRule, setRotationRule] = useState("fixed");
  const [rotationPool, setRotationPool] = useState("all");
  const [rotationFolder, setRotationFolder] = useState("");
  const [folders, setFolders] = useState<FolderInfo[]>([]);
  const [cutoutEnabled, setCutoutEnabled] = useState(true);
  const [cutoutModel, setCutoutModel] = useState<CutoutModel>(DEFAULT_CUTOUT_MODEL);
  const [cutoutDownloaded, setCutoutDownloaded] = useState<Set<string>>(new Set());
  const [cutoutSettingsLoaded, setCutoutSettingsLoaded] = useState(false);
  const [cutoutOverrides, setCutoutOverrides] = useState<Record<string, CutoutPreference>>({});
  const [cutoutDownloadRequest, setCutoutDownloadRequest] = useState<string | null>(null);
  const [cutoutDownloading, setCutoutDownloading] = useState<string | null>(null);
  const [modelPercent, setModelPercent] = useState<Partial<Record<CutoutModel, number>>>({});
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warmupStarted = useRef(false);
  const busyRef = useRef(false);
  const applyingRef = useRef(false);
  const upscaleAbort = useRef<AbortController | null>(null);
  const autoApplyRequestId = useRef<string | null>(null);

  // 系统动画/减少动态效果开关 → html.reduce-motion；窗口重新聚焦时复查。
  useEffect(() => {
    if (!isTauri) return;
    let alive = true;
    const sync = async () => {
      try {
        const enabled = await backend.getAnimationEffects();
        if (alive) document.documentElement.classList.toggle("reduce-motion", !enabled);
      } catch {
        /* 读取失败保持默认 */
      }
    };
    void sync();
    window.addEventListener("focus", sync);
    return () => {
      alive = false;
      window.removeEventListener("focus", sync);
    };
  }, []);
  const active = items.find((item) => item.id === activeId) ?? items[0];
  const activeCutoutOverride = cutoutOverrides[active.id];
  const activeCutoutEnabled = activeCutoutOverride?.enabled ?? cutoutEnabled;
  const activeCutoutModel = activeCutoutOverride && isCutoutModel(activeCutoutOverride.model) ? activeCutoutOverride.model : cutoutModel;
  const activePalette = useWallpaperPalette(active);
  const favoriteItems = items.filter((item) => favorites.has(item.id));
  const generatedRecords = genRecords.filter((record) => record.model !== "bundled");
  const historyRecords = generatedRecords.length ? generatedRecords : genRecords;

  const showToast = useCallback((text: string, detail?: string, error = false) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), text, detail, error });
    toastTimer.current = setTimeout(() => setToast(null), error ? 8000 : 1800);
  }, []);

  const updateBusy = useCallback((value: boolean) => {
    busyRef.current = value;
    setBusy(value);
  }, []);

  const submitRandomGenerate = async (applyOnDone: boolean) => {
    if (!isTauri || busyRef.current) return;
    let detail: Result;
    let styleName: string;
    let themeRatio: string;
    try {
      const { themes, libraries } = getAllPacks();
      const choice = readChoice();
      const theme = themes.find((item) => item.id === choice.themeId);
      if (!theme) throw new Error("所选主题不可用，请先在主題與畫風中检查自订数据");
      const styles = libraries.flatMap((library) => library.styles.map((style) => ({ fullId: `${library.id}/${style.id}`, style }))).filter((item) => choice.styles.includes(item.fullId));
      detail = generateV4(theme, styles, {}, readHistory());
      styleName = theme.name;
      themeRatio = theme.aspect_ratio;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logError("generation", "自动生成失败", message);
      showToast("自动生成失败", message, true);
      return;
    }
    const selectedModel = modelOptions.find((option) => option.id === model) ?? modelOptions[0];
    const generationRatio = selectedModel.ratios.includes(themeRatio) ? themeRatio : aspectRatio;
    updateBusy(true);
    try {
      const requestId = await backend.submitGeneration({
        model: selectedModel.id,
        prompt: detail.prompt,
        resolution,
        aspectRatio: generationRatio,
        styleName,
      });
      try { recordHistory(detail, detail.prompt, { model: selectedModel.id, resolution, aspectRatio: generationRatio }); } catch (error) { logWarn("generation", `无法保存方案历史：${String(error)}`); showToast("已提交，但方案历史未保存", "请检查本地存储空间或备份数据", true); }
      if (applyOnDone) autoApplyRequestId.current = requestId;
      setProgress({ requestId, label: styleName, state: "in_queue", startedAt: Date.now() });
      setPendings((current) => [{
        requestId,
        model: selectedModel.id,
        prompt: detail.prompt,
        styleName,
        resolution,
        aspectRatio: generationRatio,
        createdAt: Math.floor(Date.now() / 1000),
        active: true,
      }, ...current]);
      logInfo("generation", `${applyOnDone ? "托盘来一张" : "来一张"}：已提交 ${requestId}`, `style=${styleName} · ${selectedModel.id} ${resolution} ${generationRatio}`);
    } catch (error) {
      updateBusy(false);
      setProgress(null);
      backend.listPendingRequests().then(setPendings).catch((refreshError) => logError("generation", "读取待取回记录失败", String(refreshError)));
      const message = (error as GenerationError)?.message ?? String(error);
      logError("generation", "提交出图失败", message);
      showToast(message.includes("状态未知") ? "提交状态未知" : "没发出去", message, true);
    }
  };
  const submitRandomGenerateRef = useRef(submitRandomGenerate);
  submitRandomGenerateRef.current = submitRandomGenerate;

  useEffect(() => {
    if (!isTauri) return;
    let alive = true;
    (async () => {
      try {
        const [records, favs, pendingList, favoritesInitialized] = await Promise.all([
          backend.listGenerated(),
          backend.listFavorites(),
          backend.listPendingRequests(),
          backend.getAppSetting("favorites_initialized"),
        ]);
        if (!alive) return;
        if (records.length) {
          setGenRecords(records);
          const generated = records.filter((record) => record.model !== "bundled").map((record) => recordToWallpaper(record, getTagPresets()));
          if (generated.length) {
            setItems([...generated, ...bundledWallpapers]);
            setActiveId((current) => generated.some((item) => item.id === current) ? current : generated[0].id);
            setAppliedId((current) => generated.some((item) => item.id === current) ? current : generated[0].id);
          } else {
            setItems(bundledWallpapers);
          }
        }
        setPendings(pendingList);
        if (favs.length || favoritesInitialized === "1") {
          setFavorites(new Set(favs));
        } else {
          for (const id of SEED_FAVORITES) await backend.toggleFavorite(id);
          setFavorites(new Set(SEED_FAVORITES));
        }
        if (favoritesInitialized !== "1") {
          backend.setAppSetting("favorites_initialized", "1").catch((error) => logError("favorites", "保存收藏初始化状态失败", String(error)));
        }
        const [rotationFlag, interval, rule, pool, folder, folderList, cutoutFlag, cutoutModelSetting, downloadedFlag, cutoutPreferenceList, displayModeSetting, upscaleSetting, onboardedFlag] = await Promise.all([
          backend.getAppSetting("rotation_enabled"),
          backend.getAppSetting("rotation_interval_min"),
          backend.getAppSetting("rotation_rule"),
          backend.getAppSetting("rotation_pool"),
          backend.getAppSetting("rotation_folder"),
          backend.listFolders(),
          backend.getAppSetting("cutout_enabled"),
          backend.getAppSetting("cutout_model"),
          backend.getAppSetting("cutout_downloaded"),
          backend.listCutoutPreferences(),
          backend.getAppSetting("display_mode"),
          backend.getAppSetting("auto_upscale"),
          backend.getAppSetting("onboarded"),
        ]);
        if (!alive) return;
        setRotationEnabled(rotationFlag === null ? true : rotationFlag === "1");
        setDisplayMode(displayModeSetting === "span" ? "span" : "per-monitor");
        setAutoUpscale(upscaleSetting === "1");
        setShowOnboarding(onboardedFlag !== "1");
        setRotationIntervalMin(interval ? Math.max(1, Number(interval) || 30) : 30);
        setRotationRule(rule ?? "fixed");
        setRotationPool(pool ?? "all");
        setRotationFolder(folder ?? "");
        setFolders(folderList);
        setCutoutEnabled(cutoutFlag !== "0");
        const downloadedIds = (downloadedFlag ?? "").split(",").map((item) => item.trim()).filter((item) => isCutoutModel(item));
        const savedModel = cutoutModelSetting && isCutoutModel(cutoutModelSetting) ? cutoutModelSetting : null;
        const nextModel = savedModel && cutoutModelReady(savedModel, new Set(downloadedIds)) ? savedModel : DEFAULT_CUTOUT_MODEL;
        if (cutoutModelSetting !== nextModel) {
          backend.setAppSetting("cutout_model", nextModel).catch((error) => logError("settings", "保存抠像模型失败", String(error)));
          if (savedModel && savedModel !== nextModel) logInfo("cutout", "未下载的抠像模型已切回默认", `${savedModel} → ${nextModel}`);
        }
        setCutoutModel(nextModel);
        setCutoutOverrides(Object.fromEntries(cutoutPreferenceList
          .filter((preference) => isCutoutModel(preference.model))
          .map((preference) => [preference.wallpaperId, preference])));
        setCutoutDownloaded((current) => {
          const next = new Set(current);
          for (const id of downloadedIds) next.add(id);
          return next;
        });
        setCutoutSettingsLoaded(true);
        logInfo("init", `启动加载完成：${records.length} 张历史生成图、${favs.length} 条收藏`, APP_VERSION_LABEL);
      } catch (error) {
        logError("init", "启动加载失败", String(error));
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!isTauri || !cutoutSettingsLoaded) return;
    backend.setAppSetting("cutout_downloaded", Array.from(cutoutDownloaded).sort().join(",")).catch((error) => logError("settings", "保存抠像模型下载记录失败", String(error)));
  }, [cutoutDownloaded, cutoutSettingsLoaded]);

  useEffect(() => {
    if (view === "settings" || cutoutDownloading) return;
    setCutoutDownloadRequest((current) => current ? null : current);
  }, [view, cutoutDownloading]);

  useEffect(() => {
    if (isTauri && !cutoutSettingsLoaded) {
      syncCutoutQueue([], cutoutModel);
      return;
    }
    const enabled = (wallpaper: Wallpaper) => cutoutOverrides[wallpaper.id]?.enabled ?? cutoutEnabled;
    const selectedModel = (wallpaper: Wallpaper): CutoutModel => {
      const override = cutoutOverrides[wallpaper.id]?.model;
      return override && isCutoutModel(override) ? override : cutoutModel;
    };
    const rest = items.filter((item) => item.id !== active.id && enabled(item));
    const queue = [...(enabled(active) ? [active] : []), ...rest];
    const selectedModels = Object.fromEntries(queue.map((item) => [item.id, selectedModel(item)]));
    syncCutoutQueue(queue, cutoutModel, selectedModels);
  }, [items, active, cutoutEnabled, cutoutModel, cutoutOverrides, cutoutSettingsLoaded]);

  // 只有圖片需要預設抠像模型時才下載。已下載過的模型交給首次摳像懶加載：
  // 啟動時再跑一遍 pipeline 等於把權重重新校驗/加載一遍，離線環境下還會誤觸網絡下載。
  useEffect(() => {
    if (isTauri && !cutoutSettingsLoaded) return;
    if (cutoutDownloaded.has(DEFAULT_CUTOUT_MODEL)) return;
    const needed = items.some((wallpaper) => (cutoutOverrides[wallpaper.id]?.enabled ?? cutoutEnabled) && (cutoutOverrides[wallpaper.id]?.model ?? cutoutModel) === DEFAULT_CUTOUT_MODEL);
    if (!needed) return;
    if (warmupStarted.current) return;
    warmupStarted.current = true;
    (async () => {
      try {
        await ensureModelDownloaded(DEFAULT_CUTOUT_MODEL, (percent) => {
          setModelPercent((current) => current[DEFAULT_CUTOUT_MODEL] === percent ? current : { ...current, [DEFAULT_CUTOUT_MODEL]: percent });
        });
        setModelPercent((current) => {
          if (current[DEFAULT_CUTOUT_MODEL] == null) return current;
          const next = { ...current };
          delete next[DEFAULT_CUTOUT_MODEL];
          return next;
        });
        setCutoutDownloaded((current) => {
          if (current.has(DEFAULT_CUTOUT_MODEL)) return current;
          const next = new Set(current);
          next.add(DEFAULT_CUTOUT_MODEL);
          return next;
        });
        logInfo("cutout", "默认抠像模型已下载", cutoutModelInfo(DEFAULT_CUTOUT_MODEL).name);
      } catch (error) {
        // 允許下次啟動重試
        warmupStarted.current = false;
        logError("cutout", "默认抠像模型下载失败", String(error));
      }
    })();
  }, [cutoutSettingsLoaded, cutoutDownloaded, cutoutEnabled, cutoutModel, cutoutOverrides, items]);

  useEffect(() => {
    if (!isTauri) return;
    let unlistenDone: (() => void) | undefined;
    let unlistenError: (() => void) | undefined;
    let unlistenCancelled: (() => void) | undefined;
    let unlistenProgress: (() => void) | undefined;
    let unlistenRotated: (() => void) | undefined;
    let unlistenRotationToggle: (() => void) | undefined;
    let unlistenTrayGenerate: (() => void) | undefined;
    let alive = true;
    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      if (!alive) return;
      unlistenDone = await listen<{ requestId: string; wallpaper: GenRecord }>("burn-generation-done", (event) => {
        const wallpaper = recordToWallpaper(event.payload.wallpaper, getTagPresets());
        updateBusy(false);
        setProgress(null);
        setGenRecords((current) => [event.payload.wallpaper, ...current.filter((item) => item.id !== wallpaper.id)]);
        setPendings((current) => current.filter((item) => item.requestId !== event.payload.requestId));
        setItems((current) => [wallpaper, ...current.filter((item) => item.id !== wallpaper.id)]);
        setActiveId(wallpaper.id);
        backend.listFolders().then(setFolders).catch(() => {});
        if (!reducedMotion()) {
          setSlashing(true);
          setTimeout(() => setSlashing(false), 450);
        }
        showToast("新图到手！");
        // 托盤「來一張」：出圖完成直接上牆（全部顯示器）；上牆失敗保留上一張
        if (autoApplyRequestId.current === event.payload.requestId) {
          autoApplyRequestId.current = null;
          backend.apply(wallpaper, null)
            .then(() => {
              setAppliedId(wallpaper.id);
              logInfo("wallpaper", `自动上墙：${wallpaper.id}`);
            })
            .catch((error) => logError("wallpaper", "自动上墙失败", String(error)));
        }
      });
      unlistenError = await listen<{ requestId: string } & GenerationError>("burn-generation-error", (event) => {
        updateBusy(false);
        setProgress(null);
        if (autoApplyRequestId.current === event.payload.requestId) {
          autoApplyRequestId.current = null;
          logWarn("generation", "托盘出图失败，保留上一张壁纸");
        }
        logError("generation", `出图失败（${event.payload.kind}）`, `request=${event.payload.requestId} · ${event.payload.message}`);
        backend.listPendingRequests().then(setPendings).catch(() => {});
        showToast("出图翻车", `${event.payload.message}（可到「记录」页取回）`, true);
      });
      unlistenCancelled = await listen<string>("burn-generation-cancelled", () => {
        updateBusy(false);
        setProgress(null);
        logWarn("generation", "出图已取消");
        showToast("已取消");
      });
      unlistenProgress = await listen<{ requestId: string; state: string }>("burn-generation-progress", (event) => {
        setProgress((current) => current && current.requestId === event.payload.requestId
          ? { ...current, state: event.payload.state }
          : current);
      });
      unlistenRotated = await listen<string>("burn-rotated", (event) => {
        logInfo("rotation", `后端轮换已上墙：${event.payload}`);
        setAppliedId(event.payload);
      });
      unlistenRotationToggle = await listen<boolean>("burn-rotation-toggled", (event) => {
        setRotationEnabled(event.payload);
        logInfo("rotation", event.payload ? "轮换已开启（托盘）" : "轮换已暂停（托盘）");
      });
      unlistenTrayGenerate = await listen("burn-tray-generate", () => {
        void submitRandomGenerateRef.current(true);
      });
    })();
    return () => {
      alive = false;
      unlistenDone?.();
      unlistenError?.();
      unlistenCancelled?.();
      unlistenProgress?.();
      unlistenRotated?.();
      unlistenRotationToggle?.();
      unlistenTrayGenerate?.();
    };
  }, [showToast]);

  const selectWallpaper = useCallback((id: string) => {
    if (id === activeId || busy) return;
    if (reducedMotion()) {
      setActiveId(id);
      return;
    }
    setSlashing(true);
    setTimeout(() => setActiveId(id), 200);
    setTimeout(() => setSlashing(false), 450);
  }, [activeId, busy]);

  const stepWallpaper = useCallback((direction: number) => {
    const index = items.findIndex((item) => item.id === activeId);
    if (index < 0) return;
    selectWallpaper(items[(index + direction + items.length) % items.length].id);
  }, [items, activeId, selectWallpaper]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setView("now");
        requestAnimationFrame(() => {
          const target = document.querySelector<HTMLElement>('input[name="wallpaper-style"]:checked')
            ?? document.querySelector<HTMLElement>('input[name="wallpaper-style"]');
          target?.focus();
        });
        return;
      }
      const target = event.target as HTMLElement;
      if (view === "now" && !["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        if (event.key === "ArrowLeft") { event.preventDefault(); stepWallpaper(-1); }
        if (event.key === "ArrowRight") { event.preventDefault(); stepWallpaper(1); }
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [stepWallpaper, view]);

  useEffect(() => {
    if (view !== "now") { setIdle(false); return; }
    let timer: ReturnType<typeof setTimeout>;
    const wake = () => {
      setIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName ?? "")) setIdle(true);
      }, 3000);
    };
    wake();
    window.addEventListener("pointermove", wake);
    window.addEventListener("keydown", wake);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("keydown", wake);
    };
  }, [view]);

  const toggleFavorite = async (id: string) => {
    if (!isTauri) {
      const removing = favorites.has(id);
      setFavorites((current) => {
        const next = new Set(current);
        if (removing) next.delete(id); else next.add(id);
        return next;
      });
      showToast(removing ? "已丢掉" : "收进收藏");
      return;
    }
    try {
      const favorite = await backend.toggleFavorite(id);
      setFavorites((current) => {
        const next = new Set(current);
        if (favorite) next.add(id); else next.delete(id);
        return next;
      });
      showToast(favorite ? "收进收藏" : "已丢掉");
    } catch (error) {
      logError("favorites", "收藏同步失败", String(error));
      showToast("收藏同步失败", String(error), true);
    }
  };

  const applyWallpaper = async (id = activeId, quiet = false) => {
    if (applyingRef.current) return;
    const target = items.find((item) => item.id === id) ?? active;
    setActiveId(target.id);
    if (!isTauri) {
      setAppliedId(target.id);
      showToast("已上墙！", "原型预览 · 未修改系统桌面");
      return;
    }
    applyingRef.current = true;
    let tempUrl: string | undefined;
    try {
      let wallpaper = target;
      if (autoUpscale) {
        upscaleAbort.current = new AbortController();
        setUpscaleProgress(-1);
        const monitors = await backend.listMonitors();
        if (!monitors.length) throw new Error("未检测到显示器，无法判断目标分辨率");
        const scale = Math.max(...monitors.map((monitor) => monitor.scaleFactor || 1));
        const width = displayMode === "span" ? (Math.max(...monitors.map((m) => m.x + m.width)) - Math.min(...monitors.map((m) => m.x))) * scale : Math.max(...monitors.map((m) => m.width * (m.scaleFactor || 1)));
        const height = displayMode === "span" ? (Math.max(...monitors.map((m) => m.y + m.height)) - Math.min(...monitors.map((m) => m.y))) * scale : Math.max(...monitors.map((m) => m.height * (m.scaleFactor || 1)));
        const { upscaleWallpaper } = await import("./utils/upscale");
        showToast("正在检查并放大图片", "首次使用需要下载约 5 MB 模型");
        const blob = await upscaleWallpaper(target.image, Math.ceil(width), Math.ceil(height), setUpscaleProgress, upscaleAbort.current.signal);
        upscaleAbort.current.signal.throwIfAborted();
        if (blob) { tempUrl = URL.createObjectURL(blob); wallpaper = { ...target, image: tempUrl, localPath: undefined }; }
      }
      setUpscaleProgress(null);
      await backend.apply(wallpaper, null, tempUrl ? `upscaled-${target.id}.png` : undefined);
        setAppliedId(target.id);
        logInfo("wallpaper", `已上墙：${target.id}${quiet ? " · 轮换" : ""}`);
        if (!reducedMotion() && !quiet) {
          setShaking(true);
          setTimeout(() => setShaking(false), 220);
        }
        if (!quiet) showToast("已上墙！", "全部显示器");
    } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") showToast("已取消上墙");
        else { logError("wallpaper", "上墙失败", String(error)); showToast("上墙失败", String(error), true); }
    } finally { if (tempUrl) URL.revokeObjectURL(tempUrl); applyingRef.current = false; upscaleAbort.current = null; setUpscaleProgress(null); }
  };

  const toggleRotation = (enabled: boolean) => {
    setRotationEnabled(enabled);
    if (isTauri) {
      backend.setAppSetting("rotation_enabled", enabled ? "1" : "0").catch((error) => logError("rotation", "保存轮换开关失败", String(error)));
    }
    logInfo("rotation", enabled ? "轮换已开启" : "轮换已暂停");
  };

  const changeDisplayMode = (mode: string) => {
    const next = mode === "span" ? "span" : "per-monitor";
    setDisplayMode(next);
    if (isTauri) {
      backend.setAppSetting("display_mode", next).catch((error) => logError("settings", "保存多显示器模式失败", String(error)));
    }
    logInfo("settings", next === "span" ? "多显示器：跨屏连续" : "多显示器：每屏一张");
  };
  const toggleAutoUpscale = (enabled: boolean) => {
    setAutoUpscale(enabled);
    if (isTauri) backend.setAppSetting("auto_upscale", enabled ? "1" : "0").catch((error) => { setAutoUpscale(!enabled); showToast("保存放大设置失败", String(error), true); });
  };

  const finishOnboarding = () => {
    setShowOnboarding(false);
    if (isTauri) {
      backend.setAppSetting("onboarded", "1").catch((error) => logError("settings", "保存引导完成状态失败", String(error)));
    }
    logInfo("settings", "首次引导已完成");
  };

  const changeRotationInterval = (minutes: number) => {
    setRotationIntervalMin(minutes);
    if (isTauri) {
      backend.setAppSetting("rotation_interval_min", String(minutes)).catch((error) => logError("rotation", "保存轮换间隔失败", String(error)));
    }
  };

  const changeRotationRule = (rule: string) => {
    setRotationRule(rule);
    if (isTauri) {
      backend.setAppSetting("rotation_rule", rule).catch((error) => logError("rotation", "保存轮换规则失败", String(error)));
    }
  };

  const changeRotationPool = (pool: string) => {
    setRotationPool(pool);
    if (isTauri) {
      backend.setAppSetting("rotation_pool", pool).catch((error) => logError("rotation", "保存轮换来源失败", String(error)));
    }
  };

  const createFolder = async (name: string) => {
    try {
      const folder = await backend.createFolder(name);
      setFolders((current) => [...current.filter((item) => item.id !== folder.id), folder]);
      showToast("文件夹已创建", folder.name);
    } catch (error) {
      logError("folder", "创建文件夹失败", String(error));
      showToast("创建失败", String(error), true);
    }
  };

  const deleteFolder = async (id: string) => {
    try {
      await backend.deleteFolder(id);
      setFolders((current) => current.filter((item) => item.id !== id));
      const records = await backend.listGenerated();
      setGenRecords(records);
      setItems((current) => {
        const byId = new Map(records.map((record) => [record.id, record]));
        return current.map((item) => {
          const record = byId.get(item.id);
          return record ? { ...item, localPath: record.imagePath, image: convertFileSrc(record.imagePath) } : item;
        });
      });
      if (rotationFolder === id) {
        setRotationFolder("");
        setRotationPool("all");
        backend.setAppSetting("rotation_pool", "all").catch(() => {});
      }
      showToast("文件夹已删除，图片移回根目录");
    } catch (error) {
      logError("folder", "删除文件夹失败", String(error));
      showToast("删除失败", String(error), true);
    }
  };

  const assignFolder = async (wallpaperId: string, folderId: string | null) => {
    try {
      const record = await backend.setWallpaperFolder(wallpaperId, folderId);
      setGenRecords((current) => current.map((item) => item.id === record.id ? record : item));
      const wallpaper = recordToWallpaper(record, getTagPresets());
      setItems((current) => current.map((item) => item.id === record.id ? { ...item, localPath: record.imagePath, image: wallpaper.image } : item));
      const name = folderId ? folders.find((item) => item.id === folderId)?.name : null;
      showToast(name ? `已移入「${name}」` : "已移回根目录");
      backend.listFolders().then(setFolders).catch(() => {});
    } catch (error) {
      logError("folder", "移动图片失败", String(error));
      showToast("移动失败", String(error), true);
    }
  };

  const toggleCutout = (enabled: boolean) => {
    setCutoutEnabled(enabled);
    if (isTauri) {
      backend.setAppSetting("cutout_enabled", enabled ? "1" : "0").catch((error) => logError("settings", "保存抠像开关失败", String(error)));
    }
  };

  const saveActiveCutoutPreference = async (enabled: boolean, nextModel: CutoutModel) => {
    try {
      if (isTauri) await backend.setCutoutPreference(active.id, enabled, nextModel);
      setCutoutOverrides((current) => ({
        ...current,
        [active.id]: { wallpaperId: active.id, enabled, model: nextModel },
      }));
      if (nextModel !== activeCutoutModel) {
        pruneCutoutSessions(nextModel);
        prioritizeCutout(active, nextModel);
      }
    } catch (error) {
      logError("cutout", "保存单图抠像设置失败", String(error));
      showToast("抠像设置保存失败", String(error), true);
    }
  };

  const changeActiveCutoutModel = (nextModel: string) => {
    if (!isCutoutModel(nextModel) || nextModel === activeCutoutModel) return;
    if (!cutoutModelReady(nextModel, cutoutDownloaded)) {
      showToast("模型尚未下载", "请先到设置页下载模型", true);
      return;
    }
    void saveActiveCutoutPreference(activeCutoutEnabled, nextModel);
  };

  const changeCutoutModel = (model: string) => {
    if (!isCutoutModel(model) || cutoutDownloading) return;
    if (model === cutoutModel || cutoutModelReady(model, cutoutDownloaded)) {
      setCutoutDownloadRequest(null);
      if (model !== cutoutModel) applyCutoutModel(model);
      return;
    }
    setCutoutDownloadRequest(model);
  };

  const applyCutoutModel = (model: CutoutModel) => {
    setCutoutModel(model);
    // 舊模型的推理會話（anime-seg 176MB / BiRefNet 450MB）隨之釋放，在飛任務完成後生效
    pruneCutoutSessions(model);
    if (isTauri) {
      backend.setAppSetting("cutout_model", model).catch((error) => logError("settings", "保存抠像模型失败", String(error)));
    }
  };

  const confirmCutoutDownload = async () => {
    const model = cutoutDownloadRequest;
    if (!model || !isCutoutModel(model) || cutoutDownloading) return;
    setCutoutDownloading(model);
    setModelPercent((current) => ({ ...current, [model]: 0 }));
    try {
      await ensureModelDownloaded(model, (percent) => {
        setModelPercent((current) => current[model] === percent ? current : { ...current, [model]: percent });
      });
      setCutoutDownloaded((current) => {
        if (current.has(model)) return current;
        const next = new Set(current);
        next.add(model);
        return next;
      });
      setCutoutDownloadRequest(null);
      applyCutoutModel(model);
      showToast("模型已就绪", cutoutModelInfo(model).name);
    } catch (error) {
      logError("cutout", "模型下载失败", String(error));
      if (!cutoutModelReady(cutoutModel, cutoutDownloaded)) applyCutoutModel(DEFAULT_CUTOUT_MODEL);
      showToast("模型下载失败", "未下载，已保持可用模型", true);
    } finally {
      setCutoutDownloading(null);
      setModelPercent((current) => {
        if (current[model] == null) return current;
        const next = { ...current };
        delete next[model];
        return next;
      });
    }
  };

  const cancelCutoutDownload = () => {
    setCutoutDownloadRequest(null);
    if (!cutoutModelReady(cutoutModel, cutoutDownloaded)) applyCutoutModel(DEFAULT_CUTOUT_MODEL);
  };

  const recoverPending = async (requestId: string, singleCheck = false) => {
    if (recoveringId) return;
    setRecoveringId(requestId);
    setRecoveryStartedAt(Date.now());
    const others = pendings.filter((item) => item.requestId !== requestId).length;
    try {
      const record = await backend.recoverGeneration(requestId, singleCheck);
      if (!record) {
        showToast("还没有结果", `后台会继续自动轮询 · 共 ${others + 1} 条待取回`);
        return;
      }
      setGenRecords((current) => [record, ...current.filter((item) => item.id !== record.id)]);
      const wallpaper = recordToWallpaper(record, getTagPresets());
      setItems((current) => [wallpaper, ...current.filter((item) => item.id !== wallpaper.id)]);
      setPendings((current) => current.filter((item) => item.requestId !== requestId));
      setActiveId(wallpaper.id);
      updateBusy(false);
      setProgress((current) => current?.requestId === requestId ? null : current);
      if (autoApplyRequestId.current === requestId) {
        autoApplyRequestId.current = null;
        backend.apply(wallpaper, null)
          .then(() => {
            setAppliedId(wallpaper.id);
            logInfo("wallpaper", `自动上墙：${wallpaper.id}`);
          })
          .catch((error) => logError("wallpaper", "自动上墙失败", String(error)));
      }
      showToast(singleCheck ? "查询成功，已取回！" : "已取回！", others > 0 ? `还有 ${others} 条待取回` : "待取回已清空");
    } catch (error) {
      const message = (error as GenerationError)?.message ?? String(error);
      logError("recovery", singleCheck ? "手动查询失败" : "取回失败", message);
      showToast(singleCheck ? "查询失败" : "取回失败", `${message} · 还有 ${others + 1} 条待取回`, true);
    } finally {
      setRecoveringId(null);
    }
  };

  const discardPending = async (requestId: string) => {
    try {
      await backend.discardPendingRequest(requestId);
      setPendings((current) => current.filter((item) => item.requestId !== requestId));
      showToast("已忽略");
    } catch (error) {
      logError("recovery", "忽略待取回请求失败", String(error));
      showToast("操作失败", String(error), true);
    }
  };

  const retryPending = async (pending: PendingRequest) => {
    if (busy || !isTauri) return;
    updateBusy(true);
    try {
      const requestId = await backend.submitGeneration({
        model: pending.model,
        prompt: pending.prompt,
        resolution: pending.resolution,
        aspectRatio: pending.aspectRatio,
        styleName: pending.styleName,
      });
      setPendings((current) => [{
        requestId,
        model: pending.model,
        prompt: pending.prompt,
        styleName: pending.styleName,
        resolution: pending.resolution,
        aspectRatio: pending.aspectRatio,
        createdAt: Math.floor(Date.now() / 1000),
        active: true,
      }, ...current.filter((item) => item.requestId !== requestId)]);
      setProgress({ requestId, label: pending.styleName, state: "in_queue", startedAt: Date.now() });
      logInfo("generation", `已按原参数重投：${requestId}`, `model=${pending.model} · ${pending.resolution} ${pending.aspectRatio}`);
    } catch (error) {
      updateBusy(false);
      backend.listPendingRequests().then(setPendings).catch((refreshError) => logError("generation", "读取待取回记录失败", String(refreshError)));
      const message = (error as GenerationError)?.message ?? String(error);
      logError("generation", "重投失败", message);
      showToast(message.includes("状态未知") ? "提交状态未知" : "没发出去", message, true);
    }
  };

  const openRecord = (record: GenRecord) => {
    const target = items.find((item) => item.id === record.id);
    if (!target) {
      showToast("记录不在当前列表", "重启应用后再试");
      return;
    }
    setView("now");
    selectWallpaper(record.id);
  };

  const copyPrompt = (prompt: string) => {
    navigator.clipboard.writeText(prompt)
      .then(() => showToast("Prompt 已复制"))
      .catch(() => showToast("复制失败", undefined, true));
  };

  const deleteRecords = async (ids: string[]) => {
    const deletableIds = ids.filter((id) => genRecords.find((record) => record.id === id)?.model !== "bundled");
    if (!deletableIds.length || !isTauri) return;
    try {
      const removed = await backend.deleteWallpapers(deletableIds);
      const remaining = items.filter((item) => !deletableIds.includes(item.id));
      const nextItems = remaining.length ? remaining : bundledWallpapers;
      for (const id of deletableIds) dropCutoutsFor(id);
      for (const item of items.filter((item) => deletableIds.includes(item.id))) dropThumb(item.image);
      setGenRecords((current) => current.filter((item) => !deletableIds.includes(item.id)));
      setItems(nextItems);
      setFavorites((current) => {
        const next = new Set(current);
        deletableIds.forEach((id) => next.delete(id));
        return next;
      });
      setCutoutOverrides((current) => {
        const next = { ...current };
        deletableIds.forEach((id) => delete next[id]);
        return next;
      });
      if (deletableIds.includes(appliedId)) setAppliedId(nextItems[0].id);
      if (deletableIds.includes(activeId)) setActiveId(nextItems[0].id);
      logInfo("history", `批量删除 ${removed} 条记录`);
      showToast(removed === ids.length ? `已删除 ${removed} 条` : `已删除 ${removed} 条，内置壁纸已保留`);
    } catch (error) {
      logError("history", "批量删除失败", String(error));
      showToast("删除失败", String(error), true);
    }
  };

  const changeModel = (nextModel: string) => {
    const option = modelOptions.find((item) => item.id === nextModel) ?? modelOptions[0];
    setModel(option.id);
    setResolution(option.defaultResolution);
    setAspectRatio((current) => option.ratios.includes(current) ? current : "16:9");
  };

  const askV4 = (theme: Theme, result: Result) => {
    if (busy || !result.prompt) return;
    const selectedModel = modelOptions.find((option) => option.id === model) ?? modelOptions[0];
    v4Pending.current = result;
    setPendingPrompt({ prompt: result.prompt, styleName: theme.name, modelId: selectedModel.id, aspectRatio: selectedModel.ratios.includes(theme.aspect_ratio) ? theme.aspect_ratio : aspectRatio, resolution, modelName: selectedModel.name });
  };

  const confirmAsk = async (finalPrompt: string, settings: PromptSubmitSettings) => {
    if (!pendingPrompt || busy) return;
    const payload = { ...pendingPrompt, prompt: finalPrompt, ...settings };
    if (!isTauri) {
      // 原型：假裝產生下一張（對話框立即關閉，進度浮層接手反饋）
      setPendingPrompt(null);
      if (v4Pending.current) { try { recordHistory(v4Pending.current, finalPrompt, { model: settings.modelId, resolution: settings.resolution, aspectRatio: settings.aspectRatio }); } catch (error) { logWarn("generation", `无法保存方案历史：${String(error)}`); showToast("已提交，但方案历史未保存", "请检查本地存储空间或备份数据", true); } v4Pending.current = null; }
      updateBusy(true);
      setProgress({ requestId: "proto", label: payload.styleName, state: "in_progress", startedAt: Date.now() });
      setTimeout(() => {
        const index = items.findIndex((item) => item.id === activeId);
        const nextId = items[(index + 1) % items.length].id;
        updateBusy(false);
        setProgress(null);
        setActiveId(nextId);
        if (!reducedMotion()) {
          setSlashing(true);
          setTimeout(() => setSlashing(false), 450);
        }
      }, 1400);
      return;
    }
    // 送出中對話框保持開著（PromptDialog 顯示「送出中…」），服務器受理後才關閉
    updateBusy(true);
    try {
      const requestId = await backend.submitGeneration({
        model: settings.modelId,
        prompt: finalPrompt,
        resolution: settings.resolution,
        aspectRatio: settings.aspectRatio,
        styleName: payload.styleName,
      });
      if (v4Pending.current) { try { recordHistory(v4Pending.current, finalPrompt, { model: settings.modelId, resolution: settings.resolution, aspectRatio: settings.aspectRatio }); } catch (error) { logWarn("generation", `无法保存方案历史：${String(error)}`); showToast("已提交，但方案历史未保存", "请检查本地存储空间或备份数据", true); } v4Pending.current = null; }
      // 確認後把這次的設置同步為全局默認，下次提問直接沿用
      setModel(settings.modelId);
      setResolution(settings.resolution);
      setAspectRatio(settings.aspectRatio);
      setPendingPrompt(null);
      setProgress({ requestId, label: payload.styleName, state: "in_queue", startedAt: Date.now() });
      setPendings((current) => [{
        requestId,
        model: settings.modelId,
        prompt: finalPrompt,
        styleName: payload.styleName,
        resolution: settings.resolution,
        aspectRatio: settings.aspectRatio,
        createdAt: Math.floor(Date.now() / 1000),
        active: true,
      }, ...current.filter((item) => item.requestId !== requestId)]);
      logInfo("generation", `已提交出图请求：${requestId}`, `model=${settings.modelId} · ${settings.resolution} ${settings.aspectRatio}`);
    } catch (error) {
      updateBusy(false);
      backend.listPendingRequests().then(setPendings).catch((refreshError) => logError("generation", "读取待取回记录失败", String(refreshError)));
      const message = (error as GenerationError)?.message ?? String(error);
      logError("generation", "提交出图失败", message);
      showToast(message.includes("状态未知") ? "提交状态未知" : "没发出去", message, true);
      // 拋回對話框：顯示錯誤並恢復可操作，方便直接重試
      throw error instanceof Error ? error : new Error(message);
    }
  };

  const openFavorite = (id: string) => {
    setView("now");
    selectWallpaper(id);
  };

  return (
    <div
      className={`app ${idle ? "is-idle" : ""} ${recoveringId ? "is-recovering" : ""} ${shaking ? "is-shaking" : ""}`}
      style={view === "now" ? { "--blaze": activePalette.accent, "--title-ink": activePalette.titleColor } as CSSProperties : undefined}
    >
      <a href="#main-content" className="skip-link">跳到主要内容</a>
      <TopBar view={view} onNavigate={setView} />
      <CutoutBadge modelDownload={cutoutDownloading && isCutoutModel(cutoutDownloading)
        ? { name: cutoutModelInfo(cutoutDownloading).name, percent: modelPercent[cutoutDownloading] ?? 0 }
        : modelPercent[DEFAULT_CUTOUT_MODEL] != null
          ? { name: cutoutModelInfo(DEFAULT_CUTOUT_MODEL).name, percent: modelPercent[DEFAULT_CUTOUT_MODEL] }
          : null} />
      {recoveringId && <RecoveryBadge startedAt={recoveryStartedAt} remaining={pendings.length} />}
      {view === "now" && <NowPage
        wallpaper={active}
        items={items}
        appliedId={appliedId}
        busy={busy}
        favorite={favorites.has(active.id)}
        cutoutEnabled={activeCutoutEnabled && (!isTauri || cutoutSettingsLoaded)}
        cutoutModel={activeCutoutModel}
        cutoutDownloaded={cutoutDownloaded}
        onToggleCutout={(enabled) => { void saveActiveCutoutPreference(enabled, activeCutoutModel); }}
        onCutoutModelChange={changeActiveCutoutModel}
        onSelect={selectWallpaper}
        onAskV4={askV4}
        onApply={() => applyWallpaper()}
        onFavorite={() => toggleFavorite(active.id)}
      />}
      {view === "favorites" && <FavoritesPage
        items={favoriteItems}
        onOpen={openFavorite}
        onApply={applyWallpaper}
        onRemove={toggleFavorite}
        onSimilar={(wallpaper: Wallpaper) => { setView("now"); selectWallpaper(wallpaper.id); }}
        onToast={showToast}
      />}
      {view === "styles" && <main id="main-content" className="page-enter v4-settings-page"><h1>主題與畫風</h1><V4AskBar busy={busy} onSubmit={askV4} management /></main>}
      {view === "rotation" && <RotationPage favorites={favoriteItems} wallpapers={items} rotationEnabled={rotationEnabled} rotationIntervalMin={rotationIntervalMin} rotationRule={rotationRule} rotationPool={rotationPool} rotationFolder={rotationFolder} folders={folders} onToggleRotation={toggleRotation} onIntervalChange={changeRotationInterval} onRuleChange={changeRotationRule} onPoolChange={changeRotationPool} onRotationFolderChange={(id) => { setRotationFolder(id); backend.setAppSetting("rotation_folder", id).catch(() => {}); }} onCreateFolder={(name) => { void createFolder(name); }} onDeleteFolder={(id) => { void deleteFolder(id); }} onToast={showToast} />}
      {view === "history" && <HistoryPage records={historyRecords} pendings={pendings} recoveringId={recoveringId} folders={folders} onRecover={(id, singleCheck) => { void recoverPending(id, singleCheck); }} onDiscard={(id) => { void discardPending(id); }} onRetry={(pending) => { void retryPending(pending); }} onOpen={openRecord} onApply={(record) => applyWallpaper(record.id)} onCopyPrompt={copyPrompt} onBatchDelete={(ids) => { void deleteRecords(ids); }} onAssignFolder={(id, folderId) => { void assignFolder(id, folderId); }} />}
      {view === "settings" && <SettingsPage model={model} aspectRatio={aspectRatio} resolution={resolution} cutoutEnabled={cutoutEnabled} cutoutModel={cutoutModel} cutoutDownloaded={cutoutDownloaded} cutoutSettingsLoaded={!isTauri || cutoutSettingsLoaded} cutoutDownloadRequest={cutoutDownloadRequest} cutoutDownloading={cutoutDownloading} cutoutDownloadPercent={cutoutDownloading && isCutoutModel(cutoutDownloading) ? modelPercent[cutoutDownloading] ?? 0 : null} defaultModelPercent={modelPercent[DEFAULT_CUTOUT_MODEL] ?? null} displayMode={displayMode} autoUpscale={autoUpscale} onModelChange={changeModel} onAspectRatioChange={setAspectRatio} onResolutionChange={setResolution} onManageStyles={() => setView("styles")} onToggleCutout={toggleCutout} onCutoutModelChange={changeCutoutModel} onConfirmCutoutDownload={() => { void confirmCutoutDownload(); }} onCancelCutoutDownload={cancelCutoutDownload} onDisplayModeChange={changeDisplayMode} onToggleAutoUpscale={toggleAutoUpscale} onToast={showToast} />}
      {slashing && <div className="slash-transition" aria-hidden="true" />}
      {progress && <GenerationOverlay progress={progress} querying={recoveringId === progress.requestId} onQuery={() => { void recoverPending(progress.requestId, true); }} onHide={() => setProgress(null)} />}
      {upscaleProgress !== null && <div className="upscale-status" role="status"><span>{upscaleProgress < 0 ? "正在准备放大模型…" : `正在放大图片 ${upscaleProgress}%`}</span><button className="btn ghost-button" type="button" onClick={() => upscaleAbort.current?.abort()}>取消</button></div>}
      {pendingPrompt && <PromptDialog pending={pendingPrompt} onCancel={() => { v4Pending.current = null; setPendingPrompt(null); }} onConfirm={confirmAsk} />}
      {showOnboarding && <Onboarding onGenerate={() => { void submitRandomGenerate(false); }} onFinish={finishOnboarding} onToast={showToast} />}
      <Toast toast={toast} />
      <div className="sr-only" aria-live="polite">当前作品：{active.title}</div>
    </div>
  );
}

