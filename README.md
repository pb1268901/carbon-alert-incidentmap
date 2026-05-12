# Carbon Alert — Emergency Map Widget

A custom ArcGIS Experience Builder widget for Carbon County Emergency Management. Displays real-time evacuation zones, active incidents, fire perimeters, road closures, and shelter locations on an interactive map with an accessible sidebar panel.

---

## What This Is

This is a **custom React widget** built for ArcGIS Experience Builder (Developer Edition). It lives inside an EB app and replaces the default ArcGIS popup with a styled sidebar that shows feature details when a user clicks the map. It also includes a legend with layer toggles, per-layer zoom dropdowns, and a full feature list table for keyboard/screen reader users.

The widget is **not a standalone webpage** — it only runs inside an Experience Builder app.

---

## Repository Structure

```
/
├── README.md
└── your-extensions/
    └── widgets/
        └── carbon-alert-combined/
            └── src/
                └── runtime/
                    └── widget.tsx      ← All widget code lives here
```

The widget is a single self-contained file (`widget.tsx`). All styles are injected at runtime via a `<style>` tag — there are no separate CSS files.

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

## Making Changes to the Widget

1. Open a terminal and start the Experience Builder dev server:
   ```
   cd /path/to/experience-builder
   npm start
   ```
2. Open `your-extensions/widgets/carbon-alert-combined/src/runtime/widget.tsx` in your editor.
3. Save changes — the browser will hot-reload automatically.
4. When done, export the app (see Deployment below).

**Do not** rename the widget folder or change the folder structure — Experience Builder uses the folder name as the widget ID and will break if it changes.

---

## Deployment

### Publishing to ArcGIS Online

1. In the Experience Builder UI, click the **Download** button (top toolbar, down-arrow icon). Leave "Apply builder client ID" **unchecked**.
2. You will get a ZIP file of the built app.
3. Go to **arcgis.com → Content → My Content → New Item → Your device**.
4. Select the ZIP. When prompted for item type, choose **Application → Experience Builder**.
5. The app now has a shareable URL: `https://experience.arcgis.com/experience/YOUR_ITEM_ID`

> Do **not** drag-and-drop the ZIP onto the AGOL content page — it will be misidentified as a shapefile.

### Embedding on an ArcGIS Hub Site

1. Open your Hub site in edit mode.
2. Add a **Summary** or **Custom** card and choose the iframe/embed option.
3. Paste the Experience Builder URL from the step above.
4. Recommended iframe attributes: `allowfullscreen`, `width="100%"`, `height="700px"`.

To update the embedded app after making code changes, re-export the ZIP and re-upload it to the same AGOL item (Edit Item → Update → replace the file). The Hub embed URL does not change.

---

## Common Problems and Fixes

**Widget shows "Open widget settings and select your map"**
The widget is not connected to a map. In Experience Builder, open Widget Settings and select your map widget from the dropdown.

**Layer data not loading / popup shows all dashes**
The Feature Service is likely unavailable or the layer field names have changed. Open browser DevTools (F12) → Console tab. Load the page and click a feature — look for `[CarbonAlert] query error` messages. Cross-check field names against the service's REST endpoint (`/FeatureServer/0?f=json`). Field names are hardcoded in `widget.tsx` — search for the layer title to find which block to update.

**Zoom button doesn't navigate anywhere**
Open DevTools Console and click a zoom dropdown item. Look for `[CarbonAlert:zoom]` log lines. If `arcView: false` is logged, the map view hasn't connected yet — try refreshing. If geometry logs correctly but the map doesn't move, the ArcGIS JS version may have changed its `goTo` API. The widget tries `esri/geometry/Extent` via AMD require first, then falls back to `center + zoom`.

**ArcGIS native popup appearing on top of the widget popup**
The widget suppresses the native popup via `arcView.popup.autoOpenEnabled = false` and `arcView.popup.close()`. If the native popup reappears, check the console for `popup API methods:` — if `close` is not listed, the ArcGIS JS version has changed the popup API and the suppression call needs updating.

**Two widget instances / popups are different sizes**
If you see two widget panels on screen, there are two instances of the widget in the Experience Builder layout. Delete one. In DevTools, run `document.querySelectorAll('[class*="widget-content"]').length` — if it returns more than 2 (the map + this widget), there is a duplicate.

**`Module parse failed` / compile error on load**
Usually a syntax error introduced during editing. Check that `widget.tsx` starts with `/**` (the JSDoc comment opening) — this has been accidentally truncated before. Run the EB dev server and read the webpack error for the exact line number.

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

## Contact / Ownership

Maintained by the **Carbon County Office of Emergency Management**.  
GIS contact: `CarbonGIS` (AGOL username, see service Editor fields).  
For ArcGIS Online organization access, contact your county IT administrator.
