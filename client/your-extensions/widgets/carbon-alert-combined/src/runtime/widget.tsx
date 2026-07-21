/**
 * Carbon Alert — Combined Widget
 * ArcGIS Experience Builder Developer Edition 1.20
 *
 * Reconstructed source for the deployed carbon-alert-combined widget.
 * Mirrors the behavior of the compiled widget.js as of the 2026-07-15
 * "Mobile-friendly fixes" commit on the pb1268901/carbon-alert-incidentmap
 * GitHub repo.
 *
 * Key behaviors:
 *  - Legend with layer toggles + per-layer zoom dropdown
 *  - Sidebar popup on map feature click (native ArcGIS popup suppressed)
 *  - Full feature-list table as a non-map path for keyboard/SR users
 *  - Responsive layout: single breakpoint at 600px widget width using
 *    a ResizeObserver, ca-mobile class enables larger fonts + 44px
 *    tap targets and hides the Detail column
 *  - Focus trap in popup, Escape to close, skip link, aria-live region
 *  - Zoom uses esri/geometry/Extent via AMD require when available,
 *    falls back to center+zoom (autocasting extent objects passed to
 *    view.goTo is unreliable across EB configs)
 *
 * Layer titles here MUST match the actual layer titles in the AGOL
 * WebMap. These are the raw REST service names, not display names —
 * do not "clean them up" without also updating the WebMap.
 */

import { React, type AllWidgetProps } from 'jimu-core'
import { JimuMapViewComponent, type JimuMapView } from 'jimu-arcgis'

const { useState, useEffect, useRef, useCallback } = React

// ─────────────────────────────────────────────────────────────────────────────
// Fonts (loaded via <style> injection, see injectStyles below)
// ─────────────────────────────────────────────────────────────────────────────

const F_HEAD = "'Lora', Georgia, serif"
const F_BODY = "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif"

// ─────────────────────────────────────────────────────────────────────────────
// Feature Service query endpoints, keyed by AGOL layer title
// ─────────────────────────────────────────────────────────────────────────────

const SERVICE_URL: Record<string, string> = {
  'Carbon County Incident Evacuations':
    'https://services1.arcgis.com/lo6DwqkHoBfbpsNX/arcgis/rest/services/Carbon_County_Incidents-_Public/FeatureServer/1/query',
  'Carbon County Incident Points':
    'https://services1.arcgis.com/lo6DwqkHoBfbpsNX/arcgis/rest/services/Carbon_County_Incidents-_Public/FeatureServer/0/query',
  EventPolygon:
    'https://services1.arcgis.com/lo6DwqkHoBfbpsNX/arcgis/rest/services/NIFS_Feature_Schema_2026_(Public_View)/FeatureServer/10/query',
  RoadBlock:
    'https://services1.arcgis.com/lo6DwqkHoBfbpsNX/arcgis/rest/services/Road_Closures_View/FeatureServer/0/query',
  'Shelter Locations':
    'https://services1.arcgis.com/lo6DwqkHoBfbpsNX/arcgis/rest/services/Shelter_Locations/FeatureServer/0/query'
}

const TRACKED_LAYER_TITLES = Object.keys(SERVICE_URL)

// ─────────────────────────────────────────────────────────────────────────────
// Legend config — display label + swatch style + layer key
// The toggleTitle is the actual layer title in the WebMap that will be
// toggled on/off. Note "Incident Specific Symbology" for perimeter is
// intentional; that's what the WebMap uses even though the query service
// is EventPolygon.
// ─────────────────────────────────────────────────────────────────────────────

interface LegendEntry {
  key: LayerKey
  toggleTitle: string
  label: string
  swatch: SwatchKind
}

type LayerKey = 'evacuation' | 'perimeter' | 'incident' | 'roadblock' | 'shelter'
type SwatchKind = 'evac' | 'perimeter' | 'incident' | 'road-closure' | 'shelter'

const LEGEND: LegendEntry[] = [
  { key: 'evacuation', toggleTitle: 'Carbon County Incident Evacuations', label: 'Evacuation Zone',    swatch: 'evac'         },
  { key: 'perimeter',  toggleTitle: 'Incident Specific Symbology',        label: 'Incident Perimeter', swatch: 'perimeter'    },
  { key: 'incident',   toggleTitle: 'Carbon County Incident Points',      label: 'Incident Location',  swatch: 'incident'     },
  { key: 'roadblock',  toggleTitle: 'RoadBlock',                          label: 'Road Closure',       swatch: 'road-closure' },
  { key: 'shelter',    toggleTitle: 'Shelter Locations',                  label: 'Shelter Location',   swatch: 'shelter'      }
]

// Map from legend key to REST service key (used by the zoom dropdown
// and feature list fetches).
const LAYER_SERVICE_KEY: Record<LayerKey, string> = {
  evacuation: 'Carbon County Incident Evacuations',
  incident:   'Carbon County Incident Points',
  perimeter:  'EventPolygon',
  roadblock:  'RoadBlock',
  shelter:    'Shelter Locations'
}

// Accent color per layer, used for popup border + section headers.
const LAYER_ACCENT: Record<string, string> = {
  'Carbon County Incident Evacuations': '#7B1D13',
  'Carbon County Incident Points':      '#92400E',
  EventPolygon:                          '#4C1D95',
  RoadBlock:                             '#78350F',
  'Shelter Locations':                   '#1E3A8A'
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Geometry {
  x?: number
  y?: number
  rings?: number[][][]
  paths?: number[][][]
  spatialReference?: { wkid: number }
}

interface PopupData {
  title: string
  attrs: Record<string, any>
  geometry: Geometry | null
}

interface FeatureListRow {
  layer:    string
  geometry: Geometry | null
  name:     string
  type:     string
  status:   string
  detail:   string
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

const fmtDate = (v: any): string => {
  if (v == null) return '—'
  const d = typeof v === 'number' ? new Date(v) : new Date(String(v))
  return isNaN(d.getTime())
    ? String(v)
    : d.toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      })
}

const fmtZone = (v: string): string =>
  v === 'EvacOrder'   ? 'Evacuation Order'
  : v === 'EvacWarning' ? 'Evacuation Warning'
  : v || 'Evacuation Zone'

const fmtActive = (v: any): string => {
  if (v == null) return '—'
  if (v === 1 || v === 'Yes' || v === 'yes' || v === 'Active' || v === 'active') return 'Active'
  if (v === 0 || v === 'No'  || v === 'no'  || v === 'Inactive')                  return 'Inactive'
  return String(v)
}

// ─────────────────────────────────────────────────────────────────────────────
// Zoom helper — tries AMD esri/geometry/Extent first, falls back to
// center+zoom. Passing raw extent objects to view.goTo requires autocast
// and silently fails in many EB configs. Do not "simplify".
// ─────────────────────────────────────────────────────────────────────────────

function zoomToGeometry (view: any, geometry: Geometry | null | undefined) {
  if (!view || !geometry) return
  try {
    if (geometry.rings || geometry.paths) {
      const coords = ((geometry.rings ?? geometry.paths) as number[][][]).flat()
      const xs = coords.map(c => c[0])
      const ys = coords.map(c => c[1])
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2
      const cy = (Math.min(...ys) + Math.max(...ys)) / 2
      const halfW = 0.6 * (Math.max(...xs) - Math.min(...xs))
      const halfH = 0.6 * (Math.max(...ys) - Math.min(...ys))
      const amdRequire: any = (window as any).require ?? (window as any).__esri_require
      if (amdRequire) {
        amdRequire(['esri/geometry/Extent'], (Extent: any) => {
          const ext = new Extent({
            xmin: cx - halfW, ymin: cy - halfH,
            xmax: cx + halfW, ymax: cy + halfH,
            spatialReference: { wkid: 4326 }
          })
          view.goTo(ext, { duration: 600 }).catch(() => {
            const span = 2 * Math.max(halfW, halfH)
            view.goTo(
              { center: [cx, cy], zoom: Math.max(8, Math.min(18, Math.round(Math.log2(360 / span)) + 1)) },
              { duration: 600 }
            )
          })
        })
      } else {
        const span = 2 * Math.max(halfW, halfH)
        view.goTo(
          { center: [cx, cy], zoom: Math.max(8, Math.min(18, Math.round(Math.log2(360 / span)) + 1)) },
          { duration: 600 }
        )
      }
    } else if (geometry.x != null && geometry.y != null) {
      view.goTo({ center: [geometry.x, geometry.y], zoom: 15 }, { duration: 500 })
    }
  } catch (e) {
    console.error('[CarbonAlert:zoom] exception:', e)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature Service fetchers
// ─────────────────────────────────────────────────────────────────────────────

async function queryLayerByObjectId (serviceKey: string, oid: number): Promise<{ attrs: Record<string, any>; geometry: Geometry | null }> {
  const url = SERVICE_URL[serviceKey]
  if (!url) return { attrs: {}, geometry: null }
  const qs = new URLSearchParams({
    where: `OBJECTID=${oid}`,
    outFields: '*', returnGeometry: 'true', outSR: '4326', f: 'json'
  })
  try {
    const j = await fetch(`${url}?${qs}`).then(r => r.json())
    if (j.error) {
      console.error('[CarbonAlert] query error:', j.error)
      return { attrs: {}, geometry: null }
    }
    const f = j.features?.[0]
    return f
      ? { attrs: f.attributes ?? {}, geometry: f.geometry ?? null }
      : { attrs: {}, geometry: null }
  } catch (e) {
    console.error('[CarbonAlert] fetch error:', e)
    return { attrs: {}, geometry: null }
  }
}

async function queryAllInLayer (serviceKey: string): Promise<Array<{ label: string; geometry: Geometry | null }>> {
  const url = SERVICE_URL[serviceKey]
  if (!url) return []
  const qs = new URLSearchParams({
    where: '1=1', outFields: '*', returnGeometry: 'true', outSR: '4326', f: 'json'
  })
  try {
    const j = await fetch(`${url}?${qs}`).then(r => r.json())
    if (j.error || !j.features?.length) return []
    return j.features.map((f: any) => {
      const a = f.attributes ?? {}
      let label = ''
      if (serviceKey === 'Carbon County Incident Evacuations') label = a.Incident_Name ?? a.Zone_Level ?? 'Zone'
      else if (serviceKey === 'Carbon County Incident Points') label = a.Incident_Name ?? 'Incident'
      else if (serviceKey === 'EventPolygon')                  label = a.IncidentName  ?? 'Perimeter'
      else if (serviceKey === 'RoadBlock')                     label = a.BLOCKNM       ?? 'Road Closure'
      else if (serviceKey === 'Shelter Locations')             label = a.Shelter_Name  ?? 'Shelter'
      return { label, geometry: f.geometry ?? null }
    })
  } catch (e) {
    console.error('[CarbonAlert] fetchAll error:', e)
    return []
  }
}

async function queryAllFeaturesForList (): Promise<FeatureListRow[]> {
  const settled = await Promise.allSettled(
    TRACKED_LAYER_TITLES.map(async (title): Promise<FeatureListRow[]> => {
      const url = SERVICE_URL[title]
      const qs = new URLSearchParams({
        where: '1=1', outFields: '*', returnGeometry: 'true', outSR: '4326', f: 'json'
      })
      const j = await fetch(`${url}?${qs}`).then(r => r.json())
      if (j.error || !j.features?.length) return []
      return j.features.map((f: any): FeatureListRow => {
        const a = f.attributes ?? {}
        if (title === 'Carbon County Incident Evacuations') {
          return {
            layer: 'Evacuation Zone', geometry: f.geometry,
            name:   a.Incident_Name ?? '—',
            type:   fmtZone(a.Zone_Level ?? ''),
            status: fmtActive(a.Status),
            detail: a.Affected_Area ?? '—'
          }
        }
        if (title === 'Carbon County Incident Points') {
          return {
            layer: 'Incident', geometry: f.geometry,
            name:   a.Incident_Name ?? '—',
            type:   (a.Incident_Type ?? '').replace(/_/g, ' ') || '—',
            status: fmtActive(a.Status),
            detail: a.Location_Description ?? '—'
          }
        }
        if (title === 'EventPolygon') {
          return {
            layer: 'Perimeter', geometry: f.geometry,
            name:   a.IncidentName ?? '—',
            type:   a.FeatureCategory ?? 'Perimeter',
            status: a.GISAcres != null ? `${Number(a.GISAcres).toFixed(1)} ac` : '—',
            detail: a.MapMethod ?? '—'
          }
        }
        if (title === 'RoadBlock') {
          return {
            layer: 'Road Closure', geometry: f.geometry,
            name:   a.BLOCKNM ?? '—',
            type:   'Road Closure',
            status: fmtActive(a.ACTIVE),
            detail: a.ENDDATE ? fmtDate(a.ENDDATE) : '—'
          }
        }
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
  return settled.flatMap(r => r.status === 'fulfilled' ? r.value : [])
}

// ─────────────────────────────────────────────────────────────────────────────
// Style injection — CSS lives here because there are no CSS files in an
// EB widget by default and inline styles can't express :focus-visible,
// :hover, sticky headers, or media-query-like sizing tied to a class.
// ─────────────────────────────────────────────────────────────────────────────

function injectStyles () {
  if (typeof document === 'undefined') return
  if (document.getElementById('ca-styles')) return
  const el = document.createElement('style')
  el.id = 'ca-styles'
  el.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Lora:wght@600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');

    /* Focus ring — applied via CSS not JS so it cannot be accidentally removed */
    .ca-widget *:focus { outline: none; }
    .ca-widget *:focus-visible { outline: 3px solid #2563EB !important; outline-offset: 2px !important; }

    /* Screen-reader-only utility */
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

    /* Legend toggle — inactive state uses explicit muted color, not opacity,
       so contrast ratios stay measurable and above 3:1 */
    .ca-layer-btn { transition: background 0.1s; }
    .ca-layer-btn:hover { background: #F9FAFB !important; }
    .ca-layer-btn[aria-checked="false"] .ca-swatch      { opacity: 0.35; }
    .ca-layer-btn[aria-checked="false"] .ca-layer-label { color: #9CA3AF !important; }

    .ca-list-panel-collapsed { display: none; }

    /* Feature list table */
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
    .ca-list-table tbody tr:hover td         { background: #EFF6FF; }
    .ca-list-table tbody tr:focus-within td  { background: #DBEAFE; outline: none; }

    .ca-zoom-item:hover, .ca-zoom-item:focus-visible { background: #EFF6FF !important; }

    /* Mobile (widget width < 600px, set by ResizeObserver via .ca-mobile class):
       bigger type + row height in the feature list so it's readable and
       tappable at phone widths without shrinking columns. */
    .ca-mobile .ca-list-table th { font-size: 11px; padding:  8px 10px; }
    .ca-mobile .ca-list-table td { font-size: 13px; padding: 10px 10px; }
    .ca-mobile .ca-list-table    { min-width: 480px; }
  `
  document.head.appendChild(el)
}

// ─────────────────────────────────────────────────────────────────────────────
// Small building blocks
// ─────────────────────────────────────────────────────────────────────────────

function Field ({ label, value, isMobile }: { label: string; value?: string | null; isMobile: boolean }) {
  const v = value && value !== '—' ? value : '—'
  return (
    <div style={{ marginBottom: isMobile ? 16 : 14 }}>
      <p style={{
        margin: '0 0 3px', fontSize: isMobile ? 11 : 10, fontWeight: 700,
        color: '#4B5563', textTransform: 'uppercase',
        letterSpacing: '0.07em', fontFamily: F_BODY
      }}>{label}</p>
      <p style={{
        margin: 0, fontSize: isMobile ? 14 : 13,
        color: v === '—' ? '#9CA3AF' : '#111827',
        lineHeight: 1.5, fontFamily: F_BODY
      }}>{v}</p>
    </div>
  )
}

function PublicMsg ({ label, text, accent, isMobile }: { label: string; text: string | null; accent: string; isMobile: boolean }) {
  if (!text) return <div aria-hidden="true" style={{ height: 64 }} />
  return (
    <div style={{
      padding: isMobile ? '12px 14px' : '10px 12px',
      background: '#F9FAFB',
      borderLeft: `3px solid ${accent}`,
      borderRadius: '0 4px 4px 0'
    }}>
      <p style={{
        margin: '0 0 4px', fontSize: isMobile ? 11 : 10, fontWeight: 700,
        color: accent, textTransform: 'uppercase',
        letterSpacing: '0.07em', fontFamily: F_BODY
      }}>{label}</p>
      <p style={{ margin: 0, fontSize: isMobile ? 14 : 13, color: '#111827', lineHeight: 1.55, fontFamily: F_BODY }}>
        {text}
      </p>
    </div>
  )
}

function LegendSwatch ({ kind }: { kind: SwatchKind }) {
  if (kind === 'evac') {
    return (
      <span aria-hidden="true" className="ca-swatch" style={{
        display: 'inline-block', width: 20, height: 12, flexShrink: 0,
        border: '2px solid #C0392B', borderRadius: 2,
        backgroundImage:
          'repeating-linear-gradient(-45deg,rgba(192,57,43,.6) 0,rgba(192,57,43,.6) 2px,rgba(253,236,234,.8) 2px,rgba(253,236,234,.8) 6px)'
      }} />
    )
  }
  if (kind === 'perimeter') {
    return (
      <span aria-hidden="true" className="ca-swatch" style={{
        display: 'inline-block', width: 20, height: 12, flexShrink: 0,
        background: 'rgba(252,165,165,.5)', border: '2px solid #7B1D13', borderRadius: 2
      }} />
    )
  }
  if (kind === 'incident') {
    return (
      <svg aria-hidden="true" className="ca-swatch" width={18} height={18} viewBox="0 0 18 18"
        style={{ display: 'inline-block', flexShrink: 0, verticalAlign: 'middle' }}>
        <polygon points="9,1 17,9 9,17 1,9" fill="#7B1D13" stroke="#4B0F09" strokeWidth={1}/>
        <text x={9} y={13} textAnchor="middle" fontSize={9} fontWeight="bold" fill="white" fontFamily="sans-serif">!</text>
      </svg>
    )
  }
  if (kind === 'road-closure') {
    return (
      <svg aria-hidden="true" className="ca-swatch" width={18} height={18} viewBox="0 0 18 18"
        style={{ display: 'inline-block', flexShrink: 0, verticalAlign: 'middle' }}>
        <circle cx={9} cy={9} r={8.5} fill="#DC2626"/>
        <rect x={3} y={7} width={12} height={4} rx={1.5} fill="#FFFFFF"/>
      </svg>
    )
  }
  if (kind === 'shelter') {
    return (
      <svg aria-hidden="true" className="ca-swatch" width={18} height={18} viewBox="0 0 18 18"
        style={{ display: 'inline-block', flexShrink: 0, verticalAlign: 'middle' }}>
        <rect x={0.5} y={0.5} width={17} height={17} rx={2} fill="#111827"/>
        <rect x={7.5} y={3}   width={3}  height={12} fill="#FFFFFF"/>
        <rect x={3}   y={7.5} width={12} height={3}  fill="#FFFFFF"/>
      </svg>
    )
  }
  return <span className="ca-swatch" style={{ width: 20, height: 12, display: 'inline-block', flexShrink: 0 }} />
}

// ─────────────────────────────────────────────────────────────────────────────
// ZoomDropdown — per-layer dropdown listing every feature in that layer
// with a "zoom to it" button
// ─────────────────────────────────────────────────────────────────────────────

interface ZoomDropdownProps {
  layerKey:   LayerKey
  label:      string
  arcViewRef: React.MutableRefObject<any>
  dropdownId: string
  isMobile:   boolean
}

function ZoomDropdown ({ layerKey, label, arcViewRef, dropdownId, isMobile }: ZoomDropdownProps) {
  const [open,    setOpen]    = useState(false)
  const [loading, setLoading] = useState(false)
  const [items,   setItems]   = useState<Array<{ label: string; geometry: Geometry | null }>>([])
  const [empty,   setEmpty]   = useState(false)
  const btnRef  = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const serviceKey = LAYER_SERVICE_KEY[layerKey]

  const toggle = useCallback(async () => {
    if (open) { setOpen(false); return }
    if (!serviceKey) return
    setOpen(true)
    setEmpty(false)
    if (items.length === 0) {
      setLoading(true)
      const rows = await queryAllInLayer(serviceKey)
      setLoading(false)
      if (rows.length === 0) setEmpty(true)
      else setItems(rows)
    }
  }, [open, serviceKey, items.length])

  // Escape to close
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  // Focus first menu item on open
  useEffect(() => {
    if (open && !loading) {
      setTimeout(() => {
        listRef.current?.querySelector<HTMLElement>('[role="option"]')?.focus()
      }, 50)
    }
  }, [open, loading])

  // Click outside to close
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  if (!serviceKey) return <span />

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        ref={btnRef}
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={dropdownId}
        aria-label={`Zoom to a ${label} feature`}
        title={`Zoom to ${label}`}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', borderRadius: 3,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#1D4ED8', flexShrink: 0,
          padding: isMobile ? '12px' : '8px',
          minWidth:  isMobile ? 44 : undefined,
          minHeight: isMobile ? 44 : undefined
        }}
      >
        <svg width={14} height={14} viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx={6.5} cy={6.5} r={4.5} stroke="#1D4ED8" strokeWidth={1.6}/>
          <line x1={10} y1={10} x2={14} y2={14} stroke="#1D4ED8" strokeWidth={1.6} strokeLinecap="round"/>
        </svg>
        <svg width={8} height={8} viewBox="0 0 8 8" aria-hidden="true" style={{ marginLeft: 1 }}>
          <polyline points={open ? '1,5 4,2 7,5' : '1,3 4,6 7,3'} stroke="#1D4ED8" strokeWidth={1.5} strokeLinecap="round" fill="none"/>
        </svg>
      </button>

      {open && (
        <div
          id={dropdownId}
          role="listbox"
          aria-label={`${label} features — ${items.length} item${items.length === 1 ? '' : 's'}`}
          style={{
            position: 'absolute', bottom: '100%', right: 0, marginBottom: 4,
            width: isMobile ? 'min(240px, calc(100vw - 32px))' : 220,
            maxHeight: isMobile ? 220 : 180, overflowY: 'auto',
            background: '#FFFFFF', border: '1px solid #D1D5DB', borderRadius: 6,
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            zIndex: 999, fontFamily: F_BODY
          }}
        >
          {loading && (
            <div role="status" aria-live="polite"
              style={{ padding: '10px 12px', fontSize: 12, color: '#6B7280', textAlign: 'center' }}>
              Loading features…
            </div>
          )}
          {empty && (
            <div role="alert"
              style={{ padding: '10px 12px', fontSize: 12, color: '#DC2626', textAlign: 'center' }}>
              No features found.
            </div>
          )}
          {!loading && !empty && (
            <ul ref={listRef} style={{ margin: 0, padding: '4px 0', listStyle: 'none' }}>
              {items.map((it, i) => (
                <li key={i}>
                  <button
                    role="option"
                    tabIndex={0}
                    className="ca-zoom-item"
                    aria-label={`Zoom to ${it.label}${it.geometry ? '' : ' (no location available)'}`}
                    aria-disabled={!it.geometry}
                    onClick={() => {
                      zoomToGeometry(arcViewRef.current, it.geometry)
                      setOpen(false)
                      btnRef.current?.focus()
                    }}
                    onKeyDown={(e) => {
                      const opts = listRef.current?.querySelectorAll<HTMLElement>('[role="option"]')
                      if (!opts) return
                      if (e.key === 'ArrowDown') { e.preventDefault(); opts[Math.min(i + 1, opts.length - 1)]?.focus() }
                      if (e.key === 'ArrowUp')   { e.preventDefault(); opts[Math.max(i - 1, 0)]?.focus() }
                    }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: isMobile ? '11px 12px' : '7px 12px',
                      background: 'none', border: 'none',
                      cursor: it.geometry ? 'pointer' : 'default',
                      fontSize: isMobile ? 13 : 12,
                      color:    it.geometry ? '#111827' : '#6B7280',
                      fontFamily: F_BODY
                    }}
                  >{it.label}</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// FeatureListPanel — non-map path to all feature data
// ─────────────────────────────────────────────────────────────────────────────

interface FeatureListProps {
  arcViewRef:   React.MutableRefObject<any>
  listPanelId:  string
  isMobile:     boolean
}

function FeatureListPanel ({ arcViewRef, listPanelId, isMobile }: FeatureListProps) {
  const [rows,    setRows]    = useState<FeatureListRow[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded,  setLoaded]  = useState(false)
  const [failed,  setFailed]  = useState(false)

  useEffect(() => {
    setLoading(true)
    queryAllFeaturesForList()
      .then(rs => { setRows(rs); setLoaded(true) })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false))
  }, [])

  const LAYER_BG: Record<string, string> = {
    'Evacuation Zone': '#7B1D13',
    Incident:          '#92400E',
    Perimeter:         '#4C1D95',
    'Road Closure':    '#78350F',
    Shelter:           '#1E3A8A'
  }

  return (
    <div id={listPanelId} style={{ background: '#FFFFFF', borderTop: '2px solid #E5E7EB', fontFamily: F_BODY }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 12px 8px', borderBottom: '1px solid #F3F4F6'
      }}>
        <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#111827', fontFamily: F_HEAD }}>
          All Map Features
        </h2>
        {loading && (
          <span role="status" aria-live="polite" style={{ fontSize: 11, color: '#6B7280' }}>Loading…</span>
        )}
        {loaded && !loading && (
          <span aria-live="polite" style={{ fontSize: 11, color: '#6B7280' }}>
            {rows.length} feature{rows.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {failed && (
        <p role="alert" style={{ margin: 0, padding: 12, fontSize: 12, color: '#DC2626' }}>
          Could not load features. Check your connection.
        </p>
      )}

      {!failed && (
        <div style={{ maxHeight: 220, overflowY: 'auto', overflowX: 'auto' }}>
          <table
            className="ca-list-table"
            role="grid"
            aria-label="Active emergency features"
            aria-rowcount={rows.length}
            aria-busy={loading}
          >
            <thead>
              <tr>
                <th scope="col">Layer</th>
                <th scope="col">Name</th>
                <th scope="col">Status</th>
                {!isMobile && <th scope="col">Detail</th>}
                <th scope="col">
                  <span className="ca-sr-only">Zoom to feature</span>
                  <svg width={12} height={12} viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <circle cx={6.5} cy={6.5} r={4.5} stroke="#374151" strokeWidth={1.6}/>
                    <line x1={10} y1={10} x2={14} y2={14} stroke="#374151" strokeWidth={1.6} strokeLinecap="round"/>
                  </svg>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: '#9CA3AF', padding: 16 }}>
                    No active features.
                  </td>
                </tr>
              )}
              {rows.map((r, i) => (
                <tr key={i} tabIndex={0}>
                  <td>
                    <span style={{
                      display: 'inline-block', padding: '2px 6px', borderRadius: 3,
                      fontSize: 10, fontWeight: 700, color: '#fff',
                      background: LAYER_BG[r.layer] ?? '#374151'
                    }}>{r.layer}</span>
                  </td>
                  <td style={{ fontWeight: 600 }}>{r.name}</td>
                  <td>{r.status}</td>
                  {!isMobile && <td style={{ color: '#6B7280' }}>{r.detail}</td>}
                  <td>
                    {r.geometry ? (
                      <button
                        aria-label={`Zoom to ${r.name}`}
                        onClick={() => zoomToGeometry(arcViewRef.current, r.geometry)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          padding:   isMobile ? 8  : '2px 4px',
                          borderRadius: 3, color: '#1D4ED8',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          minWidth:  isMobile ? 36 : undefined,
                          minHeight: isMobile ? 36 : undefined
                        }}
                      >
                        <svg width={14} height={14} viewBox="0 0 16 16" fill="none" aria-hidden="true">
                          <circle cx={6.5} cy={6.5} r={4.5} stroke="#1D4ED8" strokeWidth={1.6}/>
                          <line x1={10} y1={10} x2={14} y2={14} stroke="#1D4ED8" strokeWidth={1.6} strokeLinecap="round"/>
                        </svg>
                      </button>
                    ) : (
                      <span aria-label="No location available" style={{ color: '#D1D5DB', fontSize: 11 }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PopupContent — the body of the sidebar popup, depends on layer title
// ─────────────────────────────────────────────────────────────────────────────

function PopupContent ({ data, isMobile }: { data: PopupData; isMobile: boolean }) {
  const { title, attrs: a } = data
  const accent = LAYER_ACCENT[title] ?? '#374151'

  let name = '', type = ''
  let dateLabel = 'Date',   dateVal:   string | null = null
  let statusLabel = 'Status', statusVal: string | null = null
  let detailLabel = 'Detail', detailVal: string | null = null
  let notesLabel = 'Notes',  notesVal:  string | null = null

  if (title === 'Carbon County Incident Evacuations') {
    name = a.Incident_Name ?? 'Unknown Incident'
    type = fmtZone(a.Zone_Level ?? '')
    dateLabel = 'Effective Date';   dateVal   = fmtDate(a.Effective_Date)
    statusVal = fmtActive(a.Status)
    detailLabel = 'Affected Area';  detailVal = a.Affected_Area ?? null
    notesLabel  = 'Public Message'; notesVal  = a.Public_Message ?? null
  } else if (title === 'Carbon County Incident Points') {
    name = a.Incident_Name ?? 'Unknown Incident'
    type = (a.Incident_Type ?? '').replace(/_/g, ' ')
    dateLabel = 'Last Updated';    dateVal   = fmtDate(a.Last_Updated)
    statusVal = fmtActive(a.Status)
    detailLabel = 'Location';      detailVal = a.Location_Description ?? null
    notesLabel  = 'Additional Info'
    notesVal = a.Additional_Info ?? (a.RC_Details ? `Road closure: ${a.RC_Details}` : null)
  } else if (title === 'EventPolygon') {
    name = a.IncidentName ?? 'Fire Perimeter'
    type = a.FeatureCategory ?? 'Incident Perimeter'
    dateLabel = 'Date Current';    dateVal   = fmtDate(a.DateCurrent)
    statusLabel = 'Acres'
    statusVal   = a.GISAcres != null ? `${Number(a.GISAcres).toFixed(1)} acres` : null
    detailLabel = 'Mapping Method'; detailVal = a.MapMethod ?? null
  } else if (title === 'RoadBlock') {
    name = a.BLOCKNM ?? 'Road Closure'
    type = 'Road Closure'
    dateLabel = 'Active Since';    dateVal   = fmtDate(a.STARTDATE)
    statusVal = fmtActive(a.ACTIVE)
    detailLabel = 'Est. End Date'; detailVal = a.ENDDATE ? fmtDate(a.ENDDATE) : null
    notesLabel  = a.ALTROUTE ? 'Alternate Route' : 'Notes'
    notesVal = a.COMMENT ?? (a.ALTROUTE ? `Alternate route: ${a.ALTROUTE}` : null) ?? a.LOCDESC ?? null
  } else if (title === 'Shelter Locations') {
    name = a.Shelter_Name ?? 'Emergency Shelter'
    type = 'Shelter Location'
    dateLabel = 'Serving Incident'; dateVal = a.Incident_Name ?? null
    statusVal   = fmtActive(a.Status ?? a.ACTIVE ?? null)
    detailLabel = 'Address'; detailVal = a.Address ?? a.Location ?? null
  }

  return (
    <div>
      <h3 style={{
        margin: '0 0 2px', fontSize: isMobile ? 17 : 16, fontWeight: 700,
        color: '#111827', fontFamily: F_HEAD, lineHeight: 1.3
      }}>{name}</h3>
      <p style={{
        margin: '0 0 16px', fontSize: isMobile ? 11 : 10, fontWeight: 700,
        color: accent, textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: F_BODY
      }}>{type}</p>

      <div style={isMobile
        ? { display: 'flex', flexDirection: 'column' }
        : { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}
      >
        <Field label={dateLabel}   value={dateVal}   isMobile={isMobile}/>
        <Field label={statusLabel} value={statusVal} isMobile={isMobile}/>
      </div>
      <Field     label={detailLabel} value={detailVal} isMobile={isMobile}/>
      <PublicMsg label={notesLabel}  text={notesVal}   accent={accent} isMobile={isMobile}/>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main widget
// ─────────────────────────────────────────────────────────────────────────────

export default function Widget (props: AllWidgetProps<any>) {
  const [ready,      setReady]      = useState(false)
  const [popup,      setPopup]      = useState<PopupData | null>(null)
  const [popupBusy,  setPopupBusy]  = useState(false)
  const [visibility, setVisibility] = useState<Record<LayerKey, boolean>>({
    evacuation: true, perimeter: true, incident: true, roadblock: true, shelter: true
  })

  // Layout measurement (from ResizeObserver + resize listener) drives
  // the mobile breakpoint and the popup/list panel geometry.
  const [wrapH,   setWrapH]   = useState(0)
  const [wrapW,   setWrapW]   = useState(0)
  const [availH,  setAvailH]  = useState(0)
  const [live,    setLive]    = useState('')
  const [listOpen, setListOpen] = useState(false)

  const arcViewRef  = useRef<any>(null)
  const clickHandle = useRef<any>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const dialogRef   = useRef<HTMLDivElement>(null)
  const lastFocused = useRef<HTMLElement | null>(null)
  const wrapRef     = useRef<HTMLDivElement>(null)
  const listToggleRef = useRef<HTMLButtonElement>(null)

  const LIST_PANEL_ID = 'ca-list-panel'

  // ── Inject CSS once ──
  useEffect(() => { injectStyles() }, [])

  // ── Observe widget size (breakpoint + layout math) ──
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    setWrapH(el.offsetHeight)
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        setWrapH(e.contentRect.height)
        setWrapW(e.contentRect.width)
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ── Measure available vertical space (window resize + orientation) ──
  useEffect(() => {
    const recalc = () => {
      const el = wrapRef.current
      if (!el) return
      const top = el.getBoundingClientRect().top
      setAvailH(Math.max(120, window.innerHeight - top))
    }
    recalc()
    window.addEventListener('resize', recalc)
    window.addEventListener('orientationchange', recalc)
    const t = setTimeout(recalc, 300)
    return () => {
      window.removeEventListener('resize', recalc)
      window.removeEventListener('orientationchange', recalc)
      clearTimeout(t)
    }
  }, [])

  // ── Focus trap + Escape when popup open ──
  useEffect(() => {
    if (!popup) return
    const dlg = dialogRef.current
    if (!dlg) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setPopup(null); return }
      if (e.key !== 'Tab') return
      const els = dlg.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')
      const first = els[0], last = els[els.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [popup])

  // ── Move focus into dialog on open, restore on close; announce via live region ──
  useEffect(() => {
    if (popup) {
      lastFocused.current = document.activeElement as HTMLElement
      setTimeout(() => closeBtnRef.current?.focus(), 50)
      const n = popup.attrs?.Incident_Name
        ?? popup.attrs?.BLOCKNM
        ?? popup.attrs?.Shelter_Name
        ?? popup.attrs?.IncidentName
        ?? 'Feature'
      setLive(`Feature details opened: ${n}`)
    } else {
      lastFocused.current?.focus()
      setLive('Feature details closed')
    }
  }, [popup])

  // ── Clear live region shortly after announcement ──
  useEffect(() => {
    if (!live) return
    const t = setTimeout(() => setLive(''), 1500)
    return () => clearTimeout(t)
  }, [live])

  // ── Attach map click handler once the JimuMapView is available ──
  const onActiveViewChange = useCallback((jimuView: JimuMapView | null | undefined) => {
    if (!jimuView?.view) return
    const view: any = jimuView.view
    arcViewRef.current = view

    // Kill the native ArcGIS popup so it doesn't fight the custom one
    view.popup.autoOpenEnabled = false
    if (typeof view.popup.close === 'function') view.popup.close()
    console.log('[CarbonAlert] popup API:',
      Object.getOwnPropertyNames(Object.getPrototypeOf(view.popup))
        .filter((k: string) => typeof view.popup[k] === 'function'))

    if (clickHandle.current) { clickHandle.current.remove(); clickHandle.current = null }

    clickHandle.current = view.on('click', async (evt: any) => {
      if (typeof view.popup.close === 'function') view.popup.close()
      try {
        const tracked = view.map.allLayers.toArray()
          .filter((l: any) => TRACKED_LAYER_TITLES.includes(l.title))
        if (!tracked.length) return

        const hit = await view.hitTest(evt, { include: tracked })
        if (!hit?.results?.length) { setPopup(null); return }

        const first = hit.results[0]
        const title = first.graphic?.layer?.title
        const oid   = first.graphic?.attributes?.OBJECTID
        if (!TRACKED_LAYER_TITLES.includes(title)) { setPopup(null); return }

        setPopupBusy(true)
        setPopup(null)
        const { attrs, geometry } = await queryLayerByObjectId(title, oid)
        setPopup({ title, attrs, geometry })
        setPopupBusy(false)
      } catch (e) {
        console.error('[CarbonAlert] click error:', e)
        setPopupBusy(false)
      }
    })
    setReady(true)
  }, [])

  useEffect(() => () => { clickHandle.current?.remove() }, [])

  // ── Layer visibility toggle ──
  const toggleLayer = (key: LayerKey, toggleTitle: string) => {
    const view = arcViewRef.current
    if (!view) return
    const next = !visibility[key]
    view.map.allLayers.forEach((layer: any) => {
      if (layer.title === toggleTitle) layer.visible = next
    })
    setVisibility(v => ({ ...v, [key]: next }))
  }

  // ── Not-connected state ──
  if (!props.useMapWidgetIds?.length) {
    return (
      <div className="ca-widget" style={{
        height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, textAlign: 'center', fontFamily: F_BODY, fontSize: 13, color: '#6B7280'
      }}>
        Open widget settings and select your map.
      </div>
    )
  }

  // ── Layout math ──
  const isMobile   = wrapW < 600
  const legendH    = isMobile ? 170 : 310
  const listH      = isMobile ? 190 : 320
  const listStack  = legendH + (listOpen ? listH : 0)
  const popupH     = isMobile
    ? Math.max(160, wrapH - legendH - (listOpen ? listH : 0))
    : Math.max(0,   wrapH - listStack)
  const listTop    = popupH + legendH

  const popupBoxStyle: React.CSSProperties = isMobile
    ? { position: 'relative', left: 0, right: 0, minHeight: 160,
        display: 'flex', flexDirection: 'column', overflow: 'visible' }
    : { position: 'absolute', top: 0, left: 0, right: 0, height: popupH,
        display: 'flex', flexDirection: 'column', overflow: 'hidden' }

  // ── Legend panel ──
  const legend = (
    <div style={isMobile
      ? { position: 'relative', left: 0, right: 0, background: '#FFFFFF',
          borderTop: '1px solid #E5E7EB', padding: '10px 6px 10px',
          boxSizing: 'border-box', overflow: 'visible' }
      : { position: 'absolute', top: popupH, left: 0, right: 0, height: legendH,
          borderTop: '1px solid #E5E7EB', background: '#FFFFFF',
          padding: '10px 6px 10px', boxSizing: 'border-box', overflow: 'visible' }
    }>
      <h2 id="ca-legend-heading" style={{
        margin: '0 0 4px', padding: '0 8px', fontSize: 9, fontWeight: 700,
        letterSpacing: '0.1em', color: '#6B7280', textTransform: 'uppercase', fontFamily: F_BODY
      }}>Map Layers</h2>

      <div role="group" aria-labelledby="ca-legend-heading">
        {LEGEND.map(entry => {
          const on = visibility[entry.key]
          return (
            <div key={entry.key} style={{
              display: 'flex', alignItems: 'center', width: '100%',
              padding: '0 4px', gap: 4, minHeight: isMobile ? 44 : 36
            }}>
              <button
                role="switch"
                aria-checked={on}
                aria-label={`${on ? 'Hide' : 'Show'} ${entry.label} layer`}
                className="ca-layer-btn"
                onClick={() => toggleLayer(entry.key, entry.toggleTitle)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, flex: 1,
                  padding: isMobile ? '6px 4px' : '4px 4px',
                  background: 'none', border: 'none', borderRadius: 4,
                  cursor: ready ? 'pointer' : 'default',
                  textAlign: 'left', fontFamily: F_BODY,
                  minHeight: isMobile ? 44 : 36
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', width: 26, justifyContent: 'center', flexShrink: 0 }}>
                  <LegendSwatch kind={entry.swatch}/>
                </span>
                <span className="ca-layer-label" style={{
                  flex: 1, fontSize: isMobile ? 14 : 12,
                  color: '#111827', fontWeight: 500, fontFamily: F_BODY
                }}>{entry.label}</span>
              </button>
              {ready && (
                <ZoomDropdown
                  layerKey={entry.key}
                  label={entry.label}
                  arcViewRef={arcViewRef}
                  dropdownId={`zoom-dd-${entry.key}`}
                  isMobile={isMobile}
                />
              )}
            </div>
          )
        })}
      </div>

      <p style={{
        margin: '6px 8px 0', fontSize: 10, color: '#6B7280', lineHeight: 1.6,
        fontFamily: F_BODY, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4
      }}>
        {ready ? (
          <>
            Use{' '}
            <svg width={12} height={12} viewBox="0 0 16 16" fill="none" aria-hidden="true"
              style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
              <circle cx={6.5} cy={6.5} r={4.5} stroke="#6B7280" strokeWidth={1.6}/>
              <line x1={10} y1={10} x2={14} y2={14} stroke="#6B7280" strokeWidth={1.6} strokeLinecap="round"/>
            </svg>
            {' '}to zoom to a feature · Tap a layer to show or hide it
          </>
        ) : 'Connecting to map…'}
      </p>

      <button
        ref={listToggleRef}
        onClick={() => setListOpen(o => !o)}
        aria-expanded={listOpen}
        aria-controls={LIST_PANEL_ID}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: 'calc(100% - 16px)', margin: '8px 8px 2px',
          padding: isMobile ? '12px 12px' : '6px 10px',
          background: listOpen ? '#EFF6FF' : '#F3F4F6',
          border: '1px solid ' + (listOpen ? '#BFDBFE' : '#E5E7EB'),
          borderRadius: 4, cursor: 'pointer',
          minHeight: isMobile ? 44 : undefined,
          fontSize:  isMobile ? 13 : 11,
          fontWeight: 600, color: '#1D4ED8', fontFamily: F_BODY
        }}
      >
        View features as list
        <svg width={10} height={10} viewBox="0 0 8 8" aria-hidden="true">
          <polyline points={listOpen ? '1,5 4,2 7,5' : '1,3 4,6 7,3'}
            stroke="#1D4ED8" strokeWidth={1.5} strokeLinecap="round" fill="none"/>
        </svg>
      </button>
    </div>
  )

  // ── Popup area (busy / actual popup / empty prompt) ──
  const popupArea: React.ReactNode = (isMobile || wrapH !== 0)
    ? popupBusy
      ? (
        <div style={{ ...popupBoxStyle, alignItems: 'center', justifyContent: 'center' }}>
          <p role="status" aria-live="polite" style={{ margin: 0, fontSize: 12, color: '#6B7280', fontFamily: F_BODY }}>
            Loading feature details…
          </p>
        </div>
      )
      : popup
        ? (
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Feature details"
            style={{ ...popupBoxStyle, borderTop: `3px solid ${LAYER_ACCENT[popup.title] ?? '#374151'}`, background: '#FFFFFF' }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 12px', borderBottom: '1px solid #F3F4F6',
              flexShrink: 0, background: '#F9FAFB', gap: 8
            }}>
              <span style={{
                fontSize: 10, fontWeight: 700,
                color: LAYER_ACCENT[popup.title] ?? '#374151',
                textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: F_BODY, flex: 1
              }}>
                {popup.title === 'Carbon County Incident Evacuations'
                    ? fmtZone(popup.attrs.Zone_Level ?? '')
                  : popup.title === 'EventPolygon'
                    ? (popup.attrs.FeatureCategory ?? 'Incident Perimeter')
                  : popup.title === 'Carbon County Incident Points'
                    ? ((popup.attrs.Incident_Type ?? '').replace(/_/g, ' ') || 'Active Incident')
                  : popup.title === 'RoadBlock' ? 'Road Closure'
                  : 'Shelter Location'}
              </span>
              <button
                ref={closeBtnRef}
                onClick={() => setPopup(null)}
                aria-label="Close feature details"
                style={{
                  background: 'none', border: '1px solid #D1D5DB', borderRadius: 4,
                  cursor: 'pointer',
                  padding:   isMobile ? '8px 14px' : '3px 8px',
                  fontSize:  isMobile ? 13 : 11,
                  color: '#374151', fontFamily: F_BODY,
                  minHeight: isMobile ? 44 : 28,
                  minWidth:  isMobile ? 44 : undefined,
                  flexShrink: 0
                }}
              >✕</button>
            </div>
            <div style={{
              padding: isMobile ? '16px 16px 18px' : '14px 14px 16px',
              overflowY: 'auto', flex: 1
            }}>
              <PopupContent data={popup} isMobile={isMobile}/>
            </div>
            <div style={{
              padding: '8px 12px', borderTop: '1px solid #F3F4F6',
              background: '#F9FAFB', flexShrink: 0
            }}>
              <p style={{ margin: 0, fontSize: 10, color: '#6B7280', fontFamily: F_BODY }}>
                Carbon County Office of Emergency Management
              </p>
            </div>
          </div>
        )
        : (
          <div style={{ ...popupBoxStyle, alignItems: 'center', justifyContent: 'center', padding: '20px 16px', textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 12, color: '#9CA3AF', lineHeight: 1.6, fontFamily: F_BODY }}>
              {isMobile
                ? 'Tap a feature on the map to see details.'
                : 'Click a feature on the map to see details.'}
            </p>
          </div>
        )
    : null

  // ── Root render ──
  return (
    <div
      ref={wrapRef}
      className={isMobile ? 'ca-widget ca-mobile' : 'ca-widget'}
      role="region"
      aria-label="Carbon Alert emergency information"
      style={isMobile
        ? { position: 'relative', background: '#FFFFFF', fontFamily: F_BODY,
            borderLeft: '1px solid #E5E7EB',
            display: 'flex', flexDirection: 'column',
            height: availH > 0 ? availH : 'auto',
            overflowY: 'auto', overflowX: 'hidden' }
        : { position: 'absolute', inset: 0, background: '#FFFFFF', fontFamily: F_BODY,
            overflowX: 'hidden', overflowY: 'auto',
            borderLeft: '1px solid #E5E7EB' }
      }
    >
      <a
        href={`#${LIST_PANEL_ID}`}
        className="ca-skip"
        onClick={(e) => {
          e.preventDefault()
          document.getElementById(LIST_PANEL_ID)?.querySelector<HTMLElement>('button,th,td,[tabindex]')?.focus()
        }}
      >
        Skip to feature list
      </a>

      <div role="status" aria-live="assertive" aria-atomic="true" className="ca-sr-only">
        {live}
      </div>

      <JimuMapViewComponent
        useMapWidgetId={props.useMapWidgetIds[0]}
        onActiveViewChange={onActiveViewChange}
      />

      {popupArea}
      {legend}

      {isMobile ? (
        <div style={{
          position: 'relative', left: 0, right: 0,
          display: listOpen ? 'flex' : 'none',
          flexDirection: 'column', overflow: 'visible'
        }}>
          <FeatureListPanel arcViewRef={arcViewRef} listPanelId={LIST_PANEL_ID} isMobile={isMobile}/>
        </div>
      ) : (wrapH > 0 && listOpen && (
        <div style={{
          position: 'absolute', top: listTop, left: 0, right: 0,
          height: listH, overflowY: 'auto'
        }}>
          <FeatureListPanel arcViewRef={arcViewRef} listPanelId={LIST_PANEL_ID} isMobile={isMobile}/>
        </div>
      ))}
    </div>
  )
}
