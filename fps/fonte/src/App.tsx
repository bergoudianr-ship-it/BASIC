import { useEffect, useState } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { bridge, useUI, type EngineAPI } from '@/game/bridge'
import { bootEngine } from '@/game/engine'
import { EngineContext } from '@/components/game/engine-context'
import { Hud } from '@/components/game/Hud'
import { MainMenu } from '@/components/game/MainMenu'
import { GameOver, Loading, PauseMenu, Shop } from '@/components/game/Screens'
import '@/game/game.css'

/* O motor sobe uma única vez por página (o laço de jogo e os listeners são globais). */
let engine: EngineAPI | null = null

export default function App() {
  const [api, setApi] = useState<EngineAPI | null>(engine)
  const ui = useUI()

  useEffect(() => {
    if (!engine) engine = bootEngine(bridge)
    setApi(engine)
  }, [])

  return (
    <TooltipProvider delayDuration={250}>
      <Hud />
      {!api || ui.screen === 'loading' ? <Loading /> : (
        <EngineContext.Provider value={api}>
          {ui.screen === 'menu' && <MainMenu />}
          {ui.screen === 'paused' && <PauseMenu />}
          {ui.screen === 'gameover' && <GameOver />}
          {ui.screen === 'playing' && <Shop />}
        </EngineContext.Provider>
      )}
    </TooltipProvider>
  )
}
