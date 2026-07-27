"""
Simulador FA CCEE — versão Streamlit
=====================================
App web para simular o Fator de Alavancagem (FA) segundo o Manual CCEE
v2023.2.0 (período sombra: K=0 e θ=0).

Reaproveita integralmente a lógica de cálculo de ``calculadora_fa.py``.

Publicação no Streamlit Community Cloud
---------------------------------------
1. Suba a pasta ``simulador_fa/`` num repositório GitHub.
2. Em https://share.streamlit.io crie um novo app apontando para
   ``simulador_fa/streamlit_app.py``.
3. As dependências estão em ``requirements.txt`` (streamlit, pandas).

Execução local
--------------
    pip install -r requirements.txt
    streamlit run streamlit_app.py
"""

import os
import io
import csv
import json
import datetime as _dt

import pandas as pd
import streamlit as st

from calculadora_fa import calcular_fa, combinar_portfolios, VERTICES, SUBMERCADOS

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, "data")

SUBM_LABELS = {
    "SE/CO": "SUDESTE/CENTRO-OESTE",
    "SUL": "SUL",
    "NE": "NORDESTE",
    "N": "NORTE",
}
DED_ITENS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"]
CAMPOS_VALOR = [
    ("recurso", "RECURSO (MWm)"),
    ("pm_recurso", "PREÇO MÉDIO RECURSO (R$/MWh)"),
    ("requisito", "REQUISITO (MWm)"),
    ("pm_requisito", "PREÇO MÉDIO REQUISITO (R$/MWh)"),
]

st.set_page_config(page_title="Simulador FA CCEE", page_icon="⚡", layout="wide")


# ───────────────────────── IO / estado ──────────────────────────────────────
def _load_json(name, default):
    path = os.path.join(DATA, name)
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return default
    return default


def _empty_section():
    z = lambda: {v: 0.0 for v in VERTICES}
    return {
        "subm": {s: z() for s in SUBMERCADOS},
        "recurso": z(), "pm_recurso": z(), "requisito": z(), "pm_requisito": z(),
    }


def _empty_empresa():
    return {
        "pla": {"pl_bruto": 0.0,
                "deducoes": [{"item": it, "valor": 0.0, "descricao": ""} for it in DED_ITENS]},
        "preco_fixo": _empty_section(),
        "preco_variavel": _empty_section(),
        "derivativos": _empty_section(),
        "efm_regulado": {v: 0.0 for v in VERTICES},
    }


def init_state():
    if "premissas" not in st.session_state:
        st.session_state.premissas = _load_json("premissas.json", {})
    if "empresa" not in st.session_state:
        st.session_state.empresa = _load_json("empresa.json", _empty_empresa())
    if "extra" not in st.session_state:
        st.session_state.extra = _load_json("portfolio_extra.json", _empty_section() | {"ativo": False})
    if "historico" not in st.session_state:
        st.session_state.historico = _load_json("historico.json", [])


# ─────────────────────── conversão dict <-> DataFrame ────────────────────────
def section_to_df(sec):
    """Uma linha por submercado (exposição) + 4 linhas de recurso/requisito."""
    rows, index = [], []
    for s in SUBMERCADOS:
        index.append(SUBM_LABELS[s])
        rows.append([float(sec.get("subm", {}).get(s, {}).get(v, 0) or 0) for v in VERTICES])
    for key, label in CAMPOS_VALOR:
        index.append(label)
        rows.append([float(sec.get(key, {}).get(v, 0) or 0) for v in VERTICES])
    return pd.DataFrame(rows, index=index, columns=VERTICES)


def df_to_section(df):
    sec = _empty_section()
    for i, s in enumerate(SUBMERCADOS):
        for v in VERTICES:
            sec["subm"][s][v] = float(df.iloc[i][v] or 0)
    for j, (key, _label) in enumerate(CAMPOS_VALOR):
        row = df.iloc[len(SUBMERCADOS) + j]
        for v in VERTICES:
            sec[key][v] = float(row[v] or 0)
    return sec


def efm_to_df(efm):
    return pd.DataFrame([[float(efm.get(v, 0) or 0) for v in VERTICES]],
                        index=["Efeitos Financeiros do Mercado Regulado (R$)"], columns=VERTICES)


def df_to_efm(df):
    return {v: float(df.iloc[0][v] or 0) for v in VERTICES}


def _section_editor(titulo, sec, key):
    st.markdown(f"**{titulo}** — exposição por submercado (MWm, posição vendida = negativa)")
    edited = st.data_editor(section_to_df(sec), key=key, use_container_width=True,
                            column_config={v: st.column_config.NumberColumn(v, format="%.4f") for v in VERTICES})
    return df_to_section(edited)


# ─────────────────────────────── cálculo ────────────────────────────────────
def calcular_atual():
    emp = st.session_state.empresa
    prem = st.session_state.premissas
    extra = st.session_state.extra
    ativo = bool(extra.get("ativo"))
    base = combinar_portfolios(emp, extra) if ativo else emp
    res = calcular_fa(base, prem)
    res["extra_ativo"] = ativo
    return res


def fa_color(v, neg):
    if neg or v is None:
        return "gray"
    return "green" if v < 1 else ("orange" if v <= 3 else "red")


def fmt_mi(v):
    return "—" if v is None else f"R$ {v/1e6:,.2f} mi".replace(",", "X").replace(".", ",").replace("X", ".")


# ──────────────────────────────── UI ────────────────────────────────────────
init_state()

st.title("⚡ Simulador FA CCEE")
st.caption("Fator de Alavancagem — Manual CCEE v2023.2.0 · Período sombra (K=0, θ=0) · Curva Forward DCIDE/CCEE")

# Cabeçalho de indicadores — preenchido no fim, após processar todas as abas,
# para refletir as edições feitas nesta mesma execução.
header_ph = st.container()

tab_prem, tab_pla, tab_port, tab_extra, tab_calc, tab_hist = st.tabs(
    ["📋 Premissas", "🏦 PLA", "📊 Portfólio", "➕ Portfólio Extra", "🧮 Cálculo", "📅 Histórico"])

# ---- PREMISSAS ----
with tab_prem:
    p = st.session_state.premissas
    st.subheader("Parâmetros gerais")
    a, b, c, d = st.columns(4)
    p["data_referencia"] = a.text_input("Data de referência", p.get("data_referencia", ""))
    p["phi_norm"] = b.number_input("Intervalo de Confiança (φ)", value=float(p.get("phi_norm", -1.6449)), format="%.4f")
    p["dias_liquidacao"] = c.number_input("Dias para Liquidação (D)", value=int(p.get("dias_liquidacao", 1)), min_value=1, step=1)
    e1, e2 = d.columns(2)
    p["pld_min"] = e1.number_input("PLD mín", value=float(p.get("pld_min", 57.31)), format="%.2f")
    p["pld_max"] = e2.number_input("PLD máx", value=float(p.get("pld_max", 785.27)), format="%.2f")

    st.subheader("Curva Forward DCIDE (R$/MWh)")
    fwd_keys = ["SECO", "SUL", "NE", "N", "I0", "I5", "I8", "I1"]
    fwd_labels = ["SECO/CONV", "SUL – spread", "NORDESTE – spread", "NORTE – spread",
                  "INCENT. 0%", "INCENT. 50%", "INCENT. 80%", "INCENT. 100%"]
    fwd = p.get("forward", {})
    fwd_df = pd.DataFrame(
        [[float(fwd.get(v, {}).get(k, 0) or 0) for v in VERTICES] for k in fwd_keys],
        index=fwd_labels, columns=VERTICES)
    fwd_ed = st.data_editor(fwd_df, key="fwd_ed", use_container_width=True)
    new_fwd = {v: {} for v in VERTICES}
    for i, k in enumerate(fwd_keys):
        for v in VERTICES:
            new_fwd[v][k] = float(fwd_ed.iloc[i][v] or 0)
    p["forward"] = new_fwd

    st.subheader("Volatilidade, Estresse e Horas")
    vsh_rows = {
        "Volatilidade σ": p.get("volatilidades", {}),
        "Estresse Long (R$/MWh)": p.get("stress_long", {}),
        "Estresse Short (R$/MWh)": p.get("stress_short", {}),
        "Horas / Mês": p.get("horas", {}),
    }
    vsh_df = pd.DataFrame([[float(dic.get(v, 0) or 0) for v in VERTICES] for dic in vsh_rows.values()],
                          index=list(vsh_rows.keys()), columns=VERTICES)
    vsh_ed = st.data_editor(vsh_df, key="vsh_ed", use_container_width=True)
    p["volatilidades"] = {v: float(vsh_ed.iloc[0][v] or 0) for v in VERTICES}
    p["stress_long"] = {v: float(vsh_ed.iloc[1][v] or 0) for v in VERTICES}
    p["stress_short"] = {v: float(vsh_ed.iloc[2][v] or 0) for v in VERTICES}
    p["horas"] = {v: float(vsh_ed.iloc[3][v] or 0) for v in VERTICES}

# ---- PLA ----
with tab_pla:
    st.subheader("Patrimônio Líquido Ajustado (Anexo I do Manual CCEE)")
    pla = st.session_state.empresa.setdefault("pla", {"pl_bruto": 0.0, "deducoes": []})
    pla["pl_bruto"] = st.number_input("PL Bruto (R$)", value=float(pla.get("pl_bruto", 0) or 0), step=1000.0, format="%.2f")
    deducoes = pla.get("deducoes", [])
    # normaliza para 8 itens
    ded_map = {d.get("item"): d for d in deducoes}
    novas = []
    st.markdown("**Deduções**")
    for it in DED_ITENS:
        d = ded_map.get(it, {"item": it, "valor": 0.0, "descricao": ""})
        cc1, cc2 = st.columns([1, 3])
        val = cc1.number_input(f"Dedução {it} (R$)", value=float(d.get("valor", 0) or 0), step=1000.0, format="%.2f", key=f"ded_val_{it}")
        desc = cc2.text_input(f"Descrição {it}", value=d.get("descricao", ""), key=f"ded_desc_{it}")
        novas.append({"item": it, "valor": val, "descricao": desc})
    pla["deducoes"] = novas
    total_pla = pla["pl_bruto"] - sum(d["valor"] for d in novas)
    st.metric("PLA Calculado", fmt_mi(total_pla), delta=None)

# ---- PORTFÓLIO ----
with tab_port:
    emp = st.session_state.empresa
    st.subheader("Seção 1 — Preço Fixo, Consumo e Geração")
    emp["preco_fixo"] = _section_editor("Preço Fixo", emp.get("preco_fixo", _empty_section()), "pf_ed")
    st.divider()
    st.subheader("Seção 2 — Preço Variável (PLD+)")
    emp["preco_variavel"] = _section_editor("Preço Variável", emp.get("preco_variavel", _empty_section()), "pv_ed")
    st.divider()
    st.subheader("Seção 3 — Derivativos de Energia")
    emp["derivativos"] = _section_editor("Derivativos", emp.get("derivativos", _empty_section()), "der_ed")
    st.divider()
    st.subheader("Seção 4 — Efeitos Financeiros do Mercado Regulado (ACR, etc.)")
    efm_ed = st.data_editor(efm_to_df(emp.get("efm_regulado", {})), key="efm_ed", use_container_width=True)
    emp["efm_regulado"] = df_to_efm(efm_ed)

    st.divider()
    cbtn1, cbtn2 = st.columns(2)
    if cbtn1.button("💾 Registrar no Histórico", use_container_width=True):
        tt = calcular_fa(emp, st.session_state.premissas)["totais"]
        hoje = st.session_state.premissas.get("data_referencia") or str(_dt.date.today())
        entry = {"data": hoje, "semana": "—", "fa_ris": tt["fa_ris"], "fa_divulgado": tt["fa_divulgado"],
                 "rwa": tt["rwa"], "pnl": tt["pnl"], "res_fin": tt["res_fin"], "pla": tt["pla"],
                 "var_tot": tt["var_tot"], "stest_tot": tt["stest_tot"]}
        hist = [h for h in st.session_state.historico if h.get("data") != hoje]
        hist.append(entry)
        st.session_state.historico = hist
        st.success(f"Registrado: {hoje}")

    # download do modelo de portfólio (CSV, mesmos campos da tela)
    def _modelo_csv(sec_data=None):
        buf = io.StringIO()
        w = csv.writer(buf, delimiter=";")
        w.writerow(["Secao", "Campo", "Submercado"] + VERTICES)
        secoes = [("Preco Fixo - Consumo e Geracao", "preco_fixo"),
                  ("Preco Variavel (PLD+)", "preco_variavel"),
                  ("Derivativos de Energia", "derivativos")]
        campos = [("Exposicao Liquida por Submercado", "subm"), ("Recurso", "recurso"),
                  ("Preco Medio Recurso", "pm_recurso"), ("Requisito", "requisito"),
                  ("Preco Medio Requisito", "pm_requisito")]
        src = sec_data or emp
        for slbl, skey in secoes:
            sec = src.get(skey, _empty_section())
            for clbl, ckey in campos:
                if ckey == "subm":
                    for s in SUBMERCADOS:
                        w.writerow([slbl, clbl, SUBM_LABELS[s]] + [sec["subm"][s][v] for v in VERTICES])
                else:
                    w.writerow([slbl, clbl, ""] + [sec[ckey][v] for v in VERTICES])
        w.writerow(["EFM", "Efeitos Financeiros do Mercado Regulado (ACR etc)", ""] +
                   [src.get("efm_regulado", {}).get(v, 0) for v in VERTICES])
        return buf.getvalue().encode("utf-8-sig")

    cbtn2.download_button("⬇ Baixar Modelo CSV (portfólio atual)", _modelo_csv(),
                          file_name="modelo_portfolio.csv", mime="text/csv", use_container_width=True)

# ---- PORTFÓLIO EXTRA ----
with tab_extra:
    extra = st.session_state.extra
    extra["ativo"] = st.toggle("Ativar Portfólio Extra no cálculo do FA (Real + Extra)", value=bool(extra.get("ativo")))
    st.caption("Ative para somar este portfólio ao real no cálculo do Fator de Alavancagem.")
    st.divider()
    extra["preco_fixo"] = _section_editor("Extra · Preço Fixo", extra.get("preco_fixo", _empty_section()), "xpf_ed")
    extra["preco_variavel"] = _section_editor("Extra · Preço Variável", extra.get("preco_variavel", _empty_section()), "xpv_ed")
    extra["derivativos"] = _section_editor("Extra · Derivativos", extra.get("derivativos", _empty_section()), "xder_ed")
    xefm_ed = st.data_editor(efm_to_df(extra.get("efm_regulado", {})), key="xefm_ed", use_container_width=True)
    extra["efm_regulado"] = df_to_efm(xefm_ed)

    st.divider()
    st.subheader("Comparativo Real × Real + Extra")
    real = calcular_fa(st.session_state.empresa, st.session_state.premissas)["totais"]
    comb = calcular_fa(combinar_portfolios(st.session_state.empresa, extra), st.session_state.premissas)["totais"]

    def _fa(x):
        return "PLA≤0" if x["pla_negativo"] else ("—" if x["fa_ris"] is None else f"{x['fa_ris']:.4f}")

    def _fad(x):
        return "PLA≤0" if x["pla_negativo"] else ("—" if x["fa_divulgado"] is None else f"{x['fa_divulgado']:.4f}")

    def _rs(x):
        return f"{x:,.0f}".replace(",", ".")

    comp = pd.DataFrame({
        "Portfólio Real": [_fa(real), _fad(real), _rs(real["rwa"]), _rs(real["res_fin"]),
                           _rs(real["var_tot"]), _rs(real["mtm"]), _rs(real["stest_tot"])],
        "Real + Extra": [_fa(comb), _fad(comb), _rs(comb["rwa"]), _rs(comb["res_fin"]),
                         _rs(comb["var_tot"]), _rs(comb["mtm"]), _rs(comb["stest_tot"])],
    }, index=["FA Risco", "FA Divulgado", "RWA (R$)", "Res. Financeiro (R$)", "VaR Total (R$)", "MtM (R$)", "Stress Total (R$)"])
    st.dataframe(comp, use_container_width=True)

# ---- CÁLCULO ----
with tab_calc:
    res = calcular_atual()
    pv = res["por_vertice"]
    t = res["totais"]

    st.subheader("VaR Paramétrico por vértice")
    var_df = pd.DataFrame({
        "NET Total (MWm)": [pv[v]["net_total"] for v in VERTICES],
        "MtM (R$)": [pv[v]["mtm"] for v in VERTICES],
        "VaR (R$)": [pv[v]["var"] for v in VERTICES],
        "Stress (R$)": [pv[v]["stest"] for v in VERTICES],
    }, index=VERTICES)
    st.dataframe(var_df, use_container_width=True)

    st.subheader("Exposição NET por submercado (MWm)")
    exp_df = pd.DataFrame({
        "SE/CO": [pv[v]["net_seco"] for v in VERTICES],
        "SUL": [pv[v]["net_sul"] for v in VERTICES],
        "NE": [pv[v]["net_ne"] for v in VERTICES],
        "N": [pv[v]["net_n"] for v in VERTICES],
    }, index=VERTICES)
    st.bar_chart(exp_df)

    g1, g2 = st.columns(2)
    g1.caption("MtM por vértice (R$)")
    g1.bar_chart(pd.DataFrame({"MtM": [pv[v]["mtm"] for v in VERTICES]}, index=VERTICES))
    g2.caption("VaR por vértice (R$)")
    g2.bar_chart(pd.DataFrame({"VaR": [pv[v]["var"] for v in VERTICES]}, index=VERTICES))

    st.subheader("Totais consolidados")
    tot_df = pd.DataFrame({
        "Valor (R$)": [t["res_contr"], t["fin_pv"], t["efm"], t["mtm"], t["pnl"],
                       t["res_fin"], t["var_tot"], t["stest_tot"], t["rwa"], t["pla"]],
    }, index=["Resultado Contratual (PF+DER)", "Financeiro PLD+", "EFM Regulado", "MtM", "PnL",
              "Resultado Financeiro", "VaR Total", "Stress Total", "RWA", "PLA"])
    st.dataframe(tot_df, use_container_width=True)

    ris = "PLA ≤ 0" if t["pla_negativo"] else ("—" if t["fa_ris"] is None else f"{t['fa_ris']:.4f}")
    div = "PLA ≤ 0" if t["pla_negativo"] else ("—" if t["fa_divulgado"] is None else f"{t['fa_divulgado']:.4f}")
    cc1, cc2 = st.columns(2)
    cc1.metric("FA Risco (RWA/PLA)", ris)
    cc2.metric("FA Divulgado", div)

# ---- HISTÓRICO ----
with tab_hist:
    hist = st.session_state.historico
    if not hist:
        st.info("Nenhum registro ainda. Use **Registrar no Histórico** na aba Portfólio.")
    else:
        hdf = pd.DataFrame(hist)
        st.dataframe(hdf, use_container_width=True)
        if "fa_ris" in hdf:
            st.caption("FA Risco × FA Divulgado")
            st.line_chart(hdf.set_index("data")[["fa_ris", "fa_divulgado"]])
            st.caption("RWA × PLA (R$)")
            st.line_chart(hdf.set_index("data")[["rwa", "pla"]])
        st.download_button("⬇ Exportar histórico (CSV)", hdf.to_csv(index=False, sep=";").encode("utf-8-sig"),
                           file_name="historico_fa.csv", mime="text/csv")

# ---- Cabeçalho de indicadores (renderizado no fim, no placeholder do topo) ----
res = calcular_atual()
t = res["totais"]
with header_ph:
    c1, c2, c3, c4, c5 = st.columns(5)
    ris = "PLA ≤ 0" if t["pla_negativo"] else ("—" if t["fa_ris"] is None else f"{t['fa_ris']:.4f}")
    div = "PLA ≤ 0" if t["pla_negativo"] else ("—" if t["fa_divulgado"] is None else f"{t['fa_divulgado']:.4f}")
    c1.metric("FA Risco", ris)
    c2.metric("FA Divulgado", div)
    c3.metric("RWA", fmt_mi(t["rwa"]))
    c4.metric("PLA", fmt_mi(t["pla"]))
    c5.metric("Res. Financeiro", fmt_mi(t["res_fin"]))
    if res.get("extra_ativo"):
        st.info("➕ Portfólio Extra **ativado** — o FA está somando o portfólio extra ao real.")

st.divider()
st.caption("Uso interno · Valores oficiais apurados pela CCEE · Simulação baseada no Manual CCEE v2023.2.0")
