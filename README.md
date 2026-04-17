# Yomiru Manga

Monorepo del ecosistema **Yomiru** (読みる — «leer»): lector de manga y libros con app móvil (Expo), API backend, web (Astro), ingestor y paquetes compartidos.

**Repositorio:** [github.com/OnichanDevTeam/yomiru-manga](https://github.com/OnichanDevTeam/yomiru-manga)

## Requisitos

- **Node.js** ≥ 20 (recomendado: la versión en [`.nvmrc`](./.nvmrc))
- **npm** (workspaces)
- **Docker** (opcional, para Redis: `docker compose`)

## Instalación

```bash
git clone https://github.com/OnichanDevTeam/yomiru-manga.git
cd yomiru-manga
npm install
```

Copia los `.env` que necesite cada app o paquete (por ejemplo variables de Supabase y API en la app móvil) según la documentación interna de cada workspace. No subas secretos al repositorio.

## Scripts útiles (raíz)

| Comando | Descripción |
|--------|-------------|
| `npm run mobile` | Servidor de desarrollo Expo (`@yomiru/mobile`) |
| `npm run backend` | Backend (`@yomiru/backend`) |
| `npm run backend:lan` | Backend escuchando en `0.0.0.0` |
| `npm run web` | Sitio Astro en el puerto 3000 (`@yomiru/web`) |
| `npm run web:build` | Build de producción del sitio web |
| `npm run shared:build` | Compila `@yomiru/shared` |
| `npm run db:generate` / `db:migrate` / `db:studio` | Tareas de Drizzle/DB (`@yomiru/db`) |
| `npm run ingestor` / `ingestor:dev` | Worker / dev del ingestor |
| `npm run redis:up` | Levanta Redis con Docker Compose |
| `npm run typecheck` | Typecheck en workspaces que lo expongan |
| `npm run test:backend` | Tests del backend |

## Datos locales

La carpeta `storage/` (caché, logs, artefactos grandes) está ignorada por Git y no se sube al remoto.

## Estructura

- `apps/mobile` — App React Native (Expo)
- `apps/backend` — API (Fastify)
- `apps/web` — Frontend Astro
- `apps/ingestor` — Ingestor / worker
- `packages/db`, `packages/shared`, `packages/r2` — Código compartido y datos

## Licencia y autor

Proyecto privado del equipo. Contacto: **Anthoni Rivera** · [anthoniriv01@gmail.com](mailto:anthoniriv01@gmail.com).

---

*Onichan Dev Team*
