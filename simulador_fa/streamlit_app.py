# -*- coding: utf-8 -*-
"""
Simulador FA CCEE — versão Streamlit
====================================
Este arquivo é o PONTO DE ENTRADA para publicação no Streamlit Community Cloud.
Ele reaproveita, sem alterar, o motor de cálculo original:
    - calculadora_fa.calcular_fa / combinar_portfolios
    - planilha_handler.parse_planilha_ccee / parse_extra_csv /
      gerar_modelo_portfolio / gerar_modelo_extra_csv

O app original (main.py) usava http.server + frontend estático, arquitetura que
o Streamlit Cloud não consegue publicar. Aqui a mesma lógica é exposta numa
interface Streamlit nativa.
"""
import os
import sys
import json
import copy

import pandas as pd
import streamlit as st

# ── Garante que os módulos irmãos sejam importáveis, rode de onde rodar ──────
BASE = os.path.dirname(os.path.abspath(__file__))
if BASE not in sys.path:
    sys.path.insert(0, BASE)
DATA = os.path.join(BASE, "data")

from calculadora_fa import calcular_fa, combinar_portfolios, VERTICES, SUBMERCADOS
from planilha_handler import (
    parse_planilha_ccee, parse_extra_csv,
    gerar_modelo_portfolio, gerar_modelo_extra_csv,
)

SECOES = [("preco_fixo", "Preço Fixo"),
          ("preco_variavel", "Preço Variável"),
          ("derivativos", "Derivativos")]
FLUXO_ROWS = ["recurso", "pm_recurso", "requisito", "pm_requisito"]
FLUXO_LABELS = {"recurso": "Recurso (MWm)", "pm_recurso": "PM Recurso (R$/MWh)",
                "requisito": "Requisito (MWm)", "pm_requisito": "PM Requisito (R$/MWh)"}


# ─── IO defaults ─────────────────────────────────────────────────────────────
def _load_json(name, fallback):
    path = os.path.join(DATA, name)
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return copy.deepcopy(fallback)


def _init_state():
    if "empresa" not in st.session_state:
        st.session_state.empresa = _load_json("empresa.json", {})
    if "premissas" not in st.session_state:
        st.session_state.premissas = _load_json("premissas.json", {})
    if "extra" not in st.session_state:
        st.session_state.extra = _load_json("portfolio_extra.json",
                                            {"ativo": False})


# ─── Conversões dict <-> DataFrame ───────────────────────────────────────────
def _matrix_to_df(matrix, row_keys):
    """{row: {vertice: valor}} -> DataFrame (index=row_keys, cols=VERTICES)."""
    data = {}
    for r in row_keys:
        row = matrix.get(r, {}) or {}
        data[r] = [float(row.get(v, 0) or 0) for v in VERTICES]
    return pd.DataFrame.from_dict(data, orient="index", columns=VERTICES)


def _df_to_matrix(df, row_keys):
    out = {}
    for r in row_keys:
        out[r] = {v: float(df.loc[r, v]) for v in VERTICES}
    return out


def _vec_to_df(vec, label):
    return pd.DataFrame([[float((vec or {}).get(v, 0) or 0) for v in VERTICES]],
                        index=[label], columns=VERTICES)


def _df_to_vec(df):
    return {v: float(df.iloc[0][v]) for v in VERTICES}


# ─── Formatação ──────────────────────────────────────────────────────────────
def _fmt(v, casas=2):
    if v is None:
        return "—"
    return f"{v:,.{casas}f}".replace(",", "X").replace(".", ",").replace("X", ".")


# ═════════════════════════════════════════════════════════════════════════════
def render_empresa():
    emp = st.session_state.empresa
    emp["nome"] = st.text_input("Nome da empresa", emp.get("nome", "Minha Empresa"))

    st.subheader("PLA — Patrimônio Líquido Ajustado")
    ded = emp.get("pla", {}).get("deducoes", [])
    col1, col2 = st.columns([1, 2])
    with col1:
        pl_bruto = st.number_input(
            "PL Bruto (R$)", value=float(emp.get("pla", {}).get("pl_bruto", 0) or 0),
            step=1000.0, format="%.2f")
    ded_df = pd.DataFrame(ded) if ded else pd.DataFrame(
        columns=["item", "valor", "descricao"])
    ded_edit = st.data_editor(ded_df, num_rows="dynamic", width="stretch",
                              key="ded_editor")
    emp["pla"] = {
        "pl_bruto": pl_bruto,
        "deducoes": [
            {"item": str(r.get("item", "")), "valor": float(r.get("valor", 0) or 0),
             "descricao": str(r.get("descricao", ""))}
            for r in ded_edit.to_dict("records")
        ],
    }

    for key, label in SECOES:
        st.subheader(f"Portfólio — {label}")
        sec = emp.get(key, {})
        st.caption("Exposição líquida por submercado (MWm)")
        subm_df = _matrix_to_df(sec.get("subm", {}), SUBMERCADOS)
        subm_edit = st.data_editor(subm_df, width="stretch",
                                   key=f"{key}_subm")
        st.caption("Recurso / Requisito e preços médios")
        fluxo_matrix = {r: sec.get(r, {}) for r in FLUXO_ROWS}
        fluxo_df = _matrix_to_df(fluxo_matrix, FLUXO_ROWS).rename(index=FLUXO_LABELS)
        fluxo_edit = st.data_editor(fluxo_df, width="stretch",
                                    key=f"{key}_fluxo")
        fluxo_edit.index = FLUXO_ROWS  # volta às chaves internas
        new_sec = {"subm": _df_to_matrix(subm_edit, SUBMERCADOS)}
        new_sec.update(_df_to_matrix(fluxo_edit, FLUXO_ROWS))
        emp[key] = new_sec

    st.subheader("EFM — Efeitos Financeiros Mercado Regulado (R$)")
    efm_df = _vec_to_df(emp.get("efm_regulado", {}), "EFM")
    efm_edit = st.data_editor(efm_df, width="stretch", key="efm_editor")
    emp["efm_regulado"] = _df_to_vec(efm_edit)


def render_premissas():
    pre = st.session_state.premissas
    st.info("Faça upload da planilha CCEE na barra lateral para preencher "
            "automaticamente, ou edite os valores abaixo.")
    c1, c2, c3 = st.columns(3)
    with c1:
        pre["phi_norm"] = st.number_input("phi_norm (percentil)",
                                          value=float(pre.get("phi_norm", -1.6449)),
                                          format="%.4f")
    with c2:
        pre["dias_liquidacao"] = st.number_input(
            "Dias p/ liquidação", value=int(pre.get("dias_liquidacao", 1)),
            min_value=1, step=1)
    with c3:
        st.text_input("Data de referência", pre.get("data_referencia", ""),
                      key="data_ref_ro", disabled=True)

    st.subheader("Curva Forward (R$/MWh)")
    fwd = pre.get("forward", {})
    fwd_rows = sorted({k for v in fwd.values() for k in v.keys()}) or \
        ["SECO", "SUL", "NE", "N"]
    fwd_matrix = {r: {v: fwd.get(v, {}).get(r, 0) for v in VERTICES}
                  for r in fwd_rows}
    fwd_df = _matrix_to_df(fwd_matrix, fwd_rows)
    fwd_edit = st.data_editor(fwd_df, width="stretch", key="fwd_editor")
    new_fwd = {v: {} for v in VERTICES}
    for r in fwd_rows:
        for v in VERTICES:
            new_fwd[v][r] = float(fwd_edit.loc[r, v])
    pre["forward"] = new_fwd

    for field, label in [("volatilidades", "Volatilidades (decimal)"),
                         ("stress_long", "Preço Estresse Long (R$/MWh)"),
                         ("stress_short", "Preço Estresse Short (R$/MWh)"),
                         ("horas", "Horas por mês")]:
        st.subheader(label)
        df = _vec_to_df(pre.get(field, {}), field)
        edit = st.data_editor(df, width="stretch", key=f"pre_{field}")
        pre[field] = _df_to_vec(edit)


def render_extra():
    extra = st.session_state.extra
    extra["ativo"] = st.toggle(
        "Ativar Portfólio Extra (simulação: soma ao portfólio real)",
        value=bool(extra.get("ativo")))
    st.caption("Faça upload do CSV do portfólio extra na barra lateral. "
               "Baixe o modelo lá também.")
    if extra.get("preco_fixo"):
        with st.expander("Ver dados do portfólio extra carregado"):
            st.json({k: extra[k] for k in ("preco_fixo", "preco_variavel",
                     "derivativos", "efm_regulado") if k in extra})


def render_resultado():
    emp = st.session_state.empresa
    pre = st.session_state.premissas
    extra = st.session_state.extra
    usar_extra = bool(extra.get("ativo"))
    base = combinar_portfolios(emp, extra) if usar_extra else emp

    try:
        res = calcular_fa(base, pre)
    except Exception as e:
        st.error(f"Erro no cálculo: {e}")
        st.exception(e)
        return

    t = res["totais"]
    if usar_extra:
        st.info("Resultado COM portfólio extra (simulação) incorporado.")
    if t.get("pla_negativo"):
        st.warning("PLA ≤ 0 — Fator de Ajuste não é definido (informe o PL Bruto "
                   "na aba Empresa).")

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("FA Risco", _fmt(t["fa_ris"], 4))
    c2.metric("FA Divulgado", _fmt(t["fa_divulgado"], 4))
    c3.metric("RWA (R$)", _fmt(t["rwa"]))
    c4.metric("PLA (R$)", _fmt(t["pla"]))
    c5, c6, c7, c8 = st.columns(4)
    c5.metric("VaR total (R$)", _fmt(t["var_tot"]))
    c6.metric("Stress total (R$)", _fmt(t["stest_tot"]))
    c7.metric("PnL (R$)", _fmt(t["pnl"]))
    c8.metric("Resultado Fin. (R$)", _fmt(t["res_fin"]))

    st.subheader("Detalhe por vértice")
    pv = res["por_vertice"]
    df = pd.DataFrame(pv).T.reindex(VERTICES)
    st.dataframe(df.style.format("{:,.2f}"), width="stretch")

    st.download_button(
        "Baixar resultado (JSON)",
        data=json.dumps(res, ensure_ascii=False, indent=2).encode("utf-8"),
        file_name="resultado_fa.json", mime="application/json")


# ─── Sidebar ─────────────────────────────────────────────────────────────────
def sidebar():
    st.sidebar.header("Dados de entrada")

    up_pre = st.sidebar.file_uploader("Planilha CCEE (Premissas) .xlsx",
                                      type=["xlsx"], key="up_pre")
    if up_pre is not None and st.sidebar.button("Importar premissas"):
        data, errors = parse_planilha_ccee(up_pre.getvalue())
        if errors:
            for e in errors:
                st.sidebar.error(e)
        st.session_state.premissas.update(data)
        st.sidebar.success("Premissas atualizadas.")
        st.rerun()

    up_extra = st.sidebar.file_uploader("Portfólio Extra .csv", type=["csv"],
                                        key="up_extra")
    if up_extra is not None and st.sidebar.button("Importar portfólio extra"):
        data, errors = parse_extra_csv(up_extra.getvalue())
        if errors:
            for e in errors:
                st.sidebar.error(e)
        data["ativo"] = True
        st.session_state.extra = data
        st.sidebar.success("Portfólio extra carregado e ativado.")
        st.rerun()

    st.sidebar.divider()
    st.sidebar.subheader("Modelos para download")
    st.sidebar.download_button(
        "Modelo Portfólio (.xlsx)", data=gerar_modelo_portfolio(),
        file_name="modelo_portfolio.xlsx",
        mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    st.sidebar.download_button(
        "Modelo Portfólio Extra (.csv)",
        data=gerar_modelo_extra_csv().encode("utf-8-sig"),
        file_name="modelo_portfolio_extra.csv", mime="text/csv")


def main():
    st.set_page_config(page_title="Simulador FA CCEE", page_icon="⚡",
                       layout="wide")
    st.title("⚡ Simulador de Fator de Ajuste (FA) — CCEE")
    _init_state()
    sidebar()

    tab_res, tab_emp, tab_pre, tab_extra = st.tabs(
        ["📊 Resultado", "🏢 Empresa / Portfólio", "⚙️ Premissas",
         "➕ Portfólio Extra"])
    with tab_emp:
        render_empresa()
    with tab_pre:
        render_premissas()
    with tab_extra:
        render_extra()
    with tab_res:
        render_resultado()


if __name__ == "__main__":
    main()
