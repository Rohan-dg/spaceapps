/**
 * Command menu (⌘K / Ctrl+K): one search field over every site, preset, view and action, driven by the
 * keyboard (↑ ↓ to move, ↵ to run, esc to close). Items are plain data so App owns what each one does.
 */
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Search } from './Icons';

export interface Command {
  id: string;
  group: string;
  title: string;
  /** Right-aligned hint: coordinates, a shortcut, a mode. */
  accessory?: ReactNode;
  icon?: ReactNode;
  keywords?: string;
  run: () => void;
}

/** Match every query word against the title/keywords; earlier hits in the title rank higher. */
function score(c: Command, q: string): number {
  if (!q) return 1;
  const hay = `${c.title} ${c.keywords ?? ''} ${c.group}`.toLowerCase();
  let s = 0;
  for (const w of q.toLowerCase().split(/\s+/).filter(Boolean)) {
    const i = hay.indexOf(w);
    if (i < 0) {
      // fall back to initials ("cr" → Connecting ridge)
      const initials = c.title.toLowerCase().split(/[\s–-]+/).map((x) => x[0]).join('');
      if (!initials.includes(w)) return 0;
      s += 1;
    } else s += i === 0 ? 4 : c.title.toLowerCase().includes(w) ? 3 : 2;
  }
  return s;
}

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const ModKey = () => <kbd>{isMac ? '⌘' : 'Ctrl'}</kbd>;

export default function CommandPalette({ commands, onClose }: { commands: Command[]; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  const hits = useMemo(() => {
    const scored = commands.map((c, i) => ({ c, s: score(c, q), i })).filter((x) => x.s > 0);
    if (q) scored.sort((a, b) => b.s - a.s || a.i - b.i);
    return scored.map((x) => x.c);
  }, [commands, q]);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const run = (c: Command | undefined) => { if (!c) return; onClose(); c.run(); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(hits.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); run(hits[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
  };

  // group while keeping rank order: a group appears where its best hit ranks
  const groups: { name: string; items: { c: Command; i: number }[] }[] = [];
  hits.forEach((c, i) => {
    let g = groups.find((x) => x.name === c.group);
    if (!g) groups.push((g = { name: c.group, items: [] }));
    g.items.push({ c, i });
  });
  const order = groups.flatMap((g) => g.items);
  const activeCmd = hits[active];

  return (
    <div className="cmdk-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cmdk" role="dialog" aria-modal="true" aria-label="Command menu" onKeyDown={onKey}>
        <div className="cmdk-search">
          <Search size={17} />
          <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} placeholder="Search sites, presets and actions…"
            role="combobox" aria-expanded="true" aria-controls="cmdk-list" aria-activedescendant={activeCmd ? `cmdk-${activeCmd.id}` : undefined} spellCheck={false} />
          <kbd>esc</kbd>
        </div>
        <div className="cmdk-list" id="cmdk-list" role="listbox" ref={list}>
          {order.length === 0 && <p className="cmdk-empty">No results</p>}
          {groups.map((g) => (
            <div key={g.name} role="group" aria-label={g.name}>
              <div className="cmdk-group">{g.name}</div>
              {g.items.map(({ c }) => {
                const i = order.findIndex((x) => x.c === c);
                return (
                  <div key={c.id} id={`cmdk-${c.id}`} data-i={i} role="option" aria-selected={i === active}
                    className={`cmdk-item${i === active ? ' on' : ''}`} onMouseMove={() => setActive(i)} onClick={() => run(c)}>
                    <span className="cmdk-icon">{c.icon}</span>
                    <span className="cmdk-title">{c.title}</span>
                    {c.accessory && <span className="cmdk-acc">{c.accessory}</span>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="cmdk-foot">
          <span className="cmdk-foot-mark"><span className="brand-mark" aria-hidden /> Lunar Site Compare</span>
          <span className="cmdk-foot-keys">
            <span>{activeCmd ? 'Run' : ''} <kbd>↵</kbd></span>
            <span className="sep" />
            <span>Move <kbd>↑</kbd><kbd>↓</kbd></span>
          </span>
        </div>
      </div>
    </div>
  );
}
