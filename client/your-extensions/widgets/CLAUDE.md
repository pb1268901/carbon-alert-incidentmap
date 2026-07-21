# CLAUDE.md — Carbon Alert Widget

Briefing for Claude on how this folder works. Human-facing docs live in the GitHub README.

---

## What this is

One custom ArcGIS Experience Builder widget — `carbon-alert-combined` — that renders an accessible emergency panel over a map: layer legend with toggles + per-layer zoom dropdowns, sidebar popup on feature click, feature list table (non-map path for keyboard/screen-reader users), and a mobile-responsive layout that switches at 600px widget width.

Data comes live from five ArcGIS Feature Services on every click/load — nothing is cached. The widget only runs inside an Experience Builder app; it is not a standalone webpage.

---

## Canonical source of truth

- **GitHub repo:** https://github.com/pb1268901/carbon-alert-incidentmap
- **Live GitHub Pages site:** https://pb1268901.github.io/carbon-alert-incidentmap/
- **Embedded in Hub site:** https://carbon-alert-carbonmt.hub.arcgis.com/

The GitHub README is the authoritative deployment guide. Deployment is:

1. Edit `carbon-alert-combined/src/runtime/widget.tsx` locally.
2. Run `npm run build:prod` from `C:\arcgis-experience-builder-1.20\client\`.
3. Commit and push the compiled `cdn/6/widgets/carbon-alert-combined/dist/runtime/widget.js` from the GitHub repo clone.
4. GitHub Pages redeploys automatically.
5. The Hub site iframes the GitHub Pages URL.

There is no AGOL ZIP export step. Any instructions mentioning the Dev Edition "Download" button and uploading to arcgis.com are for a different, unused pipeline — ignore them.

---

## Folder layout

```
widgets/
├── CLAUDE.md                                    ← this file
└── carbon-alert-combined/
    ├── manifest.json
    ├── config.json
    ├── icon.svg
    └── src/
        ├── runtime/widget.tsx                   ← all widget code (~1300 lines)
        └── setting/setting.tsx                  ← MapWidgetSelector for EB settings panel
```

One widget, standard EB layout. Do not rename the folder — EB uses the folder name as the widget ID, and the GitHub Pages URL depends on it staying `carbon-alert-combined`.

---

## About the current widget.tsx (as of 2026-07-21)

`widget.tsx` was reconstructed from the deployed `widget.js` on GitHub (specifically the state at the "Mobile-friendly fixes" commit of 2026-07-15) after the source file was lost. It is a hand-written TypeScript source that, when compiled with `npm run build:prod`, should produce a `widget.js` functionally equivalent to what's currently live.

**First build after reconstruction:** the compiled output will not be byte-identical to the live `widget.js` (variable names change, whitespace, module wrapping). What matters is behavior parity. Before pushing the first rebuild:

1. Load the new build in an EB dev app and click through every layer's popup + zoom dropdown.
2. Check the feature list table renders and the mobile breakpoint kicks in at <600px widget width.
3. Diff visible behavior against the live site (https://pb1268901.github.io/carbon-alert-incidentmap/) side by side.

If any behavior differs, cross-reference the deployed `widget.js` on GitHub — that file remains the ground truth for how production actually behaves until the rebuild is verified.

---

## The user's current priority: mobile UX

Mobile work is the active priority. Current state of mobile handling:

- **`widget.tsx` already has responsive logic**: a ResizeObserver measures the widget's own width; when it drops below 600px, the `ca-mobile` CSS class toggles on. This enlarges font sizes in the feature list table, enforces 44×44px minimum tap targets on layer toggles / close button / zoom dropdown buttons, hides the Detail column in the feature list, and switches the popup box from absolute to relative positioning so the whole widget scrolls as one column.
- **The mobile breakpoint is widget-width, not viewport-width**. A narrow widget on a desktop viewport still triggers mobile mode. That is intentional (the widget is often sized narrowly inside EB layouts).
- **The Hub site is the other attack surface**. The widget is iframed into an ArcGIS Hub site, and Hub's editor is notoriously limited for responsive customization. Meaningful Hub-side wins usually require: injecting custom CSS via a Text or Markdown card, restructuring the site's row/column layout, or adjusting the iframe's height / container so the widget isn't fighting a fixed-height container.
- **The iframe embed itself can undo widget responsiveness**. A perfectly-responsive widget still breaks if the iframe is fixed at e.g. 700px height on mobile, or if a Hub column wraps it in a max-width container that's too narrow.

When starting mobile work, ask whether the goal is the widget code, the Hub embed configuration, or both. Almost always both.

---

## Widget-specific gotchas

Things the code will not obviously tell you. Getting any of these wrong breaks things silently.

- **Do not import React normally.** Use `import { React } from 'jimu-core'`. Experience Builder loads its own React; importing a separate copy causes hook errors.
- **Suppress the native ArcGIS popup** with `arcView.popup.autoOpenEnabled = false` and `arcView.popup.close()`. If either is skipped, the native ArcGIS popup and the custom sidebar popup fire simultaneously.
- **`view.goTo` with a raw extent object silently fails** in Experience Builder configs — autocast does not kick in reliably. The `zoomToGeometry` function first tries `esri/geometry/Extent` via AMD `require` and falls back to `center + zoom`. Do not "simplify" it back to passing a plain object.
- **Layer titles in `TRACKED_LAYER_TITLES` and `LEGEND[].toggleTitle` MUST match the WebMap layer titles exactly.** These are the raw REST service names like `"Carbon County Incident Evacuations"` and `"EventPolygon"`, not display-friendly names. If the WebMap is renamed, or if you "clean up" these constants, the layer toggles and click-to-popup silently stop working.
- **All feature-service field names are hardcoded** in `PopupContent`, `queryAllFeaturesForList`, and `queryAllInLayer`. If AGOL renames a field, the popup shows dashes and no error surfaces except `[CarbonAlert] query error` in DevTools. Grep for the layer's title to find its mapping block.
- **Styles live in one injected `<style id="ca-styles">` block** at the top of the widget, plus inline styles in JSX. No CSS files, no CSS modules. Media-query-like behavior is done via the `ca-mobile` class toggled by the ResizeObserver — search the injected CSS for `.ca-mobile` to see the mobile-only overrides.
- **Fonts load from Google Fonts at runtime** (Lora + Plus Jakarta Sans, via `@import` in the injected `<style>`). Requires internet access; falls back to system fonts if blocked. That's fine in most cases but worth knowing.

---

## Feature service URLs

All hosted on ArcGIS Online org `lo6DwqkHoBfbpsNX`:

- Evacuation Zones: `Carbon_County_Incidents-_Public/FeatureServer/1`
- Incident Points: `Carbon_County_Incidents-_Public/FeatureServer/0`
- Fire Perimeters: `NIFS_Feature_Schema_2026_(Public_View)/FeatureServer/10`
- Road Closures: `Road_Closures_View/FeatureServer/0`
- Shelter Locations: `Shelter_Locations/FeatureServer/0`

If a layer stops showing data, the most common cause is that the service is no longer published or is no longer publicly shared in AGOL. Check that first.

---

## Dependencies

- ArcGIS Experience Builder **Developer Edition 1.20**
- ArcGIS Maps SDK for JavaScript **5.0.10**
- React — loaded by EB; do not install separately
- Google Fonts CDN — Lora + Plus Jakarta Sans

---

## Local install and GitHub clone are the same folder

`C:\arcgis-experience-builder-1.20\` serves double duty: it is both the Experience Builder Developer Edition install directory AND the git clone of the `pb1268901/carbon-alert-incidentmap` GitHub repo. `.git/` lives at that root. So the build artifact and the pushable file are the same file — no copy step needed between "compile locally" and "commit to repo."

Typical dev flow after editing `widget.tsx`:

1. Build: `cd C:\arcgis-experience-builder-1.20\client && npm run build:prod`
   - This writes to `C:\arcgis-experience-builder-1.20\cdn\6\widgets\carbon-alert-combined\dist\runtime\widget.js` — a path already inside the git working tree.
2. Commit and push from the repo root:
   ```
   cd C:\arcgis-experience-builder-1.20
   git add cdn/6/widgets/carbon-alert-combined/dist/runtime/widget.js
   git commit -m "…"
   git push origin master:main
   ```
3. GitHub Pages redeploys automatically; hard-refresh the live site after 1–2 minutes.

Note that only the compiled `widget.js` is committed to the repo — the source `widget.tsx` is gitignored (or at least, has not historically been tracked). That's why the source got lost previously. Consider adding `client/your-extensions/widgets/carbon-alert-combined/src/**` to what git tracks so this can't happen again.

For small targeted changes, the GitHub README explicitly permits editing `widget.js` directly via GitHub's web editor. **Do not do that anymore if it can be avoided** — every direct edit re-creates the source-vs-compiled drift that led to needing this reconstruction in the first place. Prefer edit-source-then-rebuild-then-push.

---

## When starting a task in this folder

1. **For mobile work**, ask whether the goal is the widget code, the Hub embed configuration, or both. Almost always both.
2. **For any code change**, confirm whether the user wants a full rebuild + git push, or (for a truly small fix) the GitHub web-editor shortcut. Push back on the shortcut — see the note above about drift.
3. **Do not add a build/test framework, TypeScript config, or restructure the widget folder** without asking. EB is opinionated about widget folder layout and will silently fail to load widgets that deviate.
4. **Before making meaningful visual changes**, load the live site (https://pb1268901.github.io/carbon-alert-incidentmap/) or the Hub site to see current state.
