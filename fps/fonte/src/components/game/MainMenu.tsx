import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useEngine } from './engine-context'
import { Choice } from './Choice'
import { ClassEditor } from './ClassEditor'
import { Operators } from './Operators'

const K = ({ children }: { children: string }) => <span className="k">{children}</span>

export function MainMenu() {
  const api = useEngine()
  const { settings: s, data, profile } = api

  const c = api.activeClass()
  const pri = data.WEAPONS.find(w => w.id === c.pri)!
  const sec = data.WEAPONS.find(w => w.id === c.sec)
  const leth = data.LETHALS[c.leth], tact = data.TACTICALS[c.tact]
  const mapDesc = data.MAPS.find(m => m.id === s.map)?.desc
  const diffDesc = data.DIFFICULTIES.find(d => d.id === s.difficulty)?.desc

  return (
    <div className="screen" id="menu">
      <h1>OPERAÇÃO <em>BLACKOUT</em></h1>
      <div className="tag">{s.mode === 'tdm' ? 'MATA-MATA 6×6 · BOTS INFINITOS' : 'MODO SOBREVIVÊNCIA · ONDAS INFINITAS'}</div>
      <button className="btn" id="btn-play" onClick={() => api.startGame()}>INICIAR MISSÃO</button>
      <div className="diff-desc" id="cls-active">
        CLASSE: {c.name} · {pri.name}{sec ? ' + ' + sec.name : ''} · {api.classPoints(c)}/10
      </div>

      <Tabs defaultValue="missao" className="w-full">
        <TabsList className="tabs h-auto w-auto bg-transparent p-0 rounded-none">
          <TabsTrigger value="missao" className="tab rounded-none shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none">MISSÃO</TabsTrigger>
          <TabsTrigger value="classe" className="tab rounded-none shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none">CRIAR CLASSE</TabsTrigger>
          <TabsTrigger value="operador" className="tab rounded-none shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none">OPERADORES</TabsTrigger>
        </TabsList>

        <TabsContent value="missao" className="tab-missao mt-0">
          <div id="mode-pick">
            <Choice label="MODO" value={s.mode} onChange={v => api.setSetting('mode', v as 'sobrevivencia' | 'tdm')}
              options={[{ value: 'sobrevivencia', label: 'SOBREVIVÊNCIA' }, { value: 'tdm', label: 'MATA-MATA 6×6' }]} />
            {s.mode === 'tdm' && (
              <Choice value={String(s.limit)} onChange={v => api.setSetting('limit', +v)}
                options={[{ value: '50', label: '50 ABATES' }, { value: '100', label: '100 ABATES' }, { value: '0', label: 'SEM LIMITE' }]} />
            )}
            <div className="diff-desc">
              {s.mode === 'tdm'
                ? 'Você + 5 aliados contra 6 bots. Todos renascem sem parar. Sequências: UAV (3) e helicóptero (7).'
                : 'Ondas crescentes de inimigos, loja entre ondas. Uma vida.'}
            </div>
          </div>

          <div id="map-pick">
            <Choice label="MAPA" value={s.map} onChange={v => api.setSetting('map', v)}
              options={data.MAPS.map(m => ({ value: m.id, label: m.name, hint: m.desc }))} />
            <div className="diff-desc">{mapDesc}</div>
          </div>

          <div id="diff-pick">
            <Choice label="DIFICULDADE DOS INIMIGOS" value={s.difficulty} onChange={v => api.setSetting('difficulty', v)}
              options={data.DIFFICULTIES.map(d => ({ value: d.id, label: d.name }))} />
            <div className="diff-desc">{diffDesc}</div>
          </div>

          <div className="cols">
            <div className="card">
              <h3>MOVIMENTO</h3>
              <div className="row"><span>Andar</span><b><K>W</K><K>A</K><K>S</K><K>D</K></b></div>
              <div className="row"><span>Correr</span><b><K>SHIFT</K></b></div>
              <div className="row"><span>Pular</span><b><K>ESPAÇO</K></b></div>
              <div className="row"><span>Agachar</span><b><K>CTRL</K> / <K>C</K></b></div>
            </div>
            <div className="card">
              <h3>COMBATE</h3>
              <div className="row"><span>Atirar</span><b>BOTÃO ESQ.</b></div>
              <div className="row"><span>Mirar (ADS)</span><b>BOTÃO DIR.</b></div>
              <div className="row"><span>Recarregar</span><b><K>R</K></b></div>
              <div className="row"><span>Trocar arma</span><b><K>1</K><K>2</K> / <K>Q</K></b></div>
              <div className="row"><span>Letal · Tática</span><b><K>G</K> · <K>F</K></b></div>
              <div className="row"><span>Prender respiração</span><b><K>SHIFT</K> na luneta</b></div>
              <div className="row"><span>Pausar</span><b><K>ESC</K></b></div>
            </div>
            <div className="card">
              <h3>CLASSE ATIVA</h3>
              <div className="row"><span><K>1</K> {pri.name}</span><b>{c.priAtt.length ? c.priAtt.length + ' acess.' : pri.cal}</b></div>
              {sec && <div className="row"><span><K>2</K> {sec.name}</span><b>{sec.cal}</b></div>}
              <div className="row"><span><K>G</K> {leth.name}</span><b>{leth.none ? '' : '×2'}</b></div>
              <div className="row"><span><K>F</K> {tact.name}</span><b>{tact.none ? '' : '×1'}</b></div>
              <div className="row muted"><span>Edite na aba CRIAR CLASSE.</span></div>
            </div>
            <div className="card">
              <h3>OBJETIVO</h3>
              {s.mode === 'tdm' ? (
                <>
                  <div className="row"><span>Mate mais do que a equipe inimiga.</span></div>
                  <div className="row"><span>Aliados têm triângulo azul.</span></div>
                  <div className="row"><span>Você renasce em 4 s.</span></div>
                </>
              ) : (
                <>
                  <div className="row"><span>Elimine todas as ondas de inimigos.</span></div>
                  <div className="row"><span>Tiros na cabeça valem <b>2.5×</b> de dano.</span></div>
                  <div className="row"><span>Cada onda fica mais difícil.</span></div>
                </>
              )}
              <div className="row muted"><span>Abates na carreira: {profile.kills}</span></div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="classe" className="mt-0"><ClassEditor /></TabsContent>
        <TabsContent value="operador" className="mt-0"><Operators /></TabsContent>
      </Tabs>

      <div className="note">CLIQUE PARA CAPTURAR O MOUSE · ESC PARA LIBERAR</div>
    </div>
  )
}
