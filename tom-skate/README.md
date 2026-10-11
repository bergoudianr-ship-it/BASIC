# Tom Skate (versão para celular)

Jogo de skate em HTML5 (Construct 2) trazido de
[Hiamlinh2k/Tom-Skate](https://github.com/Hiamlinh2k/Tom-Skate), ajustado para
jogar no celular.

## Como jogar

- **Celular:** deslize o dedo **para cima** ou **para baixo** para trocar de
  faixa, desviar dos obstáculos e pegar moedas. Jogue com o celular deitado.
- **Computador:** clique e **arraste o mouse** para cima ou para baixo.

Abra `index.html` por um servidor web (GitHub Pages, raw.githack etc.).
Abrindo o arquivo direto do disco (`file://`), o jogo não carrega.

### Tela cheia

- **Android (Chrome, Samsung Internet, Firefox):** o primeiro toque coloca o
  jogo em tela cheia e trava a tela na horizontal.
- **iPhone (Safari):** o Safari não deixa sites entrarem em tela cheia. Para
  jogar sem as barras do navegador, toque em **Compartilhar → Adicionar à Tela
  de Início** e abra o jogo pelo ícone.

## O que mudou em relação ao original

- Sem o iframe fixo de 900×500: o jogo ocupa a tela toda e se ajusta a
  qualquer tamanho, mantendo a proporção.
- Aviso "Gire o celular" quando o aparelho está em pé.
- Tela cheia e trava na horizontal no primeiro toque (Android).
- Áudio destravado no primeiro toque. O runtime de 2016 não fazia isso, então
  os navegadores atuais deixavam o jogo mudo.
- Música e som de batida convertidos também para `.m4a`. No original eles só
  existiam em `.ogg`, que o iPhone não toca.
- Jogo centralizado por CSS. Em tela cheia fora do Chrome, o runtime somava
  uma margem extra e empurrava o jogo para o lado.
- Removido o `offline.appcache` (recurso obsoleto que podia manter versões
  antigas em cache). O manifesto do app agora pede orientação horizontal.
