# App icons — AegisLink Work

Single source: the three SVGs in this folder (`icon-dark.svg` is the main icon,
`icon-light.svg` / `icon-tinted.svg` are the alternate icons offered in Settings →
App icon). Same AegisMark as the personal edition, WORK purple identity
(`docs/DESIGN-SYSTEM.md`: `#8b5cf6` dark, `#6d28d9` light).

Regenerate everything from them — never edit the PNGs by hand:

```bash
node scripts/gen-icons.mjs   # assets/*.png: icon, icon-{dark,light,tinted}, adaptive-icon,
                             # splash-icon, favicon, notification-icon (white silhouette, 96px)
node scripts/gen-icons.js    # android-icon-assets/: flat + adaptive mipmaps per variant
```

Background colours for the Android adaptive icons live in `scripts/gen-icons.js`,
`app.plugin.js` and `app.json` (`adaptiveIcon.backgroundColor`), and must match.
