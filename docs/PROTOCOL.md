# AegisLink Work — Protocolo

> **Estado:** ✅ Diseño v1 (2026-09-19). §2-§3 implementados (fase 3, PR #21); el resto sigue
> siendo diseño — el mapa §12 dice qué existe ya en código. **Doc canónico** del wire
> (`server/src/relay/**`, `relay/schemas.ts`) y de la cripto de clientes (mapa en `CLAUDE.md`).
> Todo lo que este doc **no** redefine es idéntico al `PROTOCOL.md` del AegisLink personal en el
> commit del que se copia la semilla cripto (ADR-0001): primitivas, X3DH/PQXDH, Double Ratchet,
> sobre de dos capas, padding, sealed-sender, adjuntos, backups, pánico. Aquí se especifica solo
> lo **nuevo** de Work: organización, certificados, acciones admin, salas, políticas y retención.

## 1. Primitivas (heredadas)

X25519 + XSalsa20-Poly1305 (`nacl.box`/`secretbox`), Ed25519 (`nacl.sign`), HKDF/HMAC-SHA256,
SHA-256 (`@noble/hashes`), ML-KEM-768 híbrido en X3DH v2. Nada hand-rolled.

## 2. Identidades y cadena de confianza

```
Org signing key (Ed25519, owners)
   └─ firma → Admin certificate  { orgId, aegisId, role:'admin'|'owner', identityPubKey, notBefore, notAfter }
                 └─ firma → Membership certificate { orgId, aegisId, displayName, role, teamIds, identityPubKey, notBefore, notAfter }
                 └─ firma → Device approval        { orgId, aegisId, deviceId, devicePubKey, deviceSigKey }
                 └─ firma → Invite, Policy, Revocation, Room admin actions
```

- **`orgId` = base32(SHA-256(orgPubKey))[0:20]**: conocer un `orgId` no permite suplantar la org.
- Un cliente valida **toda la cadena** hasta `orgPubKey` (que pinnea al enrolar tras comparar el
  fingerprint fuera de banda). El relay valida igualmente para autorizar, pero **el cliente nunca
  confía en que el relay lo hizo** (regla de oro #7 en sentido inverso: el relay tampoco confía
  en el cliente).
- Certificados con `notAfter` ≤ 1 año; renovación silenciosa por el admin (acción auditada).

**Implementado** (PR #23): `orgCert.ts` en los tres paquetes. Lo que el código fija y este doc
no decía:

- **Un certificado NO es una acción `orgSig`.** Una acción es una autorización de un solo uso que
  caduca en minutos y lleva nonce; un certificado es una declaración de situación válida hasta un
  año y deliberadamente reutilizable (eso significa "presentar tu certificado"). Comparten
  codificación canónica y prefijo de dominio, y por eso un certificado nunca puede reproducirse
  como acción ni al revés: el prefijo lleva el `kind` (`cert.admin`, `cert.membership`,
  `device.approve`) y los cuerpos exigen campos distintos.
- **Solo un owner certifica a un admin o a otro owner.** Si un admin pudiera acuñar admins, las
  filas "solo owner" de `ADMIN-CONSOLE.md` §3 serían inaplicables: se ascendería a sí mismo
  emitiéndose el certificado. El verificador lo rechaza con `issuer_not_admin`.
- **La aprobación de dispositivo se ata a su miembro**: `verifyDeviceApproval` compara el
  `aegisId` de la aprobación con el del certificado de membresía ya verificado. Sin esa
  comprobación, una aprobación legítima de un dispositivo autorizaría a hablar por otro miembro.
- **El `orgId` se recalcula desde `orgPubKey`**, nunca se confía el que declara el certificado.
- **La revocación no vive aquí**: un certificado sigue siendo criptográficamente válido después de
  que a su sujeto lo echen. `revokedKeyIds` lo aporta quien llama desde el estado vivo del relay.
- `issuerKeyId` es un índice (16 chars del mismo base32 que `orgId`), **no** un ancla de
  confianza: se verifica siempre con la clave presentada en la cadena, nunca con una buscada por
  ese id.

## 3. Canonicalización y firma de acciones (cierra H1)

Toda acción administrativa y todo certificado se firman sobre un **payload canónico completo**:

```
msg = "aegiswork/v1/" + action + "\n" + canonicalJSON({ orgId, action, params, nonce, exp })
sig = Ed25519.sign(msg, actorSigKey)
```

- `canonicalJSON`: claves ordenadas, sin espacios, UTF-8, números sin exponente (RFC 8785-like;
  implementación propia de ~40 líneas, testeada con vectores).
- `params` incluye **todos** los parámetros que la acción muta (target ids, rol, días de
  retención, permisos, `keyEpoch`…). Cambiar cualquiera invalida la firma.
- `nonce` (16 B aleatorios) se consume en el relay (`used_nonces`) hasta `exp`; `exp` ≤ 5 min.
- El relay verifica: firma → certificado del actor vigente → rol suficiente para `action` →
  `orgId` del certificado == `orgId` del payload (nunca el de la URL/socket) → nonce no usado.
- La **misma firma** se persiste como entrada de auditoría: la auditoría no es un log aparte que
  pueda divergir, es la autorización.

**Implementado** (PR #21): `canonicalJson.ts` + `orgSig.ts` en los tres paquetes, con vectores
dorados compartidos (`orgSig.vectors.ts`) que los tres reproducen byte a byte. Detalles que el
código fija y este doc no decía:

- `canonicalJson` es un **subconjunto** de RFC 8785: solo enteros seguros. JCS delega el formato
  de los decimales en `Number::toString`, fácil de reimplementar *casi* bien (`1e21`, `-0`,
  `5e-324`); un formato de firma sutilmente distinto en una plataforma produce firmas que
  verifican aquí y fallan allá. Ningún campo de una acción es fraccionario, así que se **rechaza**
  en vez de arriesgar. También se rechazan `undefined`, `NaN`, `±Infinity`, `-0`, `BigInt`,
  ciclos y objetos no planos (Date, Map, instancias de clase): cada uno carece de una única
  codificación honesta.
- `verifyOrgAction` exige el **`action` esperado** como parámetro: un verificador que acepta la
  acción que diga el payload ha delegado la autorización en el atacante.
- Una firma no puede reclamar más vida que la política: `exp - now > 5 min + 1 min de desfase` →
  `ttl_too_long`. Sin esto, un dispositivo de admin podría acuñar una autorización de un año que
  sobreviviera a su propio certificado.
- El módulo **no** hace anti-replay (es puro): devuelve el `nonce` para que el relay lo consuma
  en `used_nonces` hasta `exp`. Entra con el enrolamiento.

## 4. Enrolamiento

```
Admin                        Relay                          Nuevo dispositivo
  │ invite = sign({orgId, orgFingerprint, relayUrl, relayPins?, role, teamIds, roomIds?, nonce, exp})
  │──(fuera de banda: QR / código / enlace)──────────────────────────▶│
  │                                                                   │ genera identidad + claves de dispositivo (on-device)
  │                             │◀── enroll { invite, identityPubKey, devicePubKey, deviceSigKey, proof } ──│
  │                             │ verifica firma de invite (cadena → orgPubKey), exp, nonce sin usar,
  │                             │ proof = firma del dispositivo sobre invite.nonce (posesión de clave)
  │                             │ crea Member(status=pending) + Device(status=pending); consume nonce
  │◀── evento admin: pending ───│──── enroll:ok { orgPubKey, orgFingerprint, policies } ─────────▶│
  │                                                                   │ compara fingerprint con el recibido fuera de banda; pinnea orgPubKey
  │ approve = sign({orgId, action:'device.approve', params:{aegisId, deviceId, devicePubKey, deviceSigKey, displayName, role}, nonce, exp})
  │────────────────────────────▶│ verifica; Member→active, Device→verified; audit
  │                             │──── membership cert + device approval ──────────────────────────▶│
```

- La invitación **no** contiene secretos: solo prueba que un admin la emitió. Enrolar exige
  además posesión de las claves del dispositivo (`proof`).
- El fingerprint del dispositivo se verifica **por el admin** antes de aprobar (presencial/QR o
  canal ya verificado). Sin aprobación, el dispositivo no recibe ninguna clave de sala.
- `role: 'owner'` nunca se otorga por invitación; solo por ceremonia de org con la clave de org.
- **Segundo dispositivo de un miembro**: el nuevo dispositivo se enlaza desde uno ya verificado
  (QR con la clave pública del nuevo, firmado por el verificado — mismo mecanismo que el enlace
  de dispositivos del personal) y entra como `Device(pending)`; el admin lo aprueba igual que en
  el paso final. Sin aprobación no recibe claves de sala.
- La invitación fija `relayUrl` (y `relayPins` para self-host): el cliente pinnea el TLS del relay
  con esos SPKI antes del primer `enroll`.

## 5. Autenticación de socket

Idéntica al personal (challenge-response Ed25519 con TTL 30 s, comparaciones constant-time),
con dos añadidos: el reto se firma con `deviceSigKey` y el relay carga el **certificado de
membresía + aprobación de dispositivo**; el socket queda ligado a `{orgId, aegisId, deviceId,
role}`. Un dispositivo `pending`/`revoked` o un certificado expirado → `auth:fail`, fail-closed.

## 6. Mensajes de sala y DM

- **No existe ruta HTTP para enviar ni leer mensajes.** Solo eventos de socket autenticado
  (cierra H2). Cualquier sobre sin `ciphertext` y `nonce` de longitud válida es rechazado.
- **DM**: sobre de dos capas del personal (Double Ratchet interior, `nacl.box` sellado exterior),
  sin `from` en el wire. Bootstrap por X3DH con el prekey bundle del dispositivo destino.
- **Sala (`open`/`private`/`announcement`)**: cifrado con **SenderKey por miembro y época**, como
  `channelKey.ts` del personal:
  - `room:key_dist` — el emisor sella su SenderKey (`nacl.box`) para **cada dispositivo
    verificado** de cada miembro de la sala, tras validar el certificado de membresía y la
    aprobación de dispositivo de cada uno. El relay solo reenvía cajas opacas.
  - `room:msg { roomId, epoch, ciphertext, nonce }` — `secretbox` con la chain key de la época;
    el sender se autentica **dentro** del ciphertext (firma con `deviceSigKey`); el relay no ve
    quién envió.
  - Un mensaje se rechaza en cliente si su `epoch` es anterior a la actual tras un rekey.
- **Rekey** (`room:rekey`): lo dispara un miembro o el relay (por revocación/expulsión/política
  `maxKeyAgeDays`) y lo **ejecutan los miembros** generando nuevas SenderKeys para la nueva
  época y distribuyéndolas solo a los dispositivos vigentes. El relay no puede fabricar claves.
- **Hilos, pins, reacciones, ediciones, borrado, encuestas**: son mensajes de sala tipados dentro
  del ciphertext (`type: 'thread_reply' | 'pin' | 'reaction' | 'edit' | 'delete' | 'poll' |
  'poll_vote'`), nunca campos en claro. Un pin es un mensaje más; el relay no sabe qué está
  pineado. El voto de encuesta es **anónimo E2EE** como en el personal (el relay no participa).
- En salas `announcement` el cliente rechaza (y el relay no reenvía, por rol de sala) mensajes
  de quien no es moderador.
- **Mensajes de sistema** (alta/baja de miembro o dispositivo, rekey, cambio de política): los
  emite el cliente que ejecuta la acción (o el primero que la observa) como mensaje de sala
  cifrado que referencia el `eventId` de auditoría; así toda la sala ve el cambio y puede
  verificarlo contra la firma.

## 7. Retención y efímeros

- La política efectiva de una sala fija `retentionMaxDays`. La sala guarda una **copia firmada**
  de ese valor (`Room.retentionDays`) para que el relay calcule `expiresAt` en cada sobre sin
  leer la política completa.
- El relay borra físicamente el sobre al vencer o cuando todos los dispositivos destino lo han
  acusado (lo que ocurra antes). Los clientes borran localmente al vencer (job local) y muestran
  "Retención: N días · política de la organización".
- Los efímeros por usuario (timer del emisor) siguen existiendo y **solo pueden acortar**.
- Bajar la retención de una sala aplica solo a mensajes nuevos (lo anterior ya se borra con su
  TTL original o antes): sin sorpresas retroactivas, sin "borrar evidencia".

## 8. Políticas

- Publicadas por el relay a cada socket en `auth:ok` y en `policy:update`. Firmadas (§3) con
  `scope` y `version` monotónica; el cliente valida cadena + límites del owner antes de aplicar.
- Un cliente que recibe una regla que no conoce entra en **solo-lectura** para la org hasta
  actualizar (`APP_MIN_VERSION`), en vez de ignorarla.

## 9. Eventos de socket (v1)

| Evento | Dirección | Payload (claro) | Notas |
|---|---|---|---|
| `auth:challenge` / `auth:response` / `auth:ok` / `auth:fail` | ↔ | como el personal + certificados | |
| `org:action` | C→R | `{ signedAction }` | Toda acción admin; respuesta `org:action:ok/err` |
| `org:event` | R→C | `{ auditEvent }` | Fan-out a admins y a afectados |
| `policy:update` | R→C | `{ policy }` | |
| `room:create` / `room:join` / `room:leave` | C→R | ids + firma cuando la acción es admin | |
| `room:key_dist` | C→R→C | `{ roomId, epoch, boxes:[{deviceId, box}] }` | opaco |
| `room:msg` | C→R→C | `{ roomId, epoch, ciphertext, nonce }` | sin `from` |
| `room:rekey` | C→R→C | `{ roomId, newEpoch, reason }` | reason ∈ revoke/remove/policy/manual |
| `dm:msg` | C→R→C | `{ to, ciphertext, nonce, init? }` | idéntico al personal |
| `ack` | C→R | `{ envelopeId }` | scoped al dispositivo autenticado |
| `call:*` | ↔ | señalización **sellada** (SDP/ICE cifrados al destino); llamadas de sala en malla heredadas | regla de oro #4 |
| `member:leave` | C→R | `{ signedAction }` | `member.left`; wipe local previo |

HTTP se limita a: `/enroll`, `/prekeys/*`, `/blob/*` (subida/descarga con token), `/push/*`,
`/relay/info`, `/health`. Ninguna de estas rutas devuelve ni acepta contenido de mensajes.

## 10. Adjuntos, backup, pánico, llamadas

Heredados sin cambios: blob cifrado con clave dentro del mensaje; backup cifrado con clave del
miembro (la clave de org tiene su propio backup, solo owner); pánico borra el perfil Work
completo y su certificado deja de ser usable al primer reto de socket; llamadas 1:1 con
señalización sellada y credenciales TURN de vida limitada.

## 11. Lo que se hereda vs. lo nuevo (resumen para auditores)

| Área | Origen |
|---|---|
| X3DH/PQXDH, Double Ratchet, sobre, padding, sealed-sender, adjuntos, backup, pánico, auth de socket, TURN | **Heredado** del personal (ADR-0001), sin modificar |
| SenderKey de sala por época | Heredado (`channelKey.ts`) + épocas y rekey dirigido por certificados |
| Cadena de certificados de org, canonicalización y firma de acciones, enrolamiento, políticas, retención firmada, auditoría = autorización | **Nuevo** en Work |

## 12. Mapa a código (se rellena en fase 2-3)

| Sección | Archivo |
|---|---|
| §2 `orgId` = base32(sha256(orgPubKey))[0:20] | `deriveOrgId` / `orgIdMatchesKey` en `orgSig.ts` (los 3 paquetes) |
| §3 canonicalización/firma | `mobile/src/crypto/{canonicalJson,orgSig}.ts`, `desktop/src/renderer/crypto/{canonicalJson,orgSig}.ts`, `server/src/crypto/{canonicalJson,orgSig}.ts`; vectores y tests: `orgSig.test.ts` + `orgSig.vectors.ts` en los 3 |
| §2 cadena de certificados | `crypto/orgCert.ts` en los 3 paquetes (`signCertificate`, `verifyAdminCertificate`, `verifyMembershipCertificate`, `verifyDeviceApproval`); tests `orgCert.test.ts` en los 3 |
| §4 enrolamiento | `server/src/routes/enroll.ts`, `mobile/src/org/enroll.ts` |
| §6 salas | `mobile/src/crypto/roomKey.ts`, `server/src/relay/handlers/rooms.ts` |
| §7 retención | `server/src/org/retention.ts` |
