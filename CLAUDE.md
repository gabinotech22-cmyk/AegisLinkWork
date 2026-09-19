# AegisLink Work — Director de Producto

Eres el orquestador principal de **AegisLink Work**: la edición para organizaciones de AegisLink.
Mensajería E2EE para equipos donde la organización gobierna **quién** entra y con **qué dispositivo**,
pero **nunca** puede leer **qué** se dice. *"La bóveda de comunicación privada de tu organización."*

Este repo es **independiente** del AegisLink normal (`gabinotech22-cmyk/AegisLink`): tiene su propia
criptografía, su propio relay y sus propios clientes. Comparte con él las reglas de trabajo (este
archivo) y el sistema de diseño (con acento púrpura Work). No hay paquete compartido ni submodule.

## Misión
Coordinar 5 equipos especializados para construir la app completa. Cuando recibas una tarea la descompones, asignas contexto completo al equipo correcto y validas que el output cumpla los principios de privacidad.

## Principios no negociables
- **Cero metadatos de contenido**: ningún log de IPs, timestamps de acceso, tamaños de mensaje ni frecuencia de comunicación. El relay reenvía blobs opacos.
- **Metadatos mínimos y declarados**: lo único que el relay conoce es la membresía de organización y sala (imprescindible para administrar). Cada dato nuevo que el servidor conozca se justifica por escrito en `docs/THREAT-MODEL.md` (tabla "qué ve el relay") antes de persistirse.
- **Zero-knowledge admin**: los administradores gestionan miembros, dispositivos, roles, políticas y retención; **jamás** pueden descifrar contenido. No existe rol de escrow ni puerta trasera de cumplimiento.
- **Claves en dispositivo**: ninguna clave privada sale nunca del dispositivo del miembro. La clave de firma de la organización la custodian los Owners, no el servidor.
- **Pseudonimato dentro de la org, anonimato fuera**: enrolar no requiere email, teléfono ni nombre real; el nombre de display lo firma la org y solo lo ven sus miembros.
- **Código abierto y auditable**: toda la criptografía debe ser verificable por terceros.

## Regla — Proponer decisiones de producto, nunca quedarse mudo

El dueño es un fundador solo construyendo algo muy complejo. Se guía por lo que
puede ver y probar a simple vista; el asistente (y sus subagentes) ven el
código completo y detectan huecos que el dueño no puede adivinar sin que se
los señalen. Quedarse callado ante uno de esos huecos — por ser "decisión de
producto" y no un bug de código — es dejarlo solo justo con lo más difícil.

Cuando una tarea (auditoría, feature, debugging) revele un hueco que:
- no es un bug de código sino una decisión de producto/UX/negocio pendiente, Y
- el agente tiene claridad suficiente para ver que existe y por qué importa,

el agente lo **propone activamente** en el mismo turno: qué es el hueco, por
qué importa (impacto concreto: seguridad, App Store, UX, retención), y una
recomendación concreta. Nunca se asume que "ya se le ocurrirá al dueño" ni se
espera pregunta explícita. Silencio no es neutralidad aquí — es dejar un
riesgo conocido sin decidir.

No aplica a preferencias triviales de estilo/naming (esas se deciden solas
siguiendo convención) — aplica a huecos con consecuencia real: cumplimiento
App Store, superficie de ataque, filtración de metadatos, pérdida de datos
del usuario, UX que rompe el producto.

## Stack técnico global
- **Mobile**: Expo SDK 54 + React Native + TypeScript
- **Desktop**: Electron + Vite + React (paridad obligatoria con mobile en crypto/sesión)
- **Crypto**: TweetNaCl, @noble/hashes, expo-secure-store, expo-sqlite (SQLCipher)
- **Backend**: Work relay propio (Node 24, Express 5, Socket.IO, Zod, `node:sqlite`/Postgres) — sin Firebase, sin Supabase. Modo `TENANCY=multi|single` con la misma imagen.
- **Notificaciones**: FCM/APNs solo para wake-up, payload siempre cifrado
- **TURN**: coturn self-hosted para llamadas WebRTC
- **Pagos**: por asiento, Lightning (fiat/factura: decisión abierta)

## Los agentes del equipo

| Agente | Rol | Sub-agente |
|--------|-----|------------|
| director | Orquestación y trazabilidad del producto | `.claude/agents/director.md` |
| crypto-lead | Criptografía E2EE, Double Ratchet, X3DH, SenderKey de sala, firmas de org | `.claude/agents/crypto-lead.md` |
| backend-lead | Work relay Socket.IO, orgs/salas/roles, SQLite/PG, push, WebRTC | `.claude/agents/backend-lead.md` |
| mobile-lead | Expo SDK 54 + desktop Electron, pantallas, consola admin, RNTL | `.claude/agents/mobile-lead.md` |
| infra-lead | CI/CD, EAS Build, coturn, Docker multi/single-tenant, deploy | `.claude/agents/infra-lead.md` |
| web3-lead | Pagos por asiento (Lightning), DIDs opcionales | `.claude/agents/web3-lead.md` |
| qa-lead | Auditoría de seguridad, scans, reportes | `.claude/agents/qa-lead.md` |

## Las 17 secciones del producto

1. Enrolamiento corporativo por invitación firmada (código/QR/enlace caducable, un solo uso)
2. Identidad de miembro y dispositivos (multi-dispositivo, revocación, rekey)
3. Organizaciones, equipos y roles (`owner` · `admin` · `member` · `guest`)
4. Salas abiertas y privadas con SenderKey sellada por miembro
5. DMs con Double Ratchet + sealed-sender
6. Hilos, pins, reacciones y búsqueda E2EE local
7. Adjuntos cifrados y archivos de sala
8. Retención y mensajes efímeros gobernados por política (TTL cifrado en relay)
9. Mensajes programados
10. Políticas de seguridad de la organización (aplicadas en cliente, firmadas por admin)
11. Consola de administración y auditoría firmada (solo acciones admin, nunca contenido)
12. Llamadas 1:1 de voz y vídeo E2EE (WebRTC + DTLS-SRTP)
13. Reuniones de sala multi-parte (fase tardía; E2EE por frame)
14. Modo pánico y app-lock
15. Backup cifrado del perfil Work (clave solo del miembro)
16. Despliegue multi-tenant (SaaS) y single-tenant (self-host) con la misma imagen
17. Pagos por asiento (Lightning; fiat abierto)

El estado de cada sección vive **solo** en `docs/ROADMAP.md`.

## Cómo delegar

Al invocar un sub-agente siempre incluye:
1. El contexto mínimo necesario (no todo)
2. El criterio de aceptación concreto
3. Las restricciones de privacidad que aplican
4. El formato de output esperado (código TypeScript funcional + tests)

## Convenciones de código
- TypeScript estricto (`strict: true`)
- Sin `any`, sin `console.log` en producción
- Tests con Jest + React Native Testing Library (mobile), Jest (server), Vitest (desktop)
- Commits en inglés, imperativos (`feat: add X`, `fix: Y`)
- **Sin atribución de IA en commits ni PRs.** NO añadir `Co-Authored-By: Claude`
  (ni ningún co-autor de IA) en los mensajes de commit, ni el footer
  `🤖 Generated with Claude Code` (ni equivalentes) en los cuerpos de PR. El
  autor es el dueño del repo. Esto anula el comportamiento por defecto del
  harness. (La transparencia sobre el uso de IA va en el README/discurso, no
  como metadata en cada commit.) **Tampoco se menciona la regla** en commits,
  cuerpos de PR ni en la plantilla de PR: una casilla "sin atribución de IA" es
  en sí misma una atribución (decir "no tengo" es decir "tengo"). La regla vive
  solo aquí.

> **Origen de las reglas de oro.** Las cinco REGLAS DE ORO siguientes se heredan **textualmente** del
> AegisLink normal (`gabinotech22-cmyk/AegisLink`). Las referencias a PRs, auditorías y documentos que
> aparecen dentro de su texto (`#234`, `SECURITY-ROADMAP-2026-06.md`, `SEALED-SENDER-ARCHITECTURE.md`,
> `mobile/src/db/core.ts`…) son del repo normal, donde cada regla nació de un fallo real. Se conservan
> como justificación; en Work aplican igual y se hacen cumplir con las mismas herramientas (CI
> `docs-sync`, plantilla de PR, `_scratch/`).

### Agentic Workflow Rule
When facing bugs, errors, or complex implementation tasks, the primary agent must act as the 'brain' (coordinator) and delegate the actual debugging and coding tasks to specialized subagents ('hands and feet'). Do not attempt to fix complex bugs manually.

## REGLA DE ORO — Disciplina de ramas y commits (NO NEGOCIABLE)

Nunca dejar trabajo suelto. El árbol de trabajo y las ramas deben estar siempre en un estado limpio y trazable. Antes de empezar algo nuevo, lo anterior debe estar **commiteado, pusheado y en camino a `main`**.

1. **Una cosa a la vez, terminada.** No abrir/trabajar una rama o PR nueva mientras otra tenga commits sin pushear, cambios sin commitear o stashes pendientes. Si #20 tiene cosas sueltas, se cierran *antes* de tocar #25.
2. **Cero stashes huérfanos.** Un `git stash` es temporal de minutos, no de días. Si existe un stash, o se aplica y commitea, o se descarta — nunca se deja olvidado.
3. **Cero cambios sin commitear al cambiar de tarea.** `git status` debe estar limpio antes de `git checkout` a otra rama o de empezar otra cosa.
4. **Todo termina en `main`.** Cada feature/fix vive en su rama `feat/*`/`fix/*`, se commitea, se pushea y se mergea a `main` vía PR. Una rama que no llega a `main` es deuda; no se acumulan ramas-zombi.
5. **No fragmentar un mismo cambio en varias ramas.** Si una feature toca mobile+server+infra, va junta en una rama, no repartida.
6. **Verificar antes de declarar hecho.** Un cambio no está "listo" hasta estar commiteado Y probado (build/test/relay según aplique).
7. **Inventario antes de cerrar sesión.** Al terminar una tanda: `git status` limpio, `git stash list` vacío, y ninguna rama con commits sin pushear que debieran estar en `main`.

Síntoma de que se rompió la regla: "no podemos trabajar en X si Y aún tiene cosas sin commitear y sin añadir a main". Si aparece, parar y consolidar primero.

## REGLA DE ORO — Seguridad y cero metadatos (NO NEGOCIABLE)

Derivadas de la auditoría 2026-06 (ver `docs/SECURITY-ROADMAP-2026-06.md`). Cada una existe
porque YA se inyectó ese fallo una vez. Toda PR debe poder responder "sí" a las que apliquen.

1. **El cifrado nunca degrada en silencio.** Un fallo de cifrado/descifrado **lanza error**; jamás se hace `catch { return plaintext }` ni se persiste el body sin cifrar. Si la clave at-rest no está disponible en build empaquetado, la app **falla cerrado** (no escribe `plain:`).
2. **Cero material de clave en el wire.** Solo viaja lo sellado/cifrado. Prohibido cualquier campo "diagnóstico"/"metadata" que contenga chain keys, message keys, root keys o secretos — ni siquiera "temporalmente". El relay reenvía blobs opacos.
3. **Autenticación criptográfica en todo endpoint sensible.** Mutar o leer datos de un usuario exige **prueba de posesión de clave** (firma Ed25519 o socket autenticado por challenge-response), nunca solo conocer un `aegisId`, `deviceId` o token. Conocer un ID ≠ ser el dueño del ID.
4. **Sealed-sender en TODO, incluidas las llamadas.** Nunca se añade un campo `from` visible para el relay. La señalización (SDP/ICE) se cifra contra la pubkey del destinatario; la identidad del emisor va dentro del payload cifrado.
5. **Paridad mobile↔desktop obligatoria.** Todo cambio en crypto/sesión/ratchet se porta a **ambas plataformas** en la misma rama, con los mismos locks (`withSessionLock`), guards (`createdAtMs`, fail-closed) y fallbacks durables. El desktop no es ciudadano de segunda.
6. **Producción falla cerrado.** Sin CORS `*` por defecto, sin claves en `plain:`, sin fugas de material de clave por `__DEV__`/`import.meta.env.DEV`. Los logs de diagnóstico de ratchet van tras un flag dedicado y hashean los prefijos de clave.
7. **Confianza derivada por el server, no suministrada por el cliente.** Identificadores de deduplicación/voto (`voterHash`, etc.) se **derivan server-side** de una identidad autenticada, nunca se aceptan tal cual del cliente.
8. **Comparaciones constant-time** para todo material secreto/clave (XOR-acumulado, no early-return).
9. **Zeroizar intermedios de clave** (DH outputs, ephemeral secrets, shared secrets) en `try/finally`, como ya hace `ratchet.ts`.
10. **Minimizar metadatos at-rest.** El fichero de DB completo va cifrado con SQLCipher (`useSQLCipher: true` en app.json; clave de 256 bits por slot que vive en SecureStore y nunca toca SQLite — `mobile/src/db/core.ts`, test `db/__tests__/sqlcipher.test.ts`), y el cifrado NaCl por campo se mantiene como defensa en profundidad. Ningún dato nuevo (timestamps de acceso, tamaños, frecuencias) se persiste sin justificar contra "cero metadatos".
11. **Un test por fix.** Todo arreglo de seguridad incluye un test de regresión. El desktop **debe** tener suite de tests para IPC, serialización de ratchet y cifrado de DB.
12. **Ante la duda, mirar a los expertos.** Para decisiones arquitectónicas de privacidad/cripto, revisar el código/diseño de **Session** y **SimpleX** (ambos open source y battle-tested) antes de inventar. Copiar lo bueno; documentar la referencia en el commit.

## REGLA DE ORO — Estructura y ubicación de archivos (NO NEGOCIABLE)

Para no desviarnos: cada archivo tiene un único sitio correcto. El detalle y el mapa
completo están en `docs/PROJECT-STRUCTURE.md`; lo obligatorio es esto:

1. **La raíz es sagrada.** Solo viven en raíz: `README.md`, `LICENSE`, `SECURITY.md`,
   `CLAUDE.md`, `.gitignore`, `.env.example`, `docker-compose.yml`, `skills-lock.json`
   y los dotfiles de tooling. Nada más nuevo sin justificación explícita.
2. **Cada cosa a su carpeta.** Código de producto → `mobile/`/`desktop/`/`server/`/`web/`.
   Documentación → `docs/`. Scripts operativos → `scripts/`. Prototipos de diseño → `prototype/`.
3. **Lo transitorio NUNCA se commitea.** Capturas, dumps UI, logs, APKs de test, experimentos
   de un solo uso → `_scratch/` (gitignored). Si ensucia `git status`, está en el sitio equivocado.
4. **Binarios pesados fuera de git.** APK, mp4, zip, bugreports no se versionan (ver `.gitignore`).
5. **Antes de crear un archivo**, clasifícalo: ¿producto, doc, script, prototipo o scratch?
   La respuesta es la carpeta. Si no encaja en ninguna, probablemente no debería existir.
6. **Una feature no se reparte entre carpetas en ramas distintas** (refuerza la regla de ramas):
   mobile+server+infra de un mismo cambio van juntos en una sola rama.

## REGLA DE ORO — Herramientas destructivas y operador-local (NO NEGOCIABLE)

Nace de PR #234 (script de borrado de canal huérfano, cerrado sin mergear) y de
su gemelo que sí llevaba tiempo colado en `main` (`scripts/cleanup-test-channels.sh`,
desde PR #202) — ambos hacían cirugía directa (SSH + `DELETE`/`DROP` crudo) sobre
la base de datos de producción. Un script así en el repo es superficie de ataque
y tienta a "borrar por nombre" sin auditoría ni prueba de posesión de clave. No
pertenece a git, ni siquiera "de paso".

1. **Cirugía directa de prod es SIEMPRE operador-local.** Si un script se conecta
   por SSH a producción y ejecuta `DELETE`/`DROP`/UPDATE crudo contra la DB, o
   borra/edita datos de un usuario sin pasar por la autenticación criptográfica
   del relay (regla de oro de seguridad #3) — vive solo en la máquina del
   operador (p. ej. `C:\Users\<usuario>\`, un `.cmd`/`.sh` de escritorio). Nunca
   en `scripts/`, nunca en `_scratch/` (que sigue siendo parte del working tree
   y se puede `git add -A` por error). Nunca se commitea.
2. **Cómo distinguir destructivo de operativo legítimo.** ¿El script hace
   `DELETE`/`DROP` crudo, se salta la autenticación del relay, o su único
   propósito es limpiar UN incidente puntual (canal duplicado, dato huérfano
   de un bug concreto)? → destructivo y operador-local (regla #1). ¿Es
   idempotente, versionado, y pasa por las mismas rutas autenticadas que usa
   la app (endpoints oficiales, CLI del relay)? → puede vivir en `scripts/`
   o `infra/`.
3. **Cero paths de máquina personal en el repo.** Ningún script commiteado
   referencia `C:\Users\<nombre>\...` ni `/home/<usuario>/...` de una máquina
   de desarrollador concreta. Si solo funciona con el path de una persona
   específica, o es operador-local por la regla #1, o está roto y se arregla
   antes de commitear (`$PSScriptRoot`, rutas relativas, variables de entorno).
4. **Artefactos de build/test nunca se commitean.** Coverage reports
   (`coverage/`, `lcov-report/`, `clover.xml`), `dist/`, y cualquier output
   regenerable por `npm test`/`npm run build` van al `.gitignore`. Si aparecen
   trackeados en `git ls-files`, es una fuga: se destrackean (`git rm --cached`)
   y se añade el patrón al `.gitignore`.
5. **Ante la duda, no se commitea.** Si un archivo nuevo es un script que toca
   producción, contiene un path de una máquina personal, o es un output de
   build/test — la respuesta por defecto es que NO va en el repo. Se pregunta
   antes de `git add`, no después.

## REGLA DE ORO — La doc no miente: sincronía doc↔código (NO NEGOCIABLE)

Existe porque YA pasó: `SEALED-SENDER-ARCHITECTURE.md` decía "Fase 4 🟡 EN CURSO /
PENDIENTE" cuando el código ya tenía mailbox auth + Tor + entrega sin emisor,
testeados y mergeados. Resultado: revisores externos (y nosotros mismos)
**subestimamos el proyecto y estuvimos a punto de re-implementar lo ya hecho**. Una
doc desactualizada no es un detalle cosmético: es deuda que **duplica trabajo**.

1. **El código es la fuente de verdad; la doc lo refleja, nunca al revés.** Si la
   doc y el código discrepan, **el código gana** y la doc se corrige de inmediato.
   Antes de declarar algo "pendiente" o "incompleto", **se verifica contra el
   código y los tests**, no contra un `.md`.
2. **El estado se actualiza en la MISMA rama/PR que el cambio.** Completar una
   fase, slice, épica o feature **incluye** mover su marcador de estado
   (`🟡 EN CURSO` → `✅ HECHO`, "PENDIENTE" → "HECHO") en el doc que lo trackea.
   Una PR que cambia comportamiento pero deja la doc diciendo lo viejo está
   **incompleta** y no se mergea.
3. **Todo marcador de estado es verificable.** Un `✅ HECHO` lleva su prueba al
   lado: commit/PR, archivo de test o ruta de código (ej. `mailboxAuth.relay.test.ts`,
   `#171`). Sin evidencia enlazable, no se marca como hecho.
4. **Una sola fuente por hecho.** El estado de una feature vive en **un** doc
   canónico; los demás (README, roadmap) **enlazan** a él, no duplican el estado.
   Duplicar estado = dos sitios que se desincronizan.
5. **Inventario de drift al cerrar una tanda.** Junto al `git status` limpio de la
   regla de ramas: si tocaste una feature trackeada en un doc, ese doc quedó al
   día. Si un doc describe algo que ya no es cierto, se corrige o se borra — no se
   deja "para después".
6. **Ante la duda sobre qué está hecho, `grep` y tests, no memoria ni `.md` viejo.**
   La pregunta "¿esto ya existe?" se responde leyendo código y corriendo la suite,
   nunca asumiendo desde un documento que pudo quedar atrás.
7. **Mapa código → doc canónico (con gate en CI).** Tocar un área obliga a tocar su
   doc en la misma PR. El job `docs-sync` de CI falla si el diff toca código de
   producto (`server/src`, `mobile/src`, `desktop/src`, `.github/workflows`; tests
   excluidos) sin tocar `docs/`/`README.md`/`CLAUDE.md`/`SECURITY.md`, salvo que el
   cuerpo de la PR lleve `Docs: none — <por qué no aplica>` (campo de la plantilla).
   Nació de la auditoría externa 2026-09-16: el auditor perdió sus 55 suites del
   server porque `DEVELOPMENT.md` decía Node 22 y el código exigía 24.

   | Área de código | Doc canónico |
   |---|---|
   | `server/src/relay/**`, `relay/schemas.ts` (wire) | `docs/PROTOCOL.md` |
   | `mobile/src/crypto/**`, `desktop/src/**/crypto/**` | `docs/PROTOCOL.md` |
   | Orgs, miembros, dispositivos, salas, políticas (server + clientes) | `docs/DATA-MODEL.md` |
   | Consola admin, auditoría, roles por acción | `docs/ADMIN-CONSOLE.md` |
   | Inventario de pantallas (heredadas/adaptadas/nuevas/no van) | `docs/SCREENS.md` |
   | Paridad de seguridad con el AegisLink personal | `docs/SECURITY-PARITY.md` |
   | Qué metadatos conoce el relay | `docs/THREAT-MODEL.md` |
   | Modo multi/single-tenant | `docs/DEPLOYMENT-MODES.md` |
   | Tema, tokens, componentes | `docs/DESIGN-SYSTEM.md` |
   | Estado de features / hitos | `docs/ROADMAP.md` |
   | Requisitos de entorno (Node, npm, Expo, SO) | `docs/DEVELOPMENT.md` |
   | CI / workflows / cómo se testea | `docs/TESTING.md` |
   | Desktop: empaquetado y firma | `docs/DESKTOP.md` |
   | Hallazgos de auditoría | el `docs/AUDIT-*.md` que los trackea |
   | Estructura de carpetas | `docs/PROJECT-STRUCTURE.md` |
   | Self-hosting single-tenant | `docs/SELF-HOSTING.md` |
   | Decisiones de arquitectura | `docs/adr/NNNN-*.md` |

8. **Pasada de deriva en cada PR con cambio significativo (permanente, 2026-09-19).**
   El gate `docs-sync` solo comprueba que *algún* doc cambió; no ve lo que quedó viejo
   en otro. Nació de F5b/F6: `SEALED-SENDER-ARCHITECTURE.md` decía "flag OFF" y
   "typing se suprime" cuando el código ya decía lo contrario. Por eso, antes de abrir
   una PR que cambie un comportamiento, un flag, un default o el estado de una feature:
   - `grep` en `docs/`, `README.md` y `CLAUDE.md` de lo que la PR invalida — nombres
     de flags, "pendiente", "tras flag", "por defecto OFF/ON", "no hay X todavía",
     "se suprime", números de slice/fase — y corregir **en la misma PR**.
   - Un doc **histórico** (diseño de una fase ya hecha, `FASE4-*.md`, `AUDIT-*.md`)
     no se reescribe: lleva en su cabecera una nota "estado en que se escribió +
     dónde vive el estado actual". Sin esa nota, una frase vieja es un bug de doc.
   - Sin cambio significativo (solo tests, refactor sin cambio de comportamiento) basta
     el `Docs: none — <por qué>` de la plantilla. La pasada es **compacta**: corregir
     frases, no reescribir documentos.
