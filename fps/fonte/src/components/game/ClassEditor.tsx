import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { bridge, type LoadoutClass, type Weapon } from '@/game/bridge'
import { useEngine } from './engine-context'
import { Choice, MultiChoice } from './Choice'

const MAX_POINTS = 10

function StatBars({ w }: { w: Weapon }) {
  const api = useEngine()
  const s = api.wStat(w)
  const rows: [string, number][] = [['DANO', s.dano], ['CADÊNCIA', s.cad], ['ALCANCE', s.alc], ['MOBILIDADE', s.mob]]
  return (
    <>
      <div className="diff-label mt-4">{w.name} · {w.cal}</div>
      {rows.map(([n, v]) => (
        <div className="bar" key={n}>{n}<Progress value={Math.round(v * 100)} className="h-1 rounded-none bg-[var(--hud-line)]" /></div>
      ))}
    </>
  )
}

/* Aba CRIAR CLASSE: Pick 10 como no Black Ops 2. */
export function ClassEditor() {
  const api = useEngine()
  const { data, profile } = api
  const c = api.activeClass()
  const [msg, setMsg] = useState('')
  const pts = api.classPoints(c)

  const commit = () => { api.saveProfile(); api.applyCosmetics(); bridge.bump() }

  function setField<K extends keyof LoadoutClass>(k: K, v: LoadoutClass[K]) {
    const before = JSON.stringify(c)
    c[k] = v
    if (k === 'pri') c.priAtt = c.priAtt.filter(a => data.ATTACH[a].for.includes(c.pri))
    if (k === 'sec') c.secAtt = c.secAtt.filter(a => data.ATTACH[a].for.includes(c.sec))
    if (api.classPoints(c) > MAX_POINTS) {
      Object.assign(c, JSON.parse(before))
      setMsg('Sem pontos: tire um acessório ou vantagem primeiro.')
    } else setMsg('')
    commit()
  }
  function toggle(list: 'priAtt' | 'secAtt' | 'perks', v: string, max: number) {
    const arr = c[list], i = arr.indexOf(v)
    if (i >= 0) arr.splice(i, 1)
    else if (arr.length >= max) { setMsg('Limite desta categoria atingido.'); return }
    else if (api.classPoints(c) >= MAX_POINTS) { setMsg('Sem pontos: são 10 no total.'); return }
    else arr.push(v)
    setMsg(''); commit()
  }

  const full = pts >= MAX_POINTS
  const attOpts = (weapon: string, list: string[], max: number) =>
    Object.entries(data.ATTACH).filter(([, a]) => a.for.includes(weapon)).map(([id, a]) => ({
      value: id, label: a.name, hint: a.desc, disabled: !list.includes(id) && (full || list.length >= max),
    }))
  const pri = api.moddedWeapon(c.pri, c.priAtt, c.perks)
  const sec = c.sec !== 'nenhuma' ? api.moddedWeapon(c.sec, c.secAtt, c.perks) : null
  const lockLabel = (it: { name: string; kills?: number }) => it.name + (it.kills && !api.unlocked(it) ? ' · ' + it.kills : '')

  return (
    <div className="lo">
      <div className="lo-col">
        <Choice label="CLASSE" value={String(profile.cls)}
          options={profile.classes.map((k, i) => ({ value: String(i), label: `${i + 1} · ${k.name}` }))}
          onChange={v => { profile.cls = +v; setMsg(''); commit() }} />
        <div className="lo-row">
          <label className="diff-label" htmlFor="lo-name">NOME DA CLASSE</label>
          <Input id="lo-name" maxLength={12} value={c.name}
            className="w-56 rounded-none border-[var(--hud-line)] bg-black/35 font-[var(--font-display)] uppercase tracking-[2px]"
            onChange={e => { c.name = (e.target.value || 'CLASSE').toUpperCase().slice(0, 12); commit() }} />
        </div>
        <div className={'pts' + (full ? ' full' : '')} aria-label={`${pts} de 10 pontos usados`}>
          {Array.from({ length: MAX_POINTS }, (_, i) => <i key={i} className={i < pts ? 'on' : ''} />)}
          <span>{pts}/10 PONTOS</span>
        </div>
        <div className="lo-msg" role="status">{msg}</div>

        <Choice label="PRIMÁRIA" value={c.pri} onChange={v => setField('pri', v)}
          options={data.WEAPONS.filter(w => w.slot === 'pri').map(w => ({ value: w.id, label: w.name }))} />
        <MultiChoice label={`ACESSÓRIOS DA PRIMÁRIA · ${c.priAtt.length}/3`} values={c.priAtt}
          options={attOpts(c.pri, c.priAtt, 3)} onToggle={v => toggle('priAtt', v, 3)} />
        <Choice label="SECUNDÁRIA" value={c.sec} onChange={v => setField('sec', v)}
          options={[{ value: 'nenhuma', label: 'NENHUMA' }, ...data.WEAPONS.filter(w => w.slot === 'sec').map(w => ({ value: w.id, label: w.name }))]} />
        {sec && <MultiChoice label={`ACESSÓRIOS DA SECUNDÁRIA · ${c.secAtt.length}/2`} values={c.secAtt}
          options={attOpts(c.sec, c.secAtt, 2)} onToggle={v => toggle('secAtt', v, 2)} />}
        <Choice label="LETAL · G · 2 NO INVENTÁRIO" value={c.leth} onChange={v => setField('leth', v)}
          options={Object.entries(data.LETHALS).map(([id, l]) => ({ value: id, label: l.name, hint: l.desc }))} />
        <Choice label="TÁTICA · F" value={c.tact} onChange={v => setField('tact', v)}
          options={Object.entries(data.TACTICALS).map(([id, t]) => ({ value: id, label: t.name, hint: t.desc }))} />
        <MultiChoice label={`VANTAGENS · ${c.perks.length}/3`} values={c.perks}
          options={Object.entries(data.PERKS).map(([id, p]) => ({ value: id, label: p.name, hint: p.desc, disabled: !c.perks.includes(id) && (full || c.perks.length >= 3) }))}
          onToggle={v => toggle('perks', v, 3)} />
        <Choice label="CAMUFLAGEM DA PRIMÁRIA · 0 PONTOS" value={c.camo} onChange={v => setField('camo', v)}
          options={data.CAMOS.map(cm => ({ value: cm.id, label: lockLabel(cm), disabled: !api.unlocked(cm) }))} />
      </div>

      <div className="lo-col">
        <StatBars w={pri} />
        {sec && <StatBars w={sec} />}
        <div className="lo-sum">
          {[...c.priAtt.map(a => data.ATTACH[a]), ...c.perks.map(p => data.PERKS[p])].map(x => (
            <div key={x.name}><b>{x.name}</b> · {x.desc}</div>
          ))}
        </div>
        <div className="lo-sum">{data.LETHALS[c.leth].desc}<br />{data.TACTICALS[c.tact].desc}</div>
        <div className="lock">Abates na carreira: {profile.kills}</div>
      </div>
    </div>
  )
}
