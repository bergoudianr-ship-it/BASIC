# Operação Blackout — GDD: classes, operadores e realismo

v1.1 · 2026-09-23 · valores [PLACEHOLDER] até playtest

## 1. Pilar novo
**"Minha classe, meu jeito de lutar."** A escolha acontece antes da partida (primária + secundária + letal) e muda como você joga. Os visuais (operador e camuflagem) mostram o seu progresso, mas não dão vantagem.

## 2. Mecânica: Criar classe
| Campo | Definição |
|---|---|
| Propósito | Trocar o arsenal de 4 armas por um compromisso: duas armas que se complementam |
| Fantasia | "Eu montei esse kit" (efeito de posse: o jogador escolhe e dá nome à classe) |
| Entrada | Aba CRIAR CLASSE: 3 espaços de classe, nome editável e botões por categoria |
| Saída | `weapons = [primária, secundária]`; teclas 1 e 2, `Q` alterna; 2 granadas letais |
| Persistência | `localStorage.blackout_profile`: IDs inválidos voltam ao padrão e dados corrompidos viram a classe padrão |
| Casos de borda | Camuflagem bloqueada nunca é aplicada, mesmo se estiver salva. Trocar a dificuldade não afeta a classe (os seletores foram isolados) |

**Classes padrão (ensinam três estilos de jogo):**
- **Fuzileiro:** M4A1 + M9 + Frag.
- **Assalto:** MP7 + Desert Eagle + Semtex.
- **Atirador:** AWM + M9 + Frag.

### Secundárias (novas)
| Arma | Dano | Cadência | Pente | Troca | Papel |
|---|---|---|---|---|---|
| M9 (9×19mm) | 30 | 420 | 15+1 | 0,24 s | reserva rápida: acaba com o inimigo quando a primária esvazia |
| Desert Eagle (.50 AE) | 58 | 170 | 7+1 | 0,32 s | 2 tiros no tronco derrubam um soldado (100 de vida). Muito recuo |

### Letais (2 no inventário, máximo 2)
| Letal | Pavio | Comportamento | Decisão do jogador |
|---|---|---|---|
| Frag | 1,75 s | quica | lançar por cima de cobertura e deixar rolar |
| Semtex | 2,0 s | gruda no chão, na parede ou no inimigo | acerto preciso; não passa por trás de cobertura |

O inventário ficou em 2 (antes eram 4). Por isso a +1 grátis por onda e a compra na loja respeitam o limite de 2, e cada granada pesa mais na decisão.

## 3. Operadores e camuflagens (progressão de longo prazo)
**Fonte única:** abates acumulados na carreira (`profile.kills`), salvos a cada 10 abates, ao morrer e ao voltar ao menu. Nunca por pagamento.

| Item | Abates | Justificativa do limite |
|---|---|---|
| Ranger, SEAL | 0 | escolha inicial: dá ao jogador um visual próprio desde a primeira partida |
| Camuflagem Floresta | 25 | ≈ 1 partida boa no Veterano: primeira recompensa rápida |
| Operador Deserto | 50 | ≈ 2 partidas |
| Camuflagem Ártico | 100 | ≈ 4 partidas |
| Operador Ártico | 150 | meio do caminho |
| Camuflagem Ouro | 250 | objetivo de prestígio (como o dourado da sua imagem 1) |
| Operador Ghost | 300 | objetivo máximo |

- Quando um item desbloqueia, aparece "DESBLOQUEADO: …" no killfeed durante o jogo.
- O operador muda as luvas e a manga em primeira pessoa e aparece em 3D, girando, na aba OPERADORES.
- A camuflagem pinta as peças pretas, de polímero e de madeira da primária.

## 4. Realismo de armas
| Mecânica | Regra | Por quê |
|---|---|---|
| Bala na câmara | Recarregar com munição no pente deixa 30+1 (M4, MP7, AWM, pistolas). A Remington 870 fica de fora | como nas armas reais de ferrolho fechado |
| Recarga tática × vazia | tática: 82% do tempo; vazia: 100% (tem que puxar o ferrolho) | premia recarregar antes de esvaziar |
| Tempo para atirar depois de correr | não dá para atirar correndo, nem logo depois: 0,10 s (M9) a 0,34 s (AWM) | correr é uma escolha com custo |
| Respiração na luneta | a mira da AWM balança; `SHIFT` segura por até 4 s; depois fica 2,5 s "SEM FÔLEGO", balançando mais | o tiro de precisão vira uma questão de timing |
| Mira das pistolas | massa de mira com ponto vermelho, alinhada ao centro no ADS | a mesma lógica da mira holográfica |

## 5. Critérios de "quebrado"
- Mais de 70% das partidas usam a mesma classe padrão sem editar: a aba está escondida ou as alternativas são fracas.
- Desert Eagle usada como arma principal (mais abates que a primária): recuo ou dano altos demais.
- Semtex com mais de 2× os abates por granada da Frag: diminuir o raio ou aumentar o pavio.
- Nenhum operador desbloqueado depois de 5 partidas: limites altos demais.

## 6. Pick 10 (como no Black Ops 2)
Cada classe tem **10 pontos**, e cada item custa 1 ponto:
- **Obrigatório:** a primária.
- **Opcionais:** secundária, letal, tática, até 3 acessórios na primária, até 2 na secundária e até 3 vantagens.
- **Grátis:** a camuflagem.
- Abrir mão de um item (ex.: secundária NENHUMA) devolve o ponto. Essa troca é a decisão central do sistema.

| Acessório | Efeito | Armas |
|---|---|---|
| Supressor | seu tiro só alerta inimigos a 10 m (sem supressor: 70 m); alcance −15%; som abafado | todas, menos a 870 |
| Empunhadura | recuo −30% | M4, MP7, 870 |
| Mira laser | dispersão sem mirar −40% | todas |
| Pente estendido | pente +50%, recarga +10% | todas |
| Cano longo | alcance +40% | todas, menos a M9 |
| Mira rápida | entra na mira 40% mais rápido | todas |

| Vantagem | Efeito |
|---|---|
| Mãos rápidas | recarga −35% |
| Leveza | velocidade +12% |
| Mira firme | dispersão sem mirar −35% |

Supressor, laser, empunhadura e pente aparecem no modelo da arma.

**Inimigos precisam te encontrar:** sem linha de visão, o inimigo vai até a última posição que conhece. Essa posição se atualiza quando você atira sem supressor e, fora disso, a cada 3 s na sobrevivência ou 7 s no mata-mata. É isso que dá valor ao supressor.

## 7. Granadas táticas (tecla F, 1 por vida ou onda)
| Tática | Efeito | Contra-indicação |
|---|---|---|
| Atordoante | quem está a até 12 m fica até 4 s mais lento (25%), cambaleando e sem atirar | pega você também se estiver a menos de 9 m e olhando: a tela fica branca |
| Fumaça | nuvem com 5 m de raio por 12 s; depois de 1 s, bloqueia a linha de visão dos bots nos dois sentidos | você também não vê através dela |

## 8. Modo Mata-mata 6×6 (bots infinitos)
- **Equipes:** você + 5 aliados (equipe A, com o uniforme do seu operador e um marcador azul acima da cabeça) contra 6 inimigos.
- **Renascimento:** todos renascem em 4 s, sem fim. O ponto escolhido é o do lado da sua equipe mais longe dos inimigos (lógica de spawn seguro do BO2).
- **Alvos:** cada bot mira no oponente mais próximo (o jogador pesa 10% a mais) e o reavalia a cada 0,6–1 s. Bots também se matam entre si: o placar e o killfeed mostram "ALIADO BATEDOR ▸ BATEDOR".
- **Placar:** fim em 50 abates, 100 abates ou sem limite (o padrão, como você pediu). Ao atingir o limite: tela de VITÓRIA ou DERROTA.
- **Fogo amigo:** desligado. A bala para no aliado e as explosões não o ferem.
- **Sequências:** UAV com 3 abates e helicóptero com 7 (no mata-mata não há loja).
- **Minimapa:** aliados sempre em azul. Inimigos só aparecem à vista, ao disparar ou com UAV.

**Critério de "quebrado":** menos de 1 abate por minuto no total indica que os bots não se encontram (mapas grandes demais). Uma equipe à frente por mais de 3× indica spawn injusto.

## Changelog
- v1.1: Pick 10 (acessórios, vantagens, itens opcionais), granadas táticas (atordoante, fumaça), modo Mata-mata 6×6 com bots infinitos, inimigos que perdem sua posição sem linha de visão.
- v1.0: aba Criar classe (3 espaços), 2 pistolas, Semtex, operadores, camuflagens, bala na câmara, recarga tática, tempo para atirar depois de correr, respiração na luneta.
