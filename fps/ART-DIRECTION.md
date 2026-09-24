# Operação Blackout — Direção de arte (documento vivo)

v1.0 · 2026-09-24

## 1. Norte visual
Referência: Call of Duty Black Ops 2 (2012), mapas de dia e fim de tarde.
Três regras que valem para toda decisão:
1. **Luz conta a hora do dia.** Cada mapa tem sol, céu e HDRI coerentes entre si.
2. **Material antes de polígono.** Uma caixa com bom material lê melhor que um modelo detalhado com material chapado.
3. **Silhueta legível a 30 m.** Soldado, arma e cobertura precisam ser reconhecíveis pela forma, não só pela cor.

## 2. Pipeline de assets (o que funciona neste ambiente)
| Fonte | Acesso | Uso |
|---|---|---|
| npm `@pmndrs/assets` (CC0) | liberado | HDRIs (Poly Haven) e normal maps |
| `three/examples/jsm` (MIT) | liberado | pós-processamento, EXRLoader |
| Poly Haven, ambientCG, Sketchfab, CDNs | **bloqueados** pela rede do ambiente | — |

Todos os assets são embutidos em base64: o jogo continua sendo um único HTML e funciona offline.
Assets em `src/game/assets/` (ver README e licença ali).

## 3. Iluminação por mapa
| Mapa | Sol | HDRI (IBL) | Clima |
|---|---|---|---|
| Ferro-Velho | baixo, nordeste, âmbar | `sunset` | fim de tarde industrial |
| Torre | alto, branco quente | `sky` | deserto enevoado |
| Saguão | médio, neutro | `city` | cidade clara |

O céu visível continua procedural (gradiente + disco solar) para o sol bater com a sombra.
O HDRI entra só como luz de ambiente e reflexo, e chega assíncrono: até decodificar, vale o panorama da CPU.

## 4. Biblioteca de materiais
Todos são PBR (`MeshStandardMaterial`) com mapeamento triplanar, então a textura nunca estica nas caixas.
Albedo procedural + normal map real (mistura "whiteout" nos três eixos).

| Material | Albedo | Normal | Rugosidade/metal | envMapIntensity |
|---|---|---|---|---|
| Terra | fBm | 0026 torrões | 0,95 / 0 | 0,35 |
| Asfalto | agregado | 0020 | 1,0 / 0 | 0,35 |
| Concreto | manchas | 0000 poros | 0,95 / 0 | 0,35 |
| Contêiner | nervura + ferrugem | 0016 | 0,6 / 0,45 | 0,7 |
| Madeira | tábuas | 0004 | 0,8 / 0 | 0,35 |
| Saco de areia | trama | 0027 | 0,95 / 0 | 0,35 |
| Ladrilho | rejunte | 0025 | 0,5 / 0 | 0,35 |
| Uniforme | trama | 0021 (espaço do objeto) | 0,95 / 0 | 0,35 |

**Regra:** material não metálico nunca passa de 0,4 de envMapIntensity com o HDRI (senão estoura em branco, como aconteceu com os capacetes).

## 5. Personagens
- Figura articulada: quadril→joelho e ombro→cotovelo. Frente = +Z local.
- Equipamento: colete porta-placas, 3 bolsos de carregador, bolsa de hidratação, rádio, joelheiras, capacete com suporte de visão noturna.
- Pose base de tiro: mão direita no punho, esquerda no guarda-mão.
- Ciclo de passada: a coxa balança ±0,55 rad e o joelho dobra só na fase de recuperação.
- Áreas de acerto: cabeça (cabeça, capacete), corpo (tronco, colete, quadril), membros (resto).

## 6. Pós-processamento (qualidade Alta)
SAO → arma em 1ª pessoa → bloom HDR (limiar 1,6) → gradação ACES (lift frio, gain quente, saturação 1,08, vinheta 0,32, grão 0,035, aberração leve) → SMAA.

## 7. Próximas rodadas (ordem de impacto visual)
1. **Arma em 1ª pessoa**: é o objeto mais visto do jogo e ainda é o mais "caixote". Modelar com cilindros e chanfros, dar mãos e luvas reais.
2. **Decalques e sujeira**: marcas de bala, manchas de óleo e pichações nos muros (texturas geradas por código).
3. **Mapas com mais verticalidade e props**: postes, fios, carcaças de carro, andaimes (as imagens de referência têm muito disso).
4. **Animações de recarga e troca de arma** com as mãos visíveis.
5. **Céu com nuvens volumétricas simples** (camadas de sprites) e névoa de altura.

## 8. Como pedir mudanças (guia de prompt)
Prompts curtos como "deixe mais realista" funcionam, mas eu acerto mais rápido quando o pedido tem:
- **O quê:** qual parte (luz, materiais, personagens, arma, mapa, efeitos, som).
- **Referência:** uma imagem, um jogo ou um mapa específico ("o mapa Raid do BO2").
- **Prioridade:** o que importa mais se não der para fazer tudo.
- **Limite:** precisa rodar em notebook? No celular?

Exemplo. Em vez de:
> "deixe o jogo mais realista nos gráficos"

prefira:
> "Quero a arma em primeira pessoa parecida com a M4 do Black Ops 2 da imagem anexa: mais detalhada e com mãos de luva.
> Prioridade: a arma, depois as mãos. Precisa continuar rodando bem num notebook."

## Changelog
- v1.0: HDRIs e normal maps CC0 via npm, triplanar com normal map, soldados articulados, ajuste de reflexo do HDRI.
