# AegisLink Work

**La bóveda de comunicación privada de tu organización.**

Mensajería cifrada de extremo a extremo para equipos, donde la organización gobierna **quién** entra
y con **qué dispositivo**, pero **nunca** puede leer **qué** se dice. Orgs → equipos → salas, roles,
consola de administración con *zero-knowledge admin*, y despliegue como servicio o en tu propio servidor.

> **Estado: semilla técnica (fase 2 hecha, fase 3 en curso).** El repo contiene las reglas de trabajo,
> la documentación de concepto/arquitectura, los prototipos de diseño y el código base (`server/`,
> `mobile/`, `desktop/`) heredado del AegisLink personal con tema WORK, ya sin las features que Work
> no usa. El protocolo de organizaciones (enrolamiento, salas, políticas, consola) llega en las fases
> 3-4. Estado canónico de cada fase y sección: [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Qué es (y qué no)

| | AegisLink (personal) | **AegisLink Work** |
|---|---|---|
| Identidad | Anónima, sin datos | Pseudónima dentro de la organización; anónima hacia fuera |
| Estructura | Contactos y grupos | Organización → equipos → salas, DMs, hilos |
| Quién gobierna | El usuario | El usuario gobierna el contenido; la org, la membresía y los dispositivos |
| Administración | No existe | Consola admin: miembros, dispositivos, claves, políticas, auditoría firmada |
| Metadatos en el servidor | Cero | Mínimos y **declarados** ([`docs/THREAT-MODEL.md`](docs/THREAT-MODEL.md)) |
| Despliegue | Relay público federado | SaaS multi-organización **o** self-hosted, misma imagen |

Lo que **no** cambia: claves solo en el dispositivo, cifrado que nunca degrada en silencio, sealed-sender,
código abierto y auditable. Los administradores no tienen ninguna vía para leer mensajes; no existe
rol de escrow ni "modo cumplimiento" que rompa el E2EE.

AegisLink Work es un producto **independiente** de [AegisLink](https://github.com/gabinotech22-cmyk/AegisLink):
repo, criptografía, relay y clientes propios. Comparte las reglas de trabajo y el sistema de diseño
(con el acento púrpura oficial de Work).

## Documentación

| Doc | Qué contiene |
|---|---|
| [`docs/CONCEPT.md`](docs/CONCEPT.md) | Concepto de producto, personas, flujos, qué ve cada actor |
| [`docs/THREAT-MODEL.md`](docs/THREAT-MODEL.md) | Actores, activos, ataques, mitigaciones; tabla "qué conoce el relay" |
| [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) | Entidades, claves, estados; esquema del relay |
| [`docs/PROTOCOL.md`](docs/PROTOCOL.md) | Wire: enrolamiento, firmas de admin, salas, rekey, retención |
| [`docs/ADMIN-CONSOLE.md`](docs/ADMIN-CONSOLE.md) | Pantallas de la consola y qué rol puede hacer qué |
| [`docs/SCREENS.md`](docs/SCREENS.md) | Inventario de pantallas: heredadas, adaptadas, nuevas, descartadas |
| [`docs/SECURITY-PARITY.md`](docs/SECURITY-PARITY.md) | Checklist: cada defensa del AegisLink personal y cómo la hereda Work |
| [`docs/DESIGN-SYSTEM.md`](docs/DESIGN-SYSTEM.md) | Tema WORK (púrpura), tokens, componentes |
| [`docs/DEPLOYMENT-MODES.md`](docs/DEPLOYMENT-MODES.md) | Multi-tenant vs single-tenant |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Fases, criterios de hecho y estado de las 17 secciones |
| [`docs/adr/`](docs/adr/) | Decisiones de arquitectura |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) · [`docs/TESTING.md`](docs/TESTING.md) · [`docs/PROJECT-STRUCTURE.md`](docs/PROJECT-STRUCTURE.md) | Entorno, CI, estructura |
| [`SECURITY.md`](SECURITY.md) | Cómo reportar vulnerabilidades |

## Correr en local

Requisitos y comandos completos en [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md); resumen:

```bash
cd server && npm ci && npm run dev        # Work relay en http://localhost:3001
cd mobile && npm ci && npx expo start     # app Expo (emulador/dispositivo)
cd desktop && npm ci && npm run dev       # cliente Electron
```

## Prototipos de diseño

```bash
npx --yes serve -l 4180 prototype
```

Abre `http://localhost:4180`. `AegisLink.html` renderiza las pantallas con el tema WORK;
`enterprise.jsx` es la consola de administración.

## Cómo se trabaja aquí

Las reglas de oro (ramas, seguridad y cero metadatos, estructura, herramientas destructivas,
sincronía doc↔código) viven en [`CLAUDE.md`](CLAUDE.md) y se hacen cumplir en CI
(`repo-hygiene`, `docs-sync`, Semgrep, CodeQL). Toda PR usa la plantilla de `.github/`.

## Licencia

Ver [`LICENSE`](LICENSE).
