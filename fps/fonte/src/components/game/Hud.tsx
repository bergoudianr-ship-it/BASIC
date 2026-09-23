import { memo } from 'react'

/* HUD em JSX. Renderiza uma única vez (memo sem props): depois disso o motor
   atualiza os elementos direto pelo id a cada quadro, sem passar pelo React. */
export const Hud = memo(function Hud() {
  return (
    <>
      <canvas id="scene" />

      <div id="hud" className="hidden">
        <div id="vignette" />
        <div id="flash" />

        <div className="veil veil-tl" /><div className="veil veil-tc" /><div className="veil veil-tr" />
        <div className="veil veil-bl" /><div className="veil veil-br" />

        <div id="scope">
          <div id="breath">SHIFT · PRENDER A RESPIRAÇÃO</div>
          <div className="lens">
            <i className="rv" /><i className="rh" /><i className="dot" />
            <i className="mil v1" /><i className="mil v2" /><i className="mil v3" />
            <i className="mil hl1" /><i className="mil hl2" />
            <i className="mil hr1" /><i className="mil hr2" />
            <span className="tint" />
          </div>
        </div>

        <div id="hud-tl">
          <canvas id="minimap" width={272} height={272} />
          <div id="map-label"><span id="map-name">FERRO-VELHO</span><span id="map-diff">VETERANO</span></div>
        </div>

        <div id="compass">
          <div id="compass-deg">000</div>
          <div id="compass-view"><div id="compass-strip" /><div id="compass-pips" /></div>
        </div>

        <div id="hud-tr">
          <div id="wave-txt">ONDA 01</div>
          <div className="left-row"><span id="enemies-left">0</span><span className="left-l">RESTANTES</span></div>
          <div id="score"><span className="s" id="score-val">0</span><span className="l">PTS</span></div>
          <div id="credits"><span className="s" id="credits-val">0</span><span className="l">CR</span></div>
          <div id="streak" />
          <div id="killfeed" />
        </div>

        <div id="crosshair">
          <div className="ln" id="ch-t" /><div className="ln" id="ch-b" />
          <div className="ln" id="ch-l" /><div className="ln" id="ch-r" />
          <div id="ch-dot" />
        </div>
        <div id="hitmarker"><span /><span /><span /><span /></div>
        <div id="dmg-dirs" />
        <div id="reload-bar"><i /></div>

        <div id="health-wrap">
          <div id="armor-bar" aria-label="Colete"><div id="armor-fill" /><i className="notch n1" /><i className="notch n2" /></div>
          <div className="vit-row">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--danger)" strokeWidth="1.6" aria-hidden="true">
              <path d="M8 14S2 10.2 2 6.2A3.2 3.2 0 0 1 8 4.4 3.2 3.2 0 0 1 14 6.2c0 4-6 7.8-6 7.8z" />
            </svg>
            <div id="health-bar"><div id="health-fill" /></div>
            <span id="health-num">100</span>
          </div>
          <div className="vit-row small">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <circle cx="8" cy="9.5" r="4.2" /><path d="M6.4 5.2h3.2M8 5.2V3.2M9.6 3.2l1.8-1" />
            </svg>
            <span id="gren-num">2</span>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <rect x="5" y="3.5" width="6" height="10" rx="1" /><path d="M6 3.5V2h4v1.5" />
            </svg>
            <span id="tac-num">1</span>
            <span id="stance" />
          </div>
        </div>

        <div id="weapons" />
        <div id="ammo-wrap">
          <div className="wline"><span id="weapon-name">M4A1</span><span className="wsep" /><span id="fire-mode">AUTOMÁTICO</span></div>
          <div id="ammo"><span className="mag">30</span><span className="res"> / 210</span></div>
          <div id="mag-pips" />
          <div id="reload-hint">RECARREGAR [R]</div>
        </div>

        <div id="wave-banner"><div className="big">ONDA 1</div><div className="sub">PREPARE-SE</div></div>
      </div>

      <div id="touch" className="hidden">
        <div className="pad" id="tstick"><i /></div>
        <div className="pad" id="tfire">ATIRAR</div>
        <div className="pad" id="treload">R</div>
        <div className="pad" id="tjump">↑</div>
      </div>
    </>
  )
})
