import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { defaultStylePresets, modelOptions, wallpapers as bundledWallpapers } from "./data";
import type { GenerationProgress, PendingPrompt, StyleField, StylePreset, ToastMessage, View, Wallpaper } from "./types";
import { TopBar } from "./components/TopBar";
import { Toast } from "./components/Toast";
import { DesktopPreview } from "./components/DesktopPreview";
import { PromptDialog } from "./components/PromptDialog";
import { GenerationOverlay } from "./components/GenerationOverlay";
import { NowPage } from "./pages/NowPage";
import { FavoritesPage } from "./pages/FavoritesPage";
import { StylesPage } from "./pages/StylesPage";
import { RotationPage } from "./pages/RotationPage";
import { HistoryPage } from "./pages/HistoryPage";
import { SettingsPage } from "./pages/SettingsPage";
import { useWallpaperPalette } from "./hooks/useWallpaperPalette";
import { resolveStylePrompt } from "./utils/prompt";
import { backend, isTauri, recordToWallpaper, type GenerationError, type GenRecord, type MonitorInfo, type PendingRequest } from "./backend";
import { logError, logInfo, logWarn } from "./utils/logger";

const SEED_FAVORITES = ["hammer-bear", "forest-guard"];
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function App() {
  const [view, setView] = useState<View>("now");
  const [items, setItems] = useState<Wallpaper[]>(bundledWallpapers);
  const [activeId, setActiveId] = useState(bundledWallpapers[0].id);
  const [appliedId, setAppliedId] = useState(bundledWallpapers[0].id);
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set(SEED_FAVORITES));
  const [stylePresets, setStylePresets] = useState<StylePreset[]>(() => defaultStylePresets.map((preset) => ({ ...preset })));
  const [model, setModel] = useState(modelOptions[0].id);
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [resolution, setResolution] = useState(modelOptions[0].defaultResolution);
  const [pendingPrompt, setPendingPrompt] = useState<PendingPrompt | null>(null);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [slashing, setSlashing] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [idle, setIdle] = useState(false);
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [selectedMonitor, setSelectedMonitor] = useState<string | null>(null);
  const [genRecords, setGenRecords] = useState<GenRecord[]>([]);
  const [pendings, setPendings] = useState<PendingRequest[]>([]);
  const [recoveringId, setRecoveringId] = useState<string | null>(null);
  const [rotationEnabled, setRotationEnabled] = useState(true);
  const [rotationIntervalMin, setRotationIntervalMin] = useState(30);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = items.find((item) => item.id === activeId) ?? items[0];
  const activePalette = useWallpaperPalette(active);
  const favoriteItems = items.filter((item) => favorites.has(item.id));

  const showToast = useCallback((text: string, detail?: string, error = false) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), text, detail, error });
    toastTimer.current = setTimeout(() => setToast(null), error ? 8000 : 1800);
  }, []);

  useEffect(() => {
    if (!isTauri) return;
    let alive = true;
    (async () => {
      try {
        const [records, favs, mons, pendingList] = await Promise.all([
          backend.listGenerated(),
          backend.listFavorites(),
          backend.listMonitors(),
          backend.listPendingRequests(),
        ]);
        if (!alive) return;
        if (records.length) {
          setGenRecords(records);
          setItems((current) => {
            const known = new Set(current.map((item) => item.id));
            return [...records.map(recordToWallpaper).filter((item) => !known.has(item.id)), ...current];
          });
        }
        setPendings(pendingList);
        if (favs.length) {
          setFavorites(new Set(favs));
        } else {
          for (const id of SEED_FAVORITES) await backend.toggleFavorite(id);
          setFavorites(new Set(SEED_FAVORITES));
        }
        setMonitors(mons);
        const [rotationFlag, interval] = await Promise.all([
          backend.getAppSetting("rotation_enabled"),
          backend.getAppSetting("rotation_interval_min"),
        ]);
        if (!alive) return;
        setRotationEnabled(rotationFlag === null ? true : rotationFlag === "1");
        setRotationIntervalMin(interval ? Math.max(1, Number(interval) || 30) : 30);
        logInfo("init", `启动加载完成：${records.length} 张历史生成图、${favs.length} 条收藏、${mons.length} 块屏幕`);
      } catch (error) {
        logError("init", "启动加载失败", String(error));
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!isTauri) return;
    let unlistenDone: (() => void) | undefined;
    let unlistenError: (() => void) | undefined;
    let unlistenCancelled: (() => void) | undefined;
    let unlistenProgress: (() => void) | undefined;
    let unlistenRotated: (() => void) | undefined;
    let unlistenRotationToggle: (() => void) | undefined;
    let alive = true;
    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      if (!alive) return;
      unlistenDone = await listen<{ requestId: string; wallpaper: GenRecord }>("burn-generation-done", (event) => {
        const wallpaper = recordToWallpaper(event.payload.wallpaper);
        setBusy(false);
        setProgress(null);
        setGenRecords((current) => [event.payload.wallpaper, ...current.filter((item) => item.id !== wallpaper.id)]);
        setPendings((current) => current.filter((item) => item.requestId !== event.payload.requestId));
        setItems((current) => [wallpaper, ...current.filter((item) => item.id !== wallpaper.id)]);
        setActiveId(wallpaper.id);
        if (!reducedMotion()) {
          setSlashing(true);
          setTimeout(() => setSlashing(false), 450);
        }
        showToast("新图到手！");
      });
      unlistenError = await listen<{ requestId: string } & GenerationError>("burn-generation-error", (event) => {
        setBusy(false);
        setProgress(null);
        logError("generation", `出图失败（${event.payload.kind}）`, `request=${event.payload.requestId} · ${event.payload.message}`);
        backend.listPendingRequests().then(setPendings).catch(() => {});
        showToast("出图翻车", `${event.payload.message}（可到「记录」页取回）`, true);
      });
      unlistenCancelled = await listen<string>("burn-generation-cancelled", () => {
        setBusy(false);
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
    })();
    return () => {
      alive = false;
      unlistenDone?.();
      unlistenError?.();
      unlistenCancelled?.();
      unlistenProgress?.();
      unlistenRotated?.();
      unlistenRotationToggle?.();
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
        setPreview(false);
        requestAnimationFrame(() => {
          const target = document.getElementById("wallpaper-ask")
            ?? document.querySelector<HTMLElement>('input[name="wallpaper-style"]:checked')
            ?? document.querySelector<HTMLElement>('input[name="wallpaper-style"]');
          target?.focus();
        });
        return;
      }
      if (event.key === "Escape" && preview) {
        setPreview(false);
        return;
      }
      const target = event.target as HTMLElement;
      if (view === "now" && !preview && !["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        if (event.key === "ArrowLeft") { event.preventDefault(); stepWallpaper(-1); }
        if (event.key === "ArrowRight") { event.preventDefault(); stepWallpaper(1); }
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [preview, stepWallpaper, view]);

  useEffect(() => {
    if (view !== "now" || preview) { setIdle(false); return; }
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
  }, [preview, view]);

  const toggleFavorite = (id: string) => {
    const removing = favorites.has(id);
    setFavorites((current) => {
      const next = new Set(current);
      if (removing) next.delete(id); else next.add(id);
      return next;
    });
    if (isTauri) {
      backend.toggleFavorite(id).catch((error) => {
        logError("favorites", "收藏同步失败", String(error));
        showToast("收藏同步失败", String(error), true);
      });
    }
    showToast(removing ? "已丢掉" : "收进收藏");
  };

  const applyWallpaper = (id = activeId, quiet = false) => {
    const target = items.find((item) => item.id === id) ?? active;
    setAppliedId(target.id);
    setActiveId(target.id);
    setPreview(false);
    if (!isTauri) {
      showToast("已上墙！", "原型预览 · 未修改系统桌面");
      return;
    }
    backend.apply(target, selectedMonitor)
      .then(() => {
        logInfo("wallpaper", `已上墙：${target.id}${selectedMonitor ? `（单屏 ${selectedMonitor}）` : "（全部显示器）"}${quiet ? " · 轮换" : ""}`);
        if (!reducedMotion() && !quiet) {
          setShaking(true);
          setTimeout(() => setShaking(false), 220);
        }
        if (quiet) return;
        const monitorName = selectedMonitor
          ? `显示器 ${monitors.findIndex((monitor) => monitor.devicePath === selectedMonitor) + 1 || ""}`
          : "全部显示器";
        showToast("已上墙！", monitorName);
      })
      .catch((error) => {
        logError("wallpaper", "上墙失败", String(error));
        showToast("上墙失败", String(error), true);
      });
  };

  const toggleRotation = (enabled: boolean) => {
    setRotationEnabled(enabled);
    if (isTauri) {
      backend.setAppSetting("rotation_enabled", enabled ? "1" : "0").catch((error) => logError("rotation", "保存轮换开关失败", String(error)));
    }
    logInfo("rotation", enabled ? "轮换已开启" : "轮换已暂停");
  };

  const changeRotationInterval = (minutes: number) => {
    setRotationIntervalMin(minutes);
    if (isTauri) {
      backend.setAppSetting("rotation_interval_min", String(minutes)).catch((error) => logError("rotation", "保存轮换间隔失败", String(error)));
    }
  };

  const recoverPending = async (requestId: string) => {
    if (recoveringId) return;
    setRecoveringId(requestId);
    try {
      const record = await backend.recoverGeneration(requestId);
      setGenRecords((current) => [record, ...current.filter((item) => item.id !== record.id)]);
      const wallpaper = recordToWallpaper(record);
      setItems((current) => [wallpaper, ...current.filter((item) => item.id !== wallpaper.id)]);
      setPendings((current) => current.filter((item) => item.requestId !== requestId));
      setActiveId(wallpaper.id);
      showToast("已取回！");
    } catch (error) {
      const message = (error as GenerationError)?.message ?? String(error);
      logError("recovery", "取回失败", message);
      showToast("取回失败", message, true);
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
    setBusy(true);
    try {
      const requestId = await backend.submitGeneration({
        model: pending.model,
        prompt: pending.prompt,
        resolution: pending.resolution,
        aspectRatio: pending.aspectRatio,
        styleName: pending.styleName,
      });
      await backend.discardPendingRequest(pending.requestId).catch(() => {});
      setPendings((current) => current.filter((item) => item.requestId !== pending.requestId));
      setProgress({ requestId, label: pending.styleName, state: "in_queue", startedAt: Date.now() });
      logInfo("generation", `已按原参数重投：${requestId}`, `model=${pending.model} · ${pending.resolution} ${pending.aspectRatio}`);
    } catch (error) {
      setBusy(false);
      const message = (error as GenerationError)?.message ?? String(error);
      logError("generation", "重投失败", message);
      showToast("没发出去", message, true);
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
    if (!ids.length || !isTauri) return;
    try {
      const removed = await backend.deleteWallpapers(ids);
      setGenRecords((current) => current.filter((item) => !ids.includes(item.id)));
      setItems((current) => current.filter((item) => !ids.includes(item.id)));
      setFavorites((current) => {
        const next = new Set(current);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      if (ids.includes(appliedId)) setAppliedId(items.find((item) => !ids.includes(item.id))?.id ?? items[0]?.id ?? appliedId);
      if (ids.includes(activeId)) setActiveId(items.find((item) => !ids.includes(item.id))?.id ?? items[0]?.id ?? activeId);
      logInfo("history", `批量删除 ${removed} 条记录`);
      showToast(`已删除 ${removed} 条`);
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

  const ask = (description: string, styleId: string | null, selections: Record<string, string>) => {
    if (busy || !styleId) return;
    const preset = stylePresets.find((item) => item.id === styleId);
    if (!preset) return;
    const prompt = styleId === "free" ? description.trim() : resolveStylePrompt(preset, selections);
    if (!prompt) return;
    const selectedModel = modelOptions.find((option) => option.id === model) ?? modelOptions[0];
    setPendingPrompt({
      prompt,
      styleName: preset.name,
      styleId: preset.id,
      description: description.trim(),
      selections: { ...selections },
      modelId: selectedModel.id,
      aspectRatio,
      resolution,
      modelName: selectedModel.name,
    });
  };

  const rerollPrompt = () => {
    setPendingPrompt((current) => {
      if (!current || current.styleId === "free") return current;
      const preset = stylePresets.find((item) => item.id === current.styleId);
      if (!preset) return current;
      return { ...current, prompt: resolveStylePrompt(preset, current.selections) };
    });
  };

  const confirmAsk = async () => {
    if (!pendingPrompt || busy) return;
    const payload = pendingPrompt;
    setPendingPrompt(null);
    if (!isTauri) {
      // 原型：假裝產生下一張
      setBusy(true);
      setProgress({ requestId: "proto", label: payload.styleName, state: "in_progress", startedAt: Date.now() });
      setTimeout(() => {
        const index = items.findIndex((item) => item.id === activeId);
        const nextId = items[(index + 1) % items.length].id;
        setBusy(false);
        setProgress(null);
        setActiveId(nextId);
        if (!reducedMotion()) {
          setSlashing(true);
          setTimeout(() => setSlashing(false), 450);
        }
      }, 1400);
      return;
    }
    setBusy(true);
    try {
      const requestId = await backend.submitGeneration({
        model: payload.modelId,
        prompt: payload.prompt,
        resolution: payload.resolution,
        aspectRatio: payload.aspectRatio,
        styleName: payload.styleName,
      });
      setProgress({ requestId, label: payload.styleName, state: "in_queue", startedAt: Date.now() });
      logInfo("generation", `已提交出图请求：${requestId}`, `model=${payload.modelId} · ${payload.resolution} ${payload.aspectRatio}`);
    } catch (error) {
      setBusy(false);
      const message = (error as GenerationError)?.message ?? String(error);
      logError("generation", "提交出图失败", message);
      showToast("没发出去", message, true);
    }
  };

  const updateStyle = (id: string, field: StyleField, value: string) => {
    setStylePresets((current) => current.map((preset) => preset.id === id ? { ...preset, [field]: value } : preset));
  };

  const updateStyleVariable = (id: string, variable: string, value: string) => {
    const options = value.split(/[,，]/).map((option) => option.trim()).filter(Boolean);
    setStylePresets((current) => current.map((preset) => preset.id === id ? {
      ...preset,
      variables: { ...preset.variables, [variable]: options },
    } : preset));
  };

  const toggleStyleRandom = (id: string) => {
    setStylePresets((current) => current.map((preset) => preset.id === id ? {
      ...preset,
      randomize_variables: !preset.randomize_variables,
    } : preset));
  };

  const updateOptionalVariable = (id: string, variable: string, probability: number | null) => {
    setStylePresets((current) => current.map((preset) => {
      if (preset.id !== id) return preset;
      const optional = { ...preset.optional_variables };
      if (probability === null) delete optional[variable]; else optional[variable] = probability;
      return { ...preset, optional_variables: optional };
    }));
  };

  const resetStyle = (id: string) => {
    const original = defaultStylePresets.find((preset) => preset.id === id);
    if (!original) return;
    setStylePresets((current) => current.map((preset) => preset.id === id ? { ...original } : preset));
  };

  const addStylePreset = (preset: StylePreset) => {
    setStylePresets((current) => [...current, preset]);
    showToast("新风格已就位");
  };

  const importStylePresets = (imported: StylePreset[]) => {
    setStylePresets((current) => [...current, ...imported]);
  };

  const deleteStylePreset = (id: string) => {
    setStylePresets((current) => current.filter((preset) => preset.id !== id || preset.is_builtin));
    showToast("已删除自定义风格");
  };

  const openFavorite = (id: string) => {
    setView("now");
    selectWallpaper(id);
  };

  return (
    <div
      className={`app ${idle ? "is-idle" : ""} ${shaking ? "is-shaking" : ""}`}
      style={view === "now" ? { "--blaze": activePalette.accent, "--title-ink": activePalette.titleColor } as CSSProperties : undefined}
    >
      <a href="#main-content" className="skip-link">跳到主要内容</a>
      <TopBar view={view} onNavigate={setView} />
      {view === "now" && <NowPage
        wallpaper={active}
        items={items}
        presets={stylePresets}
        appliedId={appliedId}
        busy={busy}
        favorite={favorites.has(active.id)}
        monitors={monitors}
        selectedMonitor={selectedMonitor}
        onMonitorChange={setSelectedMonitor}
        onSelect={selectWallpaper}
        onAsk={ask}
        onPreview={() => setPreview(true)}
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
      {view === "styles" && <StylesPage presets={stylePresets} onUpdate={updateStyle} onVariableUpdate={updateStyleVariable} onToggleRandom={toggleStyleRandom} onOptionalChange={updateOptionalVariable} onReset={resetStyle} onAdd={addStylePreset} onDelete={deleteStylePreset} onImport={importStylePresets} onToast={showToast} />}
      {view === "rotation" && <RotationPage favorites={favoriteItems} rotationEnabled={rotationEnabled} rotationIntervalMin={rotationIntervalMin} onToggleRotation={toggleRotation} onIntervalChange={changeRotationInterval} onToast={showToast} />}
      {view === "history" && <HistoryPage records={genRecords} pendings={pendings} recoveringId={recoveringId} onRecover={(id) => { void recoverPending(id); }} onDiscard={(id) => { void discardPending(id); }} onRetry={(pending) => { void retryPending(pending); }} onOpen={openRecord} onApply={(record) => applyWallpaper(record.id)} onCopyPrompt={copyPrompt} onBatchDelete={(ids) => { void deleteRecords(ids); }} />}
      {view === "settings" && <SettingsPage presets={stylePresets} model={model} aspectRatio={aspectRatio} resolution={resolution} onModelChange={changeModel} onAspectRatioChange={setAspectRatio} onResolutionChange={setResolution} onManageStyles={() => setView("styles")} onToast={showToast} />}
      {slashing && <div className="slash-transition" aria-hidden="true" />}
      {progress && <GenerationOverlay progress={progress} onCancel={() => { setProgress(null); setBusy(false); }} />}
      {preview && <DesktopPreview wallpaper={active} onClose={() => setPreview(false)} onApply={() => applyWallpaper()} />}
      {pendingPrompt && <PromptDialog pending={pendingPrompt} onCancel={() => setPendingPrompt(null)} onConfirm={() => { void confirmAsk(); }} onReroll={pendingPrompt.styleId === "free" ? undefined : rerollPrompt} />}
      <Toast toast={toast} />
      <div className="sr-only" aria-live="polite">当前作品：{active.title}</div>
    </div>
  );
}
