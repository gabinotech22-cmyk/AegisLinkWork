# AegisLink Work — Modos de despliegue (multi-tenant y single-tenant)

> **Estado:** ✅ Diseño v1 (2026-09-19; decisión ADR-0003). **Doc canónico** del modo
> `TENANCY` (mapa en `CLAUDE.md`). El paquete self-host (`infra/selfhost/`, `docs/SELF-HOSTING.md`)
> llega en la fase 6.

## 1. Decisión

Una **única imagen** del Work relay, con `TENANCY=multi|single`:

| | `multi` (SaaS operado por AegisLink) | `single` (self-hosted por la organización) |
|---|---|---|
| Organizaciones | N | Exactamente 1 (la primera que se crea; el resto se rechaza) |
| DB | Postgres | SQLite (`node:sqlite`) por defecto; Postgres opcional |
| Quién es "el operador" en `THREAT-MODEL.md` | AegisLink | El IT de la organización |
| Facturación | Por asiento (fase 5) | Licencia; sin facturación en el relay |
| `APP_MIN_VERSION` | Global, lo fija AegisLink | Lo fija el owner desde la consola |
| Push | Proyecto FCM/APNs de AegisLink | El de la org, o relay de push de AegisLink solo-wake-up (opt-in) |
| TURN | Flota de AegisLink | coturn de la org (`infra/selfhost`) |
| Onion/Tor | Opcional | Opcional (paquete lo incluye) |

Todo lo demás — protocolo, criptografía, aislamiento por `orgId`, auditoría, políticas — es
**idéntico**. Un cliente no distingue el modo salvo por la URL del relay y la pantalla
"Servidores y red".

## 2. Aislamiento por organización (obligatorio en ambos modos)

1. Toda tabla salvo `orgs` lleva `org_id` (`DATA-MODEL.md` §4).
2. El `org_id` de cada operación se toma **del certificado autenticado en el socket** o de la
   firma verificada de la acción, nunca de la URL, el body ni un header (regla de oro #7).
3. Las consultas pasan por un repositorio que exige `orgId` como primer argumento; no existe
   una función "sin org". Semgrep (fase 3) marca cualquier `SELECT` sin `org_id` fuera de
   `orgs`.
4. Tests de aislamiento: para cada endpoint/evento, un test con dos orgs donde la B intenta
   leer/mutar datos de la A con credenciales válidas de B → 403/`err` y **sin efecto**.
5. En `single`, el mismo código corre con una sola org: el aislamiento no es un modo, es la
   base.

## 3. Lo que el operador SaaS puede y no puede

Puede (y se declara en `privacy-policy.md`): ver que la org existe, número de miembros y
dispositivos, certificados (nombre de display, rol), ids de salas y su membresía, políticas,
audit log, sobres cifrados en cola con su `expiresAt`, tokens push opacos. Puede suspender una
org (impago) — acción auditada y visible a la org.

No puede: leer contenido, nombres de sala, grafo de DMs, ni emitir certificados, invitaciones o
políticas (no tiene la clave de org). No puede añadir un dispositivo a una sala (la clave la
distribuyen los miembros).

## 4. Migración entre modos

Una org puede **exportar** su estado (certificados, políticas, audit log, sobres pendientes
cifrados) desde SaaS y **importarlo** en un relay propio; los clientes cambian de URL y
re-autentican con los mismos certificados (la cadena de confianza es la clave de org, no el
relay). Al revés igual. Fase 6; formato en `SELF-HOSTING.md`.

## 5. Configuración

| Variable | `multi` | `single` |
|---|---|---|
| `TENANCY` | `multi` | `single` |
| `DATABASE_URL` | `postgres://…` | `./data/aegislink-work.db` |
| `CORS_ORIGIN` | dominio de AegisLink | dominio de la org |
| `BLOB_SECRET`, `TURN_SECRET` | AegisLink | la org |
| `APP_MIN_VERSION` | env | consola (persistido en `orgs`) |
| `BILLING=on` | sí (fase 5) | no |

## 6. Límites por org (anti-abuso, ambos modos)

Miembros, dispositivos por miembro, salas, tamaño de blob, sobres en cola por dispositivo y
retención máxima tienen techos configurables por env; en `multi` además por plan. Los techos
son metadatos de la org, no de personas, y no requieren fila nueva en `THREAT-MODEL.md`.
