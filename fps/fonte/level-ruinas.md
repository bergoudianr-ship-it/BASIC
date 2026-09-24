# Level: RUÍNAS

v1.0 · 2026-09-24 · status: **montado (dress + FX), ainda sem playtest com pessoas**

## Intenção
**Fantasia do jogador:** atravessar uma cidade que acabou de cair, com o cenário ainda vivo: fogo nos carros, fio soltando faísca, drones no céu.
**Arco de ritmo:** leitura (bulevar aberto) → tensão (vitrine e viaduto) → pico (disputa do viaduto) → alívio (becos laterais).
**Momento que o jogador deve lembrar:** subir a laje caída até o viaduto e ver o bulevar inteiro lá de cima.
**Referência de clima:** Aftermath, Black Ops 2. O layout é original.

## Especificação do layout
**Forma:** três faixas norte–sul (padrão de mapa de mata-mata), 90 × 90 m.
**Spawns:** time do jogador ao sul (z ≈ +40), inimigos ao norte (z ≈ −40).

```
            N (spawn inimigo)
 ┌─────────────────┬───────────────┬────────────────────────┐
 │ casca NO        │ praça norte   │  rampa N ↓   casca NE  │
 │ beco oeste      │  laje caída   │ ┌────────┐             │
 │ caçambas        │               │ │VIADUTO │  PRÉDIO     │
 │                 │ LOJA          │ │ 4,2 m  │  DESABADO   │
 │ laje no muro    │ (vitrine x=−11│ │ carro  │  (ninho a   │
 │                 │  teto caído)  │ │barreira│   4,2 m)    │
 │                 │   BULEVAR     │ └────────┘             │
 │ carro           │ ônibus, carros│  rampa S ↑   cratera   │
 │ casca SO        │ posto/barreira│              casca SE  │
 └─────────────────┴───────────────┴────────────────────────┘
            S (spawn do jogador)
```

| Zona | Tamanho | Função | Cobertura |
|---|---|---|---|
| Bulevar (x −7 a 7) | 14 × 90 m | linha longa, quebrada pelo ônibus e pelos carros | barreiras escalonadas, 4 carros, ônibus |
| Loja (x −25 a −11) | 14 × 32 m | combate curto; vitrine dá visão do bulevar | balcão, prateleiras, laje do teto, 2 pilares |
| Beco oeste (x −44 a −25) | 19 × 90 m | flanco da loja | caçambas, carro, laje apoiada no muro, entulho |
| Viaduto (x 8,5 a 15,5) | 7 × 36 m a 4,2 m | **posição de poder** disputada pelos dois lados | parapeito de barreiras com falhas, carro no meio |
| Prédio desabado (x 22 a 39) | 17 × 17 m | segundo ponto alto (ninho a 4,2 m), beco sem saída | pilares, lajes empilhadas, entulho |
| Leste aberto | — | rota rápida entre cratera e cascas | cratera, cascas NE e SE, barreiras |

## Posições de poder e contra-jogo
| Posição | Acesso | Vê | Contra |
|---|---|---|---|
| Viaduto | rampa sul (lado do jogador) e rampa norte (lado inimigo) | bulevar inteiro, entrada da loja | parapeito baixo (0,81 m); do ninho leste dá para atirar de lado; embaixo não há cobertura contra quem desce |
| Ninho do prédio desabado | só pela laje inclinada (beco sem saída) | viaduto e leste | risco alto: uma saída, fica de costas para o leste |
| Vitrine da loja | por dentro | bulevar | o vidro inteiro **não para a bala**; os vãos estourados expõem |

## Encontros esperados
| ID | Onde | Situação | Opções táticas | Recuo |
|---|---|---|---|---|
| E01 | Posto de barreiras (z 30) | primeiro contato no bulevar | avançar por trás do carro em chamas; flanquear pela calçada oeste | barreiras do posto |
| E02 | Entrada da loja (porta z −6) | combate curto sob o teto desabado | entrar pela porta ou pular o peitoril de um vão estourado | fundos da loja → beco |
| E03 | Rampa sul do viaduto | disputa do alto | subir direto; granada de fumaça na rampa; atirar do ninho leste | pilares sob o viaduto |
| E04 | Cratera (29, 12) | travessia exposta no leste | contornar pela casca SE; correr entre as pedras do anel | barreira em (19,5; 8) |

## Leitura (checklist)
- [x] Marco visível de qualquer ponto: arranha-céus partidos no horizonte e colunas de fumaça ao norte.
- [x] Rotas principais mais claras que as secundárias: asfalto escuro no bulevar e no viaduto; poeira clara no resto.
- [x] Fogo marca rotas: carro em chamas perto do spawn sul, cratera em chamas no leste.
- [ ] Todo inimigo visível antes de alcançar o jogador — **[PLACEHOLDER] validar em playtest** (a loja e o prédio desabado têm cantos cegos).
- [ ] Bots não prendem nas rampas em degrau — **[PLACEHOLDER] observar em partidas longas** (teste automático curto, ~14 s de jogo com 11 bots, não mostrou travamento).

## História no cenário
Os carros queimados estão virados em direções diferentes (pânico); o ônibus parou atravessado; o viaduto caiu nas duas pontas;
a loja tem fuligem sobre cada vão estourado e rajadas de tiro só nos pilares (alguém se protegeu atrás deles);
o poste torto puxou os fios e um deles ainda solta faísca na pista.

## Números para ajustar em playtest
| Variável | Valor | Nota |
|---|---|---|
| Altura do viaduto | 4,2 m | [PLACEHOLDER] se dominar demais, baixar para 3,6 m ou abrir mais falhas no parapeito |
| Vida do drone | 60 (3 tiros de M4) | [PLACEHOLDER] recompensa só visual por enquanto |
| Volta do drone | 25 s | [PLACEHOLDER] |
| Névoa | 35 a 210 m | [PLACEHOLDER] se o atirador de elite ficar fraco demais, afastar |
