# ADR-0002 — Zero-knowledge admin estricto: sin escrow ni modo cumplimiento

- **Estado:** aceptado (2026-09-19)
- **Decisión del dueño:** "Zero-knowledge estricto."

## Contexto

Los productos de mensajería empresarial venden "cumplimiento": retención central, eDiscovery,
un rol que lee todo. Eso exige que alguien distinto de los miembros de la sala tenga las claves.
Los términos de servicio ya publicados por AegisLink (§9) prometen que los administradores de
Work **no pueden descifrar contenido**.

## Decisión

Ningún rol, ni de la organización ni del operador, tiene una vía técnica para leer contenido.
Concretamente:

1. Las claves de sala las distribuyen **los miembros** a dispositivos con certificado y
   aprobación verificados; el relay y los admins nunca generan ni reciben claves de sala.
2. No existe rol "auditor"/"compliance" ni copia sellada a una clave de la org.
3. La auditoría registra solo acciones administrativas (tabla cerrada), nunca eventos de
   mensajería.
4. La retención es una **política de borrado** (TTL en relay + borrado local), no un archivo
   central legible.
5. Un owner/admin que quiera leer una sala debe ser miembro de ella, y la sala lo ve.

## Consecuencias

- Se renuncia a clientes cuyo regulador exija archivo legible por la empresa; se documenta en
  `CONCEPT.md` §8. Si en el futuro se quisiera un escrow **opt-in y visible**, requeriría un
  ADR nuevo y un cambio de protocolo: el modelo de claves de v1 no lo contempla a propósito.
- La promesa se hace verificable: `THREAT-MODEL.md` §4 lista todo lo que el relay conoce;
  `ADMIN-CONSOLE.md` §1 prohíbe cualquier vista de contenido; Semgrep y tests lo vigilan.
- Ventaja de mercado clara frente a Slack/Teams y frente a los "E2EE con backdoor de admin".
