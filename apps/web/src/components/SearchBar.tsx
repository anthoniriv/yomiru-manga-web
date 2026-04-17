import { useState, useEffect, useRef } from 'react';
import LightningLoader from './LightningLoader';

interface SearchResult {
  slug: string;
  title: string;
  coverUrl: string;
}

export default function SearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialQuery = params.get('q') ?? '';
    if (initialQuery) setQuery(initialQuery);
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search.json?q=${encodeURIComponent(query)}`);
        const data: SearchResult[] = await res.json();
        setResults(data);
        setIsOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <form className="relative" action="/mangas" method="GET">
        <input
          type="text"
          name="q"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar manga..."
          className="w-full pl-11 pr-4 py-3 rounded-full bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-500 focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition-all text-sm font-medium"
          onFocus={() => query && results.length > 0 && setIsOpen(true)}
        />
        <button type="submit" className="sr-only">Buscar</button>
        <svg
          className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        {loading && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <LightningLoader size={18} />
          </div>
        )}
      </form>

      {isOpen && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-800 overflow-hidden z-50 max-h-80 overflow-y-auto">
          {results.map((r) => (
            <a
              key={r.slug}
              href={`/manga/${r.slug}`}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/10 transition-colors"
              onClick={() => setIsOpen(false)}
            >
              <img
                src={r.coverUrl}
                alt={r.title}
                className="w-8 h-12 object-cover rounded flex-shrink-0 bg-zinc-800"
                onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder-cover.svg'; }}
              />
              <span className="text-sm text-zinc-200 line-clamp-2 font-medium">{r.title}</span>
            </a>
          ))}
        </div>
      )}

      {isOpen && query && results.length === 0 && !loading && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-800 px-4 py-3 z-50">
          <p className="text-sm text-zinc-500">Sin resultados para &ldquo;{query}&rdquo;</p>
        </div>
      )}
    </div>
  );
}
