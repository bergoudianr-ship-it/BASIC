# Operação Blackout — FPS em primeira pessoa

Jogo de tiro em primeira pessoa no estilo *Call of Duty*, modo sobrevivência por ondas.
Roda direto no navegador, sem instalação e sem build.

## Como jogar

Abra `fps/index.html` no navegador. Duas formas:

- **Duplo clique no arquivo** — funciona porque a biblioteca 3D está incluída em `vendor/`.
- **Servidor local** (recomendado, evita restrições de `file://` em alguns navegadores):

  ```bash
  npx http-server . -p 8080
  # depois acesse http://localhost:8080/fps/
  ```

Clique em **INICIAR MISSÃO** e depois na tela para capturar o mouse. `ESC` libera o mouse e pausa.

## Controles

| Ação | Tecla |
|---|---|
| Andar | `W` `A` `S` `D` |
| Correr | `Shift` |
| Pular | `Espaço` |
| Agachar | `Ctrl` ou `C` |
| Atirar | Botão esquerdo |
| Mirar (ADS) | Botão direito |
| Recarregar | `R` |
| Trocar de arma | `1` `2` `3` ou `Q` (arma anterior) |
| Granada | `G` |
| Pausar | `ESC` |

Em celular/tablet aparecem controles de toque: analógico à esquerda, botões à direita,
e arrastar na tela move a mira.

## O jogo

Ondas infinitas de inimigos, cada uma maior e mais letal que a anterior. Ao limpar uma
onda você ganha bônus de pontos, vida, munição, colete e uma granada.

**Arsenal**

| Arma | Modo | Dano | Cadência | Pente |
|---|---|---|---|---|
| M4 Carbine | Automático | 26 | 720 RPM | 30 |
| MP7 SMG | Automático | 18 | 1000 RPM | 40 |
| Escopeta 870 | Bomba | 17 × 9 chumbos | 78 RPM | 7 |

**Inimigos**

- **Soldado** — tropa padrão, equilibrado.
- **Batedor** — rápido e agressivo, briga de perto.
- **Blindado** — 260 de vida, lento, causa muito dano.
- **Atirador** — preciso e de longo alcance, pouca vida.

**Regras que valem a pena saber**

- Tiro na cabeça causa **2,5× de dano** — dois acertos derrubam um soldado.
- A vida **regenera** após ~4 s sem tomar dano; o colete absorve 60% do dano até acabar.
- **Mover-se reduz** a chance de o inimigo acertar; ficar parado é perigoso.
- Mirar (ADS) reduz muito a dispersão; correr e pular aumentam.
- A cada 5 abates seguidos você ganha bônus de pontos, vida e munição.
- Granadas causam dano em área — **inclusive em você**.

## Estrutura

```
fps/
├── index.html          jogo inteiro: cena, IA, HUD, áudio (arquivo único)
├── vendor/
│   └── three.min.js    Three.js r128 (MIT), embutido para funcionar offline
└── README.md
```

Não há dependências para instalar nem etapa de build. Todo o áudio é sintetizado em
tempo real com a Web Audio API (nenhum arquivo de som) e toda a geometria é gerada por
código (nenhum modelo 3D externo). Se `vendor/three.min.js` faltar, a página tenta o CDN
como reserva.

## Notas técnicas

- Colisão por AABB contra uma lista de caixas do cenário; dá para subir em engradados
  e caixotes para ganhar altura.
- Tiro por *raycast* com dispersão dependente de estado (movimento, ADS, agachado, no ar)
  e queda de dano por distância. A escopeta dispara 9 chumbos e o dano é somado por alvo.
- A cadência de tiro usa um acumulador de tempo, então **não depende da taxa de quadros**.
- IA com estados (procurar/engajar), checagem de linha de visão amostrada, desvio de
  paredes e de outros inimigos, e chance de acerto explícita — o que torna o
  balanceamento previsível e ajustável.
- `window.__blackout` expõe uma sonda somente-leitura (tempo, quadros, inimigos,
  estatísticas) usada para diagnóstico e testes automatizados.
