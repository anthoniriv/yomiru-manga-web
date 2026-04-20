const titles = [
  'Reencarné como el duque villano',
  'El Camino del Aventurero de Rango S',
  'Eres tan lamentable..por eso solo yo te veo especial',
  'Dándole tutorías a una señora solitaria',
  'Las amigas de mi madre',
  'Fui Secuestrada por el Duque Loco',
  'Domando la chica rebelde',
  '¡Demasiadas Heroinas Perdedoras!',
];

async function t(text: string): Promise<string | null> {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=es&tl=en&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const data = await res.json() as any;
  const segments = Array.isArray(data?.[0]) ? data[0] : [];
  return segments.map((s: any) => s?.[0]).filter(Boolean).join('').trim();
}

for (const x of titles) {
  const en = await t(x);
  console.log(`${x.slice(0, 45).padEnd(45)} → ${en}`);
  await new Promise((r) => setTimeout(r, 400));
}
process.exit(0);
