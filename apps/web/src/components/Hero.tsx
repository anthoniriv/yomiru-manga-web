import { useEffect, useState, useRef } from 'react';
import { formatStatus } from '../lib/labels';

export interface HeroSlide {
  slug: string;
  title: string;
  description: string | null;
  coverUrl: string;
  backgroundUrl?: string | null;
  source: string | null;
  rating: number | null;
  totalChapters: number | null;
  status: string | null;
}

interface Props {
  slides: HeroSlide[];
  intervalMs?: number;
}

export default function Hero({ slides, intervalMs = 7000 }: Props) {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (paused || slides.length <= 1) return;
    timerRef.current = setInterval(() => {
      setIdx((i) => (i + 1) % slides.length);
    }, intervalMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [paused, slides.length, intervalMs]);

  if (slides.length === 0) return null;
  const current = slides[idx];
  const currentStatus = formatStatus(current.status);
  const titleParts = current.title.split(' ');
  const titleHead = titleParts.slice(0, -1).join(' ');
  const titleTail = titleParts.length > 1 ? titleParts[titleParts.length - 1] : '';

  return (
    <section
      className="relative h-[620px] md:h-[680px] w-full bg-black overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="absolute inset-0">
        {slides.map((s, i) => (
          <img
            key={s.slug}
            src={s.backgroundUrl || s.coverUrl}
            alt=""
            aria-hidden="true"
            className={`absolute inset-0 w-full h-full object-cover object-center blur-[1px] scale-105 transition-opacity duration-1000 ${
              i === idx ? 'opacity-60' : 'opacity-0'
            }`}
          />
        ))}
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/50 to-zinc-950/5" />
        <div className="absolute inset-0 bg-gradient-to-r from-zinc-950 via-zinc-950/45 to-zinc-950/10" />
        <div className="absolute inset-0 bg-black/10" />
      </div>

      <div className="relative z-10 h-full max-w-[1600px] mx-auto px-4 md:px-8 flex items-center">
        <div className="grid lg:grid-cols-12 gap-8 items-center w-full animate-fade-in" key={current.slug}>
          <div className="lg:col-span-7 space-y-6">
            <div className="space-y-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="bg-accent text-zinc-950 font-black text-[10px] px-2 py-0.5 rounded uppercase tracking-widest">
                  Destacado
                </span>
                {current.source && (
                  <span className="text-accent font-bold text-[10px] uppercase tracking-[0.3em]">
                    {current.source.replace(/^www\./, '')}
                  </span>
                )}
                {currentStatus && (
                  <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold">
                    · {currentStatus}
                  </span>
                )}
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-white italic leading-tight tracking-tighter uppercase drop-shadow-2xl line-clamp-2">
                {titleHead}
                {titleTail && (
                  <span className="text-outline-white text-transparent ml-2">{titleTail}</span>
                )}
              </h1>
            </div>

            <div className="flex items-center gap-4 text-xs">
              {current.rating != null && (
                <span className="text-zinc-100 font-semibold flex items-center gap-1">
                  <span className="text-accent">★</span>
                  {current.rating.toFixed(1)}
                </span>
              )}
              {current.totalChapters != null && (
                <span className="text-zinc-400 font-medium">
                  {current.totalChapters} capítulos
                </span>
              )}
            </div>

            {current.description && (
              <p className="text-zinc-400 text-base max-w-xl leading-relaxed line-clamp-2 md:line-clamp-3">
                {current.description}
              </p>
            )}

            <div className="flex items-center gap-3 pt-2">
              <a
                href={`/manga/${current.slug}`}
                className="bg-accent text-zinc-950 font-black px-8 py-3.5 rounded-xl flex items-center gap-2 hover:bg-white transition-all transform hover:scale-105 active:scale-95 text-sm shadow-lg shadow-accent/30"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
                LEER AHORA
              </a>
              <a
                href={`/manga/${current.slug}`}
                className="backdrop-blur-md font-black px-8 py-3.5 rounded-xl border flex items-center gap-2 transition-all text-sm bg-zinc-900/80 border-zinc-700/50 text-white hover:bg-zinc-800"
              >
                MÁS DETALLES
              </a>
            </div>
          </div>

          <div className="hidden lg:block lg:col-span-5 justify-self-end">
            <div className="relative w-[330px] h-[470px] rounded-2xl overflow-hidden shadow-[0_30px_70px_rgba(0,0,0,0.85)] border border-white/10 group transform rotate-2 hover:rotate-0 transition-all duration-500">
              <img
                src={current.coverUrl}
                alt={current.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <div className="absolute bottom-4 left-4 right-4">
                <p className="text-white font-black italic text-lg drop-shadow-lg line-clamp-2">
                  {current.title}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {slides.length > 1 && (
        <div className="absolute bottom-6 right-8 z-20 flex items-center gap-4">
          <div className="flex gap-2 mr-4">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIdx(i)}
                className={`h-1 transition-all duration-500 rounded-full ${
                  i === idx ? 'w-8 bg-accent' : 'w-2 bg-zinc-800 hover:bg-zinc-600'
                }`}
                aria-label={`Ir a slide ${i + 1}`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setIdx((i) => (i - 1 + slides.length) % slides.length)}
              className="w-10 h-10 rounded-full border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 hover:border-accent/40 transition-all"
              aria-label="Anterior"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => setIdx((i) => (i + 1) % slides.length)}
              className="w-10 h-10 rounded-full border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 hover:border-accent/40 transition-all"
              aria-label="Siguiente"
            >
              ›
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
