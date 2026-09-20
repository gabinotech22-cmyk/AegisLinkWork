# AegisLink Work — Roadmap

> **Creado:** 2026-09-19 · **Única fuente de verdad** del estado de fases y de las 17 secciones
> (`CLAUDE.md`). Los demás docs enlazan aquí, no duplican estado. Regla de oro "La doc no
> miente": un `✅` lleva su evidencia (PR, test o ruta de código) al lado; sin evidencia no se marca.

## Decisiones fundacionales (2026-09-19)

| Tema | Decisión | ADR |
|---|---|---|
| Repo | Propio, independiente del AegisLink personal; misma disciplina (reglas de oro copiadas) | — |
| Cripto | Semilla copiada una vez del personal, luego evolución independiente | [ADR-0001](adr/0001-crypto-seed.md) |
| Compliance | Zero-knowledge admin estricto; sin escrow | [ADR-0002](adr/0002-zero-knowledge-admin.md) |
| Despliegue | Multi-tenant y single-tenant desde v1, misma imagen | [ADR-0003](adr/0003-tenancy.md) |
| Clientes | Móvil (Expo) y desktop (Electron) en paralelo, paridad obligatoria | — |
| Diseño | Sistema del personal + púrpura oficial `#8b5cf6` | `DESIGN-SYSTEM.md` |

## Fases

### Fase 0 — Bootstrap del repo y reglas ✅ HECHO (2026-09-19)
- [x] Carpeta vaciada (copia vieja archivada en `_scratch/legacy-copy-2026-06/`, gitignored).
- [x] Reglas de oro copiadas íntegras: `CLAUDE.md`, `.claude/{agents,teams,skills,references}`,
      plantilla de PR, `.gitignore`, `SECURITY.md`, `.semgrep/`. Evidencia: `diff` de las reglas
      contra el personal = solo el mapa código→doc.
- [x] CI desde el día 0: `repo-hygiene`, `docs-sync`, CodeQL, Semgrep; jobs por paquete
      activados por existencia (`.github/workflows/ci.yml`, `TESTING.md`).
- [x] Prototipos de diseño (versión canónica del personal) + tema `WORK` (`prototype/theme.jsx`).
- [x] Repo GitHub `gabinotech22-cmyk/AegisLinkWork`, primer commit en `main`.

### Fase 1 — Concepto y diseño en documentos ✅ HECHO (2026-09-19)
- [x] `CONCEPT.md`, `THREAT-MODEL.md`, `DATA-MODEL.md`, `PROTOCOL.md`, `ADMIN-CONSOLE.md`,
      `DESIGN-SYSTEM.md`, `DEPLOYMENT-MODES.md`, ADR-0001/0002/0003.
- [x] Revisión de incongruencias del concepto contra las 53 pantallas y las defensas del personal
      → 10 cambios aplicados (`CONCEPT.md` §10), `SCREENS.md` (inventario 🟢/🟡/🆕/⛔) y
      `SECURITY-PARITY.md` (checklist de ~40 defensas por fase).
- [ ] Revisión del dueño (abre issues por cada objeción; se cierran antes de la fase 2).

### Fase 2 — Semilla técnica ✅ HECHO (2026-09-20, PR #3)
Criterio de hecho: `tsc` y suites verdes en `server/`, `mobile/`, `desktop/` en CI; app arranca
en emulador y desktop con tema WORK; ningún resto de features del personal que Work no usa.
- [x] Copiado del personal (`origin/main` = `6ad6f6f`, 2026-09-19; ADR-0001): `mobile/`, `desktop/`
      y `server/` completos con sus tests (no solo los módulos de crypto: el criterio "arranca en
      emulador y desktop" exige el shell entero). Finales de línea normalizados a LF
      (`.gitattributes`); el personal se editaba con CRLF en Windows.
- [x] Eliminado lo que `SCREENS.md` marca ⛔ (PR #3):
      - canales públicos sellados: `mobile/src/{channels,api/publicChannels,crypto/publicChannel*,db/channelFeed,store/channels,notifications/channelBackgroundSync,socket/publicChannels}`,
        pantallas `Channel*`, segmento Canales de `Groups`, posts de canal programados, deep link
        `aegislink://channel/`; `server/src/{routes,relay/handlers}/publicChannels`, tablas
        `public_channel*` y el pin de avatares en `routes/blob.ts`.
      - `RelaySettings` (mobile + desktop) y la fila "Mi relay" de Privacidad; `FEDERATION` es una
        constante `false` en ambos `config.ts` (el relay lo fija la invitación de la org). El
        resto de la capa de red heredada (`net/homeRelay`, `relayMigration`) se sustituye en la
        fase 3 con el protocolo de org.
      - `mobile/src/web3` (DIDs, revocación por DID), tabla `revoked_did_hashes` y los endpoints
        `/web3/did/*` y `/web3/device/*` del relay. **Queda** `/web3/subscription/*` +
        `lightning_invoices` como stub de pagos (sección 17).
      - Certificado OTA de firma del personal (`mobile/certs/`) y `mobile/.github/` (workflow
        anidado, GitHub no lo ejecuta): Work genera su propio par de firma en la fase 6.
      - pin-set SPKI del relay personal en `app.plugin.js`/`app.json`: fuera. Work no tiene relay fijo en
        build; el pin viaja en la invitación (`relayPins`, fase 4; `SECURITY-PARITY.md`) y el host SaaS
        se pinnea en la fase 6. Test `audit-regression.test.ts` M-2 reescrito: ningún manifiesto
        apunta al relay personal y cleartext sigue prohibido.
      Se **conservan** perfiles aislados, encuestas anónimas, llamadas de grupo en malla, broadcast.
- [x] `SECURITY-PARITY.md`: las filas 🟢 entran con sus tests tal cual (suites del personal en CI:
      `server-test`, `mobile-test`, `desktop-test`).
- [x] Tema WORK en ambos clientes (`theme/vault.ts`: `#8b5cf6`/`#6d28d9`); app id
      `com.aegislink.work`, slug `aegislink-work`, scheme `aegislinkwork`; paquetes
      `aegislink-work-{mobile,desktop,server}`. Iconos Work en ambos clientes (AegisMark púrpura;
      `mobile/assets/icons/README.md`, `DESIGN-SYSTEM.md` §5): principal, alternativos claro/tinted,
      adaptive + mipmaps Android, splash, favicon, icono de notificación, `.ico` de desktop.
- [x] `DEVELOPMENT.md` y `TESTING.md` con comandos reales.
- [x] Triage de las 16 alertas de code-scanning heredadas (15 también abiertas en el personal):
      `docs/AUDIT-2026-09-20-inherited-scan-alerts.md` (issue #4, PR #5). Causa raíz: GitHub ignora
      las supresiones `nosemgrep` del SARIF; `semgrep.yml` las filtra ahora.
- [ ] ~~`.semgrep/` regla "ningún `SELECT` sin `org_id`"~~ → **movida a la fase 3**: hoy no
      existe ninguna tabla con `org_id`, así que la regla fallaría en todo el relay heredado o
      habría que silenciarla entera. Entra en la misma PR que cree los repos con `orgId`.

### Fase 3 — Server Work 🔴 PENDIENTE
Criterio: `PROTOCOL.md` §3-§9 implementado con un test por endpoint/evento sensible y tests de
aislamiento entre orgs; `THREAT-MODEL.md` §3 con test enlazado en T1, T2, T3, T6, T9, T10, T12.
- [ ] Canonicalización + firma de acciones (`orgSig`), cadena de certificados, nonces.
- [ ] Enrolamiento (`/enroll`), aprobación de dispositivo, revocación con rekey.
- [ ] Orgs, equipos, miembros, salas, `room:key_dist/msg/rekey`, políticas, retención con TTL.
- [ ] Audit log = firmas; exportación JSON/CSV escapada.
- [ ] `TENANCY=multi|single`, repos con `orgId` obligatorio.
- [ ] `.semgrep/` regla: ningún `SELECT` sin `org_id` en los repos de org (viene de la fase 2).

### Fase 4 — Clientes Work (mobile + desktop en paralelo) 🔴 PENDIENTE
Criterio: flujos 5.1-5.6 de `CONCEPT.md` funcionando end-to-end en ambos clientes contra el
relay de la fase 3; consola con las 7 pestañas en desktop y su versión móvil; estados vacíos y
errores de `ADMIN-CONSOLE.md` §6; paridad crypto verificada por tests en ambos.
- [ ] Pantallas 🆕 y 🟡 de `SCREENS.md` §1-§4: Welcome/Enroll/PendingApproval/OrgCreate, OrgSwitcher, Devices con enlace + aprobación, Work Privacy (abandonar org), Directory/MemberDetail, Rooms/Room/RoomInfo/RoomCreate/RoomDiscover, Thread, Announcements, DeviceRevoked, PolicyUnsupported.
- [ ] Políticas nuevas gateando UI: viewOnce, locationSharing, notificationPreviews, allowBackup, allowExport, requireAppLock, blockScreenCapture, warnOnCompromisedRuntime.
- [ ] `RoomCall` (malla heredada, ≤ 6).
- [ ] Salas: hilos, pins, reacciones, adjuntos, programados, efímeros, búsqueda local E2EE.
- [ ] DMs (Double Ratchet + sealed-sender), mensajes de sistema.
- [ ] Consola admin completa (desktop) y reducida (móvil). Políticas aplicadas en cliente.
- [ ] Maestro E2E de enrolamiento; `permissions-audit`; fuzz de parsers de invitación.

### Fase 5 — Completar producto 🔴 PENDIENTE
- [ ] Llamadas 1:1 E2EE (señalización sellada, TURN) — heredadas; verificación de paridad.
- [ ] `AdminBilling` (SaaS, owners).
- [ ] Backup cifrado del perfil Work; backup de clave de org (owner).
- [ ] Pagos por asiento (Lightning; decisión fiat).
- [ ] Reuniones de sala multi-parte: diseño aparte (`MEETINGS-DESIGN.md`) antes de código.

### Fase 6 — Infra, auditoría y salida 🔴 PENDIENTE
- [ ] `infra/selfhost/` single-tenant + `SELF-HOSTING.md`; migración SaaS↔self-host.
- [ ] EAS/stores (`com.aegislink.work`), build desktop, reproducible-build, deploy manual.
- [ ] Legal Work definitivo (`privacy-policy.md`, `terms-of-service.md`).
- [ ] Auditoría interna `qa-lead` de `THREAT-MODEL.md` y `SECURITY-PARITY.md` contra código → `docs/AUDIT-<fecha>.md`.
- [ ] Beta cerrada con 2-3 organizaciones.

## Estado de las 17 secciones

| # | Sección | Estado | Evidencia |
|---|---|---|---|
| 1 | Enrolamiento corporativo por invitación firmada | 📐 diseñado | `PROTOCOL.md` §4 |
| 2 | Identidad de miembro y dispositivos | 📐 diseñado | `DATA-MODEL.md` |
| 3 | Organizaciones, equipos y roles | 📐 diseñado | `DATA-MODEL.md`, `ADMIN-CONSOLE.md` §3 |
| 4 | Salas abiertas/privadas con SenderKey sellada | 📐 diseñado | `PROTOCOL.md` §6 |
| 5 | DMs Double Ratchet + sealed-sender | 📐 heredado | ADR-0001 |
| 6 | Hilos, pins, reacciones, encuestas anónimas, anuncios, búsqueda E2EE local | 📐 diseñado | `PROTOCOL.md` §6, `DATA-MODEL.md` §5, `SCREENS.md` §2 |
| 7 | Adjuntos cifrados y archivos de sala | 📐 heredado | `PROTOCOL.md` §10 |
| 8 | Retención y efímeros por política | 📐 diseñado | `PROTOCOL.md` §7 |
| 9 | Mensajes programados | 📐 heredado | — |
| 10 | Políticas de seguridad de la org | 📐 diseñado | `DATA-MODEL.md` (Policy), `PROTOCOL.md` §8 |
| 11 | Consola admin y auditoría firmada | 📐 diseñado | `ADMIN-CONSOLE.md` |
| 12 | Llamadas 1:1 E2EE | 📐 heredado | `PROTOCOL.md` §10 |
| 13 | Reuniones de sala: malla heredada (≤ 6) en fase 4; SFU E2EE en fase 5 | 📐 parcial | `SCREENS.md` §3 |
| 14 | Pánico y app-lock | 📐 heredado | — |
| 15 | Backup cifrado del perfil Work + backup de clave de org | 📐 diseñado | `DATA-MODEL.md` §2, `SECURITY-PARITY.md` §1 |
| 16 | Multi-tenant + self-host | 📐 diseñado | `DEPLOYMENT-MODES.md` |
| 17 | Pagos por asiento | ⏳ fase 5 | — |

Leyenda: 📐 diseñado (doc aprobado, sin código) · 🟡 en curso · ✅ hecho (con evidencia) · ⏳ pendiente de diseño.
