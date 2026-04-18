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
| `npm run web:build` | Build de producción del sitio web (adaptador **Vercel**) |
| `npm run web:build:cf` | Build para **Cloudflare Pages** (`astro.cloudflare.mjs`) |
| `npm run shared:build` | Compila `@yomiru/shared` |
| `npm run db:generate` / `db:migrate` / `db:studio` | Tareas de Drizzle/DB (`@yomiru/db`) |
| `npm run ingestor` / `ingestor:dev` | Worker / dev del ingestor |
| `npm run redis:up` | Levanta Redis con Docker Compose |
| `npm run typecheck` | Typecheck en workspaces que lo expongan |
| `npm run test:backend` | Tests del backend |

## Datos locales

La carpeta `storage/` (caché, logs, artefactos grandes) está ignorada por Git y no se sube al remoto.

## Despliegue en Vercel (`apps/web`)

El sitio Astro usa SSR (`output: 'server'`) y el adaptador **`@astrojs/vercel`**. El build de producción es `npm run web:build` desde la raíz del monorepo.

### En el dashboard de Vercel

1. **New Project** → importa el repo de GitHub.
2. **Root Directory:** `apps/web` (así Vercel detecta Astro y `astro.config.mjs`).
3. **Install Command** (workspaces en la raíz del repo):

   `cd ../.. && npm install`

4. **Build Command:**

   `cd ../.. && npm run web:build`

5. **Node.js:** en *Settings → Environment Variables* añade `NODE_VERSION` = `22` (o la misma que [`.nvmrc`](./.nvmrc)), alineada con `engines` de `@yomiru/web`.

### Variables de entorno (producción)

Configúralas en Vercel para el runtime del servidor:

| Variable | Uso |
|----------|-----|
| `DATABASE_URL` | Postgres (p. ej. Supabase); obligatoria para el catálogo y páginas que consultan la BD. |
| `R2_PUBLIC_URL` | URL pública del bucket/CDN; si está definida, las imágenes van directo al CDN. |
| `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Necesarias si sirves media vía R2 sin URL pública (proxy `/media/...`). |
| `ADMIN_SECRET` | Autenticación de rutas `/admin` y APIs de administración. |

Tras el primer despliegue, revisa los logs de la función serverless si algo falla al conectar a la BD o a R2.

## Despliegue en Cloudflare Pages (`apps/web`)

Alternativa al plan de pago de Vercel con repos privados de organización: el mismo proyecto tiene un segundo config **`astro.cloudflare.mjs`** con **`@astrojs/cloudflare`**.

### En el dashboard de Cloudflare (Pages)

1. **Workers & Pages** → **Create** → **Connect to Git** y elige el repositorio (personal o el que permita el plan gratuito).
2. **Root directory:** déjalo **vacío** o **`.`** (raíz del repositorio). **No pongas solo `apps/web`:** si la raíz es `apps/web`, `npm install` no instala bien los workspaces (`@yomiru/db`, etc.) y el build falla.
3. **Build configuration:**
   - **Framework preset:** `None` (recomendado para monorepos).
   - **Install command:** `npm install` (por defecto; debe ejecutarse en la raíz del repo).
   - **Build command:** `npm run web:build:cf`
   - **Build output directory:** `apps/web/dist`
4. Si por alguna razón **tienes** que usar **Root directory = `apps/web`**, entonces el **Install command** tiene que ser `cd ../.. && npm install` y el **Build command** `npm run web:build:cf` (ese script también existe en `apps/web/package.json` como alias al build de Cloudflare).
5. **Environment variables:** las mismas que en Vercel (`DATABASE_URL`, `R2_*`, `ADMIN_SECRET`, `R2_PUBLIC_URL`, etc.) en el entorno **Production** (y Preview si quieres).

Node: en *Settings → Environment variables* puedes fijar `NODE_VERSION` = `22` si el build lo pide.

### Avisos importantes (Cloudflare Workers)

- El runtime **no es Node completo**: rutas que usan **Postgres** o **R2 con el SDK AWS** pueden necesitar pruebas en producción. Si Postgres falla, Cloudflare ofrece **[Hyperdrive](https://developers.cloudflare.com/hyperdrive/)** para conectar a bases SQL desde Workers.
- El build puede advertir por **sesiones / KV** (`SESSION`): si no usas sesiones de Astro con KV, suele ignorarse; si hace falta, crea un namespace KV en Cloudflare y enlázalo como te indique la documentación del adaptador.
- El build por defecto sigue siendo **`npm run web:build`** (Vercel). Cloudflare usa **`npm run web:build:cf`**.

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
