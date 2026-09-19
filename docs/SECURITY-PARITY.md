# AegisLink Work — Paridad de seguridad con el AegisLink personal

> **Estado:** ✅ Checklist v1 (2026-09-19). **Doc canónico** de "Work debe estar al nivel del
> personal en seguridad": lista cada defensa que el personal tiene hoy (auditorías 2026-06/08/09,
> `SECURITY-ROADMAP-2026-06.md` olas 1-12, `PROTOCOL.md` §8, `SEALED-SENDER-ARCHITECTURE.md`)
> y cómo la hereda o la sustituye Work. Una fila `⏳` no se cierra sin su test y su PR enlazados.
> `qa-lead` verifica esta tabla contra el código al cierre de las fases 2, 3 y 4.

Leyenda: 🟢 se hereda tal cual en la semilla (fase 2) · 🟡 se hereda con adaptación · 🆕 nueva
en Work · ⛔ no aplica (con motivo) · ⏳ pendiente.

## 1. Criptografía de sesión y contenido

| Defensa (personal) | Work | Fase | Test esperado |
|---|---|---|---|
| X3DH con verificación obligatoria de SPK; PQXDH híbrido ML-KEM-768 (v2) | 🟢 | 2 | heredados `x3dh.test.ts` |
| Double Ratchet: descifrado transaccional, cap de skipped keys (50), zeroización, constant-time | 🟢 | 2 | heredados `ratchet*.test.ts` |
| Rechazo de DH all-zero / low-order en X3DH y ratchet; `assertNonZero` en ML-KEM | 🟢 | 2 | heredados |
| Sobre de dos capas (ratchet interior + `nacl.box` sellado exterior), padding a buckets en bytes UTF-8 | 🟢 | 2 | `metadata.test.ts` |
| SenderKey de grupo sellada por miembro + rekey al quitar miembro (`rekeyGroupAfterRemoval`) | 🟡 salas con **épocas** y rekey dirigido por certificados | 3 | `roomKey.rekey.test.ts` |
| Rotación automática de SPK (~semanal), OPK por dispositivo | 🟢 | 2-3 | heredados |
| Adjuntos cifrados (clave en el mensaje), TTL con estado `expired` sin reintentos | 🟢 | 2 | `media.test.ts` |
| Backup cifrado con passphrase (mnemónica) | 🟡 + backup separado de la clave de org (owner) | 4-5 | `backup.orgKey.test.ts` |

## 2. Identidad, autenticación y autorización

| Defensa (personal) | Work | Fase | Test esperado |
|---|---|---|---|
| Auth de socket challenge-response Ed25519, TTL 30 s, constant-time | 🟡 ligada a `{org, aegisId, deviceId, rol}` con certificado vigente | 3 | `auth.cert.test.ts` |
| Prueba de posesión de clave en todo endpoint sensible (regla #3); `DELETE /identity` firmado | 🟡 → firma canónica de **acción completa** con nonce+exp (cierra H1 del Work viejo) | 3 | `orgSig.replay.test.ts`, `orgSig.paramSubstitution.test.ts` |
| Device link / revoke autenticados (ola 3) | 🟡 + aprobación/revocación por admin firmada | 3 | `device.approve.test.ts`, `device.revoke.rekey.test.ts` |
| PoW en registro anti-spam | ⛔ el enrolamiento va **gateado por invitación firmada de un solo uso**; se conservan rate-limits. PoW opcional en `/enroll` para relays públicos SaaS | 3 | `enroll.invite.replay.test.ts` |
| Confianza derivada por el server, nunca suministrada por el cliente (regla #7) | 🟡 `orgId` siempre del certificado autenticado; aislamiento entre orgs | 3 | test de aislamiento por endpoint (`tenancy.isolation.test.ts`) |
| Fingerprint de identidad (hex autoritativo + palabras) | 🟡 + **fingerprint de org** en enrolamiento y en Work Privacy | 4 | RNTL `Enroll.fingerprintMismatch.test.tsx` |
| Cadena de certificados | 🆕 org key → admin cert → membership/device/policy; expiración ≤ 1 año | 3 | `certChain.test.ts` (expirado, firmante sin rol, cadena rota) |

## 3. Metadatos y sealed-sender

| Defensa (personal) | Work | Fase | Test esperado |
|---|---|---|---|
| Sin `from` en el wire ni en la cola; `senderPublicKeyB64` solo como hint público | 🟢 DMs | 2 | heredados |
| Señalización de llamadas sellada (ola 6, regla #4) | 🟢 | 4 | heredados `callSignaling.*` |
| Typing / read receipts como mensajes sellados (F3) | 🟢 | 4 | heredados |
| **Mailbox IDs ciegos** (el relay no conoce el aegisId; modo buzón ON por defecto) | ⛔ **declarado**: el relay Work **debe** conocer la membresía (aegisId ↔ org, dispositivos) para que la org administre. Es la diferencia de fondo entre los dos productos y está en `THREAT-MODEL.md` §4. Los sobres siguen sin `from`. Buzón ciego por DM dentro de la org: evaluación en fase 5 | — | — |
| Tor / onion del relay; desktop con Tor embebido | 🟡 opcional (SaaS publica onion; self-host lo incluye en `infra/selfhost`) | 6 | smoke `selfhost-compose` |
| Sin logs de IP (middleware + log driver), sin versión de cliente al relay (`APP_MIN_VERSION` publicado) | 🟢 | 2 | heredados |
| Padding y sin contadores por usuario | 🟢 + sin contadores por sala ni por miembro | 3 | revisión `qa-lead` |
| Cover traffic (fase 5 del sealed-sender personal, sin hacer) | ⏳ igual que el personal | — | — |

## 4. At-rest y dispositivo

| Defensa (personal) | Work | Fase | Test esperado |
|---|---|---|---|
| DB completa SQLCipher (mobile) / `better-sqlite3-multiple-ciphers` (desktop), clave en SecureStore/DPAPI; fail-closed sin `plain:` en packaged | 🟢 | 2 | `sqlcipher.test.ts`, `database.sqlcipher.test.ts` |
| Desktop: PIN Argon2id envuelve la clave de DB dentro de DPAPI; rate-limit → pánico | 🟢 | 2 | `database.pinwrap.test.ts` |
| App-lock con PIN/biometría, señuelo, pánico con borrado instantáneo | 🟡 + política `requireAppLock` (no desactivable) | 4 | `LockConfig.policy.test.tsx` |
| Perfiles aislados (DB y claves por perfil) | 🟡 → un perfil por organización | 4 | heredados `profiles.*` |
| Anti-captura (`FLAG_SECURE`, ver-una-vez) | 🟡 + política `blockScreenCapture` global | 4 | Maestro (E2E flag desactiva solo con `EXPO_PUBLIC_E2E`) |
| Comprobación de integridad local (root/jailbreak/hooking; sin telemetría, no bloqueante) | 🟡 + política `warnOnCompromisedRuntime` (aviso; nunca bloqueo, nunca reporte al relay) | 4 | heredado `integrity.test.ts` |
| Logger con niveles; `transform-remove-console`; logs de ratchet tras flag + hash de prefijos | 🟢 | 2 | `logger.test.ts` |
| Certificate pinning Android (SPKI, `network_security_config`) | 🟡 el **pin viaja en la invitación** (`relayPins`) para relays self-hosted; SaaS pinneado en build | 4 | `enroll.relayPins.test.ts` |
| Borrado de cuenta (`DELETE /identity` firmado, cascada) | 🟡 → **abandonar organización** (wipe local + `member.left` firmado; la auditoría con su AegisID persiste por diseño) | 3-4 | `member.leave.test.ts` |
| Exportación de datos (GDPR) | 🟡 gateada por `allowExport` | 4 | `DataExport.policy.test.tsx` |

## 5. Servidor y cadena de suministro

| Defensa (personal) | Work | Fase | Test esperado |
|---|---|---|---|
| Fail-closed en producción: CORS vacío ≠ `*`, `BLOB_SECRET` obligatorio | 🟢 | 2 | heredados |
| Rate limiting distribuido (Redis) + límites por identidad | 🟡 + límites por org y por plan | 3 | `rateLimits.org.test.ts` |
| Validación Zod de todo evento/endpoint | 🟢 + esquemas Work | 3 | por handler |
| Drain cap por dispositivos activos; `drained_by` validado | 🟢 | 2 | `drain-cap.test.ts` |
| CSP `default-src 'none'` en API; CSP por página | 🟢 | 2 | `links.csp.test.ts` |
| Sin REST de mensajes (fail-closed `encrypted+nonce` en el path socket) | 🆕 estructural: **no existe** ruta REST de mensajes (cierra H2) | 3 | test: `POST` a cualquier ruta con `ciphertext` → 404 |
| Exportación CSV con escape de fórmulas | 🆕 (cierra M2) | 3 | `audit.export.csvInjection.test.ts` |
| Semgrep con reglas de oro; CodeQL; Dependabot agrupado; `permissions-audit` | 🟢 + regla `SELECT` sin `org_id` | 0-3 | CI |
| Builds reproducibles, política de firma de código, `health-watchdog` | 🟡 fase 6 | 6 | workflows |
| SECURITY.md + runbook de respuesta (72 h / 90 días) | 🟢 | 0 | — |

## 6. Diferencias de fondo asumidas (resumen para el dueño)

1. **El relay conoce la membresía** (quién, con qué dispositivo, en qué salas). Es lo que hace
   posible administrar y lo que el personal evita con buzones ciegos. Está declarado y acotado;
   nada más se añade sin fila en `THREAT-MODEL.md` §4.
2. **Enrolamiento por invitación** sustituye al registro anónimo con PoW. Más fuerte contra
   spam, menos anónimo hacia la org (por diseño), igual de anónimo hacia fuera.
3. **La org puede revocar y rotar**, y puede imponer políticas al cliente. Todo firmado,
   auditado y visible a los miembros; nunca contenido.
