# Operação Blackout — versão React

FPS no navegador (Three.js r128) com interface em React 18 + TypeScript + Tailwind + shadcn/ui.

## Rodar
```bash
pnpm install
pnpm dev            # desenvolvimento
bash scripts/bundle-artifact.sh   # gera bundle.html (arquivo único)
```

## Estrutura
- `src/game/engine.ts` — motor do jogo (cena, física, bots, ondas, mata-mata, economia). Portado do arquivo único;
  sem checagem de tipos interna (`// @ts-nocheck`).
- `src/game/bridge.ts` — ponte tipada entre motor e React (`useUI`, `EngineAPI`, tipos de classe/perfil/configurações).
- `src/game/game.css` — tokens e estilos da HUD e das telas.
- `src/components/game/Hud.tsx` — HUD em JSX, renderizada uma vez; o motor atualiza por id a cada quadro.
- `src/components/game/MainMenu.tsx` — menu com abas (shadcn Tabs): Missão, Criar classe, Operadores.
- `src/components/game/ClassEditor.tsx` — Pick 10 (ToggleGroup, Input, Progress, Tooltip).
- `src/components/game/Operators.tsx` — operadores com prévia 3D.
- `src/components/game/Screens.tsx` — carregamento, pausa (Slider, Switch), fim de jogo e loja.
