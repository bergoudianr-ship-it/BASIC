
## Gráficos
Pausa → **Qualidade gráfica**:
- **Alta:** materiais PBR, oclusão de ambiente (SAO), bloom HDR, gradação ACES com vinheta e grão, SMAA.
- **Média:** bloom e gradação.
- **Baixa:** sem pós-processamento.

Texturas geradas por código (concreto, asfalto, terra, metal corrugado, madeira, tecido, ladrilho) em mapeamento
triplanar, com relevo e rugosidade variável; luz de ambiente (IBL) calculada a partir do céu de cada mapa.
Tudo vem do próprio Three.js (`examples/jsm`), sem baixar nada. Código em `fonte/src/game/graphics.ts`.
