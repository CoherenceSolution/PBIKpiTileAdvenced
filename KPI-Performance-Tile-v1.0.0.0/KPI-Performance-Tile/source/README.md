# KPI Performance Tile — source

Power BI custom visual (TypeScript, Power BI Visuals API 5.11, `pbiviz` tools 7.2).
User documentation (French) is in `../docs` of the delivery package; start with `../LISEZMOI.md`.

```
npm install
npm test          # unit tests (vitest)
npm run check     # strict TypeScript
npm run lint      # eslint-plugin-powerbi-visuals
npm run package   # generates capabilities.json + string resources, then dist/*.pbiviz
npm start         # pbiviz dev server
```

## Layout

| Path | Purpose |
|---|---|
| `src/roles.ts`, `src/settingsSchema.ts` | Single source of truth for data roles and format-pane properties |
| `scripts/generate-capabilities.ts` | Generates `capabilities.json` and `stringResources/en-US/resources.resjson` |
| `src/dataConverter.ts` | dataView → view model (pure) |
| `src/status.ts`, `src/viewModel.ts`, `src/numberFormat.ts`, `src/periods.ts`, `src/layoutEngine.ts` | Display rules (pure, unit-tested) |
| `src/*Renderer.ts`, `src/landingPage.ts`, `src/icons.ts` | DOM / SVG painting |
| `src/tooltipManager.ts`, `src/interactionManager.ts`, `src/accessibilityManager.ts` | Host services: tooltips, selection, context menu, URL, keyboard, high contrast |
| `src/formattingSettings.ts`, `src/settingsResolver.ts`, `src/localization.ts` | Format pane model, persisted values, localization keys |
| `src/visual.ts` | `IVisual` implementation (constructor, update, getFormattingModel, destroy) |
| `test/` | Unit tests |
| `harness/` | Browser harness: runs the packaged visual against a fake Power BI host (`index.html` gallery, `selftest.html` checks). Refresh with `node harness/extract.mjs` after `npm run package` |
| `assets/icon.png` | 20 × 20 icon embedded in the package (`icon.svg` is its source) |

`capabilities.json` and the string resources are generated files: edit the schema, not the output.
