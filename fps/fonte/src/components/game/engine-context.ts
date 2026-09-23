import { createContext, useContext } from 'react'
import type { EngineAPI } from '@/game/bridge'

export const EngineContext = createContext<EngineAPI | null>(null)

export function useEngine(): EngineAPI {
  const api = useContext(EngineContext)
  if (!api) throw new Error('Motor do jogo ainda não iniciou')
  return api
}
