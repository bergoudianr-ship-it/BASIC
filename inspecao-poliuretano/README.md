# Inspeção PU — medidas por foto

Ferramenta web (1 arquivo, funciona offline no celular) para **inspeção dimensional**
de peças de poliuretano usando só a câmera do telefone. Você cadastra uma **peça boa**
como padrão e a ferramenta compara as próximas peças, apontando o que está **fora da
tolerância**.

## Como usar

Abra `index.html` no navegador do celular (Chrome/Safari). Nada é enviado para a
internet — tudo roda no aparelho e os padrões ficam salvos no próprio navegador.

### 1. Cadastrar uma peça boa (criar padrão)
1. Modo → **Cadastrar peça boa**.
2. Tire a foto da peça **de cima, o mais reta possível**, com um **objeto de medida
   conhecida** ao lado (régua, moeda de R$1 = 27 mm, cartão = 85,6 mm de largura).
3. Ferramenta **📏 Calibrar** → toque nas duas pontas do objeto de referência e
   informe o tamanho real em mm → **Aplicar**.
4. Ferramenta **✏️ Medir** → toque em 2 pontos para cada dimensão e dê um nome
   (ex.: "Diâmetro externo", "Altura").
5. Defina a tolerância (ex.: ±2%) e **Salvar como padrão**.

### 2. Inspecionar uma peça
1. Modo → **Inspecionar peça** e escolha o padrão.
2. Foto + calibração (igual ao cadastro).
3. Meça, na ordem indicada, as mesmas dimensões do padrão.
4. A ferramenta mostra **APROVADA/REPROVADA** com o desvio de cada medida.

### Backup
Aba **Padrões** → **Exportar (.json)** para salvar/transferir os padrões para outro
celular (**Importar**).

## Precisão e limitações (importante)

- A medição é por **foto 2D**. A precisão depende de:
  - fotografar **perpendicular** ao plano da peça (sem inclinação → sem distorção);
  - o objeto de referência estar **no mesmo plano** da medida;
  - boa iluminação e contraste das bordas.
- Não corrige perspectiva/lente automaticamente nesta versão — espere erros maiores
  em peças altas ou fotos anguladas.
- Mede **distâncias entre 2 pontos** marcados à mão; não detecta automaticamente as
  bordas (ainda).

## Ideias para próximas versões
- Calibração por marcador impresso (ArUco) com correção de perspectiva.
- Detecção automática de borda/contorno para medir sem marcar à mão.
- Defeitos de superfície (bolhas, trincas, manchas) por visão computacional.
- Relatório em PDF/foto anotada por peça inspecionada.
