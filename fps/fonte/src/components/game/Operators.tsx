import { useEffect, useRef } from 'react'
import { bridge } from '@/game/bridge'
import { useEngine } from './engine-context'
import { Choice } from './Choice'

/* Aba OPERADORES: lista + prévia 3D girando (renderizador próprio do motor). */
export function Operators() {
  const api = useEngine()
  const { profile, data } = api
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    api.attachPreview(ref.current)
    api.setPreviewActive(true)
    return () => { api.setPreviewActive(false); api.attachPreview(null) }
  }, [api])

  const op = data.OPERATORS.find(o => o.id === profile.op) ?? data.OPERATORS[0]
  return (
    <div className="lo">
      <div className="lo-col">
        <Choice label="OPERADOR" vertical value={profile.op}
          options={data.OPERATORS.map(o => ({
            value: o.id, disabled: !api.unlocked(o),
            label: o.name + (api.unlocked(o) ? '' : ` · ${o.kills} ABATES`),
          }))}
          onChange={v => { profile.op = v; api.saveProfile(); api.refreshPreview(); bridge.bump() }} />
        <div className="lo-sum">{op.desc}</div>
      </div>
      <div className="lo-col">
        <canvas id="op-prev" ref={ref} width={440} height={560} aria-label={`Prévia do operador ${op.name}`} />
        <div className="lock">Abates na carreira: {profile.kills}</div>
      </div>
    </div>
  )
}
