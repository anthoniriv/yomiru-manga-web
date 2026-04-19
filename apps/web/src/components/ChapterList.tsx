import { useState } from 'react';

export interface ChapterItem {
  number: number;
  title: string | null;
  language: string;
  pageCount: number | null;
  previewUrl?: string | null;
  publishedAt?: string | null;
  downloadedAt?: string | null;
}

interface Props {
  chapters: ChapterItem[];
  slug: string;
  initialCount?: number;
  step?: number;
}

export default function ChapterList({ chapters, slug, initialCount = 25, step = 25 }: Props) {
  const [visible, setVisible] = useState(Math.min(initialCount, chapters.length));

  if (chapters.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-500 bg-ink-800/50 rounded-2xl border border-dashed border-white/10">
        <p>No hay capítulos disponibles todavía.</p>
      </div>
    );
  }

  const shown = chapters.slice(0, visible);
  const remaining = chapters.length - visible;

  function relativeDate(value?: string | null) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const diff = Date.now() - date.getTime();
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    const week = 7 * day;
    if (diff < hour) return `hace ${Math.max(1, Math.floor(diff / minute))} min`;
    if (diff < day) return `hace ${Math.floor(diff / hour)} h`;
    if (diff < week) return `hace ${Math.floor(diff / day)} d`;
    return `hace ${Math.floor(diff / week)} sem`;
  }

  return (
    <div>
      <div className="space-y-4">
        {shown.map((ch) => (
          <a
            key={`${ch.number}-${ch.language}`}
            href={`/manga/${slug}/${ch.number}`}
            className="grid grid-cols-[92px_1fr] sm:grid-cols-[124px_1fr_auto] gap-4 sm:gap-5 items-center rounded-2xl border border-zinc-800 bg-zinc-950/70 px-4 sm:px-5 py-4 transition-colors hover:bg-zinc-900/80 hover:border-accent/40 group relative"
          >
            <div className="relative aspect-[16/9] overflow-hidden rounded-xl border border-white/10 bg-zinc-900">
              {ch.previewUrl ? (
                <img
                  src={ch.previewUrl}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover grayscale contrast-125 opacity-75 transition-transform duration-500 group-hover:scale-105 group-hover:grayscale-0"
                  onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder-cover.svg'; }}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-2xl text-accent">読</div>
              )}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent to-black/30" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <span className="text-accent" aria-hidden="true">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.25 12s3.75-6 9.75-6 9.75 6 9.75 6-3.75 6-9.75 6-9.75-6-9.75-6z" />
                    <circle cx="12" cy="12" r="3" strokeWidth={2} />
                  </svg>
                </span>
                <span className="text-lg sm:text-2xl font-black text-white group-hover:text-accent transition-colors tabular-nums">
                  Capítulo {ch.number}
                </span>
              </div>
              <p className="mt-1 text-sm sm:text-lg font-black italic uppercase text-zinc-500 line-clamp-1">
                "{ch.title || `Capítulo ${ch.number}`}"
              </p>
              {ch.language && ch.language !== 'es' && (
                <span className="mt-2 inline-flex text-[10px] uppercase font-bold tracking-wider bg-white/5 text-zinc-400 px-1.5 py-0.5 rounded flex-shrink-0">
                  {ch.language}
                </span>
              )}
            </div>

            <div className="col-span-2 sm:col-span-1 flex items-center justify-end gap-4 flex-shrink-0 ml-1 sm:ml-3">
              {ch.pageCount != null && (
                <span className="hidden lg:inline text-xs text-zinc-600 font-bold uppercase tracking-widest tabular-nums">{ch.pageCount} págs</span>
              )}
              <span className="hidden md:inline text-xs text-zinc-600 font-black uppercase tracking-widest">
                {relativeDate(ch.publishedAt || ch.downloadedAt)}
              </span>
              <span className="text-xs sm:text-sm font-black uppercase tracking-widest text-accent">Leer</span>
            </div>
          </a>
        ))}
      </div>

      {remaining > 0 && (
        <div className="flex items-center justify-center mt-6 gap-3">
          <button
            type="button"
            onClick={() => setVisible((v) => Math.min(v + step, chapters.length))}
            className="px-6 py-2.5 rounded-full bg-accent text-zinc-950 text-sm font-bold hover:bg-accent-400 transition-colors shadow-glow-accent"
          >
            Mostrar más ({Math.min(step, remaining)})
          </button>
          {remaining > step && (
            <button
              type="button"
              onClick={() => setVisible(chapters.length)}
              className="px-5 py-2.5 rounded-full border border-white/10 bg-ink-800/70 text-zinc-300 text-sm font-medium hover:border-accent/60 hover:text-white transition-colors"
            >
              Ver todos ({chapters.length})
            </button>
          )}
        </div>
      )}

      {visible > initialCount && (
        <div className="flex items-center justify-center mt-2">
          <button
            type="button"
            onClick={() => setVisible(initialCount)}
            className="text-xs text-zinc-500 hover:text-accent underline underline-offset-4"
          >
            Colapsar
          </button>
        </div>
      )}
    </div>
  );
}
