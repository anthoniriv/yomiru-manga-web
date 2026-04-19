export function formatStatus(status?: string | null): string | null {
  const key = status?.trim().toLowerCase();
  if (!key || key === 'unknown') return null;

  const labels: Record<string, string> = {
    ongoing: 'En emisión',
    publishing: 'En emisión',
    completed: 'Finalizado',
    finished: 'Finalizado',
    complete: 'Finalizado',
    hiatus: 'En pausa',
    paused: 'En pausa',
    cancelled: 'Cancelado',
    canceled: 'Cancelado',
  };

  return labels[key] ?? toDisplayLabel(status ?? '');
}

export function formatGenre(genre?: string | null): string {
  if (!genre) return '';
  const key = genre.trim().toLowerCase();

  const labels: Record<string, string> = {
    action: 'Acción',
    adventure: 'Aventura',
    avant_garde: 'Vanguardia',
    boys_love: 'Romance masculino',
    comedy: 'Comedia',
    crime: 'Crimen',
    demons: 'Demonios',
    drama: 'Drama',
    ecchi: 'Ecchi',
    fantasy: 'Fantasía',
    game: 'Juego',
    girls_love: 'Romance femenino',
    gore: 'Sangriento',
    harem: 'Harén',
    historical: 'Histórico',
    horror: 'Terror',
    isekai: 'Isekai',
    josei: 'Josei',
    magic: 'Magia',
    martial_arts: 'Artes marciales',
    mecha: 'Mecha',
    mystery: 'Misterio',
    psychological: 'Psicológico',
    romance: 'Romance',
    samurai: 'Samurai',
    school: 'Escolar',
    school_life: 'Vida escolar',
    sci_fi: 'Ciencia ficción',
    seinen: 'Seinen',
    shoujo: 'Shoujo',
    shounen: 'Shounen',
    slice_of_life: 'Recuentos de la vida',
    smut: 'Erótico',
    sports: 'Deportes',
    supernatural: 'Sobrenatural',
    suspense: 'Suspenso',
    thriller: 'Suspenso',
    vampire: 'Vampiros',
  };

  return labels[key] ?? toDisplayLabel(genre);
}

function toDisplayLabel(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}
