# AegisLink Work — Modelo de datos

> **Estado:** ✅ Diseño v1 (2026-09-19). **Doc canónico** de orgs, miembros, dispositivos, salas
> y políticas (mapa en `CLAUDE.md`). Cuando exista `server/src/org/` y `mobile/src/org/`
> (fase 2-3), este doc se mantiene en la misma PR que cambie una entidad. Cada columna que el
> relay persiste tiene su fila en `THREAT-MODEL.md` §4.

## 1. Entidades

```
Organization 1──* Team 1──* Member 1──* Device
     │                          │
     └──────* Room *────────────┘  (RoomMember: member × room, con rol de sala)
     │           └──* Envelope (cifrado, TTL)  ──* Attachment (blob cifrado)
     ├──* Policy (firmada)
     ├──* Invite (firmada, un solo uso)
     └──* AuditEvent (firmado)
```

### Organization
| Campo | Tipo | Notas |
|---|---|---|
| `orgId` | `string` (base32, derivado de la clave pública de org) | ID ↔ clave: no se puede suplantar sin la clave |
| `orgPubKey` | Ed25519 pub | La privada la custodian los owners |
| `fingerprint` | 8 bytes SHA-256 de `orgPubKey`, base32 con guiones | Se muestra en enrolamiento y en "Work Privacy" |
| `displayName` | `string` cifrado para el relay | Solo lo ven miembros |
| `tenancy` | `multi` \| `single` | Solo informativo en `single` |
| `createdAt` | día (sin hora) | Metadato mínimo |

> Los certificados (membresía, admin, aprobación de dispositivo) están implementados en
> `crypto/orgCert.ts` de los tres paquetes (PR #23); los campos de las tablas siguientes son los
> cuerpos que ese módulo firma y verifica.

### Member (certificado de membresía)
| Campo | Tipo | Notas |
|---|---|---|
| `aegisId` | `string` | Igual formato que el personal (derivado de la identidad) |
| `orgId` | | |
| `displayName` | `string` | En claro para el relay en v1 (`THREAT-MODEL.md` §4) |
| `role` | `owner` \| `admin` \| `member` \| `guest` | |
| `teamIds` | `string[]` | Solo administrativo |
| `identityPubKey` | Ed25519 pub | Identidad estable del miembro |
| `notBefore`, `notAfter` | | Validez del certificado |
| `issuerKeyId`, `signature` | | Firmado por un admin (cadena → clave de org) |
| `status` | `pending` \| `active` \| `suspended` \| `removed` | `pending` = enrolado, no aprobado |

### Device
| Campo | Tipo | Notas |
|---|---|---|
| `deviceId` | derivado de `devicePubKey` | |
| `aegisId`, `orgId` | | |
| `devicePubKey` (X25519) + `deviceSigKey` (Ed25519) | | Como el personal (por dispositivo) |
| `label` | `string` cifrado para el relay | "MacBook de Alice" solo lo ven miembros |
| `platform` | `ios` \| `android` \| `desktop` | Necesario para push |
| `status` | `pending` \| `verified` \| `revoked` | Aprobación por admin = firma |
| `approvedBy`, `approvalSig` | | Payload completo firmado |
| `revokedAt` (día), `revokedBy`, `revokeSig` | | |
| `pushToken` | opaco | Solo wake-up |

### Room
| Campo | Tipo | Notas |
|---|---|---|
| `roomId` | random 16 B | |
| `orgId` | | |
| `kind` | `open` \| `private` \| `announcement` \| `dm` | `announcement`: solo moderadores publican. `dm` no tiene metadata de sala más allá de los dos miembros |
| `meta` | blob cifrado con la clave de sala | nombre, descripción, tema, emoji |
| `retentionDays` | `number \| null` | Copia **firmada** de la política efectiva (para que el relay calcule TTL) |
| `createdBy` | `aegisId` | |
| `keyEpoch` | `number` | Sube en cada rekey |

### RoomMember
| Campo | Tipo | Notas |
|---|---|---|
| `roomId`, `aegisId` | | |
| `roomRole` | `moderator` \| `participant` | Roles **de sala**, distintos de los de org |
| `addedBy`, `addSig` | | Quién lo metió (miembro o admin) — visible a la sala |
| `joinedEpoch` | `number` | Recibe claves desde esta época |

### Policy (firmada)
```ts
type Policy = {
  orgId: string;
  scope: { kind: 'org' } | { kind: 'team'; teamId: string } | { kind: 'room'; roomId: string };
  version: number;               // monotónica por scope
  rules: {
    retentionMaxDays?: number;   // 0 = efímero obligatorio
    attachments?: { images: boolean; audio: boolean; video: boolean; files: boolean; maxBytes: number };
    requireAppLock?: boolean;
    blockScreenCapture?: boolean;
    maxKeyAgeDays?: number;      // rotación automática de SenderKey
    guestsAllowed?: boolean;
    externalDmAllowed?: boolean;
    scheduledMessages?: boolean;
    viewOnce?: boolean;
    locationSharing?: boolean;
    notificationPreviews?: boolean;    // false = sin vista previa en pantalla de bloqueo
    allowBackup?: boolean;
    allowExport?: boolean;             // exportación de contenido de salas
    warnOnCompromisedRuntime?: boolean; // aviso local (root/hooking); nunca bloqueo ni reporte
  };
  limits?: Policy['rules'];      // solo en scope org, puesto por el owner: techo para admins
  issuedBy: string; nonce: string; exp: number; signature: string;
};
```
Resolución: `org.limits` ⟶ `org.rules` ⟶ `team.rules` ⟶ `room.rules`; un scope inferior solo
puede ser **más restrictivo**. El cliente valida la cadena completa antes de aplicar.

### Invite (firmada, un solo uso)
| Campo | Notas |
|---|---|
| `inviteId` = `nonce` | Consumido al enrolar |
| `orgId`, `role` (nunca `owner`), `teamIds`, `roomIds?` (guests) | |
| `relayUrl`, `relayPins?` | Relay al que debe conectarse el miembro (SaaS o propio) y pines SPKI SHA-256 de su TLS si es self-hosted. El miembro nunca elige relay |
| `exp` | ≤ 7 días |
| `issuedBy`, `signature` | Admin certificado |
| `orgFingerprint` | Para que el invitado lo compare fuera de banda |

### AuditEvent (firmado)
Tabla **cerrada** de eventos (T9 en `THREAT-MODEL.md`): `org.created`, `org.key_rotated`,
`policy.updated`, `invite.created`, `invite.revoked`, `member.enrolled`, `member.approved`,
`member.role_changed`, `member.suspended`, `member.removed`, `device.approved`,
`device.revoked`, `room.created`, `room.archived`, `room.member_added`, `room.member_removed`,
`room.rekeyed`, `member.left`, `audit.exported`. **Ningún evento de mensajería.**

| Campo | Notas |
|---|---|
| `eventId`, `orgId`, `type`, `actorAegisId`, `target` (ids), `params` (payload canónico) | |
| `nonce`, `exp` (de la acción), `signature` (del actor) | La misma firma que autorizó la acción |
| `at` | minuto (sin segundos) |

### Envelope (cola del relay)
```
{ envelopeId, orgId, roomId | to(deviceId), epoch?, ciphertext, nonce, enqueuedAt, expiresAt }
```
Sin `from`. `expiresAt = enqueuedAt + retención efectiva`. Borrado físico al vencer o al ack de
todos los dispositivos destino.

## 2. Claves

| Clave | Genera | Custodia | Uso |
|---|---|---|---|
| Org signing key (Ed25519) | Owner, en dispositivo | Owners + backup con frase | Firma certificados de admin, políticas de org, rotación |
| Admin key | Es la identidad del admin; certificada por la org | Admin | Firma invitaciones, aprobaciones, revocaciones, políticas delegadas |
| Identidad de miembro (Ed25519 + X25519) | Miembro, en dispositivo | Miembro | Igual que el personal |
| Claves de dispositivo + prekeys | Por dispositivo | Dispositivo | X3DH / Double Ratchet en DMs y distribución de claves de sala |
| SenderKey de sala (por miembro, por época) | Cada miembro emisor | Miembros de la sala | Cifrado de mensajes de sala; rota con `keyEpoch` |
| Clave de blob | Emisor del adjunto | Dentro del mensaje cifrado | Adjuntos |
| Clave de backup de perfil Work | Miembro | Miembro | Backup cifrado (clave de org **no** va aquí salvo owner, en backup aparte) |

## 3. Estados

**Member**: `pending` →(admin aprueba)→ `active` →(admin)→ `suspended` ⇄ `active`; cualquiera
→(admin)→ `removed` (terminal; sus dispositivos pasan a `revoked` y sus salas hacen rekey).

**Device**: `pending` →(admin aprueba, tras verificar fingerprint)→ `verified` →(admin/miembro
"lo perdí")→ `revoked` (terminal; rekey de sus salas).

**Room**: `active` ⇄ `archived` (solo lectura; retención sigue aplicando).

**Policy**: la `version` más alta firmada y no expirada por scope es la vigente; el relay rechaza
versiones no monotónicas.

## 4. Esquema del relay (mínimo v1)

`orgs`, `members`, `devices`, `teams`, `team_members`, `rooms`, `room_members`, `policies`,
`invites`, `audit_events`, `envelopes`, `blobs`, `push_tokens`, `used_nonces`.
Toda tabla salvo `orgs` lleva `org_id` con índice; en `TENANCY=multi` toda consulta filtra por
el `org_id` del certificado autenticado (`DEPLOYMENT-MODES.md`). SQLite (`node:sqlite`) para
single-tenant y desarrollo; Postgres para multi-tenant. Cifrado at-rest del fichero SQLite y por
campo como en el personal.

## 5. Modelo local (clientes)

Igual que el personal (expo-sqlite/SQLCipher en mobile, better-sqlite3-multiple-ciphers en
desktop) más: `org` (certificado propio, políticas vigentes, fingerprint), `rooms` (meta
descifrada, épocas, SenderKeys en SecureStore), `room_devices` (lista visible), `audit_cache`
(solo admins). El índice de búsqueda es local y cifrado (FTS sobre texto descifrado en DB
cifrada), nunca en el relay.
