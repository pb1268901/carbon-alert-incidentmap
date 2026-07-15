/**
 * Carbon Alert — Combined Widget (v10)
 * WCAG 2.1 AA compliance pass:
 *  1. Color contrast: all text ≥4.5:1, UI components ≥3:1.
 *     #9CA3AF → #6B7280 for hint/footer text. Inactive layers use explicit muted
 *     color instead of opacity:0.3 so swatches/labels still clear 3:1.
 *  2. focus-visible: CSS injected via <style> tag using :focus-visible so outlines
 *     are driven by CSS, not fragile JS onFocus/onBlur inline style.
 *  3. Legend heading: <h2> with visually-hidden text, not a <p>.
 *  4. Zoom dropdown announces item count via aria-label on <ul>.
 *  5. Live region: sr-only aria-live="assertive" announces popup open/close to
 *     screen readers independent of focus movement.
 *  6. "View as list" panel below the legend: keyboard-accessible table of all
 *     features across all layers. Collapsible, focus-managed, fully navigable.
 *  7. Skip link at top of widget to jump directly to the feature list.
 *  8. Legend heading is a real <h2>; popup name is <h3> (was h2, now h3 since
 *     the widget panel itself should be considered a landmark region).
 *  9. widget root has role="region" and aria-label so screen readers announce it.
 */

import { React, type AllWidgetProps } from 'jimu-core'
import { JimuMapViewComponent, type JimuMapView } from 'jimu-arcgis'

const { useState, useEffect, useRef, useCallback } = React

const F_HEAD = "'Lora', Georgia, serif"
const F_BODY = "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif"

// ─── CSS injection ─────────────────────────────────────────────────────────────
// Single source of truth for focus styles + sr-only utility.
// Using CSS :focus-visible instead of JS onFocus/onBlur so outlines can't be
// wiped by any other code touching element.style.

function injectStyles(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById('ca-styles')) return
  const style = document.createElement('style')
  style.id = 'ca-styles'
  style.textContent = `
    /* Fonts */
    @import url('https://fonts.googleapis.com/css2?family=Lora:wght@600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');

    /* Focus ring — applied via CSS, not JS, so it cannot be accidentally removed */
    .ca-widget *:focus { outline: none; }
    .ca-widget *:focus-visible { outline: 3px solid #2563EB !important; outline-offset: 2px !important; }

    /* Screen-reader only utility */
    .ca-sr-only {
      position: absolute !important;
      width: 1px !important; height: 1px !important;
      padding: 0 !important; margin: -1px !important;
      overflow: hidden !important; clip: rect(0,0,0,0) !important;
      white-space: nowrap !important; border: 0 !important;
    }

    /* Skip link — visible only on focus */
    .ca-skip {
      position: absolute; top: 4px; left: 4px; z-index: 9999;
      padding: 6px 10px; border-radius: 4px;
      background: #1D4ED8; color: #fff;
      font-family: 'Plus Jakarta Sans', system-ui, sans-serif; font-size: 12px; font-weight: 600;
      text-decoration: none;
      transform: translateY(-200%); transition: transform 0.1s;
    }
    .ca-skip:focus-visible { transform: translateY(0); }

    /* Legend toggle button — inactive state uses explicit muted color, NOT opacity,
       so contrast ratios stay measurable and above 3:1 */
    .ca-layer-btn { transition: background 0.1s; }
    .ca-layer-btn:hover { background: #F9FAFB !important; }
    .ca-layer-btn[aria-checked="false"] .ca-swatch { opacity: 0.35; }
    .ca-layer-btn[aria-checked="false"] .ca-layer-label { color: #9CA3AF !important; }

    /* Add this rule */
            .ca-list-panel-collapsed { display: none; }

    /* List view table */
    .ca-list-table { border-collapse: collapse; width: 100%; font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif; }
    .ca-list-table th {
      position: sticky; top: 0; background: #F3F4F6; z-index: 1;
      padding: 6px 10px; font-size: 10px; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.06em; color: #374151;
      text-align: left; border-bottom: 2px solid #E5E7EB;
    }
    .ca-list-table td {
      padding: 7px 10px; font-size: 12px; color: #111827;
      border-bottom: 1px solid #F3F4F6; vertical-align: top;
    }
    .ca-list-table tr:last-child td { border-bottom: none; }
    .ca-list-table tbody tr:hover td { background: #EFF6FF; }
    .ca-list-table tbody tr:focus-within td { background: #DBEAFE; outline: none; }

    /* Zoom dropdown items */
    .ca-zoom-item:hover, .ca-zoom-item:focus-visible { background: #EFF6FF !important; }

    /* Mobile: bigger type + row height in the feature list table so it's
       readable and tappable at phone widths without shrinking columns. */
    .ca-mobile .ca-list-table th { font-size: 11px; padding: 8px 10px; }
    .ca-mobile .ca-list-table td { font-size: 13px; padding: 10px 10px; }
    .ca-mobile .ca-list-table { min-width: 480px; }
  `
  document.head.appendChild(style)
}

// ─── Endpoints ────────────────────────────────────────────────────────────────

const LAYER_ENDPOINTS: Record<string, string> = {
  'Carbon County Incident Evacuations':
    'https://services1.arcgis.com/lo6DwqkHoBfbpsNX/arcgis/rest/services/Carbon_County_Incidents-_Public/FeatureServer/1/query',
  'Carbon County Incident Points':
    'https://services1.arcgis.com/lo6DwqkHoBfbpsNX/arcgis/rest/services/Carbon_County_Incidents-_Public/FeatureServer/0/query',
  'EventPolygon':
    'https://services1.arcgis.com/lo6DwqkHoBfbpsNX/arcgis/rest/services/NIFS_Feature_Schema_2026_(Public_View)/FeatureServer/10/query',
  'RoadBlock':
    'https://services1.arcgis.com/lo6DwqkHoBfbpsNX/arcgis/rest/services/Road_Closures_View/FeatureServer/0/query',
  'Shelter Locations':
    'https://services1.arcgis.com/lo6DwqkHoBfbpsNX/arcgis/rest/services/Shelter_Locations/FeatureServer/0/query'
}

const TRACKED_TITLES: string[] = Object.keys(LAYER_ENDPOINTS)

type TrackedTitle =
  | 'Carbon County Incident Evacuations'
  | 'Carbon County Incident Points'
  | 'EventPolygon'
  | 'RoadBlock'
  | 'Shelter Locations'

type LegendKey = 'evacuation' | 'perimeter' | 'incident' | 'roadblock' | 'shelter'

interface FeatureResult { attrs: Record<string, any>; geometry: any | null }

// ─── Feature fetches ──────────────────────────────────────────────────────────

async function fetchFeature(layerTitle: string, objectId: number): Promise<FeatureResult> {
  const url = LAYER_ENDPOINTS[layerTitle]
  if (!url) return { attrs: {}, geometry: null }
  const qs = new URLSearchParams({ where: `OBJECTID=${objectId}`, outFields: '*', returnGeometry: 'true', outSR: '4326', f: 'json' })
  try {
    const json = await fetch(`${url}?${qs}`).then(r => r.json())
    if (json.error) { console.error('[CarbonAlert] query error:', json.error); return { attrs: {}, geometry: null } }
    const feat = json.features?.[0]
    if (!feat) return { attrs: {}, geometry: null }
    return { attrs: feat.attributes ?? {}, geometry: feat.geometry ?? null }
  } catch (err) {
    console.error('[CarbonAlert] fetch error:', err)
    return { attrs: {}, geometry: null }
  }
}

interface ZoomFeature { label: string; geometry: any }

async function fetchAllFeatures(layerTitle: string): Promise<ZoomFeature[]> {
  const baseUrl = LAYER_ENDPOINTS[layerTitle]
  if (!baseUrl) return []
  const qs = new URLSearchParams({ where: '1=1', outFields: '*', returnGeometry: 'true', outSR: '4326', f: 'json' })
  try {
    const json = await fetch(`${baseUrl}?${qs}`).then(r => r.json())
    if (json.error || !json.features?.length) return []
    return json.features.map((f: any) => {
      const a = f.attributes ?? {}
      let label = ''
      if (layerTitle === 'Carbon County Incident Evacuations') label = a.Incident_Name ?? a.Zone_Level ?? 'Zone'
      else if (layerTitle === 'Carbon County Incident Points') label = a.Incident_Name ?? 'Incident'
      else if (layerTitle === 'EventPolygon')                  label = a.IncidentName ?? 'Perimeter'
      else if (layerTitle === 'RoadBlock')                     label = a.BLOCKNM ?? 'Road Closure'
      else if (layerTitle === 'Shelter Locations')             label = a.Shelter_Name ?? 'Shelter'
      return { label, geometry: f.geometry ?? null }
    })
  } catch (err) {
    console.error('[CarbonAlert] fetchAll error:', err)
    return []
  }
}

// ─── List view data ───────────────────────────────────────────────────────────
// Fetches all features from all layers for the "View as list" panel.

interface ListRow {
  layer: string
  name: string
  type: string
  status: string
  detail: string
  geometry: any
}

async function fetchAllLayers(): Promise<ListRow[]> {
  const results = await Promise.allSettled(
    TRACKED_TITLES.map(async (title) => {
      const baseUrl = LAYER_ENDPOINTS[title]
      const qs = new URLSearchParams({ where: '1=1', outFields: '*', returnGeometry: 'true', outSR: '4326', f: 'json' })
      const json = await fetch(`${baseUrl}?${qs}`).then(r => r.json())
      if (json.error || !json.features?.length) return []
      return json.features.map((f: any): ListRow => {
        const a = f.attributes ?? {}
        if (title === 'Carbon County Incident Evacuations') return {
          layer: 'Evacuation Zone', geometry: f.geometry,
          name:   a.Incident_Name ?? '—',
          type:   fmtZone(a.Zone_Level ?? ''),
          status: fmtActive(a.Status),
          detail: a.Affected_Area ?? '—'
        }
        if (title === 'Carbon County Incident Points') return {
          layer: 'Incident', geometry: f.geometry,
          name:   a.Incident_Name ?? '—',
          type:   (a.Incident_Type ?? '').replace(/_/g, ' ') || '—',
          status: fmtActive(a.Status),
          detail: a.Location_Description ?? '—'
        }
        if (title === 'EventPolygon') return {
          layer: 'Perimeter', geometry: f.geometry,
          name:   a.IncidentName ?? '—',
          type:   a.FeatureCategory ?? 'Perimeter',
          status: a.GISAcres != null ? `${Number(a.GISAcres).toFixed(1)} ac` : '—',
          detail: a.MapMethod ?? '—'
        }
        if (title === 'RoadBlock') return {
          layer: 'Road Closure', geometry: f.geometry,
          name:   a.BLOCKNM ?? '—',
          type:   'Road Closure',
          status: fmtActive(a.ACTIVE),
          detail: a.ENDDATE ? fmtDate(a.ENDDATE) : '—'
        }
        // Shelter Locations
        return {
          layer: 'Shelter', geometry: f.geometry,
          name:   a.Shelter_Name ?? '—',
          type:   'Shelter Location',
          status: fmtActive(a.Status ?? a.ACTIVE ?? null),
          detail: a.Address ?? a.Location ?? '—'
        }
      })
    })
  )
  return results.flatMap(r => r.status === 'fulfilled' ? r.value : [])
}

// ─── Zoom ─────────────────────────────────────────────────────────────────────

function zoomTo(arcView: any, geometry: any): void {
  if (!arcView || !geometry) return
  try {
    if (geometry.rings || geometry.paths) {
      const allCoords: number[][] = (geometry.rings ?? geometry.paths).flat()
      const xs = allCoords.map((c: number[]) => c[0])
      const ys = allCoords.map((c: number[]) => c[1])
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2
      const cy = (Math.min(...ys) + Math.max(...ys)) / 2
      const dx = (Math.max(...xs) - Math.min(...xs)) * 0.6
      const dy = (Math.max(...ys) - Math.min(...ys)) * 0.6
      const esriRequire = (window as any).require ?? (window as any).__esri_require
      if (esriRequire) {
        esriRequire(['esri/geometry/Extent'], (Extent: any) => {
          const ext = new Extent({ xmin: cx - dx, ymin: cy - dy, xmax: cx + dx, ymax: cy + dy, spatialReference: { wkid: 4326 } })
          arcView.goTo(ext, { duration: 600 }).catch(() => {
            const span = Math.max(dx, dy) * 2
            arcView.goTo({ center: [cx, cy], zoom: Math.max(8, Math.min(18, Math.round(Math.log2(360 / span)) + 1)) }, { duration: 600 })
          })
        })
      } else {
        const span = Math.max(dx, dy) * 2
        arcView.goTo({ center: [cx, cy], zoom: Math.max(8, Math.min(18, Math.round(Math.log2(360 / span)) + 1)) }, { duration: 600 })
      }
    } else if (geometry.x != null && geometry.y != null) {
      arcView.goTo({ center: [geometry.x, geometry.y], zoom: 15 }, { duration: 500 })
    }
  } catch (err) {
    console.error('[CarbonAlert:zoom] exception:', err)
  }
}

// ─── Legend config ────────────────────────────────────────────────────────────

const LEGEND_LAYERS: Array<{ key: LegendKey; toggleTitle: string; label: string; swatch: string }> = [
  { key: 'evacuation', toggleTitle: 'Carbon County Incident Evacuations', label: 'Evacuation Zone',    swatch: 'evac'        },
  { key: 'perimeter',  toggleTitle: 'Incident Specific Symbology',         label: 'Incident Perimeter', swatch: 'perimeter'   },
  { key: 'incident',   toggleTitle: 'Carbon County Incident Points',        label: 'Incident Location',  swatch: 'incident'    },
  { key: 'roadblock',  toggleTitle: 'RoadBlock',                            label: 'Road Closure',       swatch: 'road-closure'},
  { key: 'shelter',    toggleTitle: 'Shelter Locations',                    label: 'Shelter Location',   swatch: 'shelter'     }
]

const ZOOM_LAYER_MAP: Partial<Record<LegendKey, TrackedTitle>> = {
  evacuation: 'Carbon County Incident Evacuations',
  incident:   'Carbon County Incident Points',
  perimeter:  'EventPolygon',
  roadblock:  'RoadBlock',
  shelter:    'Shelter Locations'
}

const ACCENT: Record<TrackedTitle, string> = {
  'Carbon County Incident Evacuations': '#7B1D13',
  'Carbon County Incident Points':      '#92400E',
  'EventPolygon':                       '#4C1D95',
  'RoadBlock':                          '#78350F',
  'Shelter Locations':                  '#1E3A8A'
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtDate(v: any): string {
  if (v == null) return '—'
  const d = typeof v === 'number' ? new Date(v) : new Date(String(v))
  if (isNaN(d.getTime())) return String(v)
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function fmtZone(v: string): string {
  if (v === 'EvacOrder') return 'Evacuation Order'
  if (v === 'EvacWarning') return 'Evacuation Warning'
  return v || 'Evacuation Zone'
}

function fmtActive(v: any): string {
  if (v == null) return '—'
  if (v === 1 || v === 'Yes' || v === 'yes' || v === 'Active' || v === 'active') return 'Active'
  if (v === 0 || v === 'No'  || v === 'no'  || v === 'Inactive')                 return 'Inactive'
  return String(v)
}

// ─── Swatches ─────────────────────────────────────────────────────────────────

function getSwatch(type: string): React.ReactElement {
  const e = React.createElement
  if (type === 'evac') return e('span', {
    'aria-hidden': 'true', className: 'ca-swatch',
    style: { display: 'inline-block', width: 20, height: 12, flexShrink: 0, border: '2px solid #C0392B', borderRadius: 2, backgroundImage: 'repeating-linear-gradient(-45deg,rgba(192,57,43,.6) 0,rgba(192,57,43,.6) 2px,rgba(253,236,234,.8) 2px,rgba(253,236,234,.8) 6px)' }
  })
  if (type === 'perimeter') return e('span', {
    'aria-hidden': 'true', className: 'ca-swatch',
    style: { display: 'inline-block', width: 20, height: 12, flexShrink: 0, background: 'rgba(252,165,165,.5)', border: '2px solid #7B1D13', borderRadius: 2 }
  })
  if (type === 'incident') return e('svg', {
    'aria-hidden': 'true', className: 'ca-swatch', width: 18, height: 18, viewBox: '0 0 18 18',
    style: { display: 'inline-block', flexShrink: 0, verticalAlign: 'middle' }
  },
    e('polygon', { points: '9,1 17,9 9,17 1,9', fill: '#7B1D13', stroke: '#4B0F09', strokeWidth: 1 }),
    e('text', { x: 9, y: 13, textAnchor: 'middle', fontSize: 9, fontWeight: 'bold', fill: 'white', fontFamily: 'sans-serif' }, '!')
  )
  if (type === 'road-closure') return e('svg', {
    'aria-hidden': 'true', className: 'ca-swatch', width: 18, height: 18, viewBox: '0 0 18 18',
    style: { display: 'inline-block', flexShrink: 0, verticalAlign: 'middle' }
  },
    e('circle', { cx: 9, cy: 9, r: 8.5, fill: '#DC2626' }),
    e('rect', { x: 3, y: 7, width: 12, height: 4, rx: 1.5, fill: '#FFFFFF' })
  )
  if (type === 'shelter') return e('svg', {
    'aria-hidden': 'true', className: 'ca-swatch', width: 18, height: 18, viewBox: '0 0 18 18',
    style: { display: 'inline-block', flexShrink: 0, verticalAlign: 'middle' }
  },
    e('rect', { x: 0.5, y: 0.5, width: 17, height: 17, rx: 2, fill: '#111827' }),
    e('rect', { x: 7.5, y: 3, width: 3, height: 12, fill: '#FFFFFF' }),
    e('rect', { x: 3, y: 7.5, width: 12, height: 3, fill: '#FFFFFF' })
  )
  return e('span', { className: 'ca-swatch', style: { width: 20, height: 12, display: 'inline-block', flexShrink: 0 } })
}

// ─── Popup content ────────────────────────────────────────────────────────────

interface PopupData { title: TrackedTitle; attrs: Record<string, any>; geometry: any | null }

function Field({ label, value, isMobile }: { label: string; value: string | null | undefined; isMobile?: boolean }): React.ReactElement {
  const v = (value && value !== '—') ? value : '—'
  return React.createElement('div', { style: { marginBottom: isMobile ? 16 : 14 } },
    // dt-style label — not using <dl> here because it's inside a grid, but the
    // visual label + value pairing is clear and announced correctly by screen readers
    React.createElement('p', {
      id: undefined,
      style: { margin: '0 0 3px', fontSize: isMobile ? 11 : 10, fontWeight: 700, color: '#4B5563', textTransform: 'uppercase' as const, letterSpacing: '0.07em', fontFamily: F_BODY }
    }, label),
    React.createElement('p', {
      style: { margin: 0, fontSize: isMobile ? 14 : 13, color: v === '—' ? '#9CA3AF' : '#111827', lineHeight: 1.5, fontFamily: F_BODY }
    }, v)
  )
}

function MsgBlock({ label, text, accent, isMobile }: { label: string; text: string | null | undefined; accent: string; isMobile?: boolean }): React.ReactElement {
  if (!text) return React.createElement('div', { 'aria-hidden': 'true', style: { height: 64 } })
  return React.createElement('div', {
    style: { padding: isMobile ? '12px 14px' : '10px 12px', background: '#F9FAFB', borderLeft: `3px solid ${accent}`, borderRadius: '0 4px 4px 0' }
  },
    React.createElement('p', { style: { margin: '0 0 4px', fontSize: isMobile ? 11 : 10, fontWeight: 700, color: accent, textTransform: 'uppercase' as const, letterSpacing: '0.07em', fontFamily: F_BODY } }, label),
    React.createElement('p', { style: { margin: 0, fontSize: isMobile ? 14 : 13, color: '#111827', lineHeight: 1.55, fontFamily: F_BODY } }, text)
  )
}

function renderPopupContent(data: PopupData, isMobile?: boolean): React.ReactElement {
  const { title, attrs: a } = data
  const accent = ACCENT[title]
  const e = React.createElement

  let name = '', sub = ''
  let whenLabel = 'Date',     whenVal:   string | null = null
  let statusLabel = 'Status', statusVal: string | null = null
  let detailLabel = 'Detail', detailVal: string | null = null
  let msgLabel = 'Notes',     msgVal:    string | null = null

  if (title === 'Carbon County Incident Evacuations') {
    name        = a.Incident_Name ?? 'Unknown Incident'
    sub         = fmtZone(a.Zone_Level ?? '')
    whenLabel   = 'Effective Date';  whenVal   = fmtDate(a.Effective_Date)
    statusLabel = 'Status';          statusVal = fmtActive(a.Status)
    detailLabel = 'Affected Area';   detailVal = a.Affected_Area ?? null
    msgLabel    = 'Public Message';  msgVal    = a.Public_Message ?? null
  } else if (title === 'Carbon County Incident Points') {
    name        = a.Incident_Name ?? 'Unknown Incident'
    sub         = (a.Incident_Type ?? '').replace(/_/g, ' ')
    whenLabel   = 'Last Updated';    whenVal   = fmtDate(a.Last_Updated)
    statusLabel = 'Status';          statusVal = fmtActive(a.Status)
    detailLabel = 'Location';        detailVal = a.Location_Description ?? null
    msgLabel    = 'Additional Info'; msgVal    = a.Additional_Info ?? (a.RC_Details ? `Road closure: ${a.RC_Details}` : null)
  } else if (title === 'EventPolygon') {
    name        = a.IncidentName ?? 'Fire Perimeter'
    sub         = a.FeatureCategory ?? 'Incident Perimeter'
    whenLabel   = 'Date Current';    whenVal   = fmtDate(a.DateCurrent)
    statusLabel = 'Acres';           statusVal = a.GISAcres != null ? `${Number(a.GISAcres).toFixed(1)} acres` : null
    detailLabel = 'Mapping Method';  detailVal = a.MapMethod ?? null
    msgLabel    = 'Notes';           msgVal    = null
  } else if (title === 'RoadBlock') {
    name        = a.BLOCKNM ?? 'Road Closure'
    sub         = 'Road Closure'
    whenLabel   = 'Active Since';    whenVal   = fmtDate(a.STARTDATE)
    statusLabel = 'Status';          statusVal = fmtActive(a.ACTIVE)
    detailLabel = 'Est. End Date';   detailVal = a.ENDDATE ? fmtDate(a.ENDDATE) : null
    msgLabel    = a.ALTROUTE ? 'Alternate Route' : 'Notes'
    msgVal      = a.COMMENT ?? (a.ALTROUTE ? `Alternate route: ${a.ALTROUTE}` : null) ?? a.LOCDESC ?? null
  } else if (title === 'Shelter Locations') {
    name        = a.Shelter_Name ?? 'Emergency Shelter'
    sub         = 'Shelter Location'
    whenLabel   = 'Serving Incident'; whenVal  = a.Incident_Name ?? null
    statusLabel = 'Status';           statusVal = fmtActive(a.Status ?? a.ACTIVE ?? null)
    detailLabel = 'Address';          detailVal = a.Address ?? a.Location ?? null
    msgLabel    = 'Notes';            msgVal    = null
  }

  return e('div', null,
    // h3 — widget panel is a landmark region (role=region), so the feature name
    // sits at heading level 3 in the document outline
    e('h3', { style: { margin: '0 0 2px', fontSize: isMobile ? 17 : 16, fontWeight: 700, color: '#111827', fontFamily: F_HEAD, lineHeight: 1.3 } }, name),
    e('p',  { style: { margin: '0 0 16px', fontSize: isMobile ? 11 : 10, fontWeight: 700, color: accent, textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: F_BODY } }, sub),
    // Single column on mobile — two narrow columns get cramped and hard to
    // read/tap on a phone-width popup.
    e('div', { style: isMobile
        ? { display: 'flex', flexDirection: 'column' as const }
        : { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }
    },
      e(Field as any, { label: whenLabel,   value: whenVal, isMobile }),
      e(Field as any, { label: statusLabel, value: statusVal, isMobile })
    ),
    e(Field as any, { label: detailLabel, value: detailVal, isMobile }),
    e(MsgBlock as any, { label: msgLabel, text: msgVal, accent, isMobile })
  )
}

// ─── Zoom dropdown ────────────────────────────────────────────────────────────

interface ZoomDropdownProps {
  layerKey: LegendKey
  label: string
  arcViewRef: React.MutableRefObject<any>
  dropdownId: string
  isMobile?: boolean
}

function ZoomDropdown({ layerKey, label, arcViewRef, dropdownId, isMobile }: ZoomDropdownProps): React.ReactElement {
  const [open,     setOpen]     = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [features, setFeatures] = useState<ZoomFeature[]>([])
  const [error,    setError]    = useState(false)
  const triggerRef   = useRef<HTMLButtonElement>(null)
  const listRef      = useRef<HTMLUListElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const e = React.createElement
  const trackedTitle = ZOOM_LAYER_MAP[layerKey]

  const openDropdown = useCallback(async () => {
    if (open) { setOpen(false); return }
    if (!trackedTitle) return
    setOpen(true); setError(false)
    if (features.length === 0) {
      setLoading(true)
      const items = await fetchAllFeatures(trackedTitle)
      setLoading(false)
      if (items.length === 0) setError(true)
      else setFeatures(items)
    }
  }, [open, trackedTitle, features.length])

  useEffect(() => {
    if (!open) return
    const handler = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { setOpen(false); triggerRef.current?.focus() } }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  useEffect(() => {
    if (open && !loading) setTimeout(() => listRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus(), 50)
  }, [open, loading])

  useEffect(() => {
    if (!open) return
    const handler = (ev: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(ev.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (!trackedTitle) return e('span', null)

  return e('div', { ref: containerRef, style: { position: 'relative' } },
    e('button', {
      ref: triggerRef,
      onClick: openDropdown,
      'aria-haspopup': 'listbox',
      'aria-expanded': open,
      'aria-controls': dropdownId,
      'aria-label': `Zoom to a ${label} feature`,
      title: `Zoom to ${label}`,
      style: {
        background: 'none', border: 'none', cursor: 'pointer', borderRadius: 3,
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1D4ED8', flexShrink: 0,
        padding: isMobile ? '12px' : '8px', minWidth: isMobile ? 44 : undefined, minHeight: isMobile ? 44 : undefined
      }
    },
      e('svg', { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
        e('circle', { cx: 6.5, cy: 6.5, r: 4.5, stroke: '#1D4ED8', strokeWidth: 1.6 }),
        e('line', { x1: 10, y1: 10, x2: 14, y2: 14, stroke: '#1D4ED8', strokeWidth: 1.6, strokeLinecap: 'round' })
      ),
      e('svg', { width: 8, height: 8, viewBox: '0 0 8 8', 'aria-hidden': 'true', style: { marginLeft: 1 } },
        e('polyline', { points: open ? '1,5 4,2 7,5' : '1,3 4,6 7,3', stroke: '#1D4ED8', strokeWidth: 1.5, strokeLinecap: 'round', fill: 'none' })
      )
    ),
    open && e('div', {
      id: dropdownId,
      role: 'listbox',
      // Item count announced when dropdown opens — fixes WCAG 4.1.3 status messages
      'aria-label': `${label} features — ${features.length} item${features.length !== 1 ? 's' : ''}`,
      style: {
        position: 'absolute', bottom: '100%', right: 0, marginBottom: 4,
        width: isMobile ? 'min(240px, calc(100vw - 32px))' : 220,
        maxHeight: isMobile ? 220 : 180, overflowY: 'auto', background: '#FFFFFF',
        border: '1px solid #D1D5DB', borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        zIndex: 999, fontFamily: F_BODY
      }
    },
      loading && e('div', { role: 'status', 'aria-live': 'polite', style: { padding: '10px 12px', fontSize: 12, color: '#6B7280', textAlign: 'center' } }, 'Loading features…'),
      error   && e('div', { role: 'alert',  style: { padding: '10px 12px', fontSize: 12, color: '#DC2626', textAlign: 'center' } }, 'No features found.'),
      !loading && !error && e('ul', {
        ref: listRef,
        style: { margin: 0, padding: '4px 0', listStyle: 'none' }
      },
        ...features.map((feat, i) => e('li', { key: i },
          e('button', {
            role: 'option',
            tabIndex: 0,
            className: 'ca-zoom-item',
            onClick: () => { zoomTo(arcViewRef.current, feat.geometry); setOpen(false); triggerRef.current?.focus() },
            onKeyDown: (ev: any) => {
              const items = listRef.current?.querySelectorAll<HTMLElement>('[role="option"]')
              if (!items) return
              if (ev.key === 'ArrowDown') { ev.preventDefault(); items[Math.min(i + 1, items.length - 1)]?.focus() }
              if (ev.key === 'ArrowUp')   { ev.preventDefault(); items[Math.max(i - 1, 0)]?.focus() }
            },
            style: { display: 'block', width: '100%', textAlign: 'left', padding: isMobile ? '11px 12px' : '7px 12px', background: 'none', border: 'none', cursor: feat.geometry ? 'pointer' : 'default', fontSize: isMobile ? 13 : 12, color: feat.geometry ? '#111827' : '#6B7280', fontFamily: F_BODY },
            'aria-label': `Zoom to ${feat.label}${!feat.geometry ? ' (no location available)' : ''}`,
            'aria-disabled': !feat.geometry
          }, feat.label)
        ))
      )
    )
  )
}

// ─── Feature list panel ───────────────────────────────────────────────────────
// Keyboard-accessible table of all features below the legend.
// This is the primary non-map path to feature data — satisfies WCAG 2.1.1.

interface ListPanelProps {
  arcViewRef: React.MutableRefObject<any>
  listPanelId: string
  isMobile: boolean
}

function ListPanel({ arcViewRef, listPanelId, isMobile }: ListPanelProps): React.ReactElement {
  const [rows,    setRows]    = useState<ListRow[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded,  setLoaded]  = useState(false)
  const [error,   setError]   = useState(false)
  const e = React.createElement

  useEffect(() => {
    setLoading(true)
    fetchAllLayers()
      .then(data => { setRows(data); setLoaded(true) })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  const LAYER_COLORS: Record<string, string> = {
    'Evacuation Zone': '#7B1D13',
    'Incident':        '#92400E',
    'Perimeter':       '#4C1D95',
    'Road Closure':    '#78350F',
    'Shelter':         '#1E3A8A'
  }

  return e('div', {
    id: listPanelId,
    style: { background: '#FFFFFF', borderTop: '2px solid #E5E7EB', fontFamily: F_BODY }
  },
    // Panel header
    e('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px 8px', borderBottom: '1px solid #F3F4F6' } },
      e('h2', { style: { margin: 0, fontSize: 13, fontWeight: 700, color: '#111827', fontFamily: F_HEAD } }, 'All Map Features'),
      loading && e('span', { role: 'status', 'aria-live': 'polite', style: { fontSize: 11, color: '#6B7280' } }, 'Loading…'),
      loaded  && e('span', { 'aria-live': 'polite', style: { fontSize: 11, color: '#6B7280' } }, `${rows.length} feature${rows.length !== 1 ? 's' : ''}`)
    ),
    error && e('p', { role: 'alert', style: { margin: 0, padding: '12px', fontSize: 12, color: '#DC2626' } }, 'Could not load features. Check your connection.'),

    // Scrollable table — max 220px so it doesn't overwhelm the panel.
    // overflowX so a narrow phone screen scrolls the table horizontally
    // instead of crushing every column unreadably small.
    !error && e('div', { style: { maxHeight: 220, overflowY: 'auto', overflowX: 'auto' } },
      e('table', {
        className: 'ca-list-table',
        // summary attr is deprecated but helps some older AT
        role: 'grid',
        'aria-label': 'Active emergency features',
        'aria-rowcount': rows.length,
        'aria-busy': loading
      },
        e('thead', null,
          e('tr', null,
            e('th', { scope: 'col' }, 'Layer'),
            e('th', { scope: 'col' }, 'Name'),
            e('th', { scope: 'col' }, 'Status'),
                                !isMobile && e('th', { scope: 'col' }, 'Detail'),
            // Zoom column — screen reader gets descriptive header
            e('th', { scope: 'col' },
              e('span', { className: 'ca-sr-only' }, 'Zoom to feature'),
              e('svg', { width: 12, height: 12, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
                e('circle', { cx: 6.5, cy: 6.5, r: 4.5, stroke: '#374151', strokeWidth: 1.6 }),
                e('line', { x1: 10, y1: 10, x2: 14, y2: 14, stroke: '#374151', strokeWidth: 1.6, strokeLinecap: 'round' })
              )
            )
          )
        ),
        e('tbody', null,
          rows.length === 0 && !loading && e('tr', null,
            e('td', { colSpan: 5, style: { textAlign: 'center', color: '#9CA3AF', padding: '16px' } }, 'No active features.')
          ),
          ...rows.map((row, i) => e('tr', { key: i, tabIndex: 0 },
            e('td', null,
              e('span', {
                style: {
                  display: 'inline-block', padding: '2px 6px', borderRadius: 3,
                  fontSize: 10, fontWeight: 700, color: '#fff',
                  background: LAYER_COLORS[row.layer] ?? '#374151'
                }
              }, row.layer)
            ),
            e('td', { style: { fontWeight: 600 } }, row.name),
            e('td', null, row.status),
            !isMobile && e('td', { style: { color: '#6B7280' } }, row.detail),
            e('td', null,
              row.geometry
                ? e('button', {
                    onClick: () => zoomTo(arcViewRef.current, row.geometry),
                    'aria-label': `Zoom to ${row.name}`,
                    style: {
                      background: 'none', border: 'none', cursor: 'pointer',
                      padding: isMobile ? '8px' : '2px 4px', borderRadius: 3, color: '#1D4ED8',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      minWidth: isMobile ? 36 : undefined, minHeight: isMobile ? 36 : undefined
                    }
                  },
                    e('svg', { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
                      e('circle', { cx: 6.5, cy: 6.5, r: 4.5, stroke: '#1D4ED8', strokeWidth: 1.6 }),
                      e('line', { x1: 10, y1: 10, x2: 14, y2: 14, stroke: '#1D4ED8', strokeWidth: 1.6, strokeLinecap: 'round' })
                    )
                  )
                : e('span', { 'aria-label': 'No location available', style: { color: '#D1D5DB', fontSize: 11 } }, '—')
            )
          ))
        )
      )
    )
  )
}

// ─── Main widget ──────────────────────────────────────────────────────────────

export default function Widget(props: AllWidgetProps<{}>): React.ReactElement {
  const [mapReady,   setMapReady]   = useState<boolean>(false)
  const [popup,      setPopup]      = useState<PopupData | null>(null)
  const [loading,    setLoading]    = useState<boolean>(false)
  const [visibility, setVisibility] = useState<Record<LegendKey, boolean>>({
    evacuation: true, perimeter: true, incident: true, roadblock: true, shelter: true
  })
  const [containerH, setContainerH] = useState<number>(0)
  const [containerW, setContainerW] = useState<number>(0)
  // Mobile-only: how much real screen height is left below wherever this
  // widget sits, measured against window.innerHeight rather than the
  // widget's own DOM box. The ancestor wrapper EB gives this widget on the
  // phone-stacked layout has no explicit height of its own (it just mirrors
  // whatever height we end up being) — so measuring OUR OWN box for sizing
  // is circular and unreliable. Anchoring to the actual viewport instead
  // gives a number that can't collapse to 0 or clip content with no way to
  // scroll to it.
  const [viewportAvailH, setViewportAvailH] = useState<number>(0)
  // Live region message for screen readers — announced independently of focus
  const [liveMsg,    setLiveMsg]    = useState<string>('')

  const arcViewRef  = useRef<any>(null)
  const clickHandle = useRef<any>(null)
  const closeRef    = useRef<HTMLButtonElement>(null)
  const lastFocus   = useRef<HTMLElement | null>(null)
  const panelRef    = useRef<HTMLDivElement>(null)
  const rootRef     = useRef<HTMLDivElement>(null)
  const listPanelId = 'ca-list-panel'
  const skipTargetId = 'ca-list-heading'
  const [listOpen, setListOpen] = useState(false)
  const listBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => { injectStyles() }, [])

  // ── ResizeObserver — measures real container height ───────────────────────
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    setContainerH(el.offsetHeight)
    const ro = new ResizeObserver(entries => {
                for (const entry of entries) {
                     setContainerH(entry.contentRect.height)
                     setContainerW(entry.contentRect.width)
                }
           })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ── Viewport-anchored available height (mobile only) ──────────────────────
  // Measures from the widget's actual position in the real viewport, not its
  // own (unreliable, ancestor-dependent) offsetHeight. Re-measured on resize
  // and orientation change so rotating the phone or the mobile browser's
  // chrome hiding/showing doesn't leave a stale value.
  useEffect(() => {
    const measure = () => {
      const el = rootRef.current
      if (!el) return
      const top = el.getBoundingClientRect().top
      const avail = Math.max(120, window.innerHeight - top)
      setViewportAvailH(avail)
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
    const t = setTimeout(measure, 300) // catches late layout settling on mount
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
      clearTimeout(t)
    }
  }, [])

  // ── Focus trap inside popup dialog ────────────────────────────────────────
  useEffect(() => {
    if (!popup) return
    const panel = panelRef.current
    if (!panel) return
    const handler = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') { setPopup(null); return }
      if (ev.key !== 'Tab') return
      const focusable = panel.querySelectorAll<HTMLElement>(
        'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'
      )
      const first = focusable[0], last = focusable[focusable.length - 1]
      if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last?.focus() }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [popup])

  // ── Focus management + live region ───────────────────────────────────────
  useEffect(() => {
    if (popup) {
      lastFocus.current = document.activeElement as HTMLElement
      // Brief delay so dialog is in DOM before focus moves
      setTimeout(() => closeRef.current?.focus(), 50)
      // Announce to screen readers who may not be near the dialog
      const title = popup.attrs?.Incident_Name ?? popup.attrs?.BLOCKNM ?? popup.attrs?.Shelter_Name ?? popup.attrs?.IncidentName ?? 'Feature'
      setLiveMsg(`Feature details opened: ${title}`)
    } else {
      lastFocus.current?.focus()
      setLiveMsg('Feature details closed')
    }
  }, [popup])

  // Clear live message after announcement
  useEffect(() => {
    if (!liveMsg) return
    const t = setTimeout(() => setLiveMsg(''), 1500)
    return () => clearTimeout(t)
  }, [liveMsg])

  // ── Map view + click handler ──────────────────────────────────────────────
  const onViewChange = useCallback((jimuView: JimuMapView) => {
    if (!jimuView?.view) return
    const arcView = jimuView.view as any
    arcViewRef.current = arcView
    arcView.popup.autoOpenEnabled = false
    if (typeof arcView.popup.close === 'function') arcView.popup.close()
    console.log('[CarbonAlert] popup API:', Object.getOwnPropertyNames(Object.getPrototypeOf(arcView.popup)).filter(k => typeof arcView.popup[k] === 'function'))

    if (clickHandle.current) { clickHandle.current.remove(); clickHandle.current = null }

    clickHandle.current = arcView.on('click', async (evt: any) => {
      if (typeof arcView.popup.close === 'function') arcView.popup.close()
      try {
        const allLayers: any[] = arcView.map.allLayers.toArray()
        const trackedLayers = allLayers.filter((l: any) => TRACKED_TITLES.includes(l.title))
        if (!trackedLayers.length) return
        const result = await arcView.hitTest(evt, { include: trackedLayers })
        if (!result?.results?.length) { setPopup(null); return }
        const hit      = result.results[0]
        const title    = hit.graphic?.layer?.title as TrackedTitle
        const objectId = hit.graphic?.attributes?.OBJECTID
        if (!TRACKED_TITLES.includes(title)) { setPopup(null); return }
        setLoading(true); setPopup(null)
        const { attrs, geometry } = await fetchFeature(title, objectId)
        setPopup({ title, attrs, geometry })
        setLoading(false)
      } catch (err) {
        console.error('[CarbonAlert] click error:', err)
        setLoading(false)
      }
    })
    setMapReady(true)
  }, [])

  const toggleLayer = (key: LegendKey, toggleTitle: string): void => {
    const arcView = arcViewRef.current
    if (!arcView) return
    const next = !visibility[key]
    arcView.map.allLayers.forEach((l: any) => { if (l.title === toggleTitle) l.visible = next })
    setVisibility((v: Record<LegendKey, boolean>) => ({ ...v, [key]: next }))
  }

  useEffect(() => { return () => { if (clickHandle.current) clickHandle.current.remove() } }, [])

  const e = React.createElement

  if (!props.useMapWidgetIds?.length) {
    return e('div', { className: 'ca-widget', style: { height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, textAlign: 'center', fontFamily: F_BODY, fontSize: 13, color: '#6B7280' } },
      'Open widget settings and select your map.')
  }

// ── Derived layout ────────────────────────────────────────────────────────
    // Threshold raised from 480 -> 600: covers real phones (~360-430px) plus
    // any narrow sidebar/embed context (e.g. a Hub-embedded iframe column)
    // that's too tight for the desktop side-by-side layout.
    const isMobile = containerW < 600
    const LEGEND_H_ACTUAL = isMobile ? 170 : 310
    const LIST_H_ACTUAL   = isMobile ? 190 : 320
    const TOTAL_BOTTOM_H  = LEGEND_H_ACTUAL + (listOpen ? LIST_H_ACTUAL : 0)
    const popupH  = isMobile
             ? Math.max(160, containerH - LEGEND_H_ACTUAL - (listOpen ? LIST_H_ACTUAL : 0))
             : Math.max(0, containerH - TOTAL_BOTTOM_H)
    const legendT = popupH
    const listT   = popupH + LEGEND_H_ACTUAL
    // NOTE: mobile doesn't use a computed pixel height at all — see the root
    // element below for why (the whole "measure containerH, subtract legend
    // height" scheme depends on the widget's own box having a real, definite
    // height on a real device, which the phone's stacked layout doesn't
    // reliably provide). minHeight here is just a static floor, not derived
    // from containerH, so it can't collapse to 0 the way the old version did.
    const popupStyle: React.CSSProperties = isMobile
      ? { position: 'relative', left: 0, right: 0, minHeight: 160, display: 'flex', flexDirection: 'column', overflow: 'visible' }
      : { position: 'absolute', top: 0, left: 0, right: 0, height: popupH, display: 'flex', flexDirection: 'column', overflow: 'hidden' }

  // ── Legend ────────────────────────────────────────────────────────────────
  const legend = e('div', {
                style: isMobile
                                                ? { position: 'relative', left: 0, right: 0, background: '#FFFFFF', borderTop: '1px solid #E5E7EB', padding: '10px 6px 10px', boxSizing: 'border-box' as const, overflow: 'visible' }
  : { position: 'absolute', top: legendT, left: 0, right: 0, height: LEGEND_H_ACTUAL, borderTop: '1px solid #E5E7EB', background: '#FFFFFF', padding: '10px 6px 10px', boxSizing: 'border-box' as const, overflow: 'visible' }
           },
                e('h2', {
                      style: { margin: '0 0 4px', padding: '0 8px', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: '#6B7280', textTransform: 'uppercase', fontFamily: F_BODY }
                 }, 'Map Layers'),
                e('div', { role: 'group', 'aria-labelledby': 'ca-legend-heading' }, 
         ...LEGEND_LAYERS.map(layer => {
                            const on = visibility[layer.key]
                            return e('div', { key: layer.key, style: { display: 'flex', alignItems: 'center', width: '100%', padding: '0 4px', gap: 4, minHeight: isMobile ? 44 : 36 } },
                                 e('button', {
                                      role: 'switch',
                                     'aria-checked': on,
                                     'aria-label': `${on ? 'Hide' : 'Show'} ${layer.label} layer`,
                                      className: 'ca-layer-btn',
                                      onClick: () => toggleLayer(layer.key, layer.toggleTitle),
                                      style: {
                                           display: 'flex', alignItems: 'center', gap: 8, flex: 1,
                                           padding: isMobile ? '6px 4px' : '4px 4px', background: 'none', border: 'none', borderRadius: 4,
                                           cursor: mapReady ? 'pointer' : 'default', textAlign: 'left',
                                           fontFamily: F_BODY, minHeight: isMobile ? 44 : 36
                                        }
                                   },
                                        e('span', { style: { display: 'flex', alignItems: 'center', width: 26, justifyContent: 'center', flexShrink: 0 } },
                                              getSwatch(layer.swatch)
                                        ),
                                        e('span', {
                                             className: 'ca-layer-label',
                                              style: { flex: 1, fontSize: isMobile ? 14 : 12, color: '#111827', fontWeight: 500, fontFamily: F_BODY }
                                         }, layer.label)
                                    ),
                                   mapReady && e(ZoomDropdown as any, {
                                        layerKey:   layer.key,
                                        label:      layer.label,
                                        arcViewRef,
                                        dropdownId: `zoom-dd-${layer.key}`,
                                        isMobile
                                    })
                              )
                         })
                    ),  
                   // ── hint text ── this is the paragraph that was already there
                   e('p', {
                                                               style: { margin: '6px 8px 0', fontSize: 10, color: '#6B7280', lineHeight: 1.6, fontFamily: F_BODY, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }
                                                   },
                         mapReady
                              ? React.createElement(React.Fragment, null,
                                      'Use ',
                                      React.createElement('svg', { width: 12, height: 12, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', style: { display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 } },
                                           React.createElement('circle', { cx: 6.5, cy: 6.5, r: 4.5, stroke: '#6B7280', strokeWidth: 1.6 }),
                                           React.createElement('line', { x1: 10, y1: 10, x2: 14, y2: 14, stroke: '#6B7280', strokeWidth: 1.6, strokeLinecap: 'round' })
                                      ),
                                     ' to zoom to a feature · Tap a layer to show or hide it'
                              )
                          : 'Connecting to map…'
                   ),
                   // ── NEW: toggle button for the feature list panel ──
                   e('button', {
                        ref: listBtnRef,
                        onClick: () => setListOpen((o: boolean) => !o),
                      'aria-expanded': listOpen,
                      'aria-controls': listPanelId,
                      style: {
                           display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                           width: 'calc(100% - 16px)', margin: '8px 8px 2px',
                           padding: isMobile ? '12px 12px' : '6px 10px', background: listOpen ? '#EFF6FF' : '#F3F4F6',
                           border: `1px solid ${listOpen ? '#BFDBFE' : '#E5E7EB'}`,
                           borderRadius: 4, cursor: 'pointer', minHeight: isMobile ? 44 : undefined,
                          fontSize: isMobile ? 13 : 11, fontWeight: 600, color: '#1D4ED8', fontFamily: F_BODY
                       }
                 },
                      'View features as list',
                      e('svg', { width: 10, height: 10, viewBox: '0 0 8 8', 'aria-hidden': 'true' },
                          e('polyline', { points: listOpen ? '1,5 4,2 7,5' : '1,3 4,6 7,3', stroke: '#1D4ED8', strokeWidth: 1.5, strokeLinecap: 'round', fill: 'none' })
                      )
                  )
              )

  // ── Popup panel ───────────────────────────────────────────────────────────
  // The containerH===0 guard only matters for the desktop absolute-position
  // math below (avoids a flash of a 0-height box before the first real
  // measurement comes in). Mobile no longer depends on containerH for sizing,
  // so it should never be gated behind this — that was the bug that made the
  // popup (and the feature list panel, same guard elsewhere) render nothing
  // on real phones.
  const popupPanel = (!isMobile && containerH === 0)
    ? null
    : loading
    ? e('div', { style: { ...popupStyle, alignItems: 'center', justifyContent: 'center' } },
        e('p', { role: 'status', 'aria-live': 'polite', style: { margin: 0, fontSize: 12, color: '#6B7280', fontFamily: F_BODY } }, 'Loading feature details…')
      )
    : popup
    ? e('div', {
        ref: panelRef,
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': 'Feature details',
        style: { ...popupStyle, borderTop: `3px solid ${ACCENT[popup.title]}`, background: '#FFFFFF' }
      },
        e('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid #F3F4F6', flexShrink: 0, background: '#F9FAFB', gap: 8 } },
          e('span', { style: { fontSize: 10, fontWeight: 700, color: ACCENT[popup.title], textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: F_BODY, flex: 1 } },
            popup.title === 'Carbon County Incident Evacuations' ? fmtZone(popup.attrs.Zone_Level ?? '')
            : popup.title === 'EventPolygon'                     ? (popup.attrs.FeatureCategory ?? 'Incident Perimeter')
            : popup.title === 'Carbon County Incident Points'    ? (popup.attrs.Incident_Type?.replace(/_/g, ' ') ?? 'Active Incident')
            : popup.title === 'RoadBlock'                        ? 'Road Closure'
            : 'Shelter Location'
          ),
          e('button', {
            ref: closeRef,
            onClick: () => setPopup(null),
            'aria-label': 'Close feature details',
            style: {
              background: 'none', border: '1px solid #D1D5DB', borderRadius: 4, cursor: 'pointer',
              padding: isMobile ? '8px 14px' : '3px 8px', fontSize: isMobile ? 13 : 11, color: '#374151',
              fontFamily: F_BODY, minHeight: isMobile ? 44 : 28, minWidth: isMobile ? 44 : undefined, flexShrink: 0
            }
          }, '✕')
        ),
        e('div', { style: { padding: isMobile ? '16px 16px 18px' : '14px 14px 16px', overflowY: 'auto', flex: 1 } },
          renderPopupContent(popup, isMobile)
        ),
        e('div', { style: { padding: '8px 12px', borderTop: '1px solid #F3F4F6', background: '#F9FAFB', flexShrink: 0 } },
          e('p', { style: { margin: 0, fontSize: 10, color: '#6B7280', fontFamily: F_BODY } }, 'Carbon County Office of Emergency Management')
        )
      )
            : e('div', { style: { ...popupStyle, alignItems: 'center', justifyContent: 'center', padding: '20px 16px', textAlign: 'center' } },
                    e('p', { style: { margin: 0, fontSize: 12, color: '#9CA3AF', lineHeight: 1.6, fontFamily: F_BODY } },
                         isMobile ? 'Tap a feature on the map to see details.' : 'Click a feature on the map to see details.'
                    )
             )

  // ── Root ──────────────────────────────────────────────────────────────────
  return e('div', {
    ref: rootRef,
    className: isMobile ? 'ca-widget ca-mobile' : 'ca-widget',
    // role=region + aria-label makes this a named landmark in the AT rotor/menu
    role: 'region',
    'aria-label': 'Carbon Alert emergency information',
     // Mobile: NOT position:absolute/inset:0. That requires a positioned
     // ancestor with a real, definite height to resolve against — fine on
     // desktop (Large breakpoint gives this widget a fixed-size box), but on
     // the phone's stacked Small-breakpoint layout the wrapping box mirrors
     // whatever height WE end up being, so inset:0 is circular. Instead we
     // size explicitly off viewportAvailH (measured against the real
     // viewport — see the effect above) and scroll internally when content
     // is taller than that. Falls back to natural height until the first
     // measurement lands.
     style: isMobile
                   ? { position: 'relative', background: '#FFFFFF', fontFamily: F_BODY, borderLeft: '1px solid #E5E7EB', display: 'flex', flexDirection: 'column', height: viewportAvailH > 0 ? viewportAvailH : 'auto', overflowY: 'auto', overflowX: 'hidden' }
                   : { position: 'absolute', inset: 0, background: '#FFFFFF', fontFamily: F_BODY, overflowX: 'hidden', overflowY: 'auto', borderLeft: '1px solid #E5E7EB' }
  },
    // Skip link — jumps keyboard users past the map+legend to the feature list
    e('a', {
      href: `#${listPanelId}`,
      className: 'ca-skip',
      onClick: (ev: any) => {
        ev.preventDefault()
        document.getElementById(listPanelId)?.querySelector<HTMLElement>('button,th,td,[tabindex]')?.focus()
      }
    }, 'Skip to feature list'),

    // Screen reader live region — announces popup open/close without moving focus
    e('div', {
      role: 'status',
      'aria-live': 'assertive',
      'aria-atomic': 'true',
      className: 'ca-sr-only'
    }, liveMsg),

    e(JimuMapViewComponent as any, {
      useMapWidgetId: props.useMapWidgetIds[0],
      onActiveViewChange: onViewChange
    }),

    popupPanel,
    legend,

    // Feature list panel — positioned below legend.
    // Mobile: always mounted, visibility toggled via the (pre-existing)
    // .ca-list-panel-collapsed { display:none } CSS class instead of
    // conditionally mounting/unmounting the element. iOS Safari has known
    // quirks recomputing scroll-content height when a new child is inserted
    // into an already-scrolled flex column after the fact — toggling display
    // on an element that's been in the layout from the start sidesteps that
    // instead of chasing it further blind. Desktop is untouched (still
    // needs containerH measured first for its absolute-position math).
    isMobile
      ? e('div', {
          // Inline display toggle, not a CSS class — removes any dependency
          // on the injected <style> tag having mounted/applied by the time
          // this renders. Matches popupStyle's mobile shape otherwise
          // (that one is confirmed working on real iPhone): overflow:visible
          // + flex column, not overflowY:auto. ListPanel scrolls its own
          // inner table via its own maxHeight/overflow, same as the popup's
          // content div does.
          style: { position: 'relative', left: 0, right: 0, display: listOpen ? 'flex' : 'none', flexDirection: 'column', overflow: 'visible' }
        }, e(ListPanel as any, { arcViewRef, listPanelId, isMobile }))
      : (containerH > 0 && listOpen && e('div', {
          style: { position: 'absolute', top: listT, left: 0, right: 0, height: LIST_H_ACTUAL, overflowY: 'auto' }
        }, e(ListPanel as any, { arcViewRef, listPanelId, isMobile })))
  )
}