# AegisLink Work — Sistema de diseño

> **Estado:** ✅ Tokens v1 definidos (2026-09-19) en `prototype/theme.jsx` (`WORK`, `WORK_LIGHT`).
> **Doc canónico** de tema, tokens y componentes (mapa en `CLAUDE.md`). Los tokens viven en
> `mobile/src/theme/vault.ts` y `desktop/src/renderer/theme/vault.ts` (tema `Work`, fase 2, PR #3);
> si el código y esta tabla discrepan, se corrige en la misma PR.

## 1. Decisión

Work **hereda** el sistema de diseño del AegisLink personal (dirección VAULT: tipografía
grotesk + mono, radios, densidades, componentes, estados vacíos, motion) y cambia **una sola
cosa de identidad**: el acento mint pasa a **púrpura oficial Work**, con neutros ligeramente
más fríos (grafito/tinta) para que el púrpura asiente. Las pantallas se rediseñan para el
concepto Work (salas, org, consola) reutilizando los mismos componentes.

Por qué púrpura: el prototipo del personal ya lo usaba (`#8b5cf6`) para todo lo relacionado
con Work (contactos Lead, "Audit Q2"), así que ya era el color de "lo corporativo" en la marca.

## 2. Tokens

| Token | WORK (oscuro, por defecto) | WORK_LIGHT | Uso |
|---|---|---|---|
| `accent` | **`#8b5cf6`** | **`#6d28d9`** | CTA, enlaces, burbuja saliente, logo |
| `accentDeep` | `#5b3bb8` | `#4c1d95` | Pressed, bordes de acento |
| `accentInk` | `#150a2e` | `#ffffff` | Texto sobre acento |
| `bg` | `#0b0a12` | `#f4f2f9` | Fondo app |
| `surface` / `surface2` / `surface3` | `#14121f` / `#1d1a2c` / `#282438` | `#ffffff` / `#ebe7f3` / `#d9d3e8` | Tarjetas, sheets, inputs |
| `text` / `textDim` / `textFaint` | `#eeeaf7` / 58 % / 32 % | `#150a2e` / 58 % / 32 % | Jerarquía tipográfica |
| `border` / `borderStrong` / `divider` | blanco 7 % / 14 % / 5 % | tinta 8 % / 20 % / 6 % | |
| `danger` / `warn` | `#ff6b6b` / `#f0c674` | `#b8442a` / `#a87f1f` | Revocar, expirado / pendiente |
| `bubbleIn` / `bubbleOut` | `#1d1a2c` / `#8b5cf6` | `#ebe7f3` / `#6d28d9` | Chat |
| `radius` / `radiusS` / `radiusL` | 14 / 8 / 22 | igual | Heredado |
| `font` / `fontMono` / `fontDisplay` | Space Grotesk / JetBrains Mono / Space Grotesk | igual | Heredado |

Contraste: `accent` sobre `bg` oscuro 5.9:1; `accentInk` sobre `accent` 7.1:1; `#6d28d9` sobre
blanco 7.3:1 (AA texto normal, AAA texto grande). Se verifica en fase 4 con la checklist de
`.claude/references/accessibility-checklist.md`.

## 3. Semántica de color específica de Work

| Significado | Token | Ejemplo |
|---|---|---|
| Verificado / activo | `accent` | dispositivo verificado, miembro activo, firma ✅ |
| Pendiente | `warn` | dispositivo pendiente de aprobación, invitación sin usar |
| Revocado / expirado / firma inválida | `danger` | dispositivo revocado, certificado caducado, ❌ auditoría |
| Forzado por la organización | `accent` + candado | chip "Forzado por administrador de <Org>" (prototipo "Work Privacy") |
| Guest | `textDim` + borde discontinuo | avatar y fila de miembro externo |

## 4. Componentes

Heredados (sin cambios): TopBar, TabBar, PrimaryButton/GhostButton, Bubble, Sheet, Toast,
EmptyState, Fingerprint (bloques mono), QR, ListRow, Chip, Toggle, Segmented, PIN pad.

Nuevos en Work (fase 4): `OrgBadge` (nombre + fingerprint abreviado), `DeviceRow` (etiqueta,
plataforma, estado, fingerprint), `PolicyChip` ("Retención 30 d · política de la org"),
`AuditRow` (tipo, actor, hora, verificación), `RoomHeader` (nombre, tipo, época, miembros),
`SystemMessage` (alta/baja/rekey con enlace al evento), `EnrollStepper`.

## 5. Iconografía y marca

- Icono de app propio `icon-work` (variante del escudo con fondo púrpura `#5b3bb8`→`#8b5cf6`);
  bundle id `com.aegislink.work`. Fuente: `prototype/App Icons.html` (variante "Work").
- Logo: mismo trazo, `logoStroke = accent`.
- Nombre en UI: **AegisLink Work** (nunca "AegisLink" a secas dentro de la app Work).

## 6. Motion y densidad

Heredados: densidades `compact/regular`, animaciones Reanimated a 120 fps
(`.claude/skills/swm-animations-gestures.md`), escenas de `Animations.html` (generación de
identidad, mensaje que se quema, alerta MITM) reutilizables para enrolamiento, retención y
fingerprint no coincidente.

## 7. Cómo previsualizar

```bash
npx --yes serve -l 4180 prototype
```

`AegisLink.html` renderiza con `WORK`/`WORK_LIGHT` (el panel de tweaks permite probar otros
acentos, pero el oficial es el de la tabla). `enterprise.jsx` es la consola.
