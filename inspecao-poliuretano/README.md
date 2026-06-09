# Inspeção PU — medidas por foto

Ferramenta web (1 arquivo, funciona offline no celular) para **inspeção dimensional**
de peças de poliuretano usando só a câmera do telefone. Você cadastra uma **peça boa**
como padrão e a ferramenta compara as próximas peças, apontando o que está **fora da
tolerância**.

## Como usar

Abra `index.html` no navegador do celular (Chrome/Safari). Nada é enviado para a
internet — tudo roda no aparelho e os padrões ficam salvos no próprio navegador.

**Botões de foto:** **📷 Câmera** abre a câmera ao vivo (com fallback para a câmera do
sistema se o navegador bloquear). **🖼️ Minhas fotos** abre a galeria do celular.

### Vistas (fotos) e profundidade
Uma foto de cima dá **diâmetros/larguras**. **Profundidade, altura e espessura do
revestimento não saem de uma foto de cima** — para isso, adicione uma **segunda foto**
**lateral** ou **de corte/seção**. Cada foto tem sua própria escala (sua própria moeda).
Use a faixa de miniaturas para alternar entre as vistas; cada medida fica marcada pelo
seu **tipo** (diâmetro, altura, profundidade, espessura do revestimento).

### Escala com moeda
Selecione a moeda usada (R$1 = 27 mm, R$0,50 = 23 mm, R$0,25 = 25 mm, R$0,10 = 20 mm,
R$0,05 = 22 mm, ou cartão = 85,6 mm) — assim você não precisa digitar/lembrar a medida.
Ao marcar a moeda, uma **lupa** aparece para você acertar a borda com precisão (era a
causa de "às vezes não entendia": toque impreciso no diâmetro da moeda).

### 1. Cadastrar uma peça boa (criar padrão)
1. Modo → **Cadastrar peça boa**.
2. Adicione a(s) foto(s) — de cima e, se precisar de profundidade, lateral/corte — cada
   uma com a **moeda no mesmo plano** da medida.
3. **📏 Calibrar** → marque o diâmetro da moeda (use a lupa), escolha a moeda → **Aplicar**.
4. **✏️ Medir** → marque 2 pontos, dê **nome** e **tipo** (diâmetro/profundidade/…).
5. Defina a tolerância (ex.: ±2%) e **Salvar como padrão**.

### 2. Inspecionar uma peça
1. Modo → **Inspecionar peça** e escolha o padrão.
2. Adicione as fotos e calibre cada uma.
3. A ferramenta indica, na ordem, **qual medida e em qual vista** medir.
4. Mostra **APROVADA/REPROVADA**, o desvio de cada medida e um **diagnóstico da causa
   provável** das medidas fora (ex.: revestimento fino/desgaste, sobremedida).

### Backup
Aba **Padrões** → **Exportar (.json)** para salvar/transferir os padrões para outro
celular (**Importar**).

## Precisão e limitações (importante)

- A medição é por **foto 2D**. A precisão depende de:
  - fotografar **perpendicular** ao plano da peça (sem inclinação → sem distorção);
  - o objeto de referência estar **no mesmo plano** da medida;
  - boa iluminação e contraste das bordas.
- **Profundidade/altura/espessura** vêm de uma **foto lateral ou de corte** (não da foto
  de cima). Uma foto sozinha não contém informação de profundidade.
- Não corrige perspectiva/lente automaticamente nesta versão — espere erros maiores
  em peças altas ou fotos anguladas.
- Mede **distâncias entre 2 pontos** marcados à mão (com lupa de precisão); não detecta
  automaticamente as bordas (ainda).

## Ideias para próximas versões
- Calibração por marcador impresso (ArUco) com correção de perspectiva.
- Detecção automática de borda/contorno para medir sem marcar à mão.
- Defeitos de superfície (bolhas, trincas, manchas) por visão computacional.
- Relatório em PDF/foto anotada por peça inspecionada.
