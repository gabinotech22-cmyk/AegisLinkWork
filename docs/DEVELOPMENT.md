# AegisLink Work — Desarrollo Local

> **Doc canónico** de "Requisitos de entorno" (mapa en `CLAUDE.md`). Estado: **fase 0/1** — el repo
> contiene reglas, docs y prototipo; los paquetes `server/`, `mobile/` y `desktop/` llegan en la fase 2
> y esta doc se completa **en esa misma PR**. Estado de fases: `docs/ROADMAP.md`.

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

Instalación de dependencias por paquete: se documenta en la fase 2 (`cd server && npm install`, etc.).

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

Fase 2. Mientras tanto, el único artefacto ejecutable es el prototipo de diseño:

```bash
npx --yes serve -l 4180 prototype
```

## Notas de privacidad para desarrollo

- Nunca apuntar un cliente de desarrollo al relay de producción del AegisLink normal: son productos
  y relays distintos.
- Ningún `.env` con valores reales se commitea (`.gitignore`); `_scratch/` para cualquier dump.
- Los logs de diagnóstico de ratchet van tras flag dedicado y hashean prefijos de clave (regla de oro
  de seguridad #6).
