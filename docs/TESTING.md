# AegisLink Work — Testing y CI

> **Doc canónico** de "CI / workflows / cómo se testea" (mapa en `CLAUDE.md`, regla de oro
> "La doc no miente" #7). Estado: **fase 0/1 — sin paquetes de código todavía**; las secciones de
> tests por paquete se completan en la fase 2 (semilla técnica) **en la misma PR** que cree `server/`,
> `mobile/` y `desktop/`. Estado de fases: `docs/ROADMAP.md`.

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
- `semgrep.yml` — packs públicos + `.semgrep/aegislink-rules.yml`, que codifica las **Reglas de Oro de
  seguridad** (fail-closed, sin `plain:`, sin material de clave en logs…). Hereda las reglas del
  AegisLink normal; las reglas específicas Work (firmas admin atadas al payload, sin REST de mensajes)
  se añaden en la fase 3 junto con el código que vigilan.

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

Se completa en la fase 2 con los comandos reales de cada paquete. Mientras tanto, lo único
ejecutable es el prototipo de diseño:

```bash
npx --yes serve -l 4180 prototype
```

## Troubleshooting

Vacío hasta que exista código. Cada problema real que aparezca se documenta aquí con su causa y
solución (no en memoria de nadie).
