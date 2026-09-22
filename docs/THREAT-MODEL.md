# AegisLink Work — Modelo de amenazas

> **Estado:** ✅ Diseño v1 (2026-09-19). **Doc canónico** de "qué metadatos conoce el relay"
> (mapa en `CLAUDE.md`). Cualquier dato nuevo que el servidor vaya a conocer o persistir se
> **añade a la tabla §4 en la misma PR** que lo introduce, con justificación; sin fila, no se
> mergea (principio "metadatos mínimos y declarados"). Hereda §8 de `PROTOCOL.md` del AegisLink
> personal para todo lo que es idéntico (ratchet, sealed-sender, dispositivo comprometido).

## 1. Activos

| Activo | Dónde vive | Quién debe poder acceder |
|---|---|---|
| Contenido de mensajes, adjuntos, llamadas | Solo dispositivos de los miembros de la sala | Miembros de la sala |
| Claves privadas de dispositivo (identidad, prekeys, ratchets, SenderKeys) | SecureStore del dispositivo | Solo ese dispositivo |
| Clave de firma de la organización | Dispositivos de los Owners (+ backup cifrado con frase) | Owners |
| Claves de admin (certificadas por el owner) | Dispositivos de admins | Ese admin |
| Grafo de DMs (quién habla con quién) | Nadie fuera de los dos extremos | Los dos extremos |
| Membresía de org y de sala; lista de dispositivos | Relay + clientes | Relay, admins, miembros (por sala) |
| Políticas firmadas | Relay + clientes | Toda la org |
| Audit log de acciones admin | Relay + consola | Owners/admins |
| Nombre de display, rol, equipo | Certificado de membresía (relay lo almacena) | Relay, miembros de la org |

## 2. Adversarios

| Adversario | Capacidades | Objetivo típico |
|---|---|---|
| **A1 · Operador del relay** (AegisLink en SaaS; IT de la org en self-host) — honesto-pero-curioso o comprometido | Lee toda la DB y el tráfico en claro que le llega; puede modificar/dropear/replayear sobres; puede coludir con un admin | Leer contenido; reconstruir grafo social; añadir un dispositivo propio a una sala |
| **A2 · Admin malicioso** | Todo lo que permite su rol, firmado | Leer contenido de una sala; enrolar un dispositivo fantasma; expulsar o suplantar |
| **A3 · Miembro malicioso / cuenta robada** | Es miembro legítimo de N salas | Exfiltrar; reenviar; hacerse pasar por otro miembro en la sala |
| **A4 · Dispositivo perdido o comprometido** | Acceso físico/ROM a un dispositivo enrolado | Leer histórico local; seguir recibiendo |
| **A5 · Red** (ISP, país, MITM) | Ve/inyecta paquetes | Metadatos de tráfico; MITM en enrolamiento |
| **A6 · Otro tenant** (solo SaaS) | Org distinta en el mismo relay | Cruzar datos entre orgs |
| **A7 · Autoridad con orden judicial** sobre el operador | Todo lo que tiene A1, con compulsión | Contenido; grafo; identidad real |

## 3. Ataques y mitigaciones

| # | Ataque | Adversario | Mitigación (y dónde se hace cumplir) |
|---|---|---|---|
| T1 | Leer contenido en el relay | A1, A7 | E2EE por sala (SenderKey sellada por miembro) y DM (Double Ratchet). El relay almacena solo sobres opacos; **no existe ruta REST de mensajes** (`PROTOCOL.md` §6) y el relay rechaza cualquier sobre sin `ciphertext`+`nonce` (fail-closed, regla de oro seguridad #1). Semgrep + test de regresión. |
| T2 | Añadir un dispositivo fantasma a una sala | A1, A2 | La clave de sala la distribuyen **los miembros**, no el relay: un dispositivo recibe SenderKeys solo si un miembro existente se la sella tras ver su certificado de membresía firmado por un admin **y** el fingerprint del dispositivo. Todo alta genera mensaje de sistema visible a la sala y entrada de auditoría firmada. Un admin no puede unirse a una sala privada sin que sus miembros lo vean. |
| T3 | Replay / sustitución de parámetros en acciones admin | A1, A2 | Toda acción admin firma el **payload canónico completo** (`{orgId, action, params, nonce, exp}`; `PROTOCOL.md` §5). El relay verifica firma, cadena de certificados hasta la clave de org, `exp` corto y nonce único. Cierra H1 del código anterior. |
| T4 | Suplantar a la org (MITM en enrolamiento) | A5, A1 | La invitación va firmada por un admin certificado por la clave de org; el cliente muestra el **fingerprint de org** al enrolar y el admin lo confirma fuera de banda. El relay nunca genera claves de org ni de admin. |
| T5 | Reconstruir el grafo de DMs | A1, A7 | Sealed-sender: sin campo `from` en el wire ni en la cola; tamaño normalizado. Límite declarado (igual que el personal): un relay que correlaciona el socket autenticado con `to` en tiempo real puede inferir el par. Mitigación adicional (fase posterior): modo buzón heredado del personal. |
| T6 | Cruzar datos entre organizaciones (SaaS) | A6, A1 | Toda fila lleva `orgId`; toda consulta filtra por el `orgId` del certificado autenticado, nunca por parámetro de cliente (regla #7 confianza derivada). Tests de aislamiento por endpoint. `DEPLOYMENT-MODES.md`. |
| T7 | Dispositivo perdido sigue recibiendo | A4 | Revocación firmada → el relay corta el socket y deja de encolar; las salas hacen **rekey** automático; app-lock/pánico heredados. Declarado: lo ya recibido no se recupera. |
| T8 | Miembro exfiltra / reenvía | A3 | No hay defensa criptográfica (límite declarado). Políticas de org: anti-captura (`FLAG_SECURE`), adjuntos restringidos, retención corta, marca "confidencial" visible. |
| T9 | Admin lee auditoría para inferir contenido | A2 | El audit log registra **solo acciones administrativas** (quién invitó/revocó/cambió qué), nunca eventos de mensajería (ni "X envió un mensaje en Y"). Tabla cerrada de eventos en `DATA-MODEL.md`. |
| T10 | Inyección de fórmulas al exportar auditoría | A2, A3 | Exportación CSV escapa `= + - @ \t \r` con prefijo `'` y entrecomilla; JSON como formato preferente. Cierra M2. Test de regresión. |
| T11 | Política maliciosa (p. ej. "retención 0" para borrar evidencia, o "adjuntos raw" para exfiltrar) | A2 | Políticas con límites del owner (un admin no puede superar los máximos del owner); toda política firmada y visible a todos los miembros; cambio genera mensaje de sistema en todas las salas afectadas. |
| T12 | Downgrade de versión de cliente para saltarse una política | A3 | El relay publica `APP_MIN_VERSION` (sin recibir la versión del cliente); un cliente que no entiende una política queda en solo-lectura (fail-closed). |
| T13 | Compulsión legal sobre el operador SaaS | A7 | El operador puede entregar: membresía, certificados (nombre de display, rol), timestamps de sobres en cola, audit log. **No puede** entregar contenido ni grafo de DMs. Documentado en `privacy-policy.md` y en la UI ("qué ve tu organización / el servicio"). Self-host elimina a AegisLink de la ecuación. |
| T14 | Pérdida de la clave de org | Owner | Backup cifrado con frase de recuperación (solo owner). Sin ella, la org no puede emitir nuevos certificados: se documenta ceremonia de rotación y se recomiendan 2+ owners. |

## 4. Qué conoce el relay (tabla canónica)

Cada fila existe porque **sin ella la función es imposible**; si aparece una alternativa que la
elimina, se adopta. Una PR que añada un dato al servidor añade su fila aquí.

| Dato | Persistido | Por qué es imprescindible | Alternativa evaluada |
|---|---|---|---|
| `orgId`, clave pública de org, fingerprint | Sí | Verificar la cadena de firmas de admins y políticas | — |
| Certificados de membresía (aegisId, displayName, rol, equipo, deviceKey pública, validez, firma) | Sí | Autenticar sockets, autorizar acciones por rol, distribuir claves de sala a dispositivos legítimos | Cifrar `displayName` para el relay: descartado en v1 (los admins necesitan gestionar la lista; se reevalúa cuando exista directorio E2EE) |
| Lista de salas por org: `roomId`, tipo (`open`/`private`/`dm`), **nombre cifrado** para el relay, miembros | Sí | Encolar sobres a los miembros correctos; permitir que un miembro descubra salas abiertas | El nombre y la descripción de la sala viajan cifrados con la clave de sala; el relay solo ve un id |
| Sobres cifrados en cola (`roomId`/`to`, `ciphertext`, `nonce`, `expiresAt`) | Sí, hasta entrega o TTL | Entrega offline y retención | Sin `from`; tamaño normalizado; TTL derivado de la política de la sala |
| Blobs de adjuntos cifrados + token de descarga | Sí, hasta TTL | Adjuntos | Clave del blob solo dentro del mensaje cifrado |
| Políticas firmadas (payload completo, en claro) | Sí | Publicarlas a los dispositivos; el relay aplica límites de tamaño/TTL de cola | Son metadatos de la org, no de personas |
| Audit log de acciones admin (evento, actor, target, firma, timestamp) | Sí | Rendición de cuentas de los admins ante la org | Tabla cerrada de eventos; nunca eventos de mensajería |
| Nonces consumidos de invitaciones y acciones admin | Sí, hasta `exp` | Anti-replay | — · Implementado: tabla `used_nonces` (`org_id` en la PK, purga por `expires_at`), `server/src/org/nonceRepo.ts`; test `orgAuthorize.test.ts` |
| Timestamp de **encolado** de un sobre | Sí, hasta entrega | TTL / retención | No se persiste timestamp de entrega ni de lectura |
| Socket autenticado ↔ dispositivo (en memoria) | No (solo RAM) | Enrutar entregas online | — |
| Tokens push opacos (FCM/APNs) por dispositivo | Sí | Wake-up (payload siempre cifrado y sin contenido) | Igual que el personal |

**Nunca**: IPs (ni en logs), user-agents, versión de cliente, timestamps de acceso, tamaños reales
(normalizados), frecuencia de mensajes por miembro, contadores por sala, quién leyó qué, ni un
campo `from` en DMs.

## 5. Límites declarados (lo que Work NO defiende)

1. Un relay que correlacione en tiempo real el socket autenticado con el destino de un sobre
   (T5). Igual que Signal/personal; mitigación futura: buzón sellado.
2. Un miembro legítimo que copie o fotografíe la pantalla (T8).
3. Un dispositivo ya comprometido antes de la revocación: lo que recibió, lo tiene (T7).
4. El operador conoce **que** una org existe, cuántos miembros y salas tiene y cuándo se
   encolan sobres. Self-host reduce el "operador" al propio IT de la org.
5. Análisis de tráfico a nivel de red (A5) sin Tor. Tor/onion se hereda del personal en una
   fase posterior.
6. **Buzones ciegos**: a diferencia del personal (modo buzón ON por defecto, el relay nunca ve
   el aegisId), el relay Work conoce aegisId ↔ org ↔ dispositivos ↔ salas. Es el precio de que
   la org pueda administrar; está acotado en §4 y comparado fila a fila en
   `SECURITY-PARITY.md` §3.

## 6. Verificación

- Cada fila de §3 lleva, cuando exista el código, el test que la cubre (regla de oro seguridad #11).
- `qa-lead` audita este documento contra el código al cierre de las fases 3 y 4 (`ROADMAP.md`).
- Los hallazgos de auditoría se trackean en `docs/AUDIT-*.md`, nunca aquí.
