# Estructura del proyecto AegisLink Work

> Documento normativo. La versión corta y obligatoria vive en `CLAUDE.md`
> (REGLA DE ORO — Estructura y ubicación de archivos). Aquí está el detalle y la
> justificación. Si una PR introduce un archivo y no sabes dónde va, este doc decide.

## Por qué existe

En el AegisLink normal la raíz del repo se contaminó con ~40 prototipos sueltos, ~400
artefactos de depuración (`_*.png`, `*.apk` de 180 MB, `bugreport-*.zip`) y scripts/docs
ad-hoc. Work hereda la lección desde el día 0 y además la hace cumplir en CI: el job
`repo-hygiene` (`.github/workflows/ci.yml`) falla si aparece en la raíz algo fuera de la
lista cerrada, si un archivo trackeado contiene un path de máquina personal, o si se
trackea un artefacto de build. **La raíz es sagrada: solo lo canónico vive ahí.**

## Mapa canónico de directorios

| Ruta | Dueño / contenido | Quién toca aquí |
|------|-------------------|-----------------|
| `mobile/` | App Expo SDK 54 + React Native + TS (cliente miembro + consola admin reducida). Fase 2+. | `mobile-lead` |
| `desktop/` | Cliente Electron (cliente miembro + **consola admin completa**); **paridad obligatoria** con mobile en crypto/sesión. Fase 2+. | `mobile-lead` / `crypto-lead` |
| `server/` | Work relay: Socket.IO, orgs/salas/roles, SQLite/PG, push, señalización WebRTC. `TENANCY=multi\|single`. Fase 2+. | `backend-lead` |
| `infra/` | CI/CD, EAS, coturn, Docker, deploy, runbooks; **`infra/selfhost/`** = paquete single-tenant (`docs/SELF-HOSTING.md`). Fase 6. | `infra-lead` |
| `web/` | Landing / web pública Work | `mobile-lead` |
| `docs/` | Toda la documentación: concepto, modelo de amenazas, datos, protocolo, consola admin, diseño, despliegue, roadmap, legal, testing; `docs/adr/` decisiones | todos |
| `prototype/` | Prototipos de diseño (`*.jsx`, `*.html`, canvas) heredados del normal + tema `WORK`. **Referencia, no build.** `enterprise.jsx` es la consola admin. | diseño |
| `scripts/` | Scripts operativos sueltos (`*.ps1`, helpers de build/deploy local) | `infra-lead` |
| `promo-video/` | Material de marketing/vídeo | marketing |
| `.claude/` | Sub-agentes, equipos, skills y referencias (heredados del normal) | `director` |
| `.semgrep/` | Reglas Semgrep que codifican las reglas de oro de seguridad | `qa-lead` |
| `_scratch/` | **Transitorio, gitignored.** Screenshots de emulador, dumps UI, logs, APKs de prueba, scripts de un solo uso | nadie commitea |

## Qué puede vivir en la raíz (lista cerrada)

Solo estos, y nada más nuevo sin justificación:
`README.md`, `LICENSE`, `SECURITY.md`, `CLAUDE.md`, `.gitignore`, `.gitattributes`, `.env.example`,
`docker-compose.yml`, `skills-lock.json`, y los dotfiles de tooling (`.github/`, `.claude/`,
`.semgrep/`, `.semgrepignore`). Esta lista **es** la expresión regular `ALLOWED` del job
`repo-hygiene` en `.github/workflows/ci.yml`: cambiar una implica cambiar la otra.

Cualquier otro archivo en la raíz es deuda: muévelo a su carpeta o a `_scratch/`.

## Reglas de ubicación

1. **Código de producto** → siempre dentro de `mobile/`, `desktop/`, `server/` o `web/`.
   Nunca un `.ts`/`.tsx` de producto suelto en la raíz.
2. **Documentación** → `docs/`. Un `.md` nuevo va a `docs/` salvo los 4 canónicos de raíz.
3. **Scripts operativos** → `scripts/`. No `.ps1`/`.sh` sueltos en raíz. Pero
   ojo: `scripts/` es solo para lo idempotente/versionado que pasa por rutas
   autenticadas — cirugía directa de prod (SSH + `DELETE`/`DROP` crudo,
   limpieza de un incidente puntual) es **operador-local**, nunca `scripts/`
   (ver REGLA DE ORO — Herramientas destructivas y operador-local en `CLAUDE.md`).
4. **Prototipos de diseño** → `prototype/`. Son referencia histórica; no se importan desde el build.
5. **Cualquier cosa transitoria** (capturas, logs, dumps, APKs de test, `_powtest.mjs`,
   experimentos de un solo uso) → `_scratch/`, que está gitignored. **Nunca** se commitea.
6. **Binarios pesados** (APK, mp4, zip, bugreports) no se versionan; van a `_scratch/`
   o a release artifacts, nunca a git. Ver patrones en `.gitignore`.
7. **Artefactos de build/test** (`coverage/`, `lcov-report/`, `dist/`) tampoco se
   versionan — son regenerables por `npm test`/`npm run build`. Si aparecen en
   `git ls-files`, es una fuga: destrackear + añadir el patrón a `.gitignore`.
8. **Paridad mobile↔desktop**: un cambio de crypto/sesión/ratchet vive en la misma rama
   y toca ambas carpetas. No se reparte una feature entre varias ramas (ver REGLA DE ORO de ramas).

## Organización interna de cada paquete

El mapa de arriba dice en qué paquete vive algo; esto dice **dónde dentro del paquete**.
No inventes carpetas nuevas en la raíz de un paquete sin actualizar esta tabla.

### `mobile/src/`
| Subcarpeta | Qué contiene |
|------------|--------------|
| `screens/` | Una pantalla por archivo (`PascalCase.tsx`). Es la capa de navegación. La consola admin vive en `screens/admin/`. |
| `components/` | UI reutilizable, sin lógica de negocio ni I/O. |
| `crypto/` | Double Ratchet, X3DH, NaCl, fingerprints, SenderKey de sala, firmas de org/admin. **Nada de UI aquí.** |
| `socket/` | Cliente del relay, sealed-sender, sesión. `client.ts` es el núcleo. |
| `webrtc/` · `calls/` | Señalización y UI de llamadas E2EE. |
| `db/` | expo-sqlite, esquema, cifrado at-rest. |
| `store/` | Estado global (zustand). |
| `security/` · `lock/` | Modo pánico, biometría, app-lock. |
| `notifications/` | Push wake-up (payload siempre cifrado). |
| `hooks/` · `utils/` · `theme/` · `i18n/` | Helpers transversales. |
| `org/` | Membresía, dispositivos, políticas, roles: estado y validación de certificados de la org. |
| `web3/` | Pagos por asiento y DIDs — opcional, la app funciona sin esto. |
| `__tests__/` · `__mocks__/` | Tests Jest + RNTL y sus mocks (ver convención de tests). |

### `server/src/`
| Subcarpeta | Qué contiene |
|------------|--------------|
| `relay/` | Socket.IO, reenvío de blobs opacos, colas. |
| `auth/` | Challenge-response Ed25519, autenticación de socket. |
| `routes/` | Endpoints HTTP (validados con Zod). **Nunca mensajes por REST**: solo socket sellado. |
| `org/` | Orgs, miembros, dispositivos, salas, políticas, audit log firmado; aislamiento por `orgId` (`TENANCY`). |
| `crypto/` · `pow/` | Verificación de firmas, prueba de trabajo anti-spam. |
| `push/` | FCM/APNs solo wake-up. |
| `db/` | SQLite del relay (mínimos metadatos at-rest). |
| `__tests__/` · `__mocks__/` | Tests del servidor. |

### `desktop/src/`
Modelo Electron: `main/` (proceso principal + IPC), `preload/` (puente seguro),
`renderer/` (UI + `renderer/socket/client.ts`, que **espeja** `mobile/src/socket/client.ts`).
Todo cambio de crypto/sesión va en paralelo en ambos `client.ts` (regla de oro #5).

## Convenciones de nombres y tests

- **Componentes y pantallas**: `PascalCase.tsx`. **Módulos de lógica/util**: `camelCase.ts`.
- **Tests**: en un `__tests__/` del paquete, nombrados `<unidad>.<caso>.test.ts`
  (p. ej. `client.desyncRecovery.test.ts`). **Un test de regresión por fix de seguridad** (regla #11).
- **Ramas**: `feat/*` para features, `fix/*` para arreglos, `chore/*` para tooling/estructura.
  Una feature que toca varios paquetes va en **una sola rama** (regla de oro de ramas #5).
- **Una sección de producto nueva** (de las 17) entra como pantallas en `mobile/src/screens/` y `desktop/src/renderer/`
  + su lógica en el paquete que corresponda; nunca como código suelto fuera de `src/`.

## Convención al añadir algo nuevo

Antes de crear un archivo, dos preguntas en orden:
1. ¿Es producto, doc, script, prototipo o scratch? → determina el **paquete/carpeta raíz**.
2. Si es producto, ¿qué capa es (pantalla, componente, crypto, socket, db, store…)? → determina
   la **subcarpeta** según las tablas de arriba.

Si no encaja en ninguna, probablemente es `_scratch/` o no debería existir. En la duda,
este doc y `CLAUDE.md` mandan sobre la conveniencia.
