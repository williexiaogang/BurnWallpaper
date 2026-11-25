import { useEffect, useState, type DragEvent, type FormEvent } from "react";
import { Clock3, FolderPlus, GripVertical, Pause, Play, Plus, Sunrise, Trash2, X } from "lucide-react";
import type { Wallpaper } from "../types";
import { backend, isTauri, type FolderInfo } from "../backend";
import { useThumbnailUrl, type ImageLoadError } from "../hooks/useThumbnailUrl";

interface RotationPageProps {
  favorites: Wallpaper[];
  wallpapers: Wallpaper[];
  onImageError: ImageLoadError;
  rotationEnabled: boolean;
  rotationIntervalMin: number;
  rotationRule: string;
  rotationPool: string;
  rotationFolder: string;
  folders: FolderInfo[];
  onToggleRotation: (enabled: boolean) => void;
  onIntervalChange: (minutes: number) => void;
  onRuleChange: (rule: string) => void;
  onPoolChange: (pool: string) => void;
  onRotationFolderChange: (id: string) => void;
  onCreateFolder: (name: string) => void;
  onDeleteFolder: (id: string) => void;
  onToast: (text: string) => void;
}

interface TimeBlock {
  key: string;
  wallpaperId: string;
  start: number;
}

const DEFAULT_BLOCKS: TimeBlock[] = [
  { key: "initial-forest", wallpaperId: "forest-guard", start: 0 },
  { key: "initial-hammer", wallpaperId: "hammer-bear", start: 18 },
];

function parseBlocks(raw: string | null): TimeBlock[] {
  if (raw === null) return DEFAULT_BLOCKS;
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((entry, index) => {
    if (typeof entry !== "object" || entry === null) return [];
    const value = entry as { wallpaperId?: unknown; start?: unknown };
    if (typeof value.wallpaperId !== "string" || typeof value.start !== "number") return [];
    const start = Math.round(value.start);
    if (!value.wallpaperId || start < 0 || start > 20) return [];
    return [{ key: `saved-${index}-${value.wallpaperId}`, wallpaperId: value.wallpaperId, start }];
  });
}

function RotationThumb({ wallpaper, onImageError }: { wallpaper: Wallpaper; onImageError: ImageLoadError }) {
  const { id, image } = wallpaper;
  const thumb = useThumbnailUrl(image, id, onImageError);
  return <img src={thumb ?? image} alt="" width="1600" height="900" loading="lazy" decoding="async" onError={() => onImageError(id, image)} />;
}

export function RotationPage({ favorites, wallpapers, onImageError, rotationEnabled, rotationIntervalMin, rotationRule, rotationPool, rotationFolder, folders, onToggleRotation, onIntervalChange, onRuleChange, onPoolChange, onRotationFolderChange, onCreateFolder, onDeleteFolder, onToast }: RotationPageProps) {
  const [newFolderName, setNewFolderName] = useState("");
  const [blocks, setBlocks] = useState<TimeBlock[]>(DEFAULT_BLOCKS);
  const [scheduleLoaded, setScheduleLoaded] = useState(!isTauri);

  useEffect(() => {
    if (!isTauri) return;
    let alive = true;
    backend.getAppSetting("rotation_schedule")
      .then((raw) => {
        if (!alive) return;
        setBlocks(parseBlocks(raw));
        setScheduleLoaded(true);
      })
      .catch(() => {
        if (!alive) return;
        onToast("时间轴读取失败，已暂停编辑；请重新打开轮换页重试");
      });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!isTauri || !scheduleLoaded) return;
    const saved = blocks.map(({ wallpaperId, start }) => ({ wallpaperId, start }));
    backend.setAppSetting("rotation_schedule", JSON.stringify(saved)).catch(() => onToast("时间轴保存失败"));
  }, [blocks, scheduleLoaded]);

  const addBlock = (wallpaper: Wallpaper, start = 8) => {
    if (!scheduleLoaded) return;
    setBlocks((current) => [...current, { key: `${wallpaper.id}-${Date.now()}`, wallpaperId: wallpaper.id, start }]);
    onToast(`${wallpaper.title} 已排入`);
  };

  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/wallpaper-id");
    const wallpaper = favorites.find((item) => item.id === id);
    if (!wallpaper) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const start = Math.round(((event.clientX - rect.left) / rect.width) * 20);
    addBlock(wallpaper, Math.max(0, Math.min(20, start)));
  };

  const applyPreset = () => {
    if (!scheduleLoaded || favorites.length < 2) return;
    setBlocks([
      { key: `preset-day-${Date.now()}`, wallpaperId: favorites[0].id, start: 6 },
      { key: `preset-night-${Date.now()}`, wallpaperId: favorites[1].id, start: 18 },
    ]);
    onToast("早燃晚静已排好");
  };

  return (
    <main id="main-content" className="rotation-page page-enter">
      <div className="page-heading">
        <div><h1>轮换</h1><p>让桌面跟着你的节奏出招。</p></div>
        <button className={`btn running-button ${rotationEnabled ? "is-running" : ""}`} onClick={() => onToggleRotation(!rotationEnabled)} aria-pressed={rotationEnabled}>
          {rotationEnabled ? <Pause size={16} /> : <Play size={16} />}{rotationEnabled ? "轮换中" : "已暂停"}
        </button>
      </div>
      <section className="schedule-section" aria-labelledby="schedule-title">
        <div className="section-inline-heading"><h2 id="schedule-title">一天，二十四格</h2><button className="btn ghost-button" onClick={applyPreset} disabled={!scheduleLoaded || favorites.length < 2} title={favorites.length < 2 ? "至少收藏两张作品" : "套用早燃晚静"}><Sunrise size={16} /> 早燃晚静</button></div>
        <div className="timeline-scroll">
          <div className="rotation-timeline" onDragOver={(event) => event.preventDefault()} onDrop={drop}>
            {Array.from({ length: 9 }, (_, index) => <span className="hour-mark" style={{ left: `${index * 12.5}%` }} key={index}>{String(index * 3).padStart(2, "0")}:00</span>)}
            <div className="timeline-track">
              {blocks.map((block) => {
                const wallpaper = wallpapers.find((item) => item.id === block.wallpaperId);
                if (!wallpaper) return null;
                return (
                  <article className="time-block" key={block.key} style={{ left: `${(block.start / 24) * 100}%`, width: `${(4 / 24) * 100}%` }}>
                    <RotationThumb wallpaper={wallpaper} onImageError={onImageError} />
                    <span><b>{wallpaper.title}</b><small>{String(block.start).padStart(2, "0")}:00—{String(block.start + 4).padStart(2, "0")}:00</small></span>
                    <button disabled={!scheduleLoaded} aria-label={`移除 ${wallpaper.title} 时段`} onClick={() => setBlocks((current) => current.filter((item) => item.key !== block.key))}><X size={15} /></button>
                  </article>
                );
              })}
              {blocks.length === 0 && <div className="timeline-empty"><Clock3 size={22} /> 把下方收藏拖进来</div>}
            </div>
          </div>
        </div>
      </section>
      <section className="rotation-rules" aria-labelledby="rules-title">
        <h2>出招规则</h2>
        <fieldset>
          <legend className="sr-only">轮换规则</legend>
          <label className={rotationRule === "fixed" ? "rule-option selected" : ""}><input type="radio" name="rule" value="fixed" checked={rotationRule === "fixed"} onChange={(event) => onRuleChange(event.target.value)} /><span><b>固定时段</b><small>照时间轴换图</small></span></label>
          <label className={rotationRule === "random" ? "rule-option selected" : ""}><input type="radio" name="rule" value="random" checked={rotationRule === "random"} onChange={(event) => onRuleChange(event.target.value)} /><span><b>每隔一阵</b><small>按间隔随机轮播作品</small></span></label>
          <label className={rotationRule === "daily" ? "rule-option selected" : ""}><input type="radio" name="rule" value="daily" checked={rotationRule === "daily"} onChange={(event) => onRuleChange(event.target.value)} /><span><b>每天来一张</b><small>每天按顺序换一张</small></span></label>
        </fieldset>
        {rotationRule === "random" && <label className="interval-select">间隔<select className="select" value={rotationIntervalMin} onChange={(event) => onIntervalChange(Number(event.target.value))}><option value={15}>每 15 分钟</option><option value={30}>每 30 分钟</option><option value={60}>每 60 分钟</option><option value={120}>每 120 分钟</option></select></label>}
      </section>
      <section className="rotation-sources" aria-labelledby="pool-title">
        <h2>轮换来源</h2>
        <fieldset className="pool-options">
          <legend className="sr-only">轮换来源</legend>
          <label className={rotationPool === "all" ? "rule-option selected" : ""}>
            <input type="radio" name="pool" value="all" checked={rotationPool === "all"} onChange={(event) => onPoolChange(event.target.value)} />
            <span><b>全部图片</b><small>内置与生成过的所有作品</small></span>
          </label>
          <label className={rotationPool === "favorites" ? "rule-option selected" : ""}>
            <input type="radio" name="pool" value="favorites" checked={rotationPool === "favorites"} onChange={(event) => onPoolChange(event.target.value)} />
            <span><b>收藏夹</b><small>只轮换已收藏的作品</small></span>
          </label>
          <label className={rotationPool === "folder" ? "rule-option selected" : ""}>
            <input type="radio" name="pool" value="folder" checked={rotationPool === "folder"} onChange={(event) => onPoolChange(event.target.value)} />
            <span><b>指定文件夹</b><small>轮换一个本地图片目录</small></span>
          </label>
        </fieldset>
        {rotationPool === "folder" && (
          <div className="folder-controls">
            <select className="select" aria-label="选择轮换文件夹" value={rotationFolder} onChange={(event) => onRotationFolderChange(event.target.value)}>
              <option value="" disabled>选择文件夹</option>
              {folders.map((folder) => <option value={folder.id} key={folder.id}>{folder.name}（{folder.count}）</option>)}
            </select>
            <form className="folder-create" onSubmit={(event: FormEvent) => {
              event.preventDefault();
              const name = newFolderName.trim();
              if (!name) return;
              onCreateFolder(name);
              setNewFolderName("");
            }}>
              <input className="input" aria-label="新文件夹名称" value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} placeholder="新文件夹名" />
              <button className="btn ghost-button" type="submit"><FolderPlus size={15} /> 新建</button>
            </form>
            {rotationFolder && <button className="btn ghost-button" onClick={() => onDeleteFolder(rotationFolder)}><Trash2 size={15} /> 删除此文件夹</button>}
            {!folders.length && <small className="folder-hint">先在记录页把图片移入文件夹，或在这里新建一个</small>}
          </div>
        )}
      </section>
      <section className="rotation-sources" aria-labelledby="sources-title">
        <div className="section-inline-heading"><h2 id="sources-title">从收藏出招</h2><span>拖进时间轴，或点一下加入</span></div>
        {favorites.length ? <div className="source-list">{favorites.map((wallpaper) => (
          <button className="source-item" key={wallpaper.id} draggable onDragStart={(event) => event.dataTransfer.setData("text/wallpaper-id", wallpaper.id)} onClick={() => addBlock(wallpaper)}>
            <GripVertical size={16} /><RotationThumb wallpaper={wallpaper} onImageError={onImageError} /><span>{wallpaper.title}</span><Plus size={16} />
          </button>
        ))}</div> : <p className="source-empty">先收藏两张作品，再来排一天的节奏。</p>}
      </section>
    </main>
  );
}

