# AegisLink Work — Concepto de producto

> **Estado:** ✅ Diseño aprobado (2026-09-19, decisiones del dueño registradas en `docs/adr/`).
> Este doc define **qué** es Work y por qué es distinto del AegisLink personal. El **cómo**
> vive en `THREAT-MODEL.md`, `DATA-MODEL.md`, `PROTOCOL.md`, `ADMIN-CONSOLE.md` y
> `DEPLOYMENT-MODES.md`. Estado de implementación: `ROADMAP.md`.

## 1. Una frase

> **La bóveda de comunicación privada de tu organización.** Mensajería E2EE para equipos donde
> la organización gobierna **quién** entra y con **qué dispositivo**, pero **nunca** puede leer
> **qué** se dice.

## 2. Por qué existe

Las organizaciones que necesitan comunicación realmente confidencial (despachos, sanidad,
periodismo, seguridad, I+D, consejos de administración) hoy eligen entre dos malos extremos:

- **Slack / Teams / Google Chat**: excelente UX y administración, pero el proveedor y los
  administradores leen todo. El cifrado es "en tránsito y en reposo", nunca de extremo a extremo.
- **Signal / Threema / Session en grupos**: E2EE real, pero sin organización: no hay forma de
  enrolar 200 personas, revocar el portátil perdido de una, aplicar una política de retención
  o saber qué dispositivos tienen acceso a la sala "Consejo".

Work ocupa el hueco: **administración de organización sin capacidad de lectura.** La org
gobierna la membresía, los dispositivos, los roles y las políticas; el contenido solo lo
descifran los miembros de cada sala. Ni AegisLink (en SaaS) ni el departamento de IT (en
self-host) tienen una vía técnica para leerlo. Esa es la promesa y la regla de oro que lo
protege: **zero-knowledge admin** (`CLAUDE.md`, principios).

## 3. Qué cambia respecto al AegisLink personal

| | AegisLink (personal) | **AegisLink Work** |
|---|---|---|
| Identidad | Anónima, sin datos | **Pseudónima dentro de la org**: AegisID + nombre de display + rol, certificados por la org al enrolar. Anónima hacia fuera. |
| Unidad de trabajo | Contacto / grupo | **Organización → Equipos → Salas** (abiertas, privadas), DMs, hilos |
| Quién gobierna | El usuario | El usuario gobierna el **contenido**; la org gobierna **membresía, dispositivos, roles y políticas** |
| Servidor | Relay público federado | **Work relay**: multi-tenant (SaaS) o single-tenant (self-host), misma imagen |
| Metadatos en el relay | Cero | **Mínimos y declarados** (tabla en `THREAT-MODEL.md` §4). Nunca contenido; DMs con sealed-sender |
| Administración | No existe | **Consola admin**: miembros/equipos, dispositivos, claves/rotación, relays, auditoría firmada, políticas |
| Onboarding | 3 pasos anónimos | **Enrolamiento por invitación firmada** (código/QR/enlace, caducable, un solo uso) |
| Retención | Efímeros por usuario | Efímeros **y** retención máxima por política de org (TTL cifrado en relay + borrado en cliente) |
| Monetización | — | Por asiento (Lightning; fiat abierto) |

Lo que **no** cambia: claves solo en dispositivo, cifrado que nunca degrada en silencio,
sealed-sender, paridad mobile↔desktop, código abierto.

## 4. Personas

| Persona | Quién es | Qué necesita | Qué **no** puede hacer |
|---|---|---|---|
| **Owner** | Fundador/CISO. 1-3 por org. Custodia la clave de firma de la org. | Crear la org, nombrar admins, definir políticas globales, rotar la clave de org, dar de baja la org. | Leer mensajes. Actuar sin que quede auditado. |
| **Admin** | IT / operaciones. | Invitar y dar de baja miembros, aprobar/revocar dispositivos, crear salas y asignar roles, ajustar políticas dentro de los límites del owner, exportar auditoría. | Leer mensajes. Entrar en salas privadas a las que no pertenece sin que sus miembros lo vean. Cambiar políticas globales del owner. |
| **Member** | Empleado/colaborador interno. | Enrolar sus dispositivos, entrar en salas abiertas, ser invitado a privadas, DMs, hilos, archivos, llamadas. Ver quién (y qué dispositivo) está en cada sala. | Invitar externos (salvo permiso de política). Cambiar políticas. |
| **Guest** | Externo (cliente, auditor, proveedor). | Acceder **solo** a las salas a las que se le invita, con su propio dispositivo. | Ver el directorio de la org, salas abiertas, ni DMs no iniciados por un miembro. |

## 5. Flujos principales

### 5.1 Crear una organización (Owner)
1. El owner instala Work y crea la org **en su dispositivo**: se genera la **clave de firma de la
   org** (Ed25519) y su **fingerprint de org** (verificable por todos los miembros).
2. Elige modo: usar el servicio alojado (SaaS, `TENANCY=multi`) o apuntar a su propio relay
   (`single`). El relay solo recibe la clave pública de la org.
3. Define políticas iniciales (retención máxima, adjuntos, app-lock, invitados) y las firma.
4. Guarda el **backup cifrado de la clave de org** (frase de recuperación, solo suya).

### 5.2 Enrolar un miembro (Admin → Member)
1. El admin crea una **invitación firmada**: `{orgId, rol, equipo, caducidad, nonce}` firmada con
   su clave de admin (y encadenada al certificado que el owner le dio). Se entrega como código,
   QR o enlace **fuera de banda**.
2. El nuevo miembro instala Work, genera su identidad **en el dispositivo** (como el personal:
   nada sale) y presenta la invitación.
3. El relay comprueba la firma y la caducidad, consume el nonce (un solo uso) y registra la
   clave pública del dispositivo bajo la org.
4. El admin ve el dispositivo como **pendiente**; lo aprueba comparando el fingerprint del
   dispositivo con el miembro (verificación fuera de banda o QR presencial). Al aprobar, firma
   el **certificado de membresía** `{orgId, aegisId, displayName, rol, deviceKey, validez}`.
5. El miembro ve la org, su fingerprint, y las salas abiertas. Los miembros de cada sala reciben
   un mensaje de sistema "Nuevo miembro/dispositivo" al distribuirle la clave de sala.

### 5.3 Salas
- **Abierta**: cualquier miembro de la org puede entrar; la clave de sala (SenderKey) se le
  distribuye sellada por cada miembro existente. El relay solo sabe quién es miembro.
- **Privada**: creada por admin o por un miembro con permiso; entrada por invitación de un
  miembro de la sala. Los guests solo existen aquí.
- **DM**: Double Ratchet pairwise + sealed-sender; el relay no ve el emisor.
- Toda sala tiene: hilos, pins, reacciones, adjuntos cifrados, mensajes programados y efímeros,
  y una **lista de dispositivos** visible a todos sus miembros.

### 5.4 Revocar un dispositivo (Admin)
1. El admin marca el dispositivo como revocado (acción firmada, auditada).
2. El relay deja de aceptar su socket y de entregarle sobres.
3. Cada sala en la que estaba **rota su clave** (rekey) automáticamente; los miembros ven
   "Dispositivo revocado · clave de sala rotada".
4. Los mensajes anteriores que ese dispositivo ya tenía no se pueden "des-recibir": se declara.

### 5.5 Cambiar una política (Owner/Admin)
1. La política se firma con el payload completo y una expiración; el relay la publica a los
   dispositivos de la org.
2. Los clientes la aplican localmente (retención, adjuntos, app-lock, anti-captura) y muestran
   "Forzado por la organización" donde toque.
3. Un cliente que no puede cumplir la política (versión antigua) queda en modo solo-lectura hasta
   actualizar. Fail-closed, no silencioso.

### 5.6 Rotación de claves
- Clave de sala: automática al revocar o expulsar, y por política (`maxKeyAgeDays`).
- Clave de org: solo el owner, con ceremonia (nuevo certificado para cada admin/miembro).
- Claves de dispositivo: como el personal (identidad estable + prekeys rotativas).

## 6. Qué ve cada actor

| Actor | Contenido | Miembros y dispositivos de una sala | Quién habla con quién en DM | Políticas | Audit log |
|---|---|---|---|---|---|
| Miembro de la sala | ✅ | ✅ | solo sus DMs | ✅ (las que le aplican) | ❌ |
| Admin/Owner | ❌ | ✅ | ❌ | ✅ | ✅ |
| Relay (SaaS o self-host) | ❌ | ✅ (membresía) | ❌ (sealed-sender) | ✅ (firmadas, públicas en la org) | ✅ (firmado) |
| Guest | solo su sala | solo su sala | solo sus DMs | las de su sala | ❌ |

La tabla completa de metadatos, con justificación de cada fila, está en `THREAT-MODEL.md` §4.

## 7. Principios de UX

1. **La confianza se ve.** Fingerprint de org, lista de dispositivos por sala y mensajes de
   sistema en cada cambio de membresía. Nada de "confía en nosotros".
2. **La política se explica.** Cada restricción aplicada muestra quién la impuso y por qué.
3. **Desktop y móvil son iguales en lo que importa.** Consola admin completa en desktop; en
   móvil, las acciones críticas (aprobar/revocar dispositivo, ver auditoría) siempre disponibles.
4. **Sin superficie oculta.** No hay pantallas "solo para AegisLink". Lo que ve el operador SaaS
   está documentado.
5. **Heredar el diseño del personal, con identidad propia.** Mismo sistema de diseño, acento
   púrpura oficial (`DESIGN-SYSTEM.md`).

## 8. Fuera de alcance (v1)

- Escrow, "compliance mode" o cualquier lectura por parte de la org (decisión: ADR-0002).
- SSO/SAML/OIDC como identidad: rompe el pseudonimato y ata la identidad a un IdP externo. Se
  evalúa **solo** como gate de enrolamiento (no como identidad) en una fase posterior.
- Reuniones multi-parte E2EE (SFU con cifrado por frame): fase 5, diseño aparte.
- Integraciones/bots: no antes de tener un modelo de "bot como dispositivo de la org" auditado.
- Federación entre organizaciones: no en v1.

## 9. Herencia del prototipo

`prototype/enterprise.jsx` (consola admin: Miembros y equipos · Dispositivos · Claves y rotación ·
Servidores y red · Auditoría de eventos · Políticas de seguridad; "METADATA ALMACENADA: 0 B por
diseño") y `prototype/screens.jsx` (enrolamiento corporativo, "Restore Work Profile", "Work
Privacy") son la referencia visual. El código Work anterior que vivió en el repo personal
(`976c09f`) **no** se reutiliza: sus tres hallazgos de auditoría (firmas admin sin atar payload,
REST que persistía texto plano, CSV sin escape) se evitan por construcción en `PROTOCOL.md`.
