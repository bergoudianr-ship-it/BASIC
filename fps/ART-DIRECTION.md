# Operação Blackout — Direção de arte (documento vivo)

v1.2 · 2026-09-24

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
| Ruínas | médio, leste-nordeste, dourado | `city` | manhã enfumaçada: névoa de poeira, sombras leitosas, cor dessaturada (saturação 0,92, exposição 0,94) |

O céu visível continua procedural (gradiente + disco solar) para o sol bater com a sombra.
Cada mapa pode ter a própria gradação (`grade` em ATMOS): saturação, lift nas sombras, gain nas altas e exposição.
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
| Poeira (Ruínas) | fBm | 0026 | 0,95 / 0 | 0,35 |
| Asfalto rachado | agregado + rede de Voronoi (512 px) | 0020 | 1,0 / 0 | 0,35 |
| Fachada arruinada | manchas + fuligem escorrida + lascas | 0000 | 0,95 / 0 | 0,35 |
| Lataria queimada | metal | 0018 | 0,85 / 0,35 | 0,7 |
| Kit SketchUp: concreto / quebra / vergalhão / entulho / barreira | concreto | 0000 / 0026 / 0018 | 0,95 / 0 (vergalhão 0,8 / 0,5) | 0,35 |
| Vidro de vitrine | trincas e furos desenhados por código (cor + alphaMap) | — | 0,08 / 0,2 | 1,1 |
| Prédios do horizonte | grade de janelas 8 × 8 (triplanar, 24 m por ladrilho) | — | 0,95 / 0 | 0,35 |

**Regra:** material não metálico nunca passa de 0,4 de envMapIntensity com o HDRI (senão estoura em branco, como aconteceu com os capacetes).

## 5. Personagens
- Figura articulada: quadril→joelho e ombro→cotovelo. Frente = +Z local.
- Equipamento: colete porta-placas, 3 bolsos de carregador, bolsa de hidratação, rádio, joelheiras, capacete com suporte de visão noturna.
- Pose base de tiro: mão direita no punho, esquerda no guarda-mão.
- Ciclo de passada: a coxa balança ±0,55 rad e o joelho dobra só na fase de recuperação.
- Áreas de acerto: cabeça (cabeça, capacete), corpo (tronco, colete, quadril), membros (resto).

## 6. Pipeline de modelagem: Trimble SketchUp → jogo
Usado a partir da M4A1 (v1.1). Serve para qualquer arma ou prop rígido.
1. **Modelar no SketchUp (conector MCP)** em medidas reais, em polegadas. Eixo X = cano (a boca do cano em +X), Z = cima.
   Cada peça é um grupo nomeado `peça|material`, com material entre `gBlack`, `gPoly`, `gSteel`, `gGlass` e `dot`.
   Só polígonos convexos (prismas, lofts), sem furos, para a triangulação em leque ser válida.
2. **Revisar pelo render do SketchUp** (miniatura do `save_model`): proporção, silhueta e inclinação do punho e do carregador.
3. **Exportar dentro do próprio SketchUp**: transformações aplicadas, normais para fora de cada peça, coordenadas
   convertidas para o jogo (x = lado, y = cima, z = −cano, em 0,1 mm), com int16 para vértices e uint8 para índices, em base64 e com checksum.
4. **Trazer para o projeto** sem copiar à mão: a resposta grande é salva em arquivo pelo ambiente, o script extrai o base64
   e confere o checksum → `src/game/assets/<arma>-sketchup.ts`.
5. **No jogo** (`sketchupMesh.ts`): decodifica, gera normais com ângulo de vinco de 40° (quinas duras, cilindros suaves)
   e aplica os materiais PBR existentes. Camuflagem e acessórios continuam funcionando.
6. **Mira**: o ponto (`holo_dot`) define o alinhamento do ADS; `adsDot` = distância do olho à mira (M4: 0,21 m, bochecha na coronha).

M4A1 v1: 52 peças, 1.464 triângulos, 33" de comprimento. Arquivo-fonte: `m4a1-blackout.skp` (SketchUp).

**Kit de ruínas (v1.2).** Mesmo pipeline, para props de cenário, em milímetros. Arquivo-fonte: `ruinas-kit.skp`.
| Asset | Peças | Pivô no jogo | Uso |
|---|---|---|---|
| `slab` laje de 2,4 × 1,8 m com borda quebrada e vergalhões | 16 | ponta inteira em x = 0, centrada em z | escalada até 12 m; vira rampa, teto caído e pilha de andares |
| `column` pilar com topo partido e vergalhões expostos | 13 | centro da base | estrutura do prédio desabado e da loja |
| `rubble0-2` três pedras de entulho | 1 cada | centro, 12% enterrada | `InstancedMesh`: montes com colisão e ~140 pedrinhas só visuais |
| `jersey` barreira New Jersey 3,05 m | 1 | centro da base | `InstancedMesh` única para todas as 25 barreiras |
| `drone` quadricóptero | 18 | centro | hélices recentradas giram no próprio eixo; luzes pisca-pisca |
As peças de um asset são juntadas por material (uma laje = 3 draw calls). A colisão não usa a malha:
caixas, rampas em degraus de 0,3 m (`addRamp`) e caixas giradas fatiadas (`addRotCollider`).

## 7. Pós-processamento (qualidade Alta)
SAO → arma em 1ª pessoa → bloom HDR (limiar 1,6) → gradação ACES (lift frio, gain quente, saturação 1,08, vinheta 0,32, grão 0,035, aberração leve) → SMAA.
- O buffer do pós usa depth de 24 bits (`stencilBuffer: true`; sem isso a r128 aloca 16 bits e superfícies próximas, como janelas e decalques, piscam a distância).
- Fogo, faíscas e luzes de drone usam cor HDR (acima de 1): passam do limiar do bloom e continuam visíveis contra o céu claro de dia.

## 7b. Mapa Ruínas: linguagem visual
Referência de clima: o mapa Aftermath do Black Ops 2 (Los Angeles destruída). O layout é original; o que vem da referência é a leitura:
- **Paleta:** poeira bege-acinzentada, concreto claro, lataria marrom-escura, fogo laranja como único acento quente.
- **Formas de destruição:** lajes inclinadas com vergalhão, pilares partidos, fachadas sem o prédio atrás, janelas vazadas, prédios altos no horizonte.
- **Vida no cenário:** fios de poste cruzando a rua (um arrebentado soltando faísca), drones patrulhando, fumaça subindo ao longe, poeira no ar.
- **Vitrine:** vidro trincado com furos de bala (o tiro atravessa e deixa a estrela de trinca) e vãos estourados só com cacos na moldura.
- **Desempenho:** caixas estáticas mescladas por material (de centenas para poucas draw calls, vale para todos os mapas); entulho e barreiras instanciados.
Documento de level design: `level-ruinas.md`.

## 8. Próximas rodadas (ordem de impacto visual)
1. **Mãos e luvas em 1ª pessoa** (a M4 já foi feita no SketchUp; as mãos ainda são blocos). Depois: MP7, AWM, Remington e pistolas pelo mesmo pipeline.
2. **Carros e ônibus do kit SketchUp** (hoje são caixas mescladas): capô amassado, rodas, para-choque caído.
3. **Levar o kit de ruínas aos outros mapas**: lajes e pilares partidos no Ferro-Velho, barreiras na Torre.
4. **Animações de recarga e troca de arma** com as mãos visíveis.
5. **Céu com nuvens volumétricas simples** (camadas de sprites) e névoa de altura.

## 9. Como pedir mudanças (guia de prompt)
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

**Sobre o pedido desta rodada** ("explore o SketchUp e o Three.js e faça ainda mais realista o mapa, baseado no Black Ops 2 igual à imagem"):
o pedido é bom porque traz uma imagem de referência. Ficaria ainda melhor dizendo se é para **mudar os mapas existentes ou criar um novo**
(escolhi criar um novo, Ruínas, e deixar os outros três como estão) e **o que da imagem importa mais** (aqui priorizei lajes com vergalhão,
vitrine trincada, fios, drones e fogo). Exemplo:
> "Crie um mapa novo no clima do Aftermath do BO2 (imagem anexa). Prioridade: lajes quebradas com vergalhão e vitrines trincadas; depois drones e fogo.
> Pode usar o SketchUp para as peças. Tem que rodar bem num notebook."

## Changelog
- v1.2: mapa Ruínas com kit de ruínas modelado no SketchUp (lajes, pilares, entulho, barreiras, drone); vitrines de vidro trincado atravessáveis;
  fios de poste, faíscas HDR, chamas com textura própria, poeira no ar, drones abatíveis; gradação por mapa; depth de 24 bits no pós;
  impactos por material (metal solta faísca); fusão de caixas estáticas em todos os mapas.
- v1.1: M4A1 modelada no Trimble SketchUp e importada como malha; ADS com distância real do olho; preto anodizado com pouco reflexo.
- v1.0: HDRIs e normal maps CC0 via npm, triplanar com normal map, soldados articulados, ajuste de reflexo do HDRI.
