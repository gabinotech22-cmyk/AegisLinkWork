# AegisLink Work — Desarrollo Local

> **Doc canónico** de "Requisitos de entorno" (mapa en `CLAUDE.md`). Estado: **fase 2 hecha**
> (PR #3): existen `server/`, `mobile/` y `desktop/` y los comandos de abajo son los reales.
> Estado de fases: `docs/ROADMAP.md`.

## Requisitos

Los mismos que el AegisLink normal, porque el stack es el mismo:

- **Node.js 24+ para `server/`** (usa `node:sqlite`, estable solo desde Node 24; en Node 22 Jest no
  arranca). El CI fija Node 24 para el server (`.github/workflows/ci.yml`).
- **Node.js 22+ para `mobile/` y `desktop/`.**
- **npm 10** para regenerar `mobile/package-lock.json` (npm 11 borra una entrada anidada y rompe el CI).
- Android Studio / Xcode para mobile; Electron viene en las dependencias de desktop.
- Docker (fase 6: imagen única del relay, `TENANCY=multi|single`).

## Setup inicial

```bash
cp .env.example .env
# Edita .env: TENANCY, BLOB_SECRET, TURN_SECRET, URLs del relay.
```

Cada paquete tiene su propio `package-lock.json`; se instala con `npm ci` (nunca `npm install`
para no reescribir el lock):

```bash
cd server  && npm ci
cd mobile  && npm ci
cd desktop && npm ci
```

Finales de línea: el repo es **LF** (`.gitattributes`, `* text=auto eol=lf`). Un checkout en
Windows también recibe LF; no cambiar `core.autocrlf` a `true` en este repo.

## Variables de entorno

La plantilla vive en `.env.example` (raíz). Cada variable nueva se añade **primero** ahí y en esta
sección, en la misma PR que la lee del entorno:

| Variable | Quién la lee | Significado |
|---|---|---|
| `TENANCY` | server | `multi` (SaaS multi-organización) o `single` (una org, self-hosted). Ver `docs/DEPLOYMENT-MODES.md`. |
| `PORT`, `TRUST_PROXY`, `CORS_ORIGIN` | server | Escucha, saltos de proxy y CORS (vacío = fail-closed, nunca `*`). |
| `BLOB_SECRET` | server | Tokens de descarga de adjuntos cifrados. Obligatorio en producción. |
| `DATABASE_URL` | server | SQLite (`./data/…db`) o Postgres. |
| `TURN_HOST`, `TURN_PORT`, `TURN_SECRET` | server + coturn | Credenciales TURN de vida limitada para llamadas 1:1. |
| `EXPO_PUBLIC_SERVER_URL` | mobile | URL del Work relay. |
| `VITE_RELAY_URL` | desktop | URL del Work relay. |
| `APP_LATEST_VERSION`, `APP_MIN_VERSION` | server → clientes | Aviso/bloqueo de versión sin recibir la versión del cliente. |

## Levantar el stack

```bash
# 1. Relay (Node 24). Lee .env de la raíz; SQLite en server/data/ (gitignored).
cd server && npm run dev            # http://localhost:3001

# 2. Mobile (Expo SDK 54). En el emulador Android el relay es http://10.0.2.2:3001
#    (mobile/src/config.ts SERVER_URL_DEV); override con EXPO_PUBLIC_SERVER_URL.
cd mobile && npx expo start         # o: npx expo run:android / run:ios

# 3. Desktop (Electron + Vite). VITE_RELAY_URL apunta al relay.
cd desktop && npm run dev
```

Typecheck por paquete (lo mismo que corre CI): `npx tsc --noEmit` en `server/` y `mobile/`,
`npm run typecheck` en `desktop/`. Tests: ver `docs/TESTING.md`.

En producción un build Work **falla cerrado** si no se le da relay: `SERVER_URL_PROD` apunta a
`work-relay.aegislink.invalid` salvo `EXPO_PUBLIC_SERVER_URL`/`VITE_RELAY_URL`, para que un
cliente Work nunca alcance el relay del AegisLink personal por accidente.

Prototipo de diseño (sin código):

```bash
npx --yes serve -l 4180 prototype
```

## Notas de privacidad para desarrollo

- Nunca apuntar un cliente de desarrollo al relay de producción del AegisLink normal: son productos
  y relays distintos.
- Ningún `.env` con valores reales se commitea (`.gitignore`); `_scratch/` para cualquier dump.
- Los logs de diagnóstico de ratchet van tras flag dedicado y hashean prefijos de clave (regla de oro
  de seguridad #6).
