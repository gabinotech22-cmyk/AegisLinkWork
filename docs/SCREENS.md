# AegisLink Work — Inventario de pantallas

> **Estado:** ✅ Revisión de concepto v1.1 (2026-09-19). **Doc canónico** del inventario de
> pantallas: qué se hereda del AegisLink personal tal cual, qué se adapta, qué es nuevo y qué
> **no** va en Work. Se cruzó contra las 53 pantallas de `mobile/src/screens/` y las 44 de
> `desktop/src/renderer/screens/` del personal (`origin/main` 2026-09-19). Cada pantalla nueva
> se implementa en **mobile y desktop** (paridad), salvo donde se indica.

Leyenda: 🟢 heredada sin cambios · 🟡 adaptada a Work · 🆕 nueva · ⛔ no va en Work.

## 1. Arranque, identidad y organización

| Pantalla | Estado | Notas |
|---|---|---|
| `Splash`, `Entry` (desktop) | 🟢 | |
| `Onboarding` | 🟡 → **`Welcome`** | Tres caminos: **Tengo una invitación** (→ `Enroll`), **Crear organización** (→ `OrgCreate`, owner), **Restaurar perfil Work** (→ `Backup` restore). Sin camino anónimo: sin invitación ni org no hay app. |
| `Enroll` | 🆕 | Escanear QR / pegar código o enlace → generar identidad on-device → mostrar **fingerprint de org** para comparar fuera de banda → enviar `enroll` → `PendingApproval`. Prototipo: `screens.jsx` pasos 0-5. |
| `PendingApproval` | 🆕 | Estado terminal hasta que un admin apruebe el dispositivo (muestra el fingerprint del dispositivo para que el admin lo verifique). |
| `OrgCreate` | 🆕 | Ceremonia de owner: genera clave de org, elige relay (SaaS o URL propia), políticas iniciales, **backup de la clave de org** obligatorio antes de continuar. Desktop preferente; disponible en móvil. |
| `Profile` | 🟡 | Identidad + AegisID + rol + equipos + **certificado de membresía** (firmante, validez). |
| `Keys` | 🟡 | Claves propias + **fingerprint de org** + época de cada sala. |
| `ProfileSwitcher`, `CreateProfile` | 🟡 → **`OrgSwitcher`** | Un perfil aislado **por organización** (un consultor/auditor pertenece a varias). Misma base de perfiles aislados del personal: DB y claves separadas por org. Crear perfil = enrolar en otra org. |
| `Devices` | 🟡 | Mis dispositivos (estado `pending/verified/revoked`, fingerprint) + "Añadir dispositivo" (QR desde el dispositivo ya verificado, como `LinkDevice`) → queda `pending` hasta aprobación admin. |
| `LinkDevice` (desktop) | 🟡 | Enlazar desktop desde móvil verificado; el desktop entra `pending` hasta aprobación admin. |
| `Backup` | 🟡 | Backup cifrado del perfil Work (clave del miembro). Para owners, además backup separado de la clave de org. Política `allowBackup` puede desactivarlo. |
| `DataExport` | 🟡 | Exportación de mis datos; política `allowExport` puede restringir contenido de salas (siempre se pueden exportar certificados y auditoría propia). |
| `Privacy` | 🟡 → **`WorkPrivacy`** | "Qué ve tu organización / el servicio" (tabla llana de `THREAT-MODEL.md` §4), políticas aplicadas y quién las firmó, Tor/onion opcional, **Abandonar organización** (wipe local + certificado inutilizable; el admin ve el dispositivo caído). Borrado de cuenta del personal → "abandonar org": los registros de auditoría con mi AegisID persisten por diseño (se declara). Prototipo: `screens.jsx` "Work Privacy". |
| `RelaySettings` | ⛔ | El relay lo fija la organización (viene en la invitación). Solo lectura en `AdminNetwork`. |

## 2. Mensajería

| Pantalla | Estado | Notas |
|---|---|---|
| `Home` | 🟡 | Salas (abiertas a las que pertenezco, privadas, anuncios) + DMs + hilos con actividad. Selector de org en la cabecera si hay varias. |
| `Contacts`, `AddContact`, `FirstContact`, `ScanQR` | 🟡 → **`Directory`** | El directorio de la org sustituye a contactos: miembros por equipo, con rol y dispositivos verificados. No hay "añadir contacto" manual ni QR entre miembros: la confianza viene de la cadena de certificados + fingerprint de org. `Verify` sigue disponible para verificación presencial opcional. |
| `ContactDetail` | 🟡 → **`MemberDetail`** | Rol, equipos, dispositivos verificados, DM, salas en común. |
| `Chat` (DM) | 🟢 | Double Ratchet + sealed-sender heredados. Chips de política ("Retención 30 d · org"). |
| `Groups`, `GroupChat`, `GroupAdmin`, `GroupJoin` | 🟡 → **`Rooms`, `Room`, `RoomInfo`, `RoomCreate`, `RoomDiscover`** | Sala = grupo con certificados: `RoomInfo` muestra miembros **con sus dispositivos y estado**, época de clave, retención efectiva, archivos, pins. `RoomDiscover` lista salas abiertas. |
| `Thread` | 🆕 | Vista de hilo (respuestas a un mensaje) — no existe en el personal. |
| `GroupPosts`, `BroadcastCompose`, `DistributionLists` | 🟡 → **`Announcements`** | Sala tipo `announcement`: solo moderadores publican, todos leen; sustituye a broadcast/listas. |
| `Poll` | 🟢 | Votación **anónima** E2EE dentro de una sala (diferenciador; se mantiene). |
| `AttachSheet`, `VoiceRecorder`, `ViewOnce`, `ViewOnceSend`, `Location`, `Scheduled`, `Ephemeral`, `MultiPreview` | 🟢 | Cada uno **gateado por política** (`attachments.*`, `viewOnce`, `locationSharing`, `scheduledMessages`, `retentionMaxDays`). Un ítem desactivado por política aparece deshabilitado con el chip "Forzado por la organización". |
| `Search` | 🟢 | Índice local cifrado; nunca en relay. |
| `ChannelCreate`, `ChannelDiscover`, `ChannelFeed`, `ChannelInfo`, `ChannelsPanel` | ⛔ | Canales públicos sellados son del producto personal. |

## 3. Llamadas

| Pantalla | Estado | Notas |
|---|---|---|
| `Call`, `IncomingCall` | 🟢 | 1:1, señalización sellada, TURN de la org o de AegisLink. |
| `GroupCall`, `IncomingGroupCall` | 🟡 → **`RoomCall`** | **Ya existe** llamada de grupo (malla WebRTC) en el personal: se hereda para salas pequeñas (≤ 6) en la fase 4. SFU con E2EE por frame para salas grandes queda en fase 5 (`MEETINGS-DESIGN.md`). |

## 4. Seguridad local

| Pantalla | Estado | Notas |
|---|---|---|
| `Lock`, `LockSetup`, `LockConfig`, `LockSettings` | 🟡 | Igual; política `requireAppLock` puede hacerlo obligatorio (no se puede desactivar; se muestra el motivo). |
| `Panic` | 🟢 | Borra el perfil Work completo (y el señuelo). No avisa a la org (silencioso por diseño); el admin verá el dispositivo sin conexión y podrá revocarlo. |
| `UpdateRequired`, `NetworkError` | 🟢 | `APP_MIN_VERSION` del relay; en single-tenant lo fija el owner. |
| `DeviceRevoked` | 🆕 | Pantalla terminal: "Tu dispositivo fue revocado por <admin>"; wipe local y contacto del admin. |
| `PolicyUnsupported` | 🆕 | Solo-lectura por política desconocida → actualizar. |
| `Notifications` | 🟡 | Política `notificationPreviews` puede forzar "sin vista previa en pantalla de bloqueo". |
| `AppIcon` | 🟡 | Icono `icon-work` y variantes. |

## 5. Consola de administración (desktop completa · móvil reducida)

| Pantalla | Estado | Móvil |
|---|---|---|
| `AdminDashboard` (resumen) | 🆕 | ✅ |
| `AdminMembers` (+ `InviteCreate` con QR/código/enlace, `TeamDetail`) | 🆕 | ✅ aprobar/suspender/baja, invitar por QR |
| `AdminDevices` (+ `DeviceApprove` con comparación de fingerprint) | 🆕 | ✅ aprobar/revocar |
| `AdminKeys` | 🆕 | solo lectura + forzar rekey |
| `AdminNetwork` | 🆕 | solo lectura |
| `AdminAudit` (+ exportación JSON/CSV) | 🆕 | ✅ lista; exportar solo desktop |
| `AdminPolicies` (+ `PolicyEditor` con diff) | 🆕 | ver; editar solo desktop en v1 |
| `AdminBilling` | 🆕 | Solo **SaaS** y solo owners: asientos, plan, pago Lightning. Sustituye a `Subscription` del desktop personal. No existe en single-tenant. |

## 6. Resumen

- Heredadas sin cambios: 18 · Adaptadas: 21 · Nuevas: 19 · No van: 6.
- Toda pantalla nueva o adaptada tiene su estado vacío y sus errores definidos en
  `ADMIN-CONSOLE.md` §6 antes de implementarse (regla de oro: "sin omitir elementos de UI,
  estados vacíos ni TabBar", `.claude/teams/mobile/CLAUDE.md`).
- TabBar Work (miembro): **Salas · DMs · Directorio · Ajustes**; para admins aparece **Admin**
  como quinta pestaña (desktop: barra lateral).
