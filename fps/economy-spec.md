# Operação Blackout — Design de loop e economia

v1.1 · 2026-09-23 · valores marcados [PLACEHOLDER] até playtest

## 1. Pilares
1. **Tiroteio seco e legível**: acertar tem que ser bom por si só, sem precisar de efeitos exagerados.
2. **Pressão crescente**: cada onda aperta um pouco mais do que a anterior.
3. **Decisão entre ondas**: o intervalo é hora de escolher, não só de esperar.
4. **A pontuação é honesta**: gastar nunca reduz o placar.

## 2. Loop principal
| Escala | Ação | Retorno | Recompensa |
|---|---|---|---|
| 0–30 s | mirar, atirar, cobrir-se | marcador de acerto, killfeed | pontos + créditos |
| Onda (1–3 min) | limpar todos os inimigos | faixa "ONDA LIMPA" | bônus de CR, +45 de vida, loja |
| Intervalo (12 s) | comprar na loja | resposta imediata no HUD | sobreviver melhor na próxima onda |
| Partida | chegar mais longe | tela final e recorde | melhor pontuação (localStorage) |

**Hipótese de diversão:** "vale gastar agora em sobrevivência ou guardar para aprimorar a arma?"

## 3. Moedas
**Pontos (PTS):** servem de placar e nunca são gastos. Ficam separados dos créditos de propósito: se as compras descontassem pontos, o jogador que compra seria punido no ranking.

**Créditos (CR):** moeda comum, válida só durante a partida (zera a cada partida, então não há inflação entre partidas).
- **Fontes:**
  - abate = 50% dos pontos do abate [PLACEHOLDER];
  - onda limpa = 150 + 40 × número da onda [PLACEHOLDER].
- **Drenos:** a loja (seção 4).
- **Limite:** nenhum. A inflação é controlada pelos drenos exponenciais de aprimoramento e pelo fim da partida.

## 4. Loja de suprimentos (aberta só no intervalo)
| Tecla | Item | Custo | Justificativa |
|---|---|---|---|
| 5 | Munição completa (todas as armas) | 300 | ≈ 6 abates. Mais barato que a vida porque o reabastecimento grátis foi reduzido |
| 6 | Placa de colete +50 | 400 | protege ≈ 83 de dano (absorve 60%). É o item defensivo mais eficiente, por isso o mais caro |
| 7 | Granada +1 (máx. 4) | 250 | limpa grupos; o limite evita estocar |
| 8 | Kit médico (vida cheia) | 350 | a vida já regenera, então só vale quando o jogador está muito ferido |
| 9 | Aprimorar a arma na mão, +12% de dano | 600 / 1.200 / 2.400 | dreno exponencial para o fim da partida. 4 armas × 4.200 = 16.800 CR |
| 0 | Helicóptero de ataque (45 s, entra na onda seguinte) | 2.500 | dreno de prestígio para o fim da partida. Rajadas de 4 tiros de 34 de dano no inimigo mais próximo. Um de cada vez |

**Casos de borda:**
- Item cheio ou no nível máximo: aparece "CHEIO" ou "MÁX", fica desabilitado e não cobra nada.
- Créditos insuficientes: o jogo toca o som de clique vazio e não cobra nada.
- Fora do intervalo: as teclas 5 a 9 não fazem nada.
- Enter encurta o intervalo para 1,5 s.

**Recursos grátis por onda (reduzidos para a loja fazer sentido):**
- munição: de 2,5 para 1,5 pente;
- colete: de +40 para +20;
- continuam iguais: +1 granada e +45 de vida ao limpar a onda.

## 5. Simulação no papel (créditos acumulados até a onda)
Premissas: composição real de inimigos por onda, 20% de headshots, todos os inimigos abatidos.

| Onda | Recruta | Veterano | Elite |
|---|---|---|---|
| 1 | 454 | 520 | 652 |
| 3 | 1.884 | 2.182 | 2.779 |
| 5 | 4.327 | 5.071 | 6.560 |
| 10 | 13.906 | 16.458 | 21.561 |

**Leitura:**
- **Onda 1:** o jogador compra 1 ou 2 consumíveis ou junta para o primeiro aprimoramento. É a escolha que queríamos.
- **Até a onda 10 (veterano):** gastando ~700 CR por onda em consumíveis, sobram ~9.000 CR, o suficiente para deixar só 1 ou 2 armas no nível 3. Isso força a **especialização**.
- **Elite:** paga 40% a mais, compensando a dificuldade.
- **Risco:** depois da onda ~13 no Elite, com tudo aprimorado, a entrada de créditos passa do que dá para gastar (inflação). Gatilho: saldo médio acima de 3.000 CR no intervalo por 3 ondas seguidas. Solução aplicada na v1.1: o helicóptero (2.500 CR), um dreno que pode ser comprado de novo a cada intervalo. Nenhuma fonte foi cortada.

## 6. Critérios de "quebrado" (definir antes do playtest)
- Mais de 60% dos jogadores terminam o intervalo sem comprar nada: preços altos demais ou loja pouco visível.
- Um item concentra mais de 70% das compras: o preço dele está baixo demais.
- Mediana de ondas no Veterano abaixo de 4: os cortes nos recursos grátis foram exagerados.

## 7. Sequências no estilo Black Ops 2
| Sequência | Como consegue | Efeito | Justificativa |
|---|---|---|---|
| UAV | 3 abates sem morrer | por 25 s, o minimapa mostra todos os inimigos | Sem UAV, o minimapa só mostra o inimigo à vista ou que atirou há menos de 1,2 s (como no BO2). Com isso, o UAV vira informação que vale a pena conquistar |
| Helicóptero de ataque | loja, 2.500 CR | apoio aéreo por 45 s | O jogador vê de verdade para onde foram os créditos |

## 8. Notas de level design (estrutura mantida, clima novo)
- **Hora do dia por mapa:**
  - Ferro-Velho: fim de tarde dourado, sol baixo a nordeste.
  - Torre: deserto enevoado, como na imagem 2.
  - Saguão: cidade clara, como na imagem 3.
- **Marcos fora do mapa** (para se orientar sem depender do minimapa):
  - Ferro-Velho: torres de resfriamento com vapor.
  - Torre: mesas de rocha.
  - Saguão: prédios em volta.
- **Destroços em chamas** perto de duas entradas inimigas. O fogo marca por onde o inimigo chega e conta que o lugar está em combate.
- **Céu, névoa e luz:** gradiente com brilho do sol, névoa na cor do horizonte e tone mapping ACES (curva de filme).

## 9. Próximas decisões (fora do escopo desta versão)
- Registro local das compras para calibrar os [PLACEHOLDER].

## Changelog
- v1.1: helicóptero de ataque (dreno para o fim da partida), UAV por sequência, minimapa só com inimigos revelados.
- v1.0: moeda CR separada dos pontos, loja entre ondas, aprimoramento de arma, recursos grátis reduzidos.
