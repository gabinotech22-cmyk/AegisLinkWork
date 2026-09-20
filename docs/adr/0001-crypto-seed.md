# ADR-0001 — Semilla criptográfica copiada del AegisLink personal, sin vínculo posterior

- **Estado:** aceptado (2026-09-19)
- **Decisión del dueño:** "Work tiene su criptografía y el personal la suya; repo nuevo sin
  estar ligado al repo del AegisLink normal."

## Contexto

Work necesita X3DH/PQXDH, Double Ratchet, sobre de dos capas con sealed-sender, SenderKey de
canal, adjuntos y backup cifrados — exactamente lo que el AegisLink personal ya tiene
implementado, testeado y auditado externamente (2026-06, 2026-08, 2026-09). Las alternativas
eran: (a) paquete npm compartido `@aegislink/core`; (b) git submodule; (c) copia única;
(d) reescritura desde cero.

## Decisión

**(c) Copia única.** En la fase 2 se copian los módulos de cripto y transporte del personal
en el `main` del personal en el momento de la copia — **`6ad6f6f`** (`origin/main` del personal el 2026-09-19; copia hecha en la PR #3 de Work) a `mobile/src/crypto`,
`desktop/src/renderer/crypto` y `server/src/{auth,crypto,pow}`, con sus tests. A partir de
ahí son código de Work: se modifican, auditan y versionan aquí, **sin obligación de
sincronizar** con el personal ni paquete compartido.

## Consecuencias

- Arranque inmediato sobre cripto ya auditada; cero cambios en el repo personal.
- Un fallo descubierto en el personal después de la copia **no llega solo**: `qa-lead` revisa
  los `docs/AUDIT-*.md` nuevos del personal al cierre de cada fase y porta lo que aplique
  (decisión explícita, PR propia). Esto es una tarea recurrente del roadmap, no un vínculo.
- Se descarta (a) para no bloquear el arranque con una refactorización del personal, y (b)
  por acoplamiento. (d) contradice la regla de oro de seguridad #12 (mirar a los expertos, no
  inventar) y añade riesgo sin beneficio.
- `PROTOCOL.md` §11 mantiene la tabla "heredado vs nuevo" para auditores.
