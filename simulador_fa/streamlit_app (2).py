"""
Simulador FA CCEE — versão Streamlit
=====================================
App web para simular o Fator de Alavancagem (FA) segundo o Manual CCEE
v2023.2.0 (período sombra: K=0 e θ=0).

ARQUIVO UNICO E AUTOSSUFICIENTE: o motor de calculo e os dados iniciais
estao embutidos aqui. Nao depende de calculadora_fa.py nem da pasta data/.

Publicação no Streamlit Community Cloud
---------------------------------------
1. Suba a pasta ``simulador_fa/`` num repositório GitHub.
2. Em https://share.streamlit.io crie um novo app apontando para
   ``simulador_fa/streamlit_app.py``.
3. Nao precisa de requirements.txt: streamlit e pandas ja vem no ambiente
   do Streamlit Cloud. (Localmente: pip install streamlit pandas.)

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



# ===== MOTOR DE CALCULO (embutido — antes em calculadora_fa.py) =====
import math

VERTICES = ["M+0", "M+1", "M+2", "M+3", "M+4", "M+5", "M+6"]
SUBMERCADOS = ["SE/CO", "SUL", "NE", "N"]
SUBM_SPREAD = {"SE/CO": "SECO", "SUL": "SUL", "NE": "NE", "N": "N"}


def _pla(empresa):
    pl = float(empresa["pla"].get("pl_bruto", 0) or 0)
    ded = sum(float(d.get("valor", 0) or 0) for d in empresa["pla"].get("deducoes", []))
    return pl - ded


def _forward_subm(premissas, vertice, subm):
    fwd = premissas["forward"][vertice]
    seco = float(fwd.get("SECO", 0) or 0)
    if subm == "SE/CO":
        return seco
    spread_key = SUBM_SPREAD[subm]
    return seco + float(fwd.get(spread_key, 0) or 0)


def _v(d, key, vertice):
    return float((d.get(key) or {}).get(vertice, 0) or 0)


# ─── Combinação Portfólio Real + Portfólio Extra ─────────────────────────────
def _zeros():
    return {v: 0.0 for v in VERTICES}


def _merge_section(base, extra):
    """Combina uma seção (preco_fixo / preco_variavel / derivativos).
    Volumes (subm, recurso, requisito) são SOMADOS.
    Preços médios (pm_recurso, pm_requisito) são MÉDIA PONDERADA pelo volume.
    """
    base = base or {}
    extra = extra or {}
    out = {"subm": {}, "recurso": {}, "pm_recurso": {},
           "requisito": {}, "pm_requisito": {}}

    # Exposição por submercado: soma
    for s in SUBMERCADOS:
        out["subm"][s] = {}
        for v in VERTICES:
            bv = float(((base.get("subm") or {}).get(s) or {}).get(v, 0) or 0)
            ev = float(((extra.get("subm") or {}).get(s) or {}).get(v, 0) or 0)
            out["subm"][s][v] = bv + ev

    # Recurso/Requisito: soma de volume + média ponderada de preço
    for vol, pm in (("recurso", "pm_recurso"), ("requisito", "pm_requisito")):
        out[vol] = {}
        out[pm] = {}
        for v in VERTICES:
            bvol = _v(base, vol, v)
            evol = _v(extra, vol, v)
            bpm = _v(base, pm, v)
            epm = _v(extra, pm, v)
            tot = bvol + evol
            out[vol][v] = tot
            out[pm][v] = ((bvol * bpm + evol * epm) / tot) if tot != 0 else 0.0
    return out


def combinar_portfolios(empresa, extra):
    """Retorna uma cópia da empresa com o portfólio extra incorporado.
    Mantém o PLA da empresa real. Soma volumes e pondera preços médios.
    """
    import copy
    comb = copy.deepcopy(empresa)
    comb["preco_fixo"] = _merge_section(empresa.get("preco_fixo"), extra.get("preco_fixo"))
    comb["preco_variavel"] = _merge_section(empresa.get("preco_variavel"), extra.get("preco_variavel"))
    comb["derivativos"] = _merge_section(empresa.get("derivativos"), extra.get("derivativos"))
    # EFM: soma
    efm = {}
    for v in VERTICES:
        efm[v] = float((empresa.get("efm_regulado") or {}).get(v, 0) or 0) \
               + float((extra.get("efm_regulado") or {}).get(v, 0) or 0)
    comb["efm_regulado"] = efm
    return comb


def calcular_fa(empresa, premissas):
    phi = abs(float(premissas.get("phi_norm", -1.6449) or -1.6449))
    D = float(premissas.get("dias_liquidacao", 1) or 1)
    sigma = premissas.get("volatilidades", {})
    stress_long = premissas.get("stress_long", {})
    stress_short = premissas.get("stress_short", {})
    horas = premissas.get("horas", {})

    pla = _pla(empresa)
    pf = empresa.get("preco_fixo", {})
    pv = empresa.get("preco_variavel", {})
    der = empresa.get("derivativos", {})

    por_vertice = {}
    res_contr_total = 0.0
    fin_pv_total = 0.0
    res_der_total = 0.0
    var_tot = 0.0
    stest_tot = 0.0
    efm_total = sum(float((empresa.get("efm_regulado") or {}).get(v, 0) or 0) for v in VERTICES)
    mtm_total_all = 0.0

    for vi in VERTICES:
        h = float((horas or {}).get(vi, 720) or 720)
        sig = float((sigma or {}).get(vi, 0) or 0)
        sl = float((stress_long or {}).get(vi, 0) or 0)
        ss = float((stress_short or {}).get(vi, 0) or 0)
        fwd_seco = float((premissas.get("forward") or {}).get(vi, {}).get("SECO", 0) or 0)

        # NET por submercado (soma PF + PV + DER)
        net_subm = {}
        for subm in SUBMERCADOS:
            n_pf  = float(((pf.get("subm") or {}).get(subm) or {}).get(vi, 0) or 0)
            n_pv  = float(((pv.get("subm") or {}).get(subm) or {}).get(vi, 0) or 0)
            n_der = float(((der.get("subm") or {}).get(subm) or {}).get(vi, 0) or 0)
            net_subm[subm] = n_pf + n_pv + n_der

        # MtM por submercado
        mtm_vi = 0.0
        for subm in SUBMERCADOS:
            fwd_s = _forward_subm(premissas, vi, subm)
            mtm_vi += net_subm[subm] * fwd_s * h

        mtm_total_all += mtm_vi

        # NET total (para VaR e Stress)
        net_total = sum(net_subm.values())

        # VaR: usa net_total × SECO forward (conforme planilha VaR)
        exp_var = net_total * fwd_seco * h
        var_vi = phi * abs(exp_var) * sig * math.sqrt(D)
        var_tot += var_vi

        # Stress Test
        if net_total > 0:
            stest_vi = sl * net_total * h - mtm_vi
        elif net_total < 0:
            stest_vi = ss * net_total * h - mtm_vi
        else:
            stest_vi = 0.0
        stest_tot += stest_vi

        # Resultado Contratual (Preço Fixo)
        rec_pf  = _v(pf, "recurso", vi)
        pmr_pf  = _v(pf, "pm_recurso", vi)
        req_pf  = _v(pf, "requisito", vi)
        pmq_pf  = _v(pf, "pm_requisito", vi)
        res_contr_vi = (req_pf * pmq_pf - rec_pf * pmr_pf) * h
        res_contr_total += res_contr_vi

        # Resultado Derivativos
        rec_der  = _v(der, "recurso", vi)
        pmr_der  = _v(der, "pm_recurso", vi)
        req_der  = _v(der, "requisito", vi)
        pmq_der  = _v(der, "pm_requisito", vi)
        res_der_vi = (req_der * pmq_der - rec_der * pmr_der) * h
        res_der_total += res_der_vi

        # Financeiro PLD+ (Preço Variável)
        rec_pv  = _v(pv, "recurso", vi)
        pmr_pv  = _v(pv, "pm_recurso", vi)
        req_pv  = _v(pv, "requisito", vi)
        pmq_pv  = _v(pv, "pm_requisito", vi)
        fin_pv_vi = (req_pv * pmq_pv - rec_pv * pmr_pv) * h
        fin_pv_total += fin_pv_vi

        por_vertice[vi] = {
            "net_seco":  round(net_subm["SE/CO"], 4),
            "net_sul":   round(net_subm["SUL"], 4),
            "net_ne":    round(net_subm["NE"], 4),
            "net_n":     round(net_subm["N"], 4),
            "net_total": round(net_total, 4),
            "mtm":       round(mtm_vi, 2),
            "res_contr": round(res_contr_vi + res_der_vi, 2),
            "fin_pv":    round(fin_pv_vi, 2),
            "efm":       round(float((empresa.get("efm_regulado") or {}).get(vi, 0) or 0), 2),
            "var":       round(var_vi, 2),
            "stest":     round(stest_vi, 2),
        }

    rwa = var_tot  # K=0, θ=0
    pnl = res_contr_total + res_der_total + mtm_total_all
    res_fin = pnl + fin_pv_total + efm_total

    pla_neg = pla <= 0
    fa_ris = None if pla_neg else rwa / pla
    fa_div = None if pla_neg else max(0.0, (rwa - res_fin) / pla)

    return {
        "por_vertice": por_vertice,
        "totais": {
            "res_contr":    round(res_contr_total + res_der_total, 2),
            "fin_pv":       round(fin_pv_total, 2),
            "efm":          round(efm_total, 2),
            "mtm":          round(mtm_total_all, 2),
            "pnl":          round(pnl, 2),
            "res_fin":      round(res_fin, 2),
            "var_tot":      round(var_tot, 2),
            "stest_tot":    round(stest_tot, 2),
            "rwa":          round(rwa, 2),
            "pla":          round(pla, 2),
            "fa_ris":       round(fa_ris, 4) if fa_ris is not None else None,
            "fa_divulgado": round(fa_div, 4) if fa_div is not None else None,
            "pla_negativo": pla_neg,
        }
    }

# ===== DADOS INICIAIS (embutidos — antes em data/*.json) =====
import copy as _copy
EMBEDDED_DATA = json.loads(r'''{
  "premissas": {
    "data_referencia": "2026-05-25",
    "forward": {
      "M+0": {
        "SECO": 222.72,
        "SUL": 23.8,
        "NE": -61.59,
        "N": -60.5,
        "I0": 1.69,
        "I5": 30.17,
        "I8": 172.09,
        "I1": 172.09
      },
      "M+1": {
        "SECO": 227.35,
        "SUL": 5.28,
        "NE": -36.7,
        "N": -32.64,
        "I0": 1.83,
        "I5": 28.61,
        "I8": 170.29,
        "I1": 170.29
      },
      "M+2": {
        "SECO": 229.93,
        "SUL": 2.72,
        "NE": -30.27,
        "N": -15.07,
        "I0": 1.83,
        "I5": 29.4,
        "I8": 171.12,
        "I1": 171.12
      },
      "M+3": {
        "SECO": 263.05,
        "SUL": 2.16,
        "NE": -28.37,
        "N": -11.42,
        "I0": 1.65,
        "I5": 29.28,
        "I8": 169.97,
        "I1": 169.97
      },
      "M+4": {
        "SECO": 292.63,
        "SUL": 2.58,
        "NE": -23.71,
        "N": -7.36,
        "I0": 1.61,
        "I5": 27.84,
        "I8": 167.61,
        "I1": 167.61
      },
      "M+5": {
        "SECO": 313.43,
        "SUL": 1.81,
        "NE": -18.07,
        "N": -7.05,
        "I0": 1.61,
        "I5": 28.98,
        "I8": 169.53,
        "I1": 169.53
      },
      "M+6": {
        "SECO": 313.43,
        "SUL": 1.81,
        "NE": -18.07,
        "N": -7.05,
        "I0": 1.61,
        "I5": 28.98,
        "I8": 169.53,
        "I1": 169.53
      }
    },
    "volatilidades": {
      "M+0": 0.07339999999999999,
      "M+1": 0.11894,
      "M+2": 0.10205,
      "M+3": 0.08728,
      "M+4": 0.067,
      "M+5": 0.05623,
      "M+6": 0.048600000000000004
    },
    "stress_long": {
      "M+0": 168.47,
      "M+1": 134.86,
      "M+2": 139.94,
      "M+3": 173.77,
      "M+4": 219.12,
      "M+5": 231.91,
      "M+6": 232.69
    },
    "stress_short": {
      "M+0": 279.76,
      "M+1": 326.52,
      "M+2": 333.03,
      "M+3": 365.56,
      "M+4": 372.34,
      "M+5": 395.11,
      "M+6": 389.62
    },
    "horas": {
      "M+0": 744,
      "M+1": 720,
      "M+2": 744,
      "M+3": 744,
      "M+4": 720,
      "M+5": 744,
      "M+6": 720
    },
    "phi_norm": -1.6449,
    "dias_liquidacao": 1,
    "K": 0,
    "theta": 0,
    "rho": 1,
    "pld_min": 57.31,
    "pld_max": 785.27
  },
  "empresa": {
    "nome": "Minha Empresa",
    "pla": {
      "pl_bruto": 0,
      "deducoes": [
        {
          "item": "I",
          "valor": 0,
          "descricao": ""
        },
        {
          "item": "II",
          "valor": 0,
          "descricao": ""
        },
        {
          "item": "III",
          "valor": 0,
          "descricao": ""
        },
        {
          "item": "IV",
          "valor": 0,
          "descricao": ""
        },
        {
          "item": "V",
          "valor": 0,
          "descricao": ""
        },
        {
          "item": "VI",
          "valor": 0,
          "descricao": ""
        },
        {
          "item": "VII",
          "valor": 0,
          "descricao": ""
        },
        {
          "item": "VIII",
          "valor": 0,
          "descricao": ""
        }
      ]
    },
    "preco_fixo": {
      "subm": {
        "SE/CO": {
          "M+0": 0,
          "M+1": 0,
          "M+2": 0,
          "M+3": 0,
          "M+4": 0,
          "M+5": 0,
          "M+6": 0
        },
        "SUL": {
          "M+0": 0,
          "M+1": 0,
          "M+2": 0,
          "M+3": 0,
          "M+4": 0,
          "M+5": 0,
          "M+6": 0
        },
        "NE": {
          "M+0": 0,
          "M+1": 0,
          "M+2": 0,
          "M+3": 0,
          "M+4": 0,
          "M+5": 0,
          "M+6": 0
        },
        "N": {
          "M+0": 0,
          "M+1": 0,
          "M+2": 0,
          "M+3": 0,
          "M+4": 0,
          "M+5": 0,
          "M+6": 0
        }
      },
      "recurso": {
        "M+0": 0,
        "M+1": 0,
        "M+2": 0,
        "M+3": 0,
        "M+4": 0,
        "M+5": 0,
        "M+6": 0
      },
      "pm_recurso": {
        "M+0": 0,
        "M+1": 0,
        "M+2": 0,
        "M+3": 0,
        "M+4": 0,
        "M+5": 0,
        "M+6": 0
      },
      "requisito": {
        "M+0": 0,
        "M+1": 0,
        "M+2": 0,
        "M+3": 0,
        "M+4": 0,
        "M+5": 0,
        "M+6": 0
      },
      "pm_requisito": {
        "M+0": 0,
        "M+1": 0,
        "M+2": 0,
        "M+3": 0,
        "M+4": 0,
        "M+5": 0,
        "M+6": 0
      }
    },
    "preco_variavel": {
      "subm": {
        "SE/CO": {
          "M+0": 0,
          "M+1": 0,
          "M+2": 0,
          "M+3": 0,
          "M+4": 0,
          "M+5": 0,
          "M+6": 0
        },
        "SUL": {
          "M+0": 0,
          "M+1": 0,
          "M+2": 0,
          "M+3": 0,
          "M+4": 0,
          "M+5": 0,
          "M+6": 0
        },
        "NE": {
          "M+0": 0,
          "M+1": 0,
          "M+2": 0,
          "M+3": 0,
          "M+4": 0,
          "M+5": 0,
          "M+6": 0
        },
        "N": {
          "M+0": 0,
          "M+1": 0,
          "M+2": 0,
          "M+3": 0,
          "M+4": 0,
          "M+5": 0,
          "M+6": 0
        }
      },
      "recurso": {
        "M+0": 0,
        "M+1": 0,
        "M+2": 0,
        "M+3": 0,
        "M+4": 0,
        "M+5": 0,
        "M+6": 0
      },
      "pm_recurso": {
        "M+0": 0,
        "M+1": 0,
        "M+2": 0,
        "M+3": 0,
        "M+4": 0,
        "M+5": 0,
        "M+6": 0
      },
      "requisito": {
        "M+0": 0,
        "M+1": 0,
        "M+2": 0,
        "M+3": 0,
        "M+4": 0,
        "M+5": 0,
        "M+6": 0
      },
      "pm_requisito": {
        "M+0": 0,
        "M+1": 0,
        "M+2": 0,
        "M+3": 0,
        "M+4": 0,
        "M+5": 0,
        "M+6": 0
      }
    },
    "derivativos": {
      "subm": {
        "SE/CO": {
          "M+0": 0,
          "M+1": 0,
          "M+2": 0,
          "M+3": 0,
          "M+4": 0,
          "M+5": 0,
          "M+6": 0
        },
        "SUL": {
          "M+0": 0,
          "M+1": 0,
          "M+2": 0,
          "M+3": 0,
          "M+4": 0,
          "M+5": 0,
          "M+6": 0
        },
        "NE": {
          "M+0": 0,
          "M+1": 0,
          "M+2": 0,
          "M+3": 0,
          "M+4": 0,
          "M+5": 0,
          "M+6": 0
        },
        "N": {
          "M+0": 0,
          "M+1": 0,
          "M+2": 0,
          "M+3": 0,
          "M+4": 0,
          "M+5": 0,
          "M+6": 0
        }
      },
      "recurso": {
        "M+0": 0,
        "M+1": 0,
        "M+2": 0,
        "M+3": 0,
        "M+4": 0,
        "M+5": 0,
        "M+6": 0
      },
      "pm_recurso": {
        "M+0": 0,
        "M+1": 0,
        "M+2": 0,
        "M+3": 0,
        "M+4": 0,
        "M+5": 0,
        "M+6": 0
      },
      "requisito": {
        "M+0": 0,
        "M+1": 0,
        "M+2": 0,
        "M+3": 0,
        "M+4": 0,
        "M+5": 0,
        "M+6": 0
      },
      "pm_requisito": {
        "M+0": 0,
        "M+1": 0,
        "M+2": 0,
        "M+3": 0,
        "M+4": 0,
        "M+5": 0,
        "M+6": 0
      }
    },
    "efm_regulado": {
      "M+0": 0,
      "M+1": 0,
      "M+2": 0,
      "M+3": 0,
      "M+4": 0,
      "M+5": 0,
      "M+6": 0
    }
  },
  "portfolio_extra": {
    "ativo": false,
    "nome": "Portfólio Extra (Simulação)",
    "preco_fixo": {
      "subm": {
        "SE/CO": {
          "M+0": 0,
          "M+1": 0,
          "M+2": 0,
          "M+3": 0,
          "M+4": 0,
          "M+5": 0,
          "M+6": 0
        },
        "SUL": {
          "M+0": 0,
          "M+1": 0,
          "M+2": 0,
          "M+3": 0,
          "M+4": 0,
          "M+5": 0,
          "M+6": 0
        },
        "NE": {
          "M+0": 0,
          "M+1": 0,
          "M+2": 0,
          "M+3": 0,
          "M+4": 0,
          "M+5": 0,
          "M+6": 0
        },
        "N": {
          "M+0": 0,
          "M+1": 0,
          "M+2": 0,
          "M+3": 0,
          "M+4": 0,
          "M+5": 0,
          "M+6": 0
        }
      },
      "recurso": {
        "M+0": 0,
        "M+1": 0,
        "M+2": 0,
        "M+3": 0,
        "M+4": 0,
        "M+5": 0,
        "M+6": 0
      },
      "pm_recurso": {
        "M+0": 0,
        "M+1": 0,
        "M+2": 0,
        "M+3": 0,
        "M+4": 0,
        "M+5": 0,
        "M+6": 0
      },
      "requisito": {
        "M+0": 0,
        "M+1": 0,
        "M+2": 0,
        "M+3": 0,
        "M+4": 0,
        "M+5": 0,
        "M+6": 0
      },
      "pm_requisito": {
        "M+0": 0,
        "M+1": 0,
        "M+2": 0,
        "M+3": 0,
        "M+4": 0,
        "M+5": 0,
        "M+6": 0
      }
    },
    "preco_variavel": {
      "subm": {
        "SE/CO": {
          "M+0": 0,
          "M+1": 0,
          "M+2": 0,
          "M+3": 0,
          "M+4": 0,
          "M+5": 0,
          "M+6": 0
        },
        "SUL": {
          "M+0": 0,
          "M+1": 0,
          "M+2": 0,
          "M+3": 0,
          "M+4": 0,
          "M+5": 0,
          "M+6": 0
        },
        "NE": {
          "M+0": 0,
          "M+1": 0,
          "M+2": 0,
          "M+3": 0,
          "M+4": 0,
          "M+5": 0,
          "M+6": 0
        },
        "N": {
          "M+0": 0,
          "M+1": 0,
          "M+2": 0,
          "M+3": 0,
          "M+4": 0,
          "M+5": 0,
          "M+6": 0
        }
      },
      "recurso": {
        "M+0": 0,
        "M+1": 0,
        "M+2": 0,
        "M+3": 0,
        "M+4": 0,
        "M+5": 0,
        "M+6": 0
      },
      "pm_recurso": {
        "M+0": 0,
        "M+1": 0,
        "M+2": 0,
        "M+3": 0,
        "M+4": 0,
        "M+5": 0,
        "M+6": 0
      },
      "requisito": {
        "M+0": 0,
        "M+1": 0,
        "M+2": 0,
        "M+3": 0,
        "M+4": 0,
        "M+5": 0,
        "M+6": 0
      },
      "pm_requisito": {
        "M+0": 0,
        "M+1": 0,
        "M+2": 0,
        "M+3": 0,
        "M+4": 0,
        "M+5": 0,
        "M+6": 0
      }
    },
    "derivativos": {
      "subm": {
        "SE/CO": {
          "M+0": 0,
          "M+1": 0,
          "M+2": 0,
          "M+3": 0,
          "M+4": 0,
          "M+5": 0,
          "M+6": 0
        },
        "SUL": {
          "M+0": 0,
          "M+1": 0,
          "M+2": 0,
          "M+3": 0,
          "M+4": 0,
          "M+5": 0,
          "M+6": 0
        },
        "NE": {
          "M+0": 0,
          "M+1": 0,
          "M+2": 0,
          "M+3": 0,
          "M+4": 0,
          "M+5": 0,
          "M+6": 0
        },
        "N": {
          "M+0": 0,
          "M+1": 0,
          "M+2": 0,
          "M+3": 0,
          "M+4": 0,
          "M+5": 0,
          "M+6": 0
        }
      },
      "recurso": {
        "M+0": 0,
        "M+1": 0,
        "M+2": 0,
        "M+3": 0,
        "M+4": 0,
        "M+5": 0,
        "M+6": 0
      },
      "pm_recurso": {
        "M+0": 0,
        "M+1": 0,
        "M+2": 0,
        "M+3": 0,
        "M+4": 0,
        "M+5": 0,
        "M+6": 0
      },
      "requisito": {
        "M+0": 0,
        "M+1": 0,
        "M+2": 0,
        "M+3": 0,
        "M+4": 0,
        "M+5": 0,
        "M+6": 0
      },
      "pm_requisito": {
        "M+0": 0,
        "M+1": 0,
        "M+2": 0,
        "M+3": 0,
        "M+4": 0,
        "M+5": 0,
        "M+6": 0
      }
    },
    "efm_regulado": {
      "M+0": 0,
      "M+1": 0,
      "M+2": 0,
      "M+3": 0,
      "M+4": 0,
      "M+5": 0,
      "M+6": 0
    }
  },
  "historico": [
    {
      "data": "2026-05-27",
      "semana": "22/2026",
      "fa_ris": 0.0,
      "fa_divulgado": 0.0,
      "rwa": 0.0,
      "pnl": 0.0,
      "res_fin": 0.0,
      "pla": 0.0,
      "var_tot": 0.0,
      "stest_tot": 0.0
    }
  ]
}''')
_EMB_MAP = {'premissas.json':'premissas','empresa.json':'empresa','portfolio_extra.json':'portfolio_extra','historico.json':'historico'}

BASE = os.path.dirname(os.path.abspath(__file__))

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
    key = _EMB_MAP.get(name)
    if key and key in EMBEDDED_DATA:
        return _copy.deepcopy(EMBEDDED_DATA[key])
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

tab_guia, tab_prem, tab_pla, tab_port, tab_extra, tab_calc, tab_hist = st.tabs(
    ["📖 Como usar", "📋 Premissas", "🏦 PLA", "📊 Portfólio", "➕ Portfólio Extra", "🧮 Cálculo", "📅 Histórico"])

# ---- GUIA / COMO USAR ----
with tab_guia:
    st.header("📖 Como usar o Simulador FA CCEE")
    st.markdown(
        """
Esta ferramenta simula o **Fator de Alavancagem (FA)** de um portfólio de energia
segundo o **Manual CCEE v2023.2.0** (período sombra, com **K = 0** e **θ = 0**).
O objetivo é responder: *dado o portfólio e as premissas de mercado, qual o nível
de risco (RWA) frente ao capital (PLA)?*

> **A regra central:** &nbsp; **FA = RWA / PLA**
> - **FA Risco** = RWA ÷ PLA
> - **FA Divulgado** = (RWA − Resultado Financeiro) ÷ PLA (nunca negativo)
> - Interpretação de cor: 🟢 abaixo de 1 · 🟡 de 1 a 3 · 🔴 acima de 3
> - Se o **PLA ≤ 0**, o FA não é calculável (aparece "PLA ≤ 0").
        """
    )

    st.subheader("Conceitos que valem para todas as abas")
    st.markdown(
        """
- **Vértices (M+0 … M+6):** os 7 meses à frente. Toda tabela tem uma coluna por vértice.
- **Submercados:** SE/CO (Sudeste/Centro-Oeste), SUL, NE (Nordeste) e N (Norte).
- **MWm (MW médio):** unidade de volume de energia. **R$/MWh:** preço.
- **Convenção de sinal (exposição líquida):** posição **comprada = positiva**,
  posição **vendida = negativa**.
- **Salvamento:** os dados valem para a **sua sessão** no navegador. Ao recarregar a
  página, tudo volta aos valores iniciais. Para guardar, use os botões de
  **download CSV** (Portfólio e Histórico).
        """
    )

    st.subheader("Passo a passo recomendado")
    st.markdown(
        """
1. **📋 Premissas** — confira/ajuste mercado e parâmetros de risco (Forward, volatilidade, etc.).
2. **🏦 PLA** — informe o Patrimônio Líquido Ajustado (é o denominador do FA).
3. **📊 Portfólio** — lance as exposições e os contratos (é o que gera o risco).
4. **➕ Portfólio Extra** *(opcional)* — simule um negócio novo e veja o impacto no FA.
5. **🧮 Cálculo** — leia os resultados: VaR, MtM, RWA e o FA final.
6. **📅 Histórico** — registre o resultado do dia e acompanhe a evolução.
        """
    )

    with st.expander("📋 Aba Premissas — detalhes"):
        st.markdown(
            """
Parâmetros de **mercado e de risco** usados no cálculo:
- **Data de referência** — data da apuração.
- **Intervalo de Confiança (φ)** — fator da distribuição normal do VaR (ex.: −1,6449 ≈ 95%).
- **Dias para Liquidação (D)** — horizonte do VaR (o VaR escala com √D).
- **PLD mín / máx** — limites regulatórios do PLD (referência).
- **Curva Forward DCIDE (R$/MWh)** — preço a termo por vértice. `SECO/CONV` é a base;
  `SUL`, `NE`, `N` são **spreads** somados à base para formar o preço de cada submercado.
- **Volatilidade σ, Estresse Long/Short e Horas/Mês** — uma linha para cada, por vértice.
  Volatilidade alimenta o **VaR**; os preços de estresse alimentam o **Teste de Estresse**;
  Horas/Mês converte MWm em MWh.

👉 *Edite as células diretamente na tabela. Tudo recalcula automaticamente.*
            """
        )

    with st.expander("🏦 Aba PLA — detalhes"):
        st.markdown(
            """
O **PLA (Patrimônio Líquido Ajustado)** é o **denominador do FA**.
- **PL Bruto (R$)** — patrimônio líquido contábil.
- **Deduções I a VIII** — os 8 itens do Anexo I do Manual CCEE (prejuízos acumulados,
  intangível, créditos tributários, etc.). Preencha o valor de cada um (a descrição é opcional).
- **PLA Calculado = PL Bruto − Σ(Deduções)** — exibido ao final.

⚠️ Se o **PLA ficar ≤ 0**, o FA não é calculável.
            """
        )

    with st.expander("📊 Aba Portfólio — detalhes"):
        st.markdown(
            """
É onde você lança as posições. São 4 seções, cada uma por vértice:
- **Seção 1 — Preço Fixo, Consumo e Geração:** contratos a preço fixo.
- **Seção 2 — Preço Variável (PLD+):** contratos indexados (PLD + prêmio).
- **Seção 3 — Derivativos de Energia:** posições em derivativos.
- **Seção 4 — EFM:** Efeitos Financeiros do Mercado Regulado (ACR, etc.), em R$.

Em cada seção você preenche:
- **Exposição líquida por submercado** (SE/CO, SUL, NE, NORTE) — em MWm.
  *Lembre: vendido = negativo, comprado = positivo.*
- **Recurso / Requisito** (MWm) e seus **Preços Médios** (R$/MWh).

Botões:
- **💾 Registrar no Histórico** — grava o resultado atual na aba Histórico.
- **⬇ Baixar Modelo CSV** — exporta o portfólio atual em CSV (para guardar/editar no Excel).

👉 *Edite as células diretamente; o FA no topo recalcula na hora.*
            """
        )

    with st.expander("➕ Aba Portfólio Extra — detalhes"):
        st.markdown(
            """
Serve para **simular um negócio novo** sem alterar o portfólio real.
- Preencha as seções do portfólio extra (mesma lógica da aba Portfólio).
- **Ative o toggle** "Ativar Portfólio Extra no cálculo do FA" para que o FA passe a
  considerar **Real + Extra**. Desativado, o FA usa só o real.
- A tabela **Comparativo Real × Real + Extra** mostra lado a lado o efeito no
  FA, RWA, VaR, MtM e Stress — ideal para avaliar se vale a pena fechar o negócio.
            """
        )

    with st.expander("🧮 Aba Cálculo — detalhes"):
        st.markdown(
            """
Mostra os resultados (somente leitura):
- **VaR Paramétrico por vértice** — perda potencial: `φ × |exposição| × σ × √D`.
- **Exposição NET por submercado** — gráfico das posições líquidas.
- **MtM (Marcação a Mercado)** — valor da posição na curva forward atual.
- **Teste de Estresse** — perda sob os preços de estresse (long/short).
- **Totais consolidados** — Resultado Contratual, PLD+, EFM, MtM, PnL,
  Resultado Financeiro, VaR, Stress, **RWA** e **PLA**.
- **FA Risco (RWA/PLA)** e **FA Divulgado** — os indicadores finais.
            """
        )

    with st.expander("📅 Aba Histórico — detalhes"):
        st.markdown(
            """
Acompanha a **evolução ao longo do tempo**:
- Cada registro (feito na aba Portfólio) vira uma linha: data, FA Risco, FA Divulgado,
  RWA, PnL, Resultado Financeiro, PLA, VaR e Stress.
- Gráficos: **FA Risco × FA Divulgado** e **RWA × PLA**.
- **⬇ Exportar histórico (CSV)** — baixa toda a série para Excel.
            """
        )

    st.info("As edições valem para a sua sessão. Para não perder, use os botões de "
            "**download CSV** nas abas Portfólio e Histórico antes de fechar.")

# ---- PREMISSAS ----
with tab_prem:
    st.info("Ajuste o **mercado e o risco**: Forward (preço a termo), volatilidade, "
            "estresse, horas e os fatores do VaR (φ e D). Edite as células — recalcula sozinho.")
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
    st.info("Informe o **PL Bruto** e as **8 deduções**. O **PLA = PL Bruto − deduções** "
            "é o denominador do FA. Se PLA ≤ 0, o FA não é calculável.")
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
    st.info("Lance suas **posições** por vértice e submercado (vendido = negativo). "
            "Preencha exposição, recurso/requisito e preços médios. Use **Registrar no "
            "Histórico** e **Baixar Modelo CSV** para guardar.")
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
    st.info("Simule um **negócio novo** sem mexer no portfólio real. Preencha as seções "
            "abaixo e **ative o toggle** para ver o efeito no FA (Real + Extra) na tabela "
            "comparativa. Desativado, o Extra fica só de referência, sem entrar no cálculo.")
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
    st.info("Somente leitura: aqui você vê o **resultado** do que foi preenchido nas abas "
            "Premissas, PLA e Portfólio — VaR, MtM, Stress, RWA, PLA e o **FA final**.")
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
    st.info("Série temporal dos registros feitos em **Registrar no Histórico** (aba "
            "Portfólio). Acompanhe a evolução do FA e exporte em CSV.")
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
