import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const CKAN = "https://dadosabertos.ccee.org.br/api/3/action";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const DATASETS = ["pld_media_mensal", "pld_media_semanal", "pld_media_diaria"];

function jr(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
async function ckan(path: string) {
  const r = await fetch(`${CKAN}/${path}`, { headers: { "User-Agent": UA, "Accept": "application/json" } });
  if (!r.ok) throw new Error(`CKAN ${path} -> HTTP ${r.status}`);
  const j = await r.json();
  if (!j.success) throw new Error(`CKAN ${path} success=false`);
  return j.result;
}
function pick(fields: any[], re: RegExp): string | null {
  for (const f of fields) if (re.test(String(f.id))) return f.id;
  return null;
}
function normSub(v: string): string | null {
  const s = String(v || "").toUpperCase().replace(/[^A-Z/]/g, "");
  if (s.includes("SUDESTE") || s.includes("CENTRO") || s === "SECO" || s === "SE/CO" || s === "SE") return "SE/CO";
  if (s.includes("NORDESTE") || s === "NE") return "NE";
  if (s.includes("NORTE") || s === "N") return "N";
  if (s.includes("SUL") || s === "S") return "S";
  return null;
}
function toYM(v: any): string | null {
  const s = String(v || "");
  let m = s.match(/(\d{4})[-/](\d{2})/); if (m) return `${m[1]}-${m[2]}`;
  m = s.match(/(\d{2})[-/](\d{4})/); if (m) return `${m[2]}-${m[1]}`;
  m = s.match(/(\d{4})(\d{2})/); if (m) return `${m[1]}-${m[2]}`;
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    let mes = "";
    try { const b = await req.json(); mes = (b?.mes || "").slice(0, 7); } catch (_) { /* no body */ }
    if (!mes) { const u = new URL(req.url); mes = (u.searchParams.get("mes") || "").slice(0, 7); }

    let lastErr = "";
    for (const ds of DATASETS) {
      try {
        const pkg = await ckan(`package_show?id=${ds}`);
        const res = (pkg.resources || []).find((r: any) => r.datastore_active) || (pkg.resources || [])[0];
        if (!res) { lastErr = `${ds}: sem recurso`; continue; }
        const data = await ckan(`datastore_search?resource_id=${res.id}&limit=8000`);
        const fields = data.fields || [];
        const recs = data.records || [];
        if (!recs.length) { lastErr = `${ds}: sem registros`; continue; }
        const subF = pick(fields, /submerc/i);
        const valF = pick(fields, /^(pld|preco|valor|vlr|vl_|media|preco_medio)/i) || pick(fields, /pld|preco|valor|media/i);
        const dateF = pick(fields, /mes|data|competen|referen|periodo|semana|ini/i);
        if (!subF || !valF) { lastErr = `${ds}: campos nao identificados (sub=${subF}, val=${valF})`; continue; }
        // group by YM
        const byYM: Record<string, Record<string, number>> = {};
        for (const r of recs) {
          const sub = normSub(r[subF]); if (!sub) continue;
          const ym = dateF ? toYM(r[dateF]) : "sem-data";
          const val = parseFloat(String(r[valF]).replace(".", "").replace(",", ".")) || parseFloat(String(r[valF]));
          if (isNaN(val)) continue;
          const key = ym || "sem-data";
          (byYM[key] = byYM[key] || {})[sub] = val;
        }
        const yms = Object.keys(byYM).filter((k) => /\d{4}-\d{2}/.test(k)).sort();
        const alvo = (mes && byYM[mes]) ? mes : (yms.length ? yms[yms.length - 1] : Object.keys(byYM)[0]);
        const precos = byYM[alvo] || {};
        if (!Object.keys(precos).length) { lastErr = `${ds}: mes ${alvo} vazio`; continue; }
        return jr({ ok: true, mes: alvo, precos, dataset: ds, resource_id: res.id, campos: { submercado: subF, valor: valF, data: dateF }, meses_disponiveis: yms.slice(-12) });
      } catch (e) { lastErr = `${ds}: ${String((e as Error).message)}`; }
    }
    return jr({ ok: false, error: "Nao foi possivel obter o PLD na CCEE (Dados Abertos).", detalhe: lastErr }, 502);
  } catch (e) {
    return jr({ ok: false, error: String((e as Error).message) }, 500);
  }
});
