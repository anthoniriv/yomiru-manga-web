import { useRef, useState } from 'react';
import LightningLoader from './LightningLoader';

interface LogItem {
  event: 'start' | 'ok' | 'miss' | 'error' | 'done';
  slug?: string;
  title?: string;
  patched?: string[];
  error?: string;
  total?: number;
  ok?: number;
  miss?: number;
}

export default function EnrichAll() {
  const [running, setRunning] = useState(false);
  const [limit, setLimit] = useState(50);
  const [log, setLog] = useState<LogItem[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0, ok: 0, miss: 0 });
  const abortRef = useRef<AbortController | null>(null);

  async function run() {
    setLog([]);
    setProgress({ done: 0, total: 0, ok: 0, miss: 0 });
    setRunning(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const fd = new FormData();
      fd.set('limit', String(limit));
      const res = await fetch('/api/admin/enrich-all', {
        method: 'POST',
        body: fd,
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        setLog((l) => [...l, { event: 'error', error: `HTTP ${res.status}` }]);
        setRunning(false);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const item: LogItem = JSON.parse(line);
            setLog((l) => [item, ...l].slice(0, 200));
            if (item.event === 'start' && item.total != null) {
              setProgress((p) => ({ ...p, total: item.total ?? 0 }));
            }
            if (item.event === 'ok' || item.event === 'miss' || item.event === 'error') {
              setProgress((p) => ({
                ...p,
                done: p.done + 1,
                ok: p.ok + (item.event === 'ok' ? 1 : 0),
                miss: p.miss + (item.event === 'miss' ? 1 : 0),
              }));
            }
          } catch {}
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setLog((l) => [{ event: 'error', error: msg }, ...l]);
    } finally {
      setRunning(false);
    }
  }

  function stop() {
    abortRef.current?.abort();
    setRunning(false);
  }

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <section className="mt-8 p-6 rounded-2xl bg-ink-800/60 border border-white/5 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="font-bold text-white">Enriquecer desde MyAnimeList</h2>
          <p className="text-xs text-zinc-500 mt-1">
            Rellena rating, año, autor, género y estado en series con datos faltantes.
          </p>
        </div>
        {running && <LightningLoader size={20} label="Trabajando…" />}
      </div>

      <div className="flex items-center gap-2 mb-3">
        <label className="text-xs text-zinc-400">Límite</label>
        <input
          type="number"
          min={1}
          max={200}
          value={limit}
          disabled={running}
          onChange={(e) => setLimit(Math.min(200, Math.max(1, parseInt(e.target.value || '1', 10))))}
          className="w-20 px-3 py-1 rounded-full border border-white/10 bg-primary-900/60 text-white text-sm focus:outline-none focus:border-accent/60"
        />
        {!running ? (
          <button
            type="button"
            onClick={run}
            className="px-5 py-1.5 rounded-full bg-accent text-zinc-950 text-sm font-bold hover:bg-accent-400 transition-colors shadow-glow-accent"
          >
            Ejecutar
          </button>
        ) : (
          <button
            type="button"
            onClick={stop}
            className="px-5 py-1.5 rounded-full border border-accent/40 text-accent bg-accent/10 text-sm font-medium hover:bg-accent/20"
          >
            Detener
          </button>
        )}
      </div>

      {progress.total > 0 && (
        <div className="mb-3">
          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-accent-700 via-accent to-accent-400 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-zinc-400 mt-1.5 tabular-nums">
            {progress.done} / {progress.total} · OK {progress.ok} · Sin match {progress.miss}
          </p>
        </div>
      )}

      {log.length > 0 && (
        <div className="max-h-72 overflow-y-auto border border-white/10 rounded-lg bg-primary-900/60 p-3 text-xs font-mono">
          {log.map((l, i) => (
            <div
              key={i}
              className={`py-0.5 ${
                l.event === 'ok'
                  ? 'text-emerald-300'
                  : l.event === 'miss'
                    ? 'text-zinc-500'
                    : l.event === 'error'
                      ? 'text-accent-300'
                      : 'text-zinc-400'
              }`}
            >
              [{l.event}] {l.title ?? l.slug ?? ''}
              {l.patched ? ` · ${l.patched.join(',')}` : ''}
              {l.error ? ` · ${l.error}` : ''}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
