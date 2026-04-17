import { useEffect } from 'react';

interface Props {
  prevUrl: string | null;
  nextUrl: string | null;
  seriesUrl: string;
  seriesTitle: string;
  chapterNumber: number;
}

export default function ChapterNav({ prevUrl, nextUrl, seriesUrl, seriesTitle, chapterNumber }: Props) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') && prevUrl) {
        window.location.href = prevUrl;
      }
      if ((e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') && nextUrl) {
        window.location.href = nextUrl;
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [prevUrl, nextUrl]);

  return (
    <nav className="sticky top-14 z-40 bg-primary-900/80 backdrop-blur-xl border-b border-white/5">
      <div className="max-w-3xl mx-auto px-4 h-12 flex items-center justify-between gap-4">
        <a
          href={seriesUrl}
          className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-accent transition-colors truncate"
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="truncate">{seriesTitle}</span>
        </a>

        <span className="text-sm font-bold text-white flex-shrink-0 tabular-nums">Cap. {chapterNumber}</span>

        <div className="flex items-center gap-1 flex-shrink-0">
          {prevUrl ? (
            <a
              href={prevUrl}
              className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white hover:bg-accent/20 transition-colors px-2.5 py-1.5 rounded-md"
              title="Capítulo anterior (← / A)"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Prev
            </a>
          ) : (
            <span className="flex items-center gap-1 text-xs text-zinc-700 px-2.5 py-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Prev
            </span>
          )}

          {nextUrl ? (
            <a
              href={nextUrl}
              className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white hover:bg-accent/20 transition-colors px-2.5 py-1.5 rounded-md"
              title="Capítulo siguiente (→ / D)"
            >
              Next
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </a>
          ) : (
            <span className="flex items-center gap-1 text-xs text-zinc-700 px-2.5 py-1.5">
              Next
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </span>
          )}
        </div>
      </div>
    </nav>
  );
}
