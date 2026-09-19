# ADR-0003 — Multi-tenant (SaaS) y single-tenant (self-host) desde v1, misma imagen

- **Estado:** aceptado (2026-09-19)
- **Decisión del dueño:** "Ambos desde v1."

## Contexto

Self-host maximiza la privacidad (AegisLink no ve ni la membresía) y es lo que piden los
clientes más sensibles; SaaS es lo que permite vender y operar a escala. Hacer solo uno y
"añadir el otro después" suele producir dos bases de código o un aislamiento por org
improvisado.

## Decisión

Una única imagen del Work relay con `TENANCY=multi|single`. El aislamiento por `orgId` es la
base del código en ambos modos, no una capa añadida al modo multi: toda tabla lleva `org_id`,
todo repositorio exige `orgId` derivado del certificado autenticado, y hay un test de
aislamiento por endpoint (`DEPLOYMENT-MODES.md` §2). Single-tenant = el mismo código con
exactamente una org y SQLite por defecto.

## Consecuencias

- Más trabajo inicial en la fase 3 (tests de aislamiento, Postgres + SQLite) a cambio de no
  tener dos productos.
- Migración SaaS ↔ self-host posible porque la confianza es la clave de org, no el relay.
- El modelo de amenazas tiene un solo "operador" con dos encarnaciones (AegisLink o el IT de
  la org); las garantías son idénticas.
- El paquete `infra/selfhost/` y `SELF-HOSTING.md` son entregables de la fase 6, no un extra.
