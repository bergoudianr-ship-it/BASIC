# Protótipo de IA — Validação de peça por foto (VALIDADA / NÃO CONFORME)

Protótipo que aprende com **fotos de peças boas** (o "modelo") e, ao receber a foto de uma
peça nova, responde **VALIDADA** ou **NÃO CONFORME**, com uma pontuação de quão diferente
ela está do padrão. É a base de **detecção visual de anomalias** usada na indústria.

> ⚠️ **Importante (você tem só celular):** este programa **não roda no telefone**. Ele roda
> num **computador ou servidor** com Python. O celular acessa pelo navegador, tira/envia a
> foto e recebe o resultado. Veja "Como rodar".

## O que ele faz (e o que não faz)
- ✅ Detecta **defeitos visuais e desvios de forma** (trinca, falha/bolha no revestimento,
  desgaste, oxidação, material faltando) comparando com as peças boas.
- ✅ Funciona treinando **só com peças boas** — não precisa de fotos de defeito.
- ❌ **Não** substitui paquímetro: não dá cota crítica em mm de peça grande com precisão.
- ❌ Precisa de **captura controlada** (câmera na mesma posição, luz e fundo constantes),
  senão dá alarme falso.

Este é um protótipo simples (embedding global com ResNet + vizinho mais próximo). Para
produção com **mapa de calor do defeito** e maior precisão, o passo seguinte é o
**Anomalib / PatchCore** (mesma ideia, mais robusto) — ver "Evolução".

## Como rodar

1. Num computador/servidor com Python 3.10+:
   ```bash
   pip install -r requirements.txt
   ```
2. Coloque de **20 a 50 fotos de peças BOAS** (o modelo) na pasta `pecas_boas/`,
   todas na **mesma condição** (mesmo enquadramento, luz e fundo).
3. Treine o modelo:
   ```bash
   python treinar.py
   ```
   Isso cria `modelo/banco.npy` e `modelo/config.json` (com o limite de decisão).
4. Suba o servidor:
   ```bash
   python servidor.py
   ```
5. No **celular**, abra o endereço mostrado (ex.: `http://IP-DO-PC:8000`) na mesma rede,
   tire a foto da peça e veja **VALIDADA / NÃO CONFORME**.

### Hospedar na internet (acessar de qualquer lugar)
Como você só tem celular, suba o `servidor.py` num servidor barato na nuvem
(qualquer VPS Linux, Render, Railway, etc.) e acesse pelo navegador do telefone.
Recomendo proteger com senha antes de expor na internet.

## Ajuste de sensibilidade
No `modelo/config.json`, o campo `limite` controla o rigor: **menor** = mais rígido (reprova
mais), **maior** = mais tolerante. Comece com o valor sugerido pelo treino e ajuste com
algumas peças reais (boas e ruins).

## Evolução para produção (Anomalib / PatchCore)
- `pip install anomalib` e treinar um `Patchcore` com as mesmas fotos boas dá **mapa de
  calor** mostrando *onde* está o defeito e melhor acurácia.
- Integrar com a câmera fixa da estação e registrar o resultado no histórico da ferramenta
  web (laudo único por peça/lote).
