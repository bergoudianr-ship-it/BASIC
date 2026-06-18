"""
Servidor de MEDIÇÃO automática (ArUco + OpenCV).
Escolha o rolamento, informe o tamanho do marcador, envie a foto -> a ferramenta
mede o diâmetro externo (D) e o furo (d), compara com o padrão e responde
APROVADA / REPROVADA, devolvendo a foto anotada.

Uso:
    python servidor_medida.py
Abra no celular: http://IP-DO-COMPUTADOR:8001
"""
import io
import os
import json
import base64
import numpy as np
import cv2
from flask import Flask, request, jsonify, Response
from medir_aruco import medir

app = Flask(__name__)

with open(os.path.join(os.path.dirname(__file__), "dados", "rolamentos.json"), encoding="utf-8") as f:
    ROLAMENTOS = {r["designacao"]: r for r in json.load(f)["rolamentos"]}


def _avaliar(med, rol, tol_pct):
    """Compara D e d medidos com o padrão do rolamento."""
    itens = []
    aprovado = True
    for chave, nome in (("D", "Diâmetro externo"), ("d", "Furo")):
        nominal = rol[chave]
        medido = med.get(chave)
        tol = nominal * tol_pct / 100.0
        if medido is None:
            itens.append({"medida": nome, "nominal": nominal, "medido": None, "status": "não medido"})
            continue
        ok = abs(medido - nominal) <= tol
        aprovado = aprovado and ok
        itens.append({"medida": nome, "nominal": nominal, "medido": medido,
                      "desvio": round(medido - nominal, 2), "status": "OK" if ok else "FORA"})
    return aprovado, itens


@app.route("/medir", methods=["POST"])
def medir_endpoint():
    desig = request.form.get("rolamento", "")
    if desig not in ROLAMENTOS:
        return jsonify({"erro": "rolamento desconhecido"}), 400
    try:
        marker_mm = float(request.form.get("marcador_mm", "0").replace(",", "."))
        tol_pct = float(request.form.get("tol_pct", "1").replace(",", "."))
    except ValueError:
        return jsonify({"erro": "valores inválidos"}), 400
    if marker_mm <= 0:
        return jsonify({"erro": "informe o tamanho do marcador em mm"}), 400
    if "foto" not in request.files:
        return jsonify({"erro": "envie o campo 'foto'"}), 400

    data = np.frombuffer(request.files["foto"].read(), np.uint8)
    img = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if img is None:
        return jsonify({"erro": "imagem inválida"}), 400

    med, annotated = medir(img, marker_mm)
    if not med["ok"]:
        return jsonify({"erro": med["erro"]}), 200

    aprovado, itens = _avaliar(med, ROLAMENTOS[desig], tol_pct)
    ok, buf = cv2.imencode(".jpg", annotated)
    img_b64 = base64.b64encode(buf).decode() if ok else None
    return jsonify({"veredito": "APROVADA" if aprovado else "REPROVADA",
                    "itens": itens, "imagem": img_b64})


PAGINA = """<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Medição ArUco</title>
<style>body{margin:0;font-family:system-ui,Arial;background:#0f1512;color:#e7efe9;padding:16px}
label{font-size:.8rem;color:#90a399;display:block;margin:10px 0 4px}
select,input{width:100%;padding:11px;border-radius:9px;border:1px solid #2c3c33;background:#0f1512;color:#e7efe9}
button{width:100%;padding:14px;border:none;border-radius:10px;background:#39d98a;color:#04130c;font-weight:700;margin-top:12px;font-size:1rem}
#res{margin-top:16px;text-align:center;padding:16px;border-radius:12px;font-size:1.2rem;font-weight:800;display:none}
.ok{background:rgba(57,217,138,.15);color:#39d98a}.bad{background:rgba(255,91,110,.15);color:#ff5b6e}
table{width:100%;border-collapse:collapse;margin-top:10px;font-size:.85rem}td,th{border-bottom:1px solid #2c3c33;padding:6px;text-align:left}
img{max-width:100%;border-radius:10px;margin-top:10px}</style></head><body>
<h2>🔧 Medição automática (ArUco)</h2>
<label>Rolamento</label><select id="rol">__OPCOES__</select>
<label>Tamanho do marcador impresso (mm)</label><input id="mk" type="number" value="40">
<label>Tolerância (±%)</label><input id="tol" type="number" value="1">
<label>Foto (peça + marcador no quadro)</label><input id="f" type="file" accept="image/*" capture="environment">
<button onclick="enviar()">Medir</button>
<div id="res"></div><div id="tab"></div><img id="im" style="display:none">
<script>
async function enviar(){
  const f=document.getElementById('f');if(!f.files[0]){alert('Escolha a foto');return;}
  const fd=new FormData();fd.append('rolamento',document.getElementById('rol').value);
  fd.append('marcador_mm',document.getElementById('mk').value);
  fd.append('tol_pct',document.getElementById('tol').value);fd.append('foto',f.files[0]);
  const res=document.getElementById('res');res.style.display='block';res.className='';res.textContent='Medindo...';
  document.getElementById('tab').innerHTML='';document.getElementById('im').style.display='none';
  try{const r=await fetch('/medir',{method:'POST',body:fd});const j=await r.json();
    if(j.erro){res.textContent='⚠️ '+j.erro;return;}
    const ok=j.veredito==='APROVADA';res.className=ok?'ok':'bad';res.textContent=(ok?'✅ ':'❌ ')+j.veredito;
    let h='<table><tr><th>Medida</th><th>Padrão</th><th>Medido</th><th>Status</th></tr>';
    j.itens.forEach(i=>{h+='<tr><td>'+i.medida+'</td><td>'+i.nominal+' mm</td><td>'+(i.medido==null?'—':i.medido+' mm')+'</td><td>'+i.status+'</td></tr>';});
    h+='</table>';document.getElementById('tab').innerHTML=h;
    if(j.imagem){const im=document.getElementById('im');im.src='data:image/jpeg;base64,'+j.imagem;im.style.display='block';}
  }catch(e){res.textContent='Falha: '+e;}
}
</script></body></html>"""


@app.route("/")
def home():
    opts = "".join(f'<option value="{d}">{d} (D={r["D"]} d={r["d"]} B={r["B"]})</option>'
                   for d, r in ROLAMENTOS.items())
    return Response(PAGINA.replace("__OPCOES__", opts), mimetype="text/html")


if __name__ == "__main__":
    print("Servidor de medição em http://0.0.0.0:8001")
    app.run(host="0.0.0.0", port=8001)
