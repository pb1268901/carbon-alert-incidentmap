# Carbon Alert — Emergency Map Widget

A custom ArcGIS Experience Builder widget for Carbon County Emergency Management. Displays real-time evacuation zones, active incidents, fire perimeters, road closures, and shelter locations on an interactive map with an accessible sidebar panel.

---

## What This Is

This is a **custom React widget** built for ArcGIS Experience Builder (Developer Edition). It lives inside an EB app and replaces the default ArcGIS popup with a styled sidebar that shows feature details when a user clicks the map. It also includes a legend with layer toggles, per-layer zoom dropdowns, and a full feature list table for keyboard/screen reader users.

The widget is **not a standalone webpage** — it only runs inside an Experience Builder app.

---

## Handoff Note (2026-07-21)

The source file `client/your-extensions/widgets/carbon-alert-combined/src/runtime/widget.tsx` was reconstructed from the deployed `widget.js` after the original source was lost. It should be functionally equivalent to what's currently live, but it has NOT been verified with a full build-and-test pass yet.

**Before pushing your first rebuild:** run `npm run build:prod`, load the compiled output in an EB dev app, and click through popups, zoom dropdowns, layer toggles, and the mobile layout (< 600px widget width) side-by-side with the live site (https://pb1268901.github.io/carbon-alert-incidentmap/). If any behavior differs, the currently-deployed `widget.js` is ground truth — do not push a broken rebuild.

Once one verified rebuild has shipped, this note can be deleted.

## How This Is Deployed

This repo IS the Experience Builder install folder. GitHub Pages serves it directly — there is no separate build/export/upload step to ArcGIS Online. The live site at `https://pb1268901.github.io/carbon-alert-incidentmap/` is served straight from this repo.

**Do not use the Download button in the Dev Edition GUI** — that exports a ZIP for ArcGIS Online hosting, which is a completely separate deployment path not used here.

---

## Repository Structure

```
/
├── README.md
├── cdn/
│   └── 6/
│       └── widgets/
│           └── carbon-alert-combined/
│               └── dist/
│                   └── runtime/
│                       └── widget.js     ← Compiled widget (what GitHub Pages serves)
├── client/
│   └── your-extensions/
│       └── widgets/
│           └── carbon-alert-combined/
│               └── src/
│                   └── runtime/
│                       └── widget.tsx    ← Source file (edit this)
└── index.html
```

---

## Making Changes to the Widget

**Edit → Build → Push. That's it.**

1. Edit the source file on your local machine:
   ```
   C:\arcgis-experience-builder-1.20\client\your-extensions\widgets\carbon-alert-combined\src\runtime\widget.tsx
   ```

2. Build the compiled output from the `client` folder:
   ```bash
   cd C:\arcgis-experience-builder-1.20\client
   npm run build:prod
   ```
   This compiles `widget.tsx` into `cdn\6\widgets\carbon-alert-combined\dist\runtime\widget.js`.

3. Push to GitHub from the repo root:
   ```bash
   cd C:\arcgis-experience-builder-1.20
   git add cdn/6/widgets/carbon-alert-combined/dist/runtime/widget.js
   git commit -m "Your change description"
   git push origin master:main
   ```

4. GitHub Pages redeploys automatically. Allow 1-2 minutes then hard-refresh (`Ctrl+Shift+R`).

> **Note:** If git doesn't detect the compiled file as changed after a build, edit `widget.js` directly via the GitHub web editor (pencil icon) as a fallback. For small targeted changes this is often faster anyway.

---

## Data Sources

All data is pulled live from ArcGIS Feature Services at click/load time. No data is stored locally.

| Layer | Service URL |
|---|---|
| Evacuation Zones | `Carbon_County_Incidents-_Public / FeatureServer/1` |
| Incident Points | `Carbon_County_Incidents-_Public / FeatureServer/0` |
| Fire Perimeters | `NIFS_Feature_Schema_2026_(Public_View) / FeatureServer/10` |
| Road Closures | `Road_Closures_View / FeatureServer/0` |
| Shelter Locations | `Shelter_Locations / FeatureServer/0` |

All services are hosted on ArcGIS Online under the organization `lo6DwqkHoBfbpsNX`. If a layer stops showing data, check that the service is still published and publicly shared in AGOL first — that is the most common failure point.

---

## How It Works

1. The widget mounts inside an Experience Builder app and connects to a map widget via `useMapWidgetIds`.
2. On map click, it runs a `hitTest` against the five tracked layers.
3. If a feature is hit, it fetches full attributes from the Feature Service REST API and displays them in the sidebar popup.
4. The legend lets users toggle layer visibility and zoom to individual features via a dropdown that queries all features for that layer on demand.
5. The feature list table below the legend loads all features from all layers on mount — this is the primary non-map path for keyboard and screen reader users.

---

## Common Problems and Fixes

**Widget shows "Open widget settings and select your map"**
The widget is not connected to a map. In Experience Builder, open Widget Settings and select your map widget from the dropdown.

**Layer data not loading / popup shows all dashes**
The Feature Service is likely unavailable or the layer field names have changed. Open browser DevTools (F12) → Console tab. Load the page and click a feature — look for `[CarbonAlert] query error` messages. Cross-check field names against the service's REST endpoint (`/FeatureServer/0?f=json`). Field names are hardcoded in `widget.tsx` — search for the layer title to find which block to update.

**Zoom button doesn't navigate anywhere**
Open DevTools Console and click a zoom dropdown item. Look for `[CarbonAlert:zoom]` log lines. If `arcView: false` is logged, the map view hasn't connected yet — try refreshing. If geometry logs correctly but the map doesn't move, the ArcGIS JS version may have changed its `goTo` API.

**ArcGIS native popup appearing on top of the widget popup**
The widget suppresses the native popup via `arcView.popup.autoOpenEnabled = false` and `arcView.popup.close()`. If the native popup reappears, check the console for `popup API methods:` — if `close` is not listed, the ArcGIS JS version has changed the popup API and the suppression call needs updating.

**`Module parse failed` / compile error on load**
Usually a syntax error introduced during editing. Run the EB dev server (`npm start` from the `client` folder) and read the webpack error for the exact line number.

---

## Accessibility

The widget targets **WCAG 2.1 Level AA**. Key implementations:

- All interactive elements are keyboard-navigable (Tab, Arrow keys, Escape)
- Focus is managed when the popup opens and closes
- A skip link at the top of the widget jumps keyboard users to the feature list table
- All text meets 4.5:1 contrast ratio; UI components meet 3:1
- Screen reader live region announces popup open/close events
- The feature list table provides a non-map path to all feature data (satisfies 2.1.1 keyboard access)
- Layer toggle buttons use `role="switch"` with `aria-checked`

The map interaction itself (clicking to open popups) is mouse-only by nature of the ArcGIS MapView. The feature list table is the accessible alternative.

---

## Dependencies

| Dependency | Version | Notes |
|---|---|---|
| ArcGIS Experience Builder | Developer Edition | Tested on the version bundled with ArcGIS Maps SDK 5.0.x |
| ArcGIS Maps SDK for JavaScript | 5.0.10 | Loaded automatically by EB |
| React | Loaded by EB | Do not import React separately — use `import { React } from 'jimu-core'` |
| Google Fonts | CDN | Lora + Plus Jakarta Sans — loaded at runtime, requires internet access |

---

## Ownership

Maintained by **Carbon County GIS**.
