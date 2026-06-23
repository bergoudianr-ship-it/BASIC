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
