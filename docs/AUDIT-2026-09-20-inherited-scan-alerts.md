# Auditoría 2026-09-20 — alertas de code-scanning heredadas con la semilla

> **Estado:** ✅ cerrada (PR #5, issue #4). Doc histórico: registra el triage de las 16 alertas de
> GitHub code scanning que llegaron con la semilla técnica (PR #3). El estado actual de las
> alertas vive en la pestaña *Security → Code scanning* del repo; las reglas y su tubería en
> `docs/TESTING.md`.

## Contexto

La semilla copió `server/`, `mobile/` y `desktop/` del AegisLink personal. CodeQL y Semgrep
corrieron por primera vez sobre ese código y GitHub abrió 16 alertas — **15 de ellas también
abiertas en el personal** (mismos archivos y líneas). `main` no tiene protección de rama, así
que no bloqueaban el merge, pero dejaban los check-runs "CodeQL" y "Semgrep OSS" en rojo en
cada PR, que es la forma más rápida de enseñar a todos a ignorar CI.

## Causa raíz de las alertas Semgrep (10)

Todas menos dos ya estaban justificadas en el código con `// nosemgrep: <regla>` (el mecanismo
sancionado en `.semgrep/aegislink-rules.yml`): el job de Semgrep las suprime y pasa, pero el
SARIF que sube a GitHub las incluye con la propiedad `suppressions`, **que GitHub code scanning
ignora**. Resultado: alerta abierta para un hallazgo ya revisado. Fix: `semgrep.yml` descarta
los resultados con `suppressions` antes de subir el SARIF. La justificación sigue viviendo al
lado del código, que es donde la lee un revisor.

Las otras dos (`mobile/plugins/withFossPush.js`) son un *config plugin* de Expo que corre solo
en `prebuild` y escribe en el log de build; la regla `no-console-log-production` ahora excluye
`**/plugins/*.js` y `**/*.plugin.js`, el mismo recorte que ya hacía `codeql-config.yml`.

## Triage

| # | Herramienta | Regla | Ubicación | Resolución |
|---|---|---|---|---|
| 1-3 | Semgrep | `aegislink-no-plain-prefix-persist` | `desktop/src/main/ipc/database.ts:149,533`, `secureStorage.ts:108` | Ya justificadas: ramas **solo dev** detrás de `app.isPackaged` que falla cerrado en producción (regla de oro #1/#6). Suprimidas en SARIF. |
| 4-5 | Semgrep | `aegislink-no-console-log-production` | `mobile/plugins/withFossPush.js:94,104` | Plugin de build, no bundle. Excluido en la regla. |
| 6-9 | Semgrep | `aegislink-no-console-log-production` | `server/src/index.ts:292-298`, `clusterMaster.ts:81` | Banner de arranque del relay, ya con `nosemgrep`. Suprimidas en SARIF. |
| 10 | Semgrep | `express-res-sendfile` | `server/src/routes/blob.ts:242` | Ya con `nosemgrep`: el id es UUID v4 validado por regex, `path.resolve` + `startsWith(UPLOADS_DIR)`, y exige token HMAC ligado al id (C-1). Suprimida en SARIF. |
| 11 | CodeQL | `js/type-confusion-through-parameter-tampering` | `server/src/routes/blob.ts:170` | **Falso positivo**, descartada: `req.body` viene de `express.raw()` y está estrechado por `Buffer.isBuffer()` dos líneas antes. |
| 12 | CodeQL | `js/weak-cryptographic-algorithm` | `server/src/routes/turn.ts:104` | **Por diseño**, descartada: HMAC-SHA1 es lo que exige el esquema TURN REST de coturn (`use-auth-secret`); credencial efímera, el secreto no sale del relay. |
| 13 | CodeQL | `js/bad-code-sanitization` | `server/src/routes/links.ts:58` | **Falso positivo**, descartada: solo se interpola `JSON.stringify` de una constante del servidor; la página va anclada por CSP `script-src 'sha256-…'` (M-4). |
| 14 | CodeQL | `js/xss-through-dom` | `desktop/src/renderer/components/Avatar.tsx:97` | **Falso positivo**, descartada (mismo triage que el personal): `safeImageSrc()` es una allowlist de protocolos; tests `avatar.uri.test.ts`. |
| 15 | CodeQL | `js/http-to-file-access` | `desktop/scripts/fetch-tor.mjs:69` | Script de build con sha256 pinneado; descartada y `**/scripts/**` excluido en `codeql-config.yml` (antes solo `scripts/` de raíz). |
| 16 | CodeQL | `js/http-to-file-access` | `server/src/routes/blob.ts:185` | **Por diseño**, descartada: guardar el blob cifrado es la feature; ruta = UUID del servidor, tamaño acotado (50 MB + cuota), PoW, TTL 24 h. |

Ningún hallazgo requería cambio de comportamiento; por eso no hay tests nuevos (regla de oro
#11 aplica a *fixes*). Lo que sí cambió, y queda testeado por el propio CI, es la tubería:
`semgrep.yml` (filtro de suprimidos), `.semgrep/aegislink-rules.yml` (exclusiones de build) y
`.github/codeql/codeql-config.yml` (`**/scripts/**`).

## Cómo justificar un hallazgo a partir de ahora

- Semgrep: `// nosemgrep: <id-de-regla>` en la línea anterior **con el motivo en el comentario**.
  No aparece como alerta en GitHub; sí aparece en el diff para el revisor.
- CodeQL: no honra comentarios `lgtm[...]`. Se descarta desde *Security → Code scanning* con
  motivo escrito (≤ 280 caracteres) — y, si es código de tooling, se excluye la ruta en
  `codeql-config.yml`.
- Un hallazgo real se arregla con su test de regresión en la misma PR (regla de oro #11).
