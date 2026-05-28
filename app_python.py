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
DEFAULT_HOURS = [744, 720, 744, 744, 720, 744, 720]
EPS = 1e-6

FIXED_SOURCES = [
    "SE/CO",
    "SUL",
    "NORDESTE",
    "NORTE",
    "CONVENCIONAL",
    "I0",
    "I5",
    "CQ5",
    "I8",
    "I1",
]
DERIVATIVE_SOURCES = ["SE/CO", "SUL", "NORDESTE", "NORTE", "CONVENCIONAL"]
RISK_SOURCES = FIXED_SOURCES[:]

SOURCE_FIELDS = {
    "SE/CO": "SECO",
    "SUL": "SUL",
    "NORDESTE": "NE",
    "NORTE": "N",
    "CONVENCIONAL": "CONV",
    "I0": "I0",
    "I5": "I5",
    "CQ5": "CQ5",
    "I8": "I8",
    "I1": "I1",
}

SECTION_DEFS = [
    {
        "key": "fixed",
        "title": "Portfolio - Preco Fixo, Consumo e Geracao",
        "sources": FIXED_SOURCES,
        "has_pm_requirement": True,
        "sheet": {
            "source_start": 6,
            "resource": 16,
            "pm_resource": 17,
            "requirement": 18,
            "pm_requirement": 19,
            "net": 20,
        },
    },
    {
        "key": "variable",
        "title": "Portfolio - Preco Variavel",
        "sources": FIXED_SOURCES,
        "has_pm_requirement": True,
        "sheet": {
            "source_start": 22,
            "resource": 32,
            "pm_resource": 33,
            "requirement": 34,
            "pm_requirement": 35,
            "net": 36,
        },
    },
    {
        "key": "derivatives",
        "title": "Portfolio - Derivativos",
        "sources": DERIVATIVE_SOURCES,
        "has_pm_requirement": False,
        "sheet": {
            "source_start": 38,
            "resource": 43,
            "pm_resource": 44,
            "requirement": 45,
            "pm_requirement": None,
            "net": 46,
        },
    },
]

HISTORY_PATH = Path(__file__).with_name("historico_analises.json")
DEFAULT_XLSX_PATH = (
    r"C:\Users\rafac\Documents\Codex\2026-05-27\files-mentioned-by-the-user-manual\simulacao_semanal.xlsx"
)


def make_section_state(source_labels, has_pm_requirement):
    return {
        "sources": {label: [0.0] * 7 for label in source_labels},
        "resource": [0.0] * 7,
        "pmResource": [0.0] * 7,
        "requirement": [0.0] * 7,
        "pmRequirement": ([0.0] * 7) if has_pm_requirement else None,
        "netLine": [0.0] * 7,
    }


def new_default_state():
    return {
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
        "vertex": {
            "hours": DEFAULT_HOURS[:],
            "volatility": [0.0] * 7,
            "stressLongPrice": [0.0] * 7,
            "stressShortPrice": [0.0] * 7,
        },
        "portfolio": {
            "fixed": make_section_state(FIXED_SOURCES, True),
            "variable": make_section_state(FIXED_SOURCES, True),
            "derivatives": make_section_state(DERIVATIVE_SOURCES, False),
            "regulatedRevenue": [0.0] * 7,
        },
        "forward": {key: [0.0] * 7 for key in RISK_SOURCES},
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


def section_def_by_key(key):
    for item in SECTION_DEFS:
        if item["key"] == key:
            return item
    raise KeyError(key)


def forward_field(source):
    return SOURCE_FIELDS[source]


def get_post_state(params):
    state = new_default_state()
    state["xlsxPath"] = params.get("xlsx_path", [state["xlsxPath"]])[0].strip() or state["xlsxPath"]
    state["pla"] = parse_number(params.get("pla", [state["pla"]])[0], state["pla"])

    state["company"]["name"] = params.get("company_name", [""])[0].strip()
    state["company"]["cnpj"] = params.get("company_cnpj", [""])[0].strip()
    state["company"]["analyst"] = params.get("company_analyst", [""])[0].strip()
    state["company"]["note"] = params.get("company_note", [""])[0].strip()

    for key, value in state["parameters"].items():
        state["parameters"][key] = parse_number(params.get(f"parameters_{key}", [value])[0], value)

    for i in range(7):
        state["vertex"]["hours"][i] = parse_number(
            params.get(f"vertex_hours_{i}", [state["vertex"]["hours"][i]])[0], state["vertex"]["hours"][i]
        )
        state["vertex"]["volatility"][i] = parse_number(
            params.get(f"vertex_volatility_{i}", [state["vertex"]["volatility"][i]])[0],
            state["vertex"]["volatility"][i],
        )
        state["vertex"]["stressLongPrice"][i] = parse_number(
            params.get(f"vertex_stress_long_{i}", [state["vertex"]["stressLongPrice"][i]])[0],
            state["vertex"]["stressLongPrice"][i],
        )
        state["vertex"]["stressShortPrice"][i] = parse_number(
            params.get(f"vertex_stress_short_{i}", [state["vertex"]["stressShortPrice"][i]])[0],
            state["vertex"]["stressShortPrice"][i],
        )

    for section in SECTION_DEFS:
        key = section["key"]
        data = state["portfolio"][key]
        for source in section["sources"]:
            source_key = forward_field(source)
            for i in range(7):
                form_key = f"sec_{key}_{source_key}_{i}"
                data["sources"][source][i] = parse_number(params.get(form_key, [data["sources"][source][i]])[0], 0.0)

        for i in range(7):
            data["resource"][i] = parse_number(params.get(f"sec_{key}_resource_{i}", [data["resource"][i]])[0], 0.0)
            data["pmResource"][i] = parse_number(
                params.get(f"sec_{key}_pm_resource_{i}", [data["pmResource"][i]])[0], 0.0
            )
            data["requirement"][i] = parse_number(
                params.get(f"sec_{key}_requirement_{i}", [data["requirement"][i]])[0], 0.0
            )
            if section["has_pm_requirement"]:
                data["pmRequirement"][i] = parse_number(
                    params.get(f"sec_{key}_pm_requirement_{i}", [data["pmRequirement"][i]])[0], 0.0
                )
            data["netLine"][i] = parse_number(params.get(f"sec_{key}_net_{i}", [data["netLine"][i]])[0], 0.0)

    for i in range(7):
        state["portfolio"]["regulatedRevenue"][i] = parse_number(
            params.get(f"regulated_revenue_{i}", [state["portfolio"]["regulatedRevenue"][i]])[0],
            state["portfolio"]["regulatedRevenue"][i],
        )

    for source in RISK_SOURCES:
        field = forward_field(source)
        for i in range(7):
            state["forward"][source][i] = parse_number(
                params.get(f"forward_{field}_{i}", [state["forward"][source][i]])[0],
                state["forward"][source][i],
            )
    return state


def read_row_values(ws, row):
    return [parse_number(ws.cell(row, 4 + i).value, 0.0) for i in range(7)]


def load_calc_state_from_xlsx(path_text):
    path = Path(path_text).expanduser()
    if not path.exists():
        raise FileNotFoundError(f"Planilha nao encontrada: {path}")

    imported = new_default_state()
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
            vol_raw = parse_number(ws_premissas.cell(9, col).value, 0.0)
            imported["vertex"]["volatility"][i] = vol_raw * 100 if vol_raw <= 1.5 else vol_raw
            imported["vertex"]["stressLongPrice"][i] = parse_number(ws_premissas.cell(10, col).value, 0.0)
            imported["vertex"]["stressShortPrice"][i] = parse_number(ws_premissas.cell(11, col).value, 0.0)

        corr_vals = []
        for r in range(17, 24):
            for c in range(2, 9):
                corr_vals.append(parse_number(ws_premissas.cell(r, c).value, 1.0))
        if corr_vals:
            imported["parameters"]["correlation"] = sum(corr_vals) / len(corr_vals)

    if ws_var:
        phi = parse_number(ws_var.cell(5, 12).value, imported["parameters"]["phiZ"])
        if phi > 0:
            imported["parameters"]["phiZ"] = phi

    if ws_consolidado:
        imported["parameters"]["theta"] = parse_number(ws_consolidado.cell(4, 3).value, imported["parameters"]["theta"])
        imported["vertex"]["hours"] = [
            parse_number(ws_consolidado.cell(15, 3 + i).value, imported["vertex"]["hours"][i]) for i in range(7)
        ]

    if ws_forward:
        for i in range(7):
            col = 2 + i
            base = parse_number(ws_forward.cell(15, col).value, 0.0)
            spread_s = parse_number(ws_forward.cell(16, col).value, 0.0)
            spread_ne = parse_number(ws_forward.cell(17, col).value, 0.0)
            spread_n = parse_number(ws_forward.cell(18, col).value, 0.0)
            spread_i0 = parse_number(ws_forward.cell(19, col).value, 0.0)
            spread_i5 = parse_number(ws_forward.cell(20, col).value, 0.0)
            spread_i8 = parse_number(ws_forward.cell(21, col).value, 0.0)
            spread_i1 = parse_number(ws_forward.cell(22, col).value, 0.0)

            imported["forward"]["SE/CO"][i] = base
            imported["forward"]["CONVENCIONAL"][i] = base
            imported["forward"]["SUL"][i] = base + spread_s
            imported["forward"]["NORDESTE"][i] = base + spread_ne
            imported["forward"]["NORTE"][i] = base + spread_n
            imported["forward"]["I0"][i] = base + spread_i0
            imported["forward"]["I5"][i] = base + spread_i5
            imported["forward"]["CQ5"][i] = base + spread_i5
            imported["forward"]["I8"][i] = base + spread_i8
            imported["forward"]["I1"][i] = base + spread_i1

    if ws_portfolio:
        imported["pla"] = parse_number(ws_portfolio.cell(3, 2).value, imported["pla"])
        for section in SECTION_DEFS:
            section_data = imported["portfolio"][section["key"]]
            row_start = section["sheet"]["source_start"]
            for offset, source in enumerate(section["sources"]):
                section_data["sources"][source] = read_row_values(ws_portfolio, row_start + offset)
            section_data["resource"] = read_row_values(ws_portfolio, section["sheet"]["resource"])
            section_data["pmResource"] = read_row_values(ws_portfolio, section["sheet"]["pm_resource"])
            section_data["requirement"] = read_row_values(ws_portfolio, section["sheet"]["requirement"])
            if section["has_pm_requirement"]:
                section_data["pmRequirement"] = read_row_values(ws_portfolio, section["sheet"]["pm_requirement"])
            section_data["netLine"] = read_row_values(ws_portfolio, section["sheet"]["net"])

        imported["portfolio"]["regulatedRevenue"] = read_row_values(ws_portfolio, 48)

    if ws_pla:
        pla_sheet = parse_number(ws_pla.cell(4, 3).value, 0)
        if abs(pla_sheet) > EPS:
            imported["pla"] = pla_sheet

    return imported


def apply_imported_calc_data(base_state, imported_state):
    merged = deepcopy(base_state)
    merged["xlsxPath"] = imported_state["xlsxPath"]
    merged["pla"] = imported_state["pla"]
    merged["parameters"] = imported_state["parameters"]
    merged["vertex"] = imported_state["vertex"]
    merged["portfolio"] = imported_state["portfolio"]
    merged["forward"] = imported_state["forward"]
    return merged


def section_checks(section_key, section_data):
    checks = []
    for i, month in enumerate(MONTHS):
        src = section_data["sources"]
        source_sum = sum(src[source][i] for source in src.keys())
        net_line = section_data["netLine"][i]
        resource_minus_requirement = section_data["resource"][i] - section_data["requirement"][i]
        issue = []
        if abs(resource_minus_requirement - net_line) > 0.0001:
            issue.append("linha net difere de recurso-requisito")
        if abs(source_sum - net_line) > 0.0001:
            issue.append("linha net difere da soma das fontes")
        if section_key == "derivatives":
            sub_sum = (
                src.get("SE/CO", [0] * 7)[i]
                + src.get("SUL", [0] * 7)[i]
                + src.get("NORDESTE", [0] * 7)[i]
                + src.get("NORTE", [0] * 7)[i]
            )
            if abs(sub_sum - net_line) > 0.0001:
                issue.append("linha net derivativos difere da soma SE/CO+SUL+NE+N")
        checks.append({"month": month, "ok": len(issue) == 0, "issues": issue})
    return checks


def source_exposure_by_month(state, source, i):
    fixed_val = state["portfolio"]["fixed"]["sources"].get(source, [0.0] * 7)[i]
    variable_val = state["portfolio"]["variable"]["sources"].get(source, [0.0] * 7)[i]
    deriv_val = state["portfolio"]["derivatives"]["sources"].get(source, [0.0] * 7)[i]
    return fixed_val + variable_val + deriv_val


def build_source_month_summary(state, month_results, params):
    summaries = []
    for i, m in enumerate(month_results):
        entries = []
        for source in RISK_SOURCES:
            exposure = source_exposure_by_month(state, source, i)
            forward = state["forward"].get(source, [0.0] * 7)[i]
            if abs(forward) <= EPS:
                forward = state["forward"]["SE/CO"][i]
            sigma = max(0, m["volatility"] / 100)
            mtm = exposure * forward * m["hours"]
            var_value = abs(mtm) * params["phiZ"] * sigma * sqrt(max(0, params["liquidationDays"]))
            if exposure >= 0:
                stress_price = m["stressLongPrice"] or max(params["pldMin"], forward * (1 - 0.24))
            else:
                stress_price = m["stressShortPrice"] or min(params["pldMax"], forward * (1 + 0.32))
            stress = abs(exposure) * m["hours"] * abs(forward - stress_price)
            risk = var_value + params["theta"] * stress
            entries.append(
                {
                    "source": source,
                    "exposure": exposure,
                    "forward": forward,
                    "mtm": mtm,
                    "var": var_value,
                    "stress": stress,
                    "risk": risk,
                }
            )

        entries.sort(key=lambda x: abs(x["risk"]), reverse=True)
        summaries.append(
            {
                "month": m["month"],
                "totalRisk": sum(abs(x["risk"]) for x in entries),
                "top": entries[:4],
                "all": entries,
            }
        )
    return summaries


def build_source_totals(source_month_summary):
    totals = {source: {"source": source, "exposure": 0.0, "mtm": 0.0, "var": 0.0, "stress": 0.0, "risk": 0.0} for source in RISK_SOURCES}
    for month in source_month_summary:
        for item in month["all"]:
            row = totals[item["source"]]
            row["exposure"] += item["exposure"]
            row["mtm"] += item["mtm"]
            row["var"] += item["var"]
            row["stress"] += item["stress"]
            row["risk"] += item["risk"]
    result = list(totals.values())
    result.sort(key=lambda x: abs(x["risk"]), reverse=True)
    return result


def calculate(state):
    p = state["parameters"]
    pla = state["pla"]
    sqrt_d = sqrt(max(0, p["liquidationDays"]))
    checks = {section["key"]: section_checks(section["key"], state["portfolio"][section["key"]]) for section in SECTION_DEFS}

    month_results = []
    for i, month in enumerate(MONTHS):
        fixed_fin = (
            state["portfolio"]["fixed"]["requirement"][i] * state["portfolio"]["fixed"]["pmRequirement"][i]
            - state["portfolio"]["fixed"]["resource"][i] * state["portfolio"]["fixed"]["pmResource"][i]
        ) * state["vertex"]["hours"][i]
        variable_fin = (
            state["portfolio"]["variable"]["requirement"][i] * state["portfolio"]["variable"]["pmRequirement"][i]
            - state["portfolio"]["variable"]["resource"][i] * state["portfolio"]["variable"]["pmResource"][i]
        ) * state["vertex"]["hours"][i]
        res_contr = fixed_fin + variable_fin
        month_results.append(
            {
                "month": month,
                "hours": state["vertex"]["hours"][i],
                "volatility": state["vertex"]["volatility"][i],
                "stressLongPrice": state["vertex"]["stressLongPrice"][i],
                "stressShortPrice": state["vertex"]["stressShortPrice"][i],
                "resContr": res_contr,
                "regulatedRevenue": state["portfolio"]["regulatedRevenue"][i],
                "mtm": 0.0,
                "varValue": 0.0,
                "stressLoss": 0.0,
            }
        )

    source_month = build_source_month_summary(state, month_results, p)
    for i, detail in enumerate(source_month):
        month_results[i]["mtm"] = sum(item["mtm"] for item in detail["all"])
        month_results[i]["varValue"] = sum(item["var"] for item in detail["all"])
        month_results[i]["stressLoss"] = sum(item["stress"] for item in detail["all"])

    var_vector = [row["varValue"] for row in month_results]
    rho = clamp(p["correlation"], -1, 1)
    var_quadratic = 0.0
    for i in range(len(var_vector)):
        for j in range(len(var_vector)):
            var_quadratic += var_vector[i] * (1 if i == j else rho) * var_vector[j]
    var_total = sqrt(max(0, var_quadratic))

    stress_total = sum(row["stressLoss"] for row in month_results)
    rwa = var_total + p["theta"] * stress_total
    res_fin = sum(row["resContr"] + row["regulatedRevenue"] for row in month_results)
    pnl = sum(row["mtm"] + row["resContr"] for row in month_results)
    acr_revenue = sum(row["regulatedRevenue"] for row in month_results)
    fa_risk = rwa / pla if abs(pla) > EPS else float("inf")
    fa = max(0.0, (rwa - res_fin) / pla) if pla > 0 else float("inf")

    source_totals = build_source_totals(source_month)
    top_source_risk = abs(source_totals[0]["risk"]) if source_totals else 0.0
    top_source_ratio = top_source_risk / pla if pla > EPS else float("inf")
    stress_ratio = stress_total / pla if pla > EPS else float("inf")

    if pla <= EPS:
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
    if pla <= EPS:
        verdict = "Critica"
        notes.append("PLA <= 0. Sem base prudencial para sustentar o risco.")
    else:
        m = p["faReference"]
        if fa > m:
            notes.append(f"FA ({ratio(fa)}) acima da referencia M ({ratio(m)}).")
        elif fa > m * 0.8:
            notes.append(f"FA ({ratio(fa)}) em zona de atencao (>80% de M).")
        if fa_risk > m:
            notes.append("FA de risco acima da referencia.")
        if stress_ratio > 0.25:
            notes.append("Stress / PLA acima de 25%.")
        if top_source_ratio > 0.35:
            notes.append("Concentracao de risco por fonte/submercado acima de 35% do PLA.")
        if res_fin < 0:
            notes.append("Resultado financeiro prudencial negativo.")

        invalid_checks = []
        for key, check_rows in checks.items():
            for c in check_rows:
                if not c["ok"]:
                    invalid_checks.append(f"{key.upper()} {c['month']}: {', '.join(c['issues'])}")
        if invalid_checks:
            notes.append("Validacao do portfolio com divergencias de consistencia em linhas do template.")
        if not notes:
            notes.append("Sem gatilho critico nos parametros atuais.")

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
        "rwa": rwa,
        "pnl": pnl,
        "acrRevenue": acr_revenue,
        "resFin": res_fin,
        "faRisk": fa_risk,
        "fa": fa,
        "score": score,
        "rating": rating,
        "stressRatio": stress_ratio,
        "topSourceRatio": top_source_ratio,
        "verdict": verdict,
        "notes": notes,
        "sourceMonthSummary": source_month,
        "sourceTotalSummary": source_totals,
        "checks": checks,
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
          <tbody>{''.join(rows)}</tbody>
        </table>
      </div>
    </div>
  </div>
</body>
</html>"""


def render_section_table(section, state):
    key = section["key"]
    data = state["portfolio"][key]
    source_rows = []
    for source in section["sources"]:
        field = forward_field(source)
        cells = [f'<td><input name="sec_{key}_{field}_{i}" value="{data["sources"][source][i]}" /></td>' for i in range(7)]
        source_rows.append(f"<tr><td>{escape(source)}</td>{''.join(cells)}</tr>")

    footer = []
    footer.append(
        "<tr><td><strong>RECURSO</strong></td>"
        + "".join(f'<td><input name="sec_{key}_resource_{i}" value="{data["resource"][i]}" /></td>' for i in range(7))
        + "</tr>"
    )
    footer.append(
        "<tr><td><strong>PRECO MEDIO RECURSO</strong></td>"
        + "".join(f'<td><input name="sec_{key}_pm_resource_{i}" value="{data["pmResource"][i]}" /></td>' for i in range(7))
        + "</tr>"
    )
    footer.append(
        "<tr><td><strong>REQUISITO</strong></td>"
        + "".join(f'<td><input name="sec_{key}_requirement_{i}" value="{data["requirement"][i]}" /></td>' for i in range(7))
        + "</tr>"
    )
    if section["has_pm_requirement"]:
        footer.append(
            "<tr><td><strong>PRECO MEDIO REQUISITO</strong></td>"
            + "".join(
                f'<td><input name="sec_{key}_pm_requirement_{i}" value="{data["pmRequirement"][i]}" /></td>' for i in range(7)
            )
            + "</tr>"
        )
    footer.append(
        "<tr><td><strong>NET ENERGETICO (linha template)</strong></td>"
        + "".join(f'<td><input name="sec_{key}_net_{i}" value="{data["netLine"][i]}" /></td>' for i in range(7))
        + "</tr>"
    )

    return f"""
    <article class="card">
      <h2>{escape(section["title"])}</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Fonte/Submercado</th><th>M+0</th><th>M+1</th><th>M+2</th><th>M+3</th><th>M+4</th><th>M+5</th><th>M+6</th></tr></thead>
          <tbody>{''.join(source_rows)}{''.join(footer)}</tbody>
        </table>
      </div>
    </article>
    """


def render_main_page(state, metrics, flash_msg):
    p = state["parameters"]

    checks_lines = []
    for section in SECTION_DEFS:
        key = section["key"]
        issue_months = [f'{c["month"]}: {", ".join(c["issues"])}' for c in metrics["checks"][key] if not c["ok"]]
        if issue_months:
            checks_lines.append(f'{section["title"]}: ' + " | ".join(issue_months))
    if not checks_lines:
        checks_text = "Checks do template: OK para todos os meses."
    else:
        checks_text = "Checks do template com divergencias: " + " || ".join(checks_lines)

    rows_forward = []
    for source in RISK_SOURCES:
        field = forward_field(source)
        cells = [f'<td><input name="forward_{field}_{i}" value="{state["forward"][source][i]}" /></td>' for i in range(7)]
        rows_forward.append(f"<tr><td>{escape(source)}</td>{''.join(cells)}</tr>")

    vertex_rows = []
    vertex_rows.append(
        "<tr><td>Horas</td>"
        + "".join(f'<td><input name="vertex_hours_{i}" value="{state["vertex"]["hours"][i]}" /></td>' for i in range(7))
        + "</tr>"
    )
    vertex_rows.append(
        "<tr><td>Volatilidade %</td>"
        + "".join(
            f'<td><input name="vertex_volatility_{i}" value="{state["vertex"]["volatility"][i]}" /></td>' for i in range(7)
        )
        + "</tr>"
    )
    vertex_rows.append(
        "<tr><td>Preco Stress Long</td>"
        + "".join(
            f'<td><input name="vertex_stress_long_{i}" value="{state["vertex"]["stressLongPrice"][i]}" /></td>' for i in range(7)
        )
        + "</tr>"
    )
    vertex_rows.append(
        "<tr><td>Preco Stress Short</td>"
        + "".join(
            f'<td><input name="vertex_stress_short_{i}" value="{state["vertex"]["stressShortPrice"][i]}" /></td>' for i in range(7)
        )
        + "</tr>"
    )

    regulated_row = (
        "<tr><td>Efeitos Financeiros do Mercado Regulado (R$)</td>"
        + "".join(
            f'<td><input name="regulated_revenue_{i}" value="{state["portfolio"]["regulatedRevenue"][i]}" /></td>'
            for i in range(7)
        )
        + "</tr>"
    )

    month_detail_rows = []
    for month in metrics["sourceMonthSummary"]:
        top_lines = []
        for item in month["top"]:
            direction = "Long" if item["exposure"] >= 0 else "Short"
            top_lines.append(
                f'{item["source"]}: {direction} {br_number(item["exposure"],2)} MWm | Forward {br_money(item["forward"])} | VaR {br_money(item["var"])} | Stress {br_money(item["stress"])}'
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
    for item in metrics["sourceTotalSummary"]:
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

    sections_html = "".join(render_section_table(section, state) for section in SECTION_DEFS)
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
    .big{{font-size:1.85rem;font-weight:700;margin-top:6px}}
    .layout{{display:grid;grid-template-columns:1fr;gap:12px;margin-top:12px}}
    .table-wrap{{overflow:auto;border:1px solid var(--line);border-radius:8px}}
    table{{width:100%;border-collapse:collapse;min-width:1100px}}
    th,td{{padding:8px;border-bottom:1px solid var(--line);text-align:left;font-size:.9rem}}
    th{{font-size:.72rem;color:var(--muted);text-transform:uppercase}}
    input,textarea{{width:100%;padding:7px;border:1px solid #c8cfca;border-radius:6px;background:#fff}}
    .formgrid{{display:grid;grid-template-columns:repeat(4,minmax(170px,1fr));gap:10px}}
    .field label{{display:block;font-size:.75rem;color:var(--muted);text-transform:uppercase;margin-bottom:4px}}
    .kpis{{display:grid;grid-template-columns:repeat(4,minmax(170px,1fr));gap:10px;margin-top:10px}}
    .tag{{display:inline-block;padding:4px 8px;border-radius:999px;background:#e8f0ec;color:#1f6d58;font-size:.8rem;font-weight:700}}
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
          <p class="muted" style="margin:6px 0 0 0">Modelo estruturado conforme portfolio semanal (fixo, variavel, derivativos) e curva forward.</p>
        </div>
        <div class="btns">
          <button type="submit" name="action" value="calculate">Recalcular</button>
          <button type="submit" name="action" value="import_xlsx">Importar da planilha</button>
          <button type="submit" name="action" value="save_analysis">Salvar analise</button>
          <a class="btn" href="/historico">Historico salvo</a>
        </div>
      </div>
      <div class="card" style="margin-bottom:12px"><p class="muted" style="margin:0">{escape(flash_msg)}</p></div>

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
          <h2>Premissas por vertice (M+0 a M+6)</h2>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Parametro</th><th>M+0</th><th>M+1</th><th>M+2</th><th>M+3</th><th>M+4</th><th>M+5</th><th>M+6</th></tr></thead>
              <tbody>{''.join(vertex_rows)}</tbody>
            </table>
          </div>
        </article>

        {sections_html}

        <article class="card">
          <h2>Efeito financeiro do mercado regulado</h2>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Linha</th><th>M+0</th><th>M+1</th><th>M+2</th><th>M+3</th><th>M+4</th><th>M+5</th><th>M+6</th></tr></thead>
              <tbody>{regulated_row}</tbody>
            </table>
          </div>
        </article>

        <article class="card">
          <h2>Curva Forward (ACL) por fonte/submercado</h2>
          <p class="muted">Usada na marcacao a mercado e no risco de cada fonte por mes.</p>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Fonte/Submercado</th><th>M+0</th><th>M+1</th><th>M+2</th><th>M+3</th><th>M+4</th><th>M+5</th><th>M+6</th></tr></thead>
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
            <div class="field"><label>Referencia M</label><input name="parameters_faReference" value="{p["faReference"]}" /></div>
            <div class="field"><label>Confianca %</label><input name="parameters_confidence" value="{p["confidence"]}" /></div>
            <div class="field"><label>Phi normal</label><input name="parameters_phiZ" value="{p["phiZ"]}" /></div>
            <div class="field"><label>Dias liquidacao</label><input name="parameters_liquidationDays" value="{p["liquidationDays"]}" /></div>
            <div class="field"><label>Correlacao media</label><input name="parameters_correlation" value="{p["correlation"]}" /></div>
            <div class="field"><label>Theta</label><input name="parameters_theta" value="{p["theta"]}" /></div>
            <div class="field"><label>PLD minimo</label><input name="parameters_pldMin" value="{p["pldMin"]}" /></div>
            <div class="field"><label>PLD maximo</label><input name="parameters_pldMax" value="{p["pldMax"]}" /></div>
          </div>
        </article>

        <article class="card">
          <h2>Leitura metodologica e parecer</h2>
          <p><strong>Formula base:</strong> FA = max(0,(RWA - RES_FIN)/PLA), FA_Risco = RWA/PLA, RWA = VaR + theta*Stress.</p>
          <p><strong>Apuracao atual:</strong> VaR {br_money(metrics["varTotal"])}, Stress {br_money(metrics["stressTotal"])}, RWA {br_money(metrics["rwa"])}, RES_FIN {br_money(metrics["resFin"])}.</p>
          <p><strong>Checks do template:</strong> {escape(checks_text)}</p>
          <p><strong>Regras do parecer:</strong> {' '.join(escape(n) for n in metrics["notes"])}</p>
          <p class="muted">A analise detalha risco por mes e por fonte, para apoiar a gestao do portfolio ACL.</p>
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
              <thead><tr><th>Fonte/Submercado</th><th>Direcao</th><th>Exposicao MWm</th><th>MtM</th><th>VaR</th><th>Stress</th><th>Risco combinado</th></tr></thead>
              <tbody>{''.join(source_total_rows)}</tbody>
            </table>
          </div>
        </article>
      </section>
    </form>
  </div>
</body>
</html>"""


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

        state = new_default_state()
        metrics = calculate(state)
        content = render_main_page(
            state,
            metrics,
            "Importe a planilha semanal para preencher os campos de calculo e manter o padrao do template CCEE.",
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
            flash_msg = "Analise salva no historico para " + (rec["company_name"] or "empresa sem nome") + "."

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
