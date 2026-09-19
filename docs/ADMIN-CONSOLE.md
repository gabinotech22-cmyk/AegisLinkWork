# AegisLink Work — Consola de administración

> **Estado:** ✅ Diseño v1 (2026-09-19). **Doc canónico** de la consola, la auditoría y qué rol
> puede hacer qué (mapa en `CLAUDE.md`). Referencia visual: `prototype/enterprise.jsx`
> (`WorkDashboard`, seis pestañas). Se implementa en fase 4: completa en desktop, reducida en
> móvil, **misma lógica** (paridad).

## 1. Principio

La consola administra **personas, dispositivos, claves y reglas**. Nunca contenido. No existe
ninguna vista, exportación ni API que devuelva texto de mensajes, nombres de sala en claro,
quién habló con quién en DM ni contadores de actividad por miembro. Si una funcionalidad
requiere eso, no se construye (ADR-0002).

## 2. Pestañas (desktop) y equivalente móvil

| # | Pestaña (prototipo) | Qué muestra | Acciones | Móvil |
|---|---|---|---|---|
| 0 | **Resumen** | Miembros activos / pendientes, dispositivos verificados, edad media de claves vs política, "metadata de contenido almacenada: 0 B por diseño", últimos eventos de auditoría | Ir a cada pestaña | ✅ tarjetas |
| 1 | **Miembros y equipos** | Lista de miembros (nombre, AegisID, rol, equipos, estado, nº dispositivos), equipos | Invitar (genera QR/código/enlace), aprobar pendiente, cambiar rol, suspender, dar de baja, crear/editar equipo | ✅ lista + aprobar/suspender/baja; invitar por QR |
| 2 | **Dispositivos** | Por miembro: etiqueta, plataforma, fingerprint, estado, fecha de aprobación, salas a las que tiene clave (por id, nombre solo si el admin es miembro) | Aprobar (con verificación de fingerprint), revocar (con motivo), pedir re-verificación | ✅ aprobar/revocar (acción crítica: siempre disponible) |
| 3 | **Claves y rotación** | Fingerprint de org, época actual por sala, edad de claves, estado del pool de prekeys de cada dispositivo, política `maxKeyAgeDays` | Forzar rekey (org/equipo/sala), rotar clave de org (solo owner, ceremonia), regenerar backup de clave de org | ⚠️ solo lectura + forzar rekey |
| 4 | **Servidores y red** | Relay al que apunta la org, modo `multi`/`single`, versión mínima de cliente publicada, estado TURN, fingerprint TLS/onion si aplica | Cambiar `APP_MIN_VERSION`/`APP_LATEST_VERSION` (single-tenant), ver `relay/info` | solo lectura |
| 5 | **Auditoría de eventos** | Tabla de `AuditEvent` (tipo, actor, target, hora al minuto, verificación de firma ✅/❌) con filtros por tipo/actor/rango | Exportar JSON (preferente) / CSV (escapado), verificar firma de un evento | ✅ lista + filtros; exportar solo desktop |
| 6 | **Políticas de seguridad** | Política de org (con `limits` del owner), políticas por equipo y por sala, versión y firmante | Editar y firmar (respetando límites), ver diff entre versiones, ver qué salas se ven afectadas | ✅ ver; editar solo owner/admin en desktop (v1) |

## 3. Matriz rol → acción

| Acción | Owner | Admin | Member | Guest |
|---|---|---|---|---|
| Crear org, rotar clave de org, dar de baja org | ✅ | ❌ | ❌ | ❌ |
| Nombrar/retirar admins | ✅ | ❌ | ❌ | ❌ |
| Fijar `limits` de política de org | ✅ | ❌ | ❌ | ❌ |
| Editar políticas de org/equipo/sala dentro de `limits` | ✅ | ✅ | ❌ | ❌ |
| Crear invitación (`member`/`guest`) | ✅ | ✅ | solo `guest` si política `guestsAllowed` y es moderador de la sala | ❌ |
| Aprobar / suspender / dar de baja miembro | ✅ | ✅ | ❌ | ❌ |
| Aprobar / revocar dispositivo | ✅ | ✅ | revocar **el suyo** ("lo perdí") | el suyo |
| Crear sala abierta | ✅ | ✅ | según política | ❌ |
| Crear sala privada | ✅ | ✅ | ✅ | ❌ |
| Añadir/quitar miembros de una sala privada | moderador de la sala (owner/admin **solo si son miembros**) | | | ❌ |
| Forzar rekey de sala | ✅ | ✅ | moderador de la sala | ❌ |
| Ver auditoría / exportar | ✅ | ✅ | ❌ | ❌ |
| Leer contenido de una sala | **solo si es miembro**, como cualquier miembro | | | solo su sala |

Regla estructural: **el rol de org nunca otorga acceso a contenido.** Un owner que quiera leer
una sala tiene que entrar en ella como miembro, y la sala entera lo verá (mensaje de sistema
+ lista de dispositivos).

## 4. Auditoría

- Fuente: la **misma firma** que autorizó la acción (`PROTOCOL.md` §3). La consola re-verifica
  cada firma contra la cadena de certificados y marca ✅/❌; un ❌ es un incidente, no un aviso.
- Tabla cerrada de eventos (`DATA-MODEL.md`). Añadir un evento nuevo exige fila en
  `THREAT-MODEL.md` §4 y revisión de `qa-lead`.
- Exportación:
  - **JSON** (por defecto): el array de eventos tal cual, con firmas, para verificación externa.
  - **CSV**: cada celda entrecomillada; las que empiezan por `= + - @ \t \r` se prefijan con `'`
    (cierra M2). Test de regresión con esos cinco prefijos.
  - Exportar es en sí un evento auditado (`audit.exported`).
- Retención del audit log: la fija el owner (`auditRetentionDays`, mínimo 90). Es el único dato
  de la org que puede sobrevivir a la baja de un miembro, y solo referencia AegisIDs.

## 5. Pantallas nuevas fuera de la consola (cliente miembro)

| Pantalla | Contenido |
|---|---|
| **Enrolamiento** (sustituye al onboarding anónimo) | Escanear/pegar invitación → generar identidad → comparar fingerprint de org → "pendiente de aprobación" → bienvenida "Welcome to <Org>" (prototipo `screens.jsx` paso 5) |
| **Work Privacy** (ajustes) | Qué ve tu organización / el servicio (tabla de `THREAT-MODEL.md` §4 en lenguaje llano), fingerprint de org, políticas que te aplican y quién las firmó, tus dispositivos |
| **Sala → Info** | Miembros con rol de sala, **dispositivos** de cada uno con estado, época de clave, retención efectiva, archivos, pins |
| **Directorio** | Miembros de la org por equipo (no visible para guests) |
| **Salas abiertas** | Descubrimiento y entrada |

## 6. Estados vacíos y errores (obligatorios en fase 4)

Sin miembros aún · invitación caducada/usada · fingerprint no coincide (bloqueante, con
explicación de MITM) · dispositivo revocado (pantalla terminal con contacto del admin) ·
política no soportada (solo-lectura + actualizar) · relay en modo mantenimiento.
