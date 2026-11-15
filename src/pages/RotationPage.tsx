import { useState, type DragEvent } from "react";
import { Clock3, GripVertical, Pause, Play, Plus, Sunrise, X } from "lucide-react";
import type { Wallpaper } from "../types";

interface RotationPageProps {
  favorites: Wallpaper[];
  rotationEnabled: boolean;
  rotationIntervalMin: number;
  onToggleRotation: (enabled: boolean) => void;
  onIntervalChange: (minutes: number) => void;
  onToast: (text: string) => void;
}

interface TimeBlock {
  key: string;
  wallpaper: Wallpaper;
  start: number;
}

export function RotationPage({ favorites, rotationEnabled, rotationIntervalMin, onToggleRotation, onIntervalChange, onToast }: RotationPageProps) {
  const [blocks, setBlocks] = useState<TimeBlock[]>([
    { key: "initial-forest", wallpaper: favorites.find((item) => item.id === "forest-guard") ?? favorites[0], start: 0 },
    { key: "initial-hammer", wallpaper: favorites.find((item) => item.id === "hammer-bear") ?? favorites[0], start: 18 },
  ].filter((block) => Boolean(block.wallpaper)));
  const [rule, setRule] = useState("fixed");

  const addBlock = (wallpaper: Wallpaper, start = 8) => {
    setBlocks((current) => [...current, { key: `${wallpaper.id}-${Date.now()}`, wallpaper, start }]);
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
    if (favorites.length < 2) return;
    setBlocks([
      { key: `preset-day-${Date.now()}`, wallpaper: favorites[0], start: 6 },
      { key: `preset-night-${Date.now()}`, wallpaper: favorites[1], start: 18 },
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
        <div className="section-inline-heading"><h2 id="schedule-title">一天，二十四格</h2><button className="btn ghost-button" onClick={applyPreset} disabled={favorites.length < 2} title={favorites.length < 2 ? "至少收藏两张作品" : "套用早燃晚静"}><Sunrise size={16} /> 早燃晚静</button></div>
        <div className="timeline-scroll">
          <div className="rotation-timeline" onDragOver={(event) => event.preventDefault()} onDrop={drop}>
            {Array.from({ length: 9 }, (_, index) => <span className="hour-mark" style={{ left: `${index * 12.5}%` }} key={index}>{String(index * 3).padStart(2, "0")}:00</span>)}
            <div className="timeline-track">
              {blocks.map((block) => (
                <article className="time-block" key={block.key} style={{ left: `${(block.start / 24) * 100}%`, width: `${(4 / 24) * 100}%` }}>
                  <img src={block.wallpaper.image} alt="" width="1600" height="900" />
                  <span><b>{block.wallpaper.title}</b><small>{String(block.start).padStart(2, "0")}:00—{String(block.start + 4).padStart(2, "0")}:00</small></span>
                  <button aria-label={`移除 ${block.wallpaper.title} 时段`} onClick={() => setBlocks((current) => current.filter((item) => item.key !== block.key))}><X size={15} /></button>
                </article>
              ))}
              {blocks.length === 0 && <div className="timeline-empty"><Clock3 size={22} /> 把下方收藏拖进来</div>}
            </div>
          </div>
        </div>
      </section>
      <section className="rotation-rules" aria-labelledby="rules-title">
        <h2 id="rules-title">出招规则</h2>
        <fieldset>
          <legend className="sr-only">轮换规则</legend>
          <label className={rule === "fixed" ? "rule-option selected" : "rule-option"}><input type="radio" name="rule" value="fixed" checked={rule === "fixed"} onChange={(event) => setRule(event.target.value)} /><span><b>固定时段</b><small>照时间轴换图</small></span></label>
          <label className={rule === "random" ? "rule-option selected" : "rule-option"}><input type="radio" name="rule" value="random" checked={rule === "random"} onChange={(event) => setRule(event.target.value)} /><span><b>每隔一阵</b><small>从收藏里随机挑</small></span></label>
          <label className={rule === "daily" ? "rule-option selected" : "rule-option"}><input type="radio" name="rule" value="daily" checked={rule === "daily"} onChange={(event) => setRule(event.target.value)} /><span><b>每天来一张</b><small>每天开机换一张新的</small></span></label>
        </fieldset>
        {rule === "random" && <label className="interval-select">间隔<select className="select" value={rotationIntervalMin} onChange={(event) => onIntervalChange(Number(event.target.value))}><option value={15}>每 15 分钟</option><option value={30}>每 30 分钟</option><option value={60}>每 60 分钟</option><option value={120}>每 120 分钟</option></select></label>}
      </section>
      <section className="rotation-sources" aria-labelledby="sources-title">
        <div className="section-inline-heading"><h2 id="sources-title">从收藏出招</h2><span>拖进时间轴，或点一下加入</span></div>
        {favorites.length ? <div className="source-list">{favorites.map((wallpaper) => (
          <button
            className="source-item"
            key={wallpaper.id}
            draggable
            onDragStart={(event) => event.dataTransfer.setData("text/wallpaper-id", wallpaper.id)}
            onClick={() => addBlock(wallpaper)}
          >
            <GripVertical size={16} /><img src={wallpaper.image} alt="" width="1600" height="900" /><span>{wallpaper.title}</span><Plus size={16} />
          </button>
        ))}</div> : <p className="source-empty">先收藏两张作品，再来排一天的节奏。</p>}
      </section>
    </main>
  );
}
