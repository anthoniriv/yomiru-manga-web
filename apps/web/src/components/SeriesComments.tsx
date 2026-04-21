import { useEffect, useState } from 'react';

interface CommentItem {
  id: string;
  author_name: string | null;
  body: string;
  created_at: string;
  user_id: string;
}

interface Payload {
  ok: boolean;
  comments: CommentItem[];
}

interface Props {
  slug: string;
  isLoggedIn: boolean;
  currentUserEmail: string | null;
  commentStatus: string | null;
}

export default function SeriesComments({ slug, isLoggedIn, currentUserEmail, commentStatus }: Props) {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      setIsLoading(true);
      setHasError(false);
      try {
        const response = await fetch(`/api/series/${encodeURIComponent(slug)}/community`);
        if (!response.ok) throw new Error(`community_failed:${response.status}`);
        const payload = (await response.json()) as Payload;
        if (!active) return;
        setComments(Array.isArray(payload.comments) ? payload.comments : []);
      } catch {
        if (!active) return;
        setHasError(true);
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [slug]);

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5 md:p-6">
      <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-accent text-[10px] font-black uppercase tracking-[0.24em]">Comunidad</p>
          <h2 className="text-3xl md:text-4xl font-black italic tracking-tighter uppercase text-white">
            Comentarios
          </h2>
        </div>
        <p className="text-sm text-zinc-500">{isLoading ? 'Cargando...' : `${comments.length} recientes`}</p>
      </div>

      {commentStatus === 'ok' && (
        <div className="mb-4 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
          Comentario publicado.
        </div>
      )}
      {commentStatus === 'invalid' && (
        <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          Escribe entre 1 y 800 caracteres.
        </div>
      )}
      {commentStatus === 'error' && (
        <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          No pudimos publicar tu comentario.
        </div>
      )}

      {isLoggedIn ? (
        <form method="POST" action={`/api/series/${slug}/comment`} className="space-y-3" data-inline-submit data-no-loader>
          <input type="hidden" name="redirect" value={`/manga/${slug}`} />
          <label className="block">
            <span className="sr-only">Comentario</span>
            <textarea
              name="body"
              required
              maxLength={800}
              rows={4}
              placeholder={`Comenta como ${currentUserEmail ?? 'lector'}...`}
              className="w-full resize-none rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
            />
          </label>
          <button
            type="submit"
            className="inline-submit-loader inline-flex items-center justify-center rounded-xl bg-accent px-5 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-950 shadow-glow-accent hover:bg-white transition-colors"
          >
            <span>Publicar comentario</span>
          </button>
        </form>
      ) : (
        <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-400">
          <p>Necesitas una cuenta para comentar y votar.</p>
          <a
            href={`/login?redirect=${encodeURIComponent(`/manga/${slug}`)}`}
            data-no-loader
            className="mt-3 inline-flex rounded-lg bg-accent px-4 py-2 text-[10px] font-black uppercase tracking-widest text-zinc-950 hover:bg-white transition-colors"
          >
            Iniciar sesión
          </a>
        </div>
      )}

      <div className="mt-8 space-y-4">
        {hasError && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
            No pudimos cargar los comentarios ahora mismo.
          </div>
        )}

        {!hasError && isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 animate-pulse">
                <div className="h-4 w-28 rounded bg-zinc-800" />
                <div className="mt-3 h-3 w-full rounded bg-zinc-900" />
                <div className="mt-2 h-3 w-4/5 rounded bg-zinc-900" />
              </div>
            ))}
          </div>
        )}

        {!hasError && !isLoading && comments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/30 px-4 py-8 text-center text-sm text-zinc-500">
            Todavía no hay comentarios. Sé el primero en romper el hielo.
          </div>
        ) : null}

        {!hasError && !isLoading && comments.map((comment) => (
          <article key={comment.id} className="rounded-xl border border-zinc-800 bg-zinc-900/55 p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-sm font-black text-white">{comment.author_name ?? 'Lector'}</p>
              <time className="text-[10px] font-bold uppercase tracking-widest text-zinc-600" dateTime={comment.created_at}>
                {new Date(comment.created_at).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })}
              </time>
            </div>
            <p className="whitespace-pre-line text-sm leading-6 text-zinc-300">{comment.body}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
