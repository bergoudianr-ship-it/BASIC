# Simulador FA CCEE

Simulador semanal do **Fator de Alavancagem** conforme Manual de Monitoramento Prudencial CCEE v2023.2.0.

## Stack
- **Backend**: Python 3.12 + `http.server` nativo (sem frameworks)
- **Frontend**: HTML/CSS/JS vanilla em arquivo único (`static/index.html`)
- **Cálculos**: `calculadora_fa.py` — fiel aos Quadros 3–29 do Manual
- **Planilhas**: `openpyxl` para leitura da planilha CCEE e geração do modelo
- **Gráficos**: Chart.js via CDN
- **Persistência**: arquivos JSON locais em `data/`

## Estrutura
```
simulador_fa/
├── main.py                  # Servidor HTTP + roteamento REST
├── calculadora_fa.py        # Lógica de cálculo do FA (Manual CCEE)
├── planilha_handler.py      # Parser planilha CCEE + gerador modelo .xlsx
├── iniciar.bat              # Script de inicialização (Windows)
├── data/
│   ├── premissas.json       # Parâmetros semanais (forward, vol, stress)
│   ├── empresa.json         # Portfólio e PLA da empresa
│   └── historico.json       # Série temporal semanal
├── static/
│   └── index.html           # Frontend completo
└── templates/               # Modelos gerados
```

## Como usar

### 1. Instalar dependência
```bash
pip install openpyxl
```

### 2. Iniciar o servidor
```bash
python main.py
# ou duplo-clique em iniciar.bat (Windows)
```

Acesse: **http://localhost:8765**

### 3. Fluxo semanal
1. **Aba Premissas** → Carregue a planilha semanal da CCEE/DCIDE (.xlsx)
2. **Aba PLA** → Informe o Patrimônio Líquido e as deduções do Anexo I
3. **Aba Portfólio** → Declare as exposições (Preço Fixo, PV, Derivativos, EFM)
4. **Aba Cálculo** → Visualize FA Risco, FA Divulgado, VaR, Stress, Consolidado
5. **Botão "Registrar no Histórico"** → Salva o snapshot semanal

## Cálculo (Manual CCEE v2023.2.0)

| Fórmula | Descrição |
|---|---|
| `MtM = NET × Forward × Horas` | Mark-to-Market por submercado |
| `VaR = φ × |NET × Fwd × h| × σ × √D` | VaR Paramétrico (K=0, θ=0) |
| `RWA = VaR_Total` | Período sombra |
| `FA_Risco = RWA / PLA` | Fator de Alavancagem |
| `FA_Div = max(0, (RWA − Res.Fin.) / PLA)` | FA Divulgado |

**Parâmetros período sombra**: K=0, θ=0, ρ=1, φ = -1,6449 (IC 95%)

## Abas da interface
- **Premissas** — Upload planilha CCEE + edição manual de parâmetros
- **Patrimônio Líquido Ajustado** — PL bruto + deduções Anexo I
- **Declaração Portfólio** — Preço Fixo / Preço Variável / Derivativos / EFM
- **Cálculo VaR / Consolidado** — Resultados completos + gráficos
- **Histórico** — Série temporal com exportação CSV
