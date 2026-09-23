/* Ponte entre o motor (Three.js, laço de jogo) e a interface em React.
   O motor escreve estado de tela aqui; o React assina com useSyncExternalStore
   e chama o motor pela EngineAPI. A HUD de alta frequência (bússola, mira,
   minimapa) continua imperativa dentro do motor, por desempenho. */
import { useSyncExternalStore } from 'react'

export type Screen = 'loading' | 'menu' | 'playing' | 'paused' | 'gameover'

export interface ShopItemView { key: string; name: string; price: string; can: boolean }

export interface GameOverView {
  title: string; tag: string; score: string; wave: string; kills: number
  headshots: number; accuracy: string; bestStreak: number; best: string
}

export interface UIState {
  screen: Screen
  /** incrementa quando algo no motor muda e a UI precisa reler (perfil, configurações) */
  version: number
  shopOpen: boolean
  shopT: number
  shop: ShopItemView[]
  gameover: GameOverView | null
}

export interface Bridge {
  get(): UIState
  set(patch: Partial<UIState>): void
  bump(): void
}

type Listener = () => void

export function createBridge(): Bridge & { subscribe(l: Listener): () => void } {
  let state: UIState = { screen: 'loading', version: 0, shopOpen: false, shopT: 0, shop: [], gameover: null }
  const listeners = new Set<Listener>()
  const emit = () => listeners.forEach(l => l())
  return {
    get: () => state,
    set(patch) {
      let changed = false
      for (const k of Object.keys(patch) as (keyof UIState)[]) if (state[k] !== patch[k]) { changed = true; break }
      if (!changed) return
      state = { ...state, ...patch }
      emit()
    },
    bump() { state = { ...state, version: state.version + 1 }; emit() },
    subscribe(l) { listeners.add(l); return () => { listeners.delete(l) } },
  }
}

export const bridge = createBridge()
export const useUI = () => useSyncExternalStore(bridge.subscribe, bridge.get)

/* ---- Dados do jogo expostos à interface ---- */
export interface Weapon {
  id: string; name: string; cal: string; mode: string; slot: 'pri' | 'sec'
  damage: number; pellets: number; rpm: number; range: number; switchTime: number
  magMax: number; reload: number
}
export interface Named { id?: string; name: string; desc?: string; kills?: number }
export interface Attachment extends Named { for: string[] }
export interface Operator extends Named { id: string; uni: number; kills: number }
export interface Camo extends Named { id: string; kills: number }
export interface MapDef { id: string; name: string; desc: string }
export interface Difficulty { id: string; name: string; desc: string }

export interface LoadoutClass {
  name: string; pri: string; sec: string; leth: string; tact: string; camo: string
  priAtt: string[]; secAtt: string[]; perks: string[]
}
export interface Profile { classes: LoadoutClass[]; cls: number; op: string; kills: number }

export interface Settings {
  sens: number; fov: number; volume: number; invertY: boolean; bob: boolean
  difficulty: string; map: string; mode: 'sobrevivencia' | 'tdm'; limit: number
}

export interface WeaponStats { dano: number; cad: number; alc: number; mob: number }

export interface EngineAPI {
  startGame(): void
  resumeGame(): void
  toMenu(): void
  buy(index: number): void
  setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void
  saveProfile(): void
  applyCosmetics(): void
  attachPreview(canvas: HTMLCanvasElement | null): void
  setPreviewActive(on: boolean): void
  refreshPreview(): void
  activeClass(): LoadoutClass
  classPoints(c: LoadoutClass): number
  moddedWeapon(id: string, att: string[], perks: string[]): Weapon
  wStat(w: Weapon): WeaponStats
  unlocked(item: { kills?: number }): boolean
  readonly settings: Settings
  readonly profile: Profile
  readonly data: {
    MAPS: MapDef[]; DIFFICULTIES: Difficulty[]; WEAPONS: Weapon[]
    LETHALS: Record<string, Named & { none?: boolean }>
    TACTICALS: Record<string, Named & { none?: boolean }>
    ATTACH: Record<string, Attachment>; PERKS: Record<string, Named>
    OPERATORS: Operator[]; CAMOS: Camo[]
  }
}
