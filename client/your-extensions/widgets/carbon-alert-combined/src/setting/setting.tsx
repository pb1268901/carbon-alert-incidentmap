import { React } from 'jimu-core'
import { type AllWidgetSettingProps } from 'jimu-for-builder'
import { MapWidgetSelector } from 'jimu-ui/advanced/setting-components'

export default function Setting (props: AllWidgetSettingProps<any>) {
  return (
    <div style={{ padding: '16px', fontFamily: 'sans-serif', fontSize: '13px', color: '#374151' }}>
      <p style={{ margin: '0 0 8px', fontWeight: 600 }}>Select Map</p>
      <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#6B7280' }}>
        Choose the map this widget will connect to.
      </p>
      <MapWidgetSelector
        useMapWidgetIds={props.useMapWidgetIds}
        onSelect={(ids) => props.onSettingChange({ id: props.id, useMapWidgetIds: ids })}
      />
    </div>
  )
}