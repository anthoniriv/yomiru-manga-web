import { useMemo, useState } from 'react';

interface Item {
  id: string;
  slug: string;
  title: string;
  coverUrl: string;
  isAdult: boolean;
}

interface Props {
  items: Item[];
}

export default function AdminMangaGrid({ items: initial }: Props) {
  const [items, setItems] = useState<Item[]>(initial);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [lastIdx, setLastIdx] = useState<number | null>(null);

  const selectedCount = selected.size;
  const allSelected = useMemo(
    () => items.length > 0 && items.every((i) => selected.has(i.id)),
    [items, selected],
  );

  function toggle(idx: number, shift: boolean) {
    const id = items[idx]?.id;
    if (!id) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (shift && lastIdx !== null && lastIdx !== idx) {
        const [lo, hi] = lastIdx < idx ? [lastIdx, idx] : [idx, lastIdx];
        const target = !prev.has(id);
        for (let i = lo; i <= hi; i++) {
          const it = items[i];
          if (!it) continue;
          if (target) next.add(it.id);
          else next.delete(it.id);
        }
      } else if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setLastIdx(idx);
  }

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(items.map((i) => i.id)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function applyBulk(value: boolean) {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/bulk-adult', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selected), value }),
      });
      if (!res.ok) {
        setToast(`Error: HTTP ${res.status}`);
        return;
      }
      const data = (await res.json()) as { updated: number };
      setItems((prev) =>
        prev.map((i) => (selected.has(i.id) ? { ...i, isAdult: value } : i)),
      );
      setToast(`${data.updated} actualizados (${value ? '+18' : 'sin marca'})`);
      clearSelection();
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Error');
    } finally {
      setBusy(false);
      setTimeout(() => setToast(null), 3000);
    }
  }

  return (
    <div>
      <div className="sticky top-16 z-30 -mx-4 px-4 py-3 mb-4 bg-primary-900/90 backdrop-blur-xl border-b border-white/10 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-zinc-200 cursor-pointer">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            className="w-4 h-4 accent-accent"
            style={{ accentColor: '#E95000' }}
          />
          <span>Seleccionar página ({items.length})</span>
        </label>

        <span className="text-sm text-zinc-400">
          {selectedCount > 0 ? `${selectedCount} seleccionados` : 'Nada seleccionado'}
        </span>
        <span className="text-xs text-zinc-500 hidden md:inline">
          tip: shift+click para rango
        </span>

        <div className="flex-1" />

        <button
          type="button"
          disabled={busy || selectedCount === 0}
          onClick={() => applyBulk(true)}
          className="px-4 py-1.5 rounded-full bg-accent text-zinc-950 text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent-400 transition-colors shadow-glow-accent"
        >
          Marcar +18
        </button>
        <button
          type="button"
          disabled={busy || selectedCount === 0}
          onClick={() => applyBulk(false)}
          className="px-4 py-1.5 rounded-full border border-white/10 bg-ink-800/70 text-zinc-200 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:border-accent/60 hover:text-white transition-colors"
        >
          Quitar +18
        </button>
        {selectedCount > 0 && (
          <button
            type="button"
            onClick={clearSelection}
            className="text-xs text-zinc-400 hover:text-accent underline underline-offset-4"
          >
            limpiar
          </button>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-5 py-3 rounded-full bg-accent text-zinc-950 text-sm font-semibold shadow-glow-accent-lg animate-fade-in">
          {toast}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {items.map((item, idx) => {
          const isSelected = selected.has(item.id);
          return (
            <div
              key={item.id}
              className={`relative group rounded-xl overflow-hidden border-2 transition-all cursor-pointer select-none ${
                isSelected
                  ? 'border-accent shadow-glow-accent-lg'
                  : item.isAdult
                    ? 'border-accent/50'
                    : 'border-white/5 hover:border-white/30'
              }`}
              onClick={(e) => toggle(idx, e.shiftKey)}
            >
              <div className="relative aspect-[2/3] bg-ink-700">
                <img
                  src={item.coverUrl}
                  alt={item.title}
                  loading="lazy"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = '/placeholder-cover.svg';
                  }}
                />
                <div
                  className={`absolute inset-0 transition-opacity ${
                    isSelected ? 'bg-accent/30' : 'bg-black/0 group-hover:bg-black/20'
                  }`}
                />
                <div className="absolute top-2 left-2 z-10">
                  <div
                    className={`w-6 h-6 rounded-md flex items-center justify-center text-sm font-bold shadow-sm ${
                      isSelected
                        ? 'bg-accent text-zinc-950'
                        : 'bg-primary-900/70 backdrop-blur-sm text-transparent group-hover:text-zinc-500 border border-white/10'
                    }`}
                  >
                    ✓
                  </div>
                </div>
                {item.isAdult && (
                  <div className="absolute top-2 right-2 z-10 px-1.5 py-0.5 rounded-md bg-accent text-zinc-950 text-[10px] font-bold shadow-sm">
                    +18
                  </div>
                )}
                <a
                  href={`/manga/${item.slug}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  onClick={(e) => e.stopPropagation()}
                  className="absolute bottom-2 right-2 z-10 px-2 py-1 rounded-md bg-primary-900/80 backdrop-blur-sm text-white text-[10px] font-semibold border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Ver detalles"
                >
                  ↗
                </a>
              </div>
              <div className="p-2 bg-ink-800/80">
                <p className="text-xs font-semibold text-zinc-200 line-clamp-2 leading-tight">
                  {item.title}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
