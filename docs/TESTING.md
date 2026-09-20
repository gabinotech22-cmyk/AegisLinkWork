# AegisLink Work — Testing y CI

> **Doc canónico** de "CI / workflows / cómo se testea" (mapa en `CLAUDE.md`, regla de oro
> "La doc no miente" #7). Estado: **fase 2 hecha** (PR #3): los tres paquetes existen y sus jobs
> de CI están activos. Estado de fases: `docs/ROADMAP.md`.

## Qué corre hoy en CI (`.github/workflows/ci.yml`)

| Job | Cuándo | Qué hace | Regla que hace cumplir |
|---|---|---|---|
| `detect` | siempre | Detecta si existen `server/`, `mobile/`, `desktop/` (por su `package-lock.json`) y qué áreas tocó la PR. Fail-safe: ante la duda, "cambió". | — |
| `repo-hygiene` | siempre | (1) la raíz solo contiene la lista cerrada de `docs/PROJECT-STRUCTURE.md`; (2) ningún archivo trackeado contiene paths de máquina personal (`C:\Users\<x>`, `/home/<x>/`); (3) ningún artefacto de build/test ni binario pesado está trackeado. | Estructura #1 · Operador-local #3 y #4 |
| `docs-sync` | solo `pull_request` | Falla si el diff toca código de producto (`server/src/`, `mobile/src/`, `desktop/src/`, `.github/workflows/`; tests excluidos) sin tocar `docs/`, `README.md`, `CLAUDE.md` o `SECURITY.md`, salvo línea `Docs: none — <motivo>` en el cuerpo de la PR (plantilla). | La doc no miente #7 |
| `server-typecheck` / `server-test` | si existe `server/` | `npx tsc --noEmit` y `npm test` con **Node 24** (`node:sqlite` estable). | Seguridad #11 |
| `mobile-typecheck` / `mobile-test` | si existe `mobile/` | `npx tsc --noEmit` y `npm test -- --passWithNoTests` con Node 22. | Seguridad #11 |
| `desktop-typecheck` / `desktop-test` | si existe `desktop/` | `npm run typecheck` y `npm test` (Vitest) con Node 22. | Seguridad #11 y #5 (paridad) |

Otros workflows activos desde el día 0:
- `codeql.yml` — SAST semántico JS/TS (security-extended), config en `.github/codeql/codeql-config.yml`.
  Se salta el análisis (paso `Detect product code`) mientras no exista ningún `package.json` de
  `server/`, `mobile/` o `desktop/`: CodeQL falla en duro si no ve código fuente.
- `dependabot.yml` — bumps semanales agrupados por paquete (`github-actions`, `mobile`, `server`,
  `desktop`; `docker` se activa en la fase 6). Los *security updates* (PRs por CVE) van aparte y
  los abre GitHub cuando aparece la alerta.
- `semgrep.yml` — packs públicos + `.semgrep/aegislink-rules.yml`, que codifica las **Reglas de Oro de
  seguridad** (fail-closed, sin `plain:`, sin material de clave en logs…). Hereda las reglas del
  AegisLink normal; las reglas específicas Work (firmas admin atadas al payload, sin REST de mensajes)
  se añaden en la fase 3 junto con el código que vigilan. Un hallazgo justificado con
  `// nosemgrep: <regla>` (motivo en el comentario) se descarta del SARIF antes de subirlo:
  GitHub ignora la propiedad `suppressions` y, sin ese paso, cada supresión era una alerta
  abierta (`docs/AUDIT-2026-09-20-inherited-scan-alerts.md`). CodeQL no honra `lgtm[...]`: sus
  falsos positivos se descartan en *Security → Code scanning* con motivo escrito.

## Jobs que se añaden por fase (no existen aún — no están "rotos")

| Job | Fase en que entra | Motivo |
|---|---|---|
| `mobile-fuzz` (parsers de invitación/enlace/QR) | 3-4 | Necesita `mobile/src/fuzz/`. |
| `permissions-audit` (permisos Android / claves iOS resueltos por Expo) | 4 | Necesita `app.json` Work. |
| `selfhost-compose` (smoke del paquete single-tenant) | 6 | Necesita `infra/selfhost/`. |
| `mobile-e2e` (Maestro en emulador) | 4 | Necesita flujos `.maestro/` de enrolamiento. |
| `eas-build-*`, `build-desktop`, `reproducible-build` | 6 | Necesitan credenciales EAS/firma. |

## Convención de tests (igual que el normal)

- Tests en `__tests__/` del paquete, nombrados `<unidad>.<caso>.test.ts`.
- **Un test de regresión por fix de seguridad** (regla de oro #11), en la misma PR.
- Mobile: Jest + React Native Testing Library. Server: Jest. Desktop: Vitest (IPC, serialización
  de ratchet, cifrado de DB — obligatorio).
- Cambios de crypto/sesión se testean en **mobile y desktop** en la misma rama (regla #5).

## Cómo correr local

```bash
# server (Node 24) — Jest con node:sqlite, --runInBand
cd server  && npx tsc --noEmit && npm test
# mobile — Jest + RNTL (jest.config.js; tsconfig.test.json)
cd mobile  && npx tsc --noEmit && npm test
# desktop — tsc (main + renderer) y Vitest
cd desktop && npm run typecheck && npm test
```

Un solo archivo: `npm test -- <ruta-o-patrón>` (Jest) / `npx vitest run <ruta>` (desktop).
Las suites de mobile y desktop son pesadas; en una máquina justa de recursos conviene correr
solo el typecheck y los archivos tocados, y dejar la suite completa a CI.

## Troubleshooting

- **Miles de líneas cambiadas sin tocar nada / `^M` en el diff.** El repo es LF (`.gitattributes`).
  Si el editor guarda CRLF, `git add --renormalize .` lo corrige; no activar `core.autocrlf=true`.
- **`npm ci` en `mobile/` falla con npm 11.** Regenerar el lock solo con npm 10 (ver `DEVELOPMENT.md`).
- **Jest del server no arranca (`node:sqlite`).** Node < 24: el server exige 24+.
