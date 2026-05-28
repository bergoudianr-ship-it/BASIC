from copy import deepcopy
from datetime import datetime
from html import escape
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
from math import erf, exp, isfinite, pi, sqrt
from pathlib import Path
import unicodedata
from urllib.parse import parse_qs, urlparse

from openpyxl import load_workbook

HOST = "127.0.0.1"
PORT = 8899
MONTHS = ["M+0", "M+1", "M+2", "M+3", "M+4", "M+5", "M+6"]
SOURCE_KEYS = ["SE/CO", "SUL", "NORDESTE", "NORTE", "CONVENCIONAL", "I0", "I5/CQ5", "I8", "I1"]
SOURCE_FIELDS = {
    "SE/CO": "SECO",
    "SUL": "SUL",
    "NORDESTE": "NE",
    "NORTE": "N",
    "CONVENCIONAL": "CONV",
    "I0": "I0",
    "I5/CQ5": "I5CQ5",
    "I8": "I8",
    "I1": "I1",
}
HISTORY_PATH = Path(__file__).with_name("historico_analises.json")
DEFAULT_XLSX_PATH = (
    r"C:\Users\rafac\Documents\Codex\2026-05-27\files-mentioned-by-the-user-manual\simulacao_semanal.xlsx"
)

DEFAULT_STATE = {
    "xlsxPath": DEFAULT_XLSX_PATH,
    "company": {
        "name": "",
        "cnpj": "",
        "analyst": "",
        "note": "",
    },
    "pla": 0.0,
    "parameters": {
        "faReference": 1.5,
        "confidence": 95.0,
        "phiZ": 1.6448536269,
        "liquidationDays": 1.0,
        "correlation": 1.0,
        "theta": 0.0,
        "pldMin": 57.31,
        "pldMax": 785.27,
    },
    "portfolio": [
        {
            "month": month,
            "hours": [744, 720, 744, 744, 720, 744, 720][idx],
            "exposure": 0.0,
            "forward": 0.0,
            "volatility": 0.0,
            "rec": 0.0,
            "pmRec": 0.0,
            "req": 0.0,
            "pmReq": 0.0,
            "acrRevenue": 0.0,
            "stressLongPrice": 0.0,
            "stressShortPrice": 0.0,
        }
        for idx, month in enumerate(MONTHS)
    ],
    "sourceExposure": {key: [0.0] * 7 for key in SOURCE_KEYS},
    "sourceForward": {key: [0.0] * 7 for key in SOURCE_KEYS},
}


def clamp(value, min_value, max_value):
    return min(max_value, max(min_value, value))


def parse_number(value, default=0.0):
    if value is None:
        return default
    text = str(value).strip()
    if text == "":
        return default
    if "," in text and "." in text:
        text = text.replace(".", "").replace(",", ".")
    elif "," in text:
        text = text.replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return default


def parse_bool(value):
    return str(value).lower() in ("on", "true", "1", "yes")


def norm_text(value):
    if value is None:
        return ""
    text = str(value).strip().lower()
    text = unicodedata.normalize("NFKD", text)
    return "".join(ch for ch in text if not unicodedata.combining(ch))


def br_number(value, decimals=2):
    if not isfinite(value):
        return "n.a."
    txt = f"{value:,.{decimals}f}"
    return txt.replace(",", "X").replace(".", ",").replace("X", ".")


def br_money(value):
    if not isfinite(value):
        return "R$ n.a."
    return f"R$ {br_number(value, 0)}"


def ratio(value):
    if not isfinite(value):
        return "n.a."
    return f"{br_number(value, 2)}x"


def pct(value):
    if not isfinite(value):
        return "n.a."
    return f"{br_number(value * 100, 1)}%"


def normal_pdf(z):
    return exp(-0.5 * z * z) / sqrt(2 * pi)


def normal_cdf(z):
    return (1 + erf(z / sqrt(2))) / 2


def get_sheet_by_name(wb, target_name):
    target = norm_text(target_name)
    for sheet in wb.sheetnames:
        if norm_text(sheet) == target:
            return wb[sheet]
    return None


def find_row_by_labels(ws, label_a, label_b=None):
    want_a = norm_text(label_a)
    want_b = norm_text(label_b) if label_b is not None else None
    for row in range(1, ws.max_row + 1):
        a = norm_text(ws.cell(row, 1).value)
        b = norm_text(ws.cell(row, 2).value)
        if a == want_a and (want_b is None or b == want_b):
            return row
    return None


def portfolio_label_to_source(label):
    n = norm_text(label)
    mapping = {
        "sudeste/centro-oeste": "SE/CO",
        "sudeste/centro oeste": "SE/CO",
        "sul": "SUL",
        "nordeste": "NORDESTE",
        "norte": "NORTE",
        "convencional": "CONVENCIONAL",
        "incentivada 0%": "I0",
        "i0": "I0",
        "incentivada 50%": "I5/CQ5",
        "cq5": "I5/CQ5",
        "incentivada 80%": "I8",
        "i8": "I8",
        "incentivada 100%": "I1",
        "i1": "I1",
    }
    return mapping.get(n, "")


def forward_row_to_source(label):
    n = norm_text(label)
    mapping = {
        "seco/conv": "SE/CO",
        "s": "SUL",
        "ne": "NORDESTE",
        "n": "NORTE",
        "i0": "I0",
        "i5/cq5": "I5/CQ5",
        "i8": "I8",
        "i1": "I1",
    }
    return mapping.get(n, "")


def get_post_state(params):
    state = deepcopy(DEFAULT_STATE)
    state["xlsxPath"] = params.get("xlsx_path", [state["xlsxPath"]])[0].strip() or state["xlsxPath"]
    state["pla"] = parse_number(params.get("pla", [state["pla"]])[0], state["pla"])

    state["company"]["name"] = params.get("company_name", [""])[0].strip()
    state["company"]["cnpj"] = params.get("company_cnpj", [""])[0].strip()
    state["company"]["analyst"] = params.get("company_analyst", [""])[0].strip()
    state["company"]["note"] = params.get("company_note", [""])[0].strip()

    for key, value in state["parameters"].items():
        field_name = f"parameters_{key}"
        if isinstance(value, bool):
            state["parameters"][key] = parse_bool(params.get(field_name, [""])[0])
        else:
            state["parameters"][key] = parse_number(params.get(field_name, [value])[0], value)

    for i, row in enumerate(state["portfolio"]):
        for key in (
            "hours",
            "exposure",
            "forward",
            "volatility",
            "rec",
            "pmRec",
            "req",
            "pmReq",
            "acrRevenue",
            "stressLongPrice",
            "stressShortPrice",
        ):
            row[key] = parse_number(params.get(f"portfolio_{i}_{key}", [row[key]])[0], row[key])

    for source in SOURCE_KEYS:
        field = SOURCE_FIELDS[source]
        for i in range(7):
            key = f"forward_{field}_{i}"
            state["sourceForward"][source][i] = parse_number(
                params.get(key, [state["sourceForward"][source][i]])[0],
                state["sourceForward"][source][i],
            )
    return state


def load_calc_state_from_xlsx(path_text):
    path = Path(path_text).expanduser()
    if not path.exists():
        raise FileNotFoundError(f"Planilha nao encontrada: {path}")

    imported = deepcopy(DEFAULT_STATE)
    imported["xlsxPath"] = str(path)
    wb = load_workbook(str(path), data_only=True)

    ws_premissas = get_sheet_by_name(wb, "Premissas")
    ws_forward = get_sheet_by_name(wb, "Curva Forward")
    ws_portfolio = get_sheet_by_name(wb, "Declaracao Portfolio")
    ws_pla = get_sheet_by_name(wb, "Patrimonio Liquido Ajustado")
    ws_consolidado = get_sheet_by_name(wb, "Consolidado")
    ws_var = get_sheet_by_name(wb, "Calculo VaR e Teste de Estresse")

    if ws_premissas:
        conf = parse_number(ws_premissas.cell(4, 2).value, 0.95)
        imported["parameters"]["confidence"] = conf * 100 if conf <= 1.5 else conf
        imported["parameters"]["liquidationDays"] = parse_number(
            ws_premissas.cell(5, 2).value, imported["parameters"]["liquidationDays"]
        )
        imported["parameters"]["pldMin"] = parse_number(ws_premissas.cell(13, 2).value, imported["parameters"]["pldMin"])
        imported["parameters"]["pldMax"] = parse_number(ws_premissas.cell(14, 2).value, imported["parameters"]["pldMax"])

        for i in range(7):
            col = 2 + i
            vol_raw = parse_number(ws_premissas.cell(9, col).value, 0)
            imported["portfolio"][i]["volatility"] = vol_raw * 100 if vol_raw <= 1.5 else vol_raw
            imported["portfolio"][i]["stressLongPrice"] = parse_number(ws_premissas.cell(10, col).value, 0)
            imported["portfolio"][i]["stressShortPrice"] = parse_number(ws_premissas.cell(11, col).value, 0)

        # Correlation matrix in rows 17..23 and cols 2..8
        corr_vals = []
        for r in range(17, 24):
            for c in range(2, 9):
                corr_vals.append(parse_number(ws_premissas.cell(r, c).value, 1))
        if corr_vals:
            imported["parameters"]["correlation"] = sum(corr_vals) / len(corr_vals)

    if ws_var:
        phi = parse_number(ws_var.cell(5, 12).value, imported["parameters"]["phiZ"])
        if phi > 0:
            imported["parameters"]["phiZ"] = phi

    if ws_forward:
        for row in range(15, 23):
            source = forward_row_to_source(ws_forward.cell(row, 1).value)
            if not source:
                continue
            for i in range(7):
                value = parse_number(ws_forward.cell(row, 2 + i).value, 0)
                imported["sourceForward"][source][i] = value
                if source == "SE/CO":
                    imported["portfolio"][i]["forward"] = value

        # Use SE/CO forward as proxy for CONVENCIONAL when not explicitly available.
        imported["sourceForward"]["CONVENCIONAL"] = imported["sourceForward"]["SE/CO"][:]

    if ws_consolidado:
        theta = parse_number(ws_consolidado.cell(4, 3).value, imported["parameters"]["theta"])
        imported["parameters"]["theta"] = theta
        for i in range(7):
            imported["portfolio"][i]["hours"] = parse_number(
                ws_consolidado.cell(15, 3 + i).value, imported["portfolio"][i]["hours"]
            )

    if ws_portfolio:
        # PLA appears in B3.
        imported["pla"] = parse_number(ws_portfolio.cell(3, 2).value, imported["pla"])
        row_resource = find_row_by_labels(ws_portfolio, "RECURSO", "Preco Fixo, Consumo e Geracao")
        row_pm_rec = find_row_by_labels(ws_portfolio, "PRECO MEDIO RECURSO", "Preco Fixo, Consumo e Geracao")
        row_req = find_row_by_labels(ws_portfolio, "REQUISITO", "Preco Fixo, Consumo e Geracao")
        row_pm_req = find_row_by_labels(ws_portfolio, "PRECO MEDIO REQUISITO", "Preco Fixo, Consumo e Geracao")
        row_net = find_row_by_labels(ws_portfolio, "NET ENERGETICO", "Preco Fixo, Consumo e Geracao")
        # Source exposures by row labels in the fixed-price section.
        for row in range(6, 21):
            portfolio_type = norm_text(ws_portfolio.cell(row, 2).value)
            if portfolio_type != norm_text("Preco Fixo, Consumo e Geracao"):
                continue
            source = portfolio_label_to_source(ws_portfolio.cell(row, 1).value)
            if not source:
                continue
            for i in range(7):
                imported["sourceExposure"][source][i] += parse_number(ws_portfolio.cell(row, 4 + i).value, 0)

        for i in range(7):
            col = 4 + i
            if row_resource:
                imported["portfolio"][i]["rec"] = parse_number(
                    ws_portfolio.cell(row_resource, col).value, imported["portfolio"][i]["rec"]
                )
            if row_pm_rec:
                imported["portfolio"][i]["pmRec"] = parse_number(
                    ws_portfolio.cell(row_pm_rec, col).value, imported["portfolio"][i]["pmRec"]
                )
            if row_req:
                imported["portfolio"][i]["req"] = parse_number(
                    ws_portfolio.cell(row_req, col).value, imported["portfolio"][i]["req"]
                )
            if row_pm_req:
                imported["portfolio"][i]["pmReq"] = parse_number(
                    ws_portfolio.cell(row_pm_req, col).value, imported["portfolio"][i]["pmReq"]
                )
            if row_net:
                imported["portfolio"][i]["exposure"] = parse_number(
                    ws_portfolio.cell(row_net, col).value, imported["portfolio"][i]["exposure"]
                )

    if ws_pla:
        pla_sheet = parse_number(ws_pla.cell(4, 3).value, 0)
        if pla_sheet != 0:
            imported["pla"] = pla_sheet

    return imported


def apply_imported_calc_data(base_state, imported_state):
    # Keep company metadata from the current form. Import should only alter calculation data.
    merged = deepcopy(base_state)
    merged["xlsxPath"] = imported_state["xlsxPath"]
    merged["pla"] = imported_state["pla"]
    merged["parameters"] = imported_state["parameters"]
    merged["portfolio"] = imported_state["portfolio"]
    merged["sourceExposure"] = imported_state["sourceExposure"]
    merged["sourceForward"] = imported_state["sourceForward"]
    return merged


def build_source_month_summary(state, month_results, params):
    summaries = []
    for i, m in enumerate(month_results):
        entries = []
        for source in SOURCE_KEYS:
            exp_src = state["sourceExposure"].get(source, [0.0] * 7)[i]
            fwd_src = state["sourceForward"].get(source, [0.0] * 7)[i]
            if fwd_src == 0:
                fwd_src = m["forward"]
            sigma = max(0, m["volatility"] / 100)
            mtm_src = exp_src * fwd_src * m["hours"]
            var_src = abs(mtm_src) * params["phiZ"] * sigma * sqrt(max(0, params["liquidationDays"]))
            if exp_src >= 0:
                stress_price = m["stressLongPrice"] or max(params["pldMin"], fwd_src * (1 - 0.24))
            else:
                stress_price = m["stressShortPrice"] or min(params["pldMax"], fwd_src * (1 + 0.32))
            stress_src = abs(exp_src) * m["hours"] * abs(fwd_src - stress_price)
            risk_src = var_src + params["theta"] * stress_src
            entries.append(
                {
                    "source": source,
                    "exposure": exp_src,
                    "forward": fwd_src,
                    "mtm": mtm_src,
                    "var": var_src,
                    "stress": stress_src,
                    "risk": risk_src,
                }
            )

        entries.sort(key=lambda x: abs(x["risk"]), reverse=True)
        total_risk = sum(abs(x["risk"]) for x in entries)
        summaries.append(
            {
                "month": m["month"],
                "totalRisk": total_risk,
                "top": entries[:4],
                "all": entries,
            }
        )
    return summaries


def build_source_totals(state, month_results, params):
    acc = {source: {"source": source, "exposure": 0.0, "mtm": 0.0, "var": 0.0, "stress": 0.0, "risk": 0.0} for source in SOURCE_KEYS}
    for i, m in enumerate(month_results):
        for source in SOURCE_KEYS:
            exp_src = state["sourceExposure"].get(source, [0.0] * 7)[i]
            fwd_src = state["sourceForward"].get(source, [0.0] * 7)[i]
            if fwd_src == 0:
                fwd_src = m["forward"]
            sigma = max(0, m["volatility"] / 100)
            mtm_src = exp_src * fwd_src * m["hours"]
            var_src = abs(mtm_src) * params["phiZ"] * sigma * sqrt(max(0, params["liquidationDays"]))
            if exp_src >= 0:
                stress_price = m["stressLongPrice"] or max(params["pldMin"], fwd_src * (1 - 0.24))
            else:
                stress_price = m["stressShortPrice"] or min(params["pldMax"], fwd_src * (1 + 0.32))
            stress_src = abs(exp_src) * m["hours"] * abs(fwd_src - stress_price)
            risk_src = var_src + params["theta"] * stress_src
            acc[source]["exposure"] += exp_src
            acc[source]["mtm"] += mtm_src
            acc[source]["var"] += var_src
            acc[source]["stress"] += stress_src
            acc[source]["risk"] += risk_src
    totals = list(acc.values())
    totals.sort(key=lambda x: abs(x["risk"]), reverse=True)
    return totals


def calculate(state):
    p = state["parameters"]
    pla = state["pla"]
    sqrt_d = sqrt(max(0, p["liquidationDays"]))

    month_results = []
    for row in state["portfolio"]:
        sigma = max(0, row["volatility"] / 100)
        mtm = row["exposure"] * row["forward"] * row["hours"]
        res_contr = (row["req"] * row["pmReq"] - row["rec"] * row["pmRec"]) * row["hours"]
        var_value = abs(mtm) * p["phiZ"] * sigma * sqrt_d
        if row["exposure"] >= 0:
            stress_price = row["stressLongPrice"] or max(p["pldMin"], row["forward"] * (1 - 0.24))
        else:
            stress_price = row["stressShortPrice"] or min(p["pldMax"], row["forward"] * (1 + 0.32))
        stress_loss = abs(row["exposure"]) * row["hours"] * abs(row["forward"] - stress_price)
        month_results.append(
            {
                **row,
                "mtm": mtm,
                "resContr": res_contr,
                "varValue": var_value,
                "stressLoss": stress_loss,
            }
        )

    # Recalculate month VaR/Stress from detailed source forward curves.
    source_month = build_source_month_summary(state, month_results, p)
    for idx, detail in enumerate(source_month):
        month_results[idx]["varValue"] = sum(item["var"] for item in detail["all"])
        month_results[idx]["stressLoss"] = sum(item["stress"] for item in detail["all"])
        month_results[idx]["mtm"] = sum(item["mtm"] for item in detail["all"])

    var_vector = [row["varValue"] for row in month_results]
    rho = clamp(p["correlation"], -1, 1)
    var_quadratic = 0.0
    for i in range(len(var_vector)):
        for j in range(len(var_vector)):
            var_quadratic += var_vector[i] * (1 if i == j else rho) * var_vector[j]
    var_total = sqrt(max(0, var_quadratic))
    stress_total = sum(row["stressLoss"] for row in month_results)
    additional_risk = stress_total
    rwa = var_total + p["theta"] * additional_risk

    pnl = sum(row["mtm"] + row["resContr"] for row in month_results)
    acr_revenue = sum(row["acrRevenue"] for row in month_results)
    res_fin = pnl + acr_revenue
    fa_risk = rwa / pla if pla != 0 else float("inf")
    fa = max(0, (rwa - res_fin) / pla) if pla > 0 else float("inf")

    stress_ratio = stress_total / pla if pla > 0 else float("inf")
    source_totals = build_source_totals(state, month_results, p)
    top_source_risk = abs(source_totals[0]["risk"]) if source_totals else 0.0
    top_source_ratio = top_source_risk / pla if pla > 0 else float("inf")

    # Market-risk focused score (no full DRE assumptions).
    if pla <= 0:
        score = 0.0
    else:
        m = max(0.001, p["faReference"])
        score = 100.0
        score -= min(60.0, (fa / m) * 40.0)
        score -= min(20.0, (fa_risk / m) * 15.0)
        score -= min(15.0, stress_ratio * 45.0)
        score -= min(20.0, top_source_ratio * 80.0)
        score = clamp(score, 0.0, 100.0)

    if score >= 90:
        rating = "AAA"
    elif score >= 80:
        rating = "AA"
    elif score >= 70:
        rating = "A"
    elif score >= 60:
        rating = "BBB"
    elif score >= 50:
        rating = "BB"
    elif score >= 40:
        rating = "B"
    else:
        rating = "CCC"

    notes = []
    if pla <= 0:
        verdict = "Critica"
        notes.append("PLA <= 0. Sem base prudencial para sustentar risco.")
    else:
        m = p["faReference"]
        if fa > m:
            notes.append(f"FA ({ratio(fa)}) acima de M ({ratio(m)}).")
        elif fa > m * 0.8:
            notes.append(f"FA ({ratio(fa)}) em zona de atencao (acima de 80% de M).")
        if fa_risk > m:
            notes.append("FA risco acima da referencia de mercado.")
        if stress_ratio > 0.25:
            notes.append("Stress / PLA acima de 25%.")
        if top_source_ratio > 0.35:
            notes.append("Concentracao de risco em uma fonte/submercado acima de 35% do PLA.")
        if res_fin < 0:
            notes.append("Resultado financeiro prudencial negativo (agravante).")
        if not notes:
            notes.append("Sem gatilho critico de alavancagem nos parametros atuais.")

        if fa > m or fa_risk > m * 1.1:
            verdict = "Alavancada"
        elif fa > m * 0.8 or stress_ratio > 0.25 or top_source_ratio > 0.35:
            verdict = "Atencao"
        else:
            verdict = "Saudavel"

    return {
        "pla": pla,
        "monthResults": month_results,
        "varTotal": var_total,
        "stressTotal": stress_total,
        "additionalRisk": additional_risk,
        "rwaMarket": rwa,
        "rwa": rwa,
        "pnl": pnl,
        "acrRevenue": acr_revenue,
        "resFin": res_fin,
        "faRisk": fa_risk,
        "fa": fa,
        "exposureNet": sum(row["exposure"] for row in state["portfolio"]),
        "score": score,
        "rating": rating,
        "stressRatio": stress_ratio,
        "topSourceRatio": top_source_ratio,
        "verdict": verdict,
        "notes": notes,
        "sourceMonthSummary": source_month,
        "sourceTotalSummary": source_totals,
    }


def load_history():
    if not HISTORY_PATH.exists():
        return []
    try:
        return json.loads(HISTORY_PATH.read_text(encoding="utf-8"))
    except Exception:
        return []


def save_history(records):
    HISTORY_PATH.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")


def append_history_record(state, metrics):
    records = load_history()
    now = datetime.now().isoformat(timespec="seconds")
    record = {
        "timestamp": now,
        "company_name": state["company"]["name"],
        "company_cnpj": state["company"]["cnpj"],
        "analyst": state["company"]["analyst"],
        "note": state["company"]["note"],
        "verdict": metrics["verdict"],
        "fa": metrics["fa"],
        "faRisk": metrics["faRisk"],
        "pla": metrics["pla"],
        "rwa": metrics["rwa"],
        "varTotal": metrics["varTotal"],
        "stressTotal": metrics["stressTotal"],
        "resFin": metrics["resFin"],
        "score": metrics["score"],
        "rating": metrics["rating"],
        "notes": metrics["notes"],
    }
    records.append(record)
    records = records[-500:]
    save_history(records)
    return record


def render_history_page():
    records = load_history()
    rows = []
    for rec in reversed(records):
        rows.append(
            f"""
            <tr>
              <td>{escape(rec.get("timestamp", ""))}</td>
              <td>{escape(rec.get("company_name", ""))}</td>
              <td>{escape(rec.get("company_cnpj", ""))}</td>
              <td>{escape(rec.get("verdict", ""))}</td>
              <td>{ratio(parse_number(rec.get("fa"), 0))}</td>
              <td>{ratio(parse_number(rec.get("faRisk"), 0))}</td>
              <td>{br_money(parse_number(rec.get("pla"), 0))}</td>
              <td>{br_money(parse_number(rec.get("rwa"), 0))}</td>
              <td>{escape(rec.get("rating", ""))} ({br_number(parse_number(rec.get("score"), 0), 1)})</td>
            </tr>
            """
        )

    if not rows:
        rows.append('<tr><td colspan="9">Sem historico salvo ate o momento.</td></tr>')

    return f"""<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Historico de Analises</title>
  <style>
    body{{margin:0;background:#f6f6f2;font-family:Segoe UI,Arial,sans-serif;color:#1c221f}}
    .wrap{{max-width:1240px;margin:0 auto;padding:18px}}
    .top{{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}}
    .card{{background:#fff;border:1px solid #d9ddd8;border-radius:8px;padding:14px}}
    a.btn{{display:inline-block;padding:8px 12px;background:#12231e;color:#fff;border-radius:7px;text-decoration:none}}
    .table-wrap{{overflow:auto;border:1px solid #d9ddd8;border-radius:8px;margin-top:12px}}
    table{{width:100%;border-collapse:collapse;min-width:980px}}
    th,td{{padding:8px;border-bottom:1px solid #d9ddd8;text-align:left;font-size:.9rem}}
    th{{font-size:.72rem;color:#67706b;text-transform:uppercase}}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div>
        <h1 style="margin:0">Historico de Analises Salvas</h1>
        <p style="margin:6px 0 0 0;color:#67706b">Registros por empresa para trilha de decisao de risco.</p>
      </div>
      <a class="btn" href="/">Voltar para calculadora</a>
    </div>
    <div class="card" style="margin-top:12px">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Data/Hora</th><th>Empresa</th><th>CNPJ</th><th>Parecer</th>
              <th>FA</th><th>FA Risco</th><th>PLA</th><th>RWA</th><th>Rating</th>
            </tr>
          </thead>
          <tbody>
            {''.join(rows)}
          </tbody>
        </table>
      </div>
    </div>
  </div>
</body>
</html>"""


def render_main_page(state, metrics, flash_msg):
    p = state["parameters"]
    direction = "Net long" if metrics["exposureNet"] > 0.5 else "Net short" if metrics["exposureNet"] < -0.5 else "Net zerado"

    def param_input(name):
        return f'<input name="parameters_{name}" value="{state["parameters"][name]}" />'

    rows_portfolio = []
    for i, row in enumerate(state["portfolio"]):
        rows_portfolio.append(
            f"""
            <tr>
              <td>{escape(row["month"])}</td>
              <td><input name="portfolio_{i}_hours" value="{row["hours"]}" /></td>
              <td><input name="portfolio_{i}_exposure" value="{row["exposure"]}" /></td>
              <td><input name="portfolio_{i}_forward" value="{row["forward"]}" /></td>
              <td><input name="portfolio_{i}_volatility" value="{row["volatility"]}" /></td>
              <td><input name="portfolio_{i}_rec" value="{row["rec"]}" /></td>
              <td><input name="portfolio_{i}_pmRec" value="{row["pmRec"]}" /></td>
              <td><input name="portfolio_{i}_req" value="{row["req"]}" /></td>
              <td><input name="portfolio_{i}_pmReq" value="{row["pmReq"]}" /></td>
              <td><input name="portfolio_{i}_acrRevenue" value="{row["acrRevenue"]}" /></td>
              <td><input name="portfolio_{i}_stressLongPrice" value="{row["stressLongPrice"]}" /></td>
              <td><input name="portfolio_{i}_stressShortPrice" value="{row["stressShortPrice"]}" /></td>
            </tr>
            """
        )

    rows_forward = []
    for source in SOURCE_KEYS:
        field = SOURCE_FIELDS[source]
        cells = []
        for i in range(7):
            cells.append(
                f'<td><input name="forward_{field}_{i}" value="{state["sourceForward"][source][i]}" /></td>'
            )
        rows_forward.append(f"<tr><td>{escape(source)}</td>{''.join(cells)}</tr>")
    month_detail_rows = []
    for month in metrics["sourceMonthSummary"]:
        top_lines = []
        for item in month["top"]:
            direction = "Long" if item["exposure"] >= 0 else "Short"
            top_lines.append(
                f'{item["source"]}: {direction} {br_number(item["exposure"],2)} MWm | VaR {br_money(item["var"])} | Stress {br_money(item["stress"])}'
            )
        month_detail_rows.append(
            f"""
            <tr>
              <td>{escape(month["month"])}</td>
              <td>{br_money(month["totalRisk"])}</td>
              <td>{'<br>'.join(escape(x) for x in top_lines)}</td>
            </tr>
            """
        )

    source_total_rows = []
    for item in metrics["sourceTotalSummary"][:10]:
        direction = "Long" if item["exposure"] >= 0 else "Short"
        source_total_rows.append(
            f"""
            <tr>
              <td>{escape(item["source"])}</td>
              <td>{direction}</td>
              <td>{br_number(item["exposure"],2)}</td>
              <td>{br_money(item["mtm"])}</td>
              <td>{br_money(item["var"])}</td>
              <td>{br_money(item["stress"])}</td>
              <td>{br_money(item["risk"])}</td>
            </tr>
            """
        )

    return f"""<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Calculadora FA Prudencial</title>
  <style>
    :root {{
      --bg:#f6f6f2; --panel:#fff; --ink:#1c221f; --line:#d9ddd8; --muted:#67706b; --accent:#12231e;
    }}
    *{{box-sizing:border-box}}
    body{{margin:0;background:var(--bg);font-family:Segoe UI,Arial,sans-serif;color:var(--ink)}}
    .wrap{{max-width:1320px;margin:0 auto;padding:18px}}
    .top{{display:flex;justify-content:space-between;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:12px}}
    h1{{margin:0;font-size:2rem}} h2{{margin:0 0 8px 0;font-size:1.18rem}}
    .muted{{color:var(--muted)}}
    .btns{{display:flex;gap:8px;flex-wrap:wrap}}
    button,a.btn{{background:var(--accent);color:#fff;border:1px solid var(--accent);border-radius:7px;padding:9px 12px;cursor:pointer;text-decoration:none;display:inline-block}}
    .card{{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:14px}}
    .grid5{{display:grid;grid-template-columns:repeat(5,minmax(170px,1fr));gap:10px}}
    .big{{font-size:2rem;font-weight:700;margin-top:6px}}
    .layout{{display:grid;grid-template-columns:1fr;gap:12px;margin-top:12px}}
    .table-wrap{{overflow:auto;border:1px solid var(--line);border-radius:8px}}
    table{{width:100%;border-collapse:collapse;min-width:1100px}}
    th,td{{padding:8px;border-bottom:1px solid var(--line);text-align:left;font-size:.9rem}}
    th{{font-size:.72rem;color:var(--muted);text-transform:uppercase}}
    input,select,textarea{{width:100%;padding:7px;border:1px solid #c8cfca;border-radius:6px;background:#fff}}
    .formgrid{{display:grid;grid-template-columns:repeat(4,minmax(170px,1fr));gap:10px}}
    .field label{{display:block;font-size:.75rem;color:var(--muted);text-transform:uppercase;margin-bottom:4px}}
    .kpis{{display:grid;grid-template-columns:repeat(4,minmax(170px,1fr));gap:10px;margin-top:10px}}
    .tag{{display:inline-block;padding:4px 8px;border-radius:999px;background:#e8f0ec;color:#1f6d58;font-size:.8rem;font-weight:700}}
    .check{{display:flex;align-items:center;gap:8px}}
    .check input{{width:18px;height:18px}}
    @media(max-width:1080px){{.grid5,.formgrid,.kpis{{grid-template-columns:1fr 1fr}}}}
    @media(max-width:680px){{.grid5,.formgrid,.kpis{{grid-template-columns:1fr}}}}
  </style>
</head>
<body>
  <div class="wrap">
    <form method="post">
      <div class="top">
        <div>
          <p class="muted" style="margin:0">Monitoramento prudencial CCEE</p>
          <h1>Calculadora de Alavancagem</h1>
          <p class="muted" style="margin:6px 0 0 0">Modelo alinhado a planilha semanal e manual prudencial, sem DRE completo.</p>
        </div>
        <div class="btns">
          <button type="submit" name="action" value="calculate">Recalcular</button>
          <button type="submit" name="action" value="import_xlsx">Importar da planilha</button>
          <button type="submit" name="action" value="save_analysis">Salvar analise</button>
          <a class="btn" href="/historico">Historico salvo</a>
        </div>
      </div>
      <div class="card" style="margin-bottom:12px">
        <p class="muted" style="margin:0">{escape(flash_msg)}</p>
      </div>

      <section class="card" style="margin-bottom:12px">
        <h2>Empresa e importacao</h2>
        <div class="formgrid">
          <div class="field"><label>Empresa</label><input name="company_name" value="{escape(state["company"]["name"])}" /></div>
          <div class="field"><label>CNPJ</label><input name="company_cnpj" value="{escape(state["company"]["cnpj"])}" /></div>
          <div class="field"><label>Analista</label><input name="company_analyst" value="{escape(state["company"]["analyst"])}" /></div>
          <div class="field"><label>PLA ajustado (R$)</label><input name="pla" value="{state["pla"]}" /></div>
          <div class="field" style="grid-column:1 / -1"><label>Caminho planilha semanal</label><input name="xlsx_path" value="{escape(state["xlsxPath"])}" /></div>
          <div class="field" style="grid-column:1 / -1"><label>Nota da analise</label><textarea name="company_note" rows="2">{escape(state["company"]["note"])}</textarea></div>
        </div>
      </section>

      <section class="grid5">
        <article class="card"><span class="muted">FA divulgado</span><div class="big">{ratio(metrics["fa"])}</div></article>
        <article class="card"><span class="muted">FA risco</span><div class="big">{ratio(metrics["faRisk"])}</div></article>
        <article class="card"><span class="muted">RWA total</span><div class="big">{br_money(metrics["rwa"])}</div></article>
        <article class="card"><span class="muted">Score / Rating</span><div class="big">{br_number(metrics["score"],1)}</div><span class="muted">{escape(metrics["rating"])}</span></article>
        <article class="card"><span class="muted">Parecer</span><div class="big">{escape(metrics["verdict"])}</div><span class="tag">{escape(metrics["notes"][0])}</span></article>
      </section>

      <section class="layout">
        <article class="card">
          <h2>Portfolio prudencial (M+0 a M+6)</h2>
          <p class="muted">Direcao: <strong>{direction}</strong></p>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Mes</th><th>Horas</th><th>Net MWm</th><th>Forward</th><th>Vol %</th>
                  <th>Recurso</th><th>PM Recurso</th><th>Requisito</th><th>PM Requisito</th>
                  <th>Receita ACR</th><th>Stress Long</th><th>Stress Short</th>
                </tr>
              </thead>
              <tbody>{''.join(rows_portfolio)}</tbody>
            </table>
          </div>
        </article>

        <article class="card">
          <h2>Curva Forward (ACL) por fonte/submercado</h2>
          <p class="muted">Curva base para marcação a mercado e risco financeiro semanal.</p>
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>Fonte/Submercado</th><th>M+0</th><th>M+1</th><th>M+2</th><th>M+3</th><th>M+4</th><th>M+5</th><th>M+6</th></tr>
              </thead>
              <tbody>{''.join(rows_forward)}</tbody>
            </table>
          </div>
          <div class="kpis">
            <div class="card"><span class="muted">Stress/PLA</span><div class="big">{pct(metrics["stressRatio"])}</div></div>
            <div class="card"><span class="muted">Maior fonte de risco/PLA</span><div class="big">{pct(metrics["topSourceRatio"])}</div></div>
            <div class="card"><span class="muted">VaR total</span><div class="big">{br_money(metrics["varTotal"])}</div></div>
            <div class="card"><span class="muted">Stress total</span><div class="big">{br_money(metrics["stressTotal"])}</div></div>
          </div>
        </article>

        <article class="card">
          <h2>Parametros de risco</h2>
          <div class="formgrid">
            <div class="field"><label>Referencia M</label>{param_input("faReference")}</div>
            <div class="field"><label>Confianca %</label>{param_input("confidence")}</div>
            <div class="field"><label>Phi normal</label>{param_input("phiZ")}</div>
            <div class="field"><label>Dias liquidacao</label>{param_input("liquidationDays")}</div>
            <div class="field"><label>Correlacao media</label>{param_input("correlation")}</div>
            <div class="field"><label>Theta</label>{param_input("theta")}</div>
            <div class="field"><label>PLD minimo</label>{param_input("pldMin")}</div>
            <div class="field"><label>PLD maximo</label>{param_input("pldMax")}</div>
          </div>
          <p class="muted">Campos alinhados ao modelo da planilha semanal (premissas e parâmetros prudenciais).</p>
        </article>

        <article class="card">
          <h2>Leitura metodologica e parecer</h2>
          <p><strong>Formula base:</strong> FA = max(0,(RWA - RES_FIN)/PLA), FA_Risco = RWA/PLA, RWA = VaR + theta*Stress.</p>
          <p><strong>Apuracao atual:</strong> VaR {br_money(metrics["varTotal"])}, Stress {br_money(metrics["stressTotal"])}, RWA {br_money(metrics["rwa"])}, RES_FIN {br_money(metrics["resFin"])}.</p>
          <p><strong>Regras do parecer:</strong> {' '.join(escape(n) for n in metrics["notes"])}</p>
          <p class="muted">Historico salvo por empresa disponivel na pagina "Historico salvo".</p>
        </article>

        <article class="card">
          <h2>Resumo de risco por mes (detalhado)</h2>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Mes</th><th>Risco agregado (VaR + theta*Stress)</th><th>Principais fontes/submercados do risco</th></tr></thead>
              <tbody>{''.join(month_detail_rows)}</tbody>
            </table>
          </div>
        </article>

        <article class="card">
          <h2>Resumo de risco por fonte (horizonte total)</h2>
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>Fonte/Submercado</th><th>Direcao</th><th>Exposicao MWm</th><th>MtM</th><th>VaR</th><th>Stress</th><th>Risco combinado</th></tr>
              </thead>
              <tbody>{''.join(source_total_rows)}</tbody>
            </table>
          </div>
        </article>
      </section>
    </form>
  </div>
</body>
</html>
"""


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/historico":
            content = render_history_page().encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
            return

        state = deepcopy(DEFAULT_STATE)
        metrics = calculate(state)
        content = render_main_page(
            state,
            metrics,
            "Use a importacao da planilha semanal para atualizar apenas os dados de calculo.",
        ).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/historico":
            self.send_response(405)
            self.end_headers()
            return

        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length).decode("utf-8", errors="replace")
        params = parse_qs(body, keep_blank_values=True)
        action = params.get("action", ["calculate"])[0]

        state = get_post_state(params)
        flash_msg = "Campos recalculados."

        if action == "import_xlsx":
            try:
                imported = load_calc_state_from_xlsx(state["xlsxPath"])
                state = apply_imported_calc_data(state, imported)
                flash_msg = f"Planilha importada com sucesso: {state['xlsxPath']}"
            except Exception as exc:
                flash_msg = f"Falha ao importar planilha: {exc}"
        elif action == "save_analysis":
            metrics_tmp = calculate(state)
            rec = append_history_record(state, metrics_tmp)
            flash_msg = (
                "Analise salva no historico para "
                + (rec["company_name"] or "empresa sem nome")
                + "."
            )
        elif action == "calculate":
            flash_msg = "Campos recalculados."

        metrics = calculate(state)
        content = render_main_page(state, metrics, flash_msg).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def log_message(self, fmt, *args):
        return


def run():
    server = HTTPServer((HOST, PORT), Handler)
    print(f"Calculadora FA prudencial em http://{HOST}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    run()
