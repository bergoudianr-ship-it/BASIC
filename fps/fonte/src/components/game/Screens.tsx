import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { useUI } from '@/game/bridge'
import { useEngine } from './engine-context'

export function Loading() {
  return (
    <div className="screen" id="loading">
      <div className="spin" />
      <div className="tag m-0">CARREGANDO OPERAÇÃO…</div>
    </div>
  )
}

function SliderRow({ id, label, value, min, max, step, shown, onChange }: {
  id: string; label: string; value: number; min: number; max: number; step: number; shown: string; onChange: (v: number) => void
}) {
  return (
    <div className="slider-row">
      <label htmlFor={id}>{label}</label>
      <Slider id={id} min={min} max={max} step={step} value={[value]} onValueChange={([v]) => onChange(v)} />
      <b>{shown}</b>
    </div>
  )
}

export function PauseMenu() {
  const api = useEngine()
  const s = api.settings
  const map = api.data.MAPS.find(m => m.id === s.map)
  const diff = api.data.DIFFICULTIES.find(d => d.id === s.difficulty)
  return (
    <div className="screen" id="pause">
      <h1 className="pause-t">PAUSADO</h1>
      <div className="tag">MISSÃO EM ANDAMENTO</div>
      <div className="card wide">
        <h3>CONFIGURAÇÕES</h3>
        <div className="setting"><span>Mapa</span><b>{map?.name}</b></div>
        <div className="setting"><span>Dificuldade dos inimigos</span><b>{diff?.name}</b></div>
        <SliderRow id="set-sens" label="Sensibilidade do mouse" min={0.2} max={3} step={0.01}
          value={s.sens} shown={s.sens.toFixed(2)} onChange={v => api.setSetting('sens', v)} />
        <SliderRow id="set-fov" label="Campo de visão (FOV)" min={65} max={110} step={1}
          value={s.fov} shown={String(s.fov)} onChange={v => api.setSetting('fov', v)} />
        <SliderRow id="set-vol" label="Volume" min={0} max={1} step={0.01}
          value={s.volume} shown={String(Math.round(s.volume * 100))} onChange={v => api.setSetting('volume', v)} />
        <div className="setting">
          <label htmlFor="set-invert">Inverter eixo Y</label>
          <Switch id="set-invert" checked={s.invertY} onCheckedChange={v => api.setSetting('invertY', v)} />
        </div>
        <div className="setting">
          <label htmlFor="set-bob">Balanço da câmera</label>
          <Switch id="set-bob" checked={s.bob} onCheckedChange={v => api.setSetting('bob', v)} />
        </div>
      </div>
      <div className="btn-row">
        <button className="btn" id="btn-resume" onClick={() => api.resumeGame()}>CONTINUAR</button>
        <button className="btn sm" id="btn-quit" onClick={() => api.toMenu()}>ABANDONAR</button>
      </div>
    </div>
  )
}

export function GameOver() {
  const api = useEngine()
  const g = useUI().gameover
  if (!g) return null
  const rows: [string, string | number][] = [
    ['Ondas sobrevividas', g.wave], ['Abates', g.kills], ['Tiros na cabeça', g.headshots],
    ['Precisão', g.accuracy], ['Melhor sequência', g.bestStreak], ['Recorde', g.best],
  ]
  return (
    <div className="screen" id="gameover">
      <h1 className={g.title === 'VITÓRIA' ? 'text-[var(--amber)]' : ''}>{g.title}</h1>
      <div className="tag">{g.tag}</div>
      <div className="cols">
        <div className="card">
          <h3>RESULTADO</h3>
          <div className="row"><span>Pontuação</span><b className="stat-big">{g.score}</b></div>
          {rows.map(([k, v]) => <div className="row" key={k}><span>{k}</span><b>{v}</b></div>)}
        </div>
      </div>
      <div className="btn-row">
        <button className="btn" id="btn-retry" onClick={() => api.startGame()}>JOGAR DE NOVO</button>
        <button className="btn sm" id="btn-menu" onClick={() => api.toMenu()}>MENU</button>
      </div>
    </div>
  )
}

/* Loja entre ondas (sobrevivência). Teclas 5–0 compram; no toque, os itens são clicáveis. */
export function Shop() {
  const api = useEngine()
  const ui = useUI()
  if (!ui.shopOpen) return null
  return (
    <div id="shop" className="show" aria-label="Suprimentos">
      <div className="hd">SUPRIMENTOS <b>{ui.shopT}s</b></div>
      <div>
        {ui.shop.map((it, i) => (
          <button key={it.key} className={'it' + (it.can ? '' : ' no')} onClick={() => api.buy(i)}>
            <kbd>{it.key}</kbd><span>{it.name}</span><em>{it.price}</em>
          </button>
        ))}
      </div>
      <div className="ft">Teclas 5–0 compram · Enter pula · créditos não afetam a pontuação</div>
    </div>
  )
}
