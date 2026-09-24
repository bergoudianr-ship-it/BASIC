"""
Servidor de inspeção. Carrega o modelo treinado e expõe uma página simples
para o celular: tira/escolhe a foto e responde VALIDADA / NÃO CONFORME.

Uso:
    python servidor.py
Depois abra no navegador do celular: http://IP-DO-COMPUTADOR:8000
"""
import os
import io
import json
import numpy as np
from PIL import Image
from flask import Flask, request, jsonify, Response
from embedding import embedding_de_imagem

PASTA_MODELO = "modelo"

app = Flask(__name__)

banco = None
config = None


def carregar_modelo():
    global banco, config
    banco_path = os.path.join(PASTA_MODELO, "banco.npy")
    cfg_path = os.path.join(PASTA_MODELO, "config.json")
    if not (os.path.exists(banco_path) and os.path.exists(cfg_path)):
        raise SystemExit("Modelo não encontrado. Rode 'python treinar.py' primeiro.")
    banco = np.load(banco_path)
    with open(cfg_path, encoding="utf-8") as f:
        config = json.load(f)


def avaliar(img: Image.Image):
    v = embedding_de_imagem(img)
    dist = float(np.linalg.norm(banco - v, axis=1).min())
    limite = float(config["limite"])
    conforme = dist <= limite
    # confiança simples: quão longe do limite (0 a 1)
    conf = max(0.0, min(1.0, 1 - abs(dist - limite) / (limite + 1e-6)))
    return {
        "veredito": "VALIDADA" if conforme else "NAO_CONFORME",
        "distancia": round(dist, 4),
        "limite": round(limite, 4),
        "confianca": round(conf, 2),
    }


@app.route("/inspecionar", methods=["POST"])
def inspecionar():
    if "foto" not in request.files:
        return jsonify({"erro": "envie o campo 'foto'"}), 400
    try:
        img = Image.open(io.BytesIO(request.files["foto"].read()))
    except Exception as e:
        return jsonify({"erro": f"imagem inválida: {e}"}), 400
    return jsonify(avaliar(img))


PAGINA = """<!doctype html><html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Inspeção por IA</title>
<style>
body{margin:0;font-family:system-ui,Arial,sans-serif;background:#0f1512;color:#e7efe9;padding:18px}
h1{font-size:1.1rem}button{width:100%;padding:14px;border:none;border-radius:10px;background:#39d98a;color:#04130c;font-weight:700;font-size:1rem;margin-top:10px}
input{width:100%;margin-top:10px;color:#e7efe9}
#res{margin-top:18px;text-align:center;padding:18px;border-radius:12px;font-size:1.3rem;font-weight:800;display:none}
.ok{background:rgba(57,217,138,.15);color:#39d98a}.bad{background:rgba(255,91,110,.15);color:#ff5b6e}
small{color:#90a399;display:block;font-weight:400;font-size:.8rem;margin-top:6px}
img{max-width:100%;border-radius:10px;margin-top:10px}
</style></head><body>
<h1>🔍 Inspeção por IA — foto da peça</h1>
<input id="f" type="file" accept="image/*" capture="environment">
<img id="prev" style="display:none">
<button onclick="enviar()">Inspecionar</button>
<div id="res"></div>
<script>
const f=document.getElementById('f'),prev=document.getElementById('prev'),res=document.getElementById('res');
f.onchange=()=>{if(f.files[0]){prev.src=URL.createObjectURL(f.files[0]);prev.style.display='block';}};
async function enviar(){
  if(!f.files[0]){alert('Escolha uma foto.');return;}
  const fd=new FormData();fd.append('foto',f.files[0]);
  res.style.display='block';res.className='';res.textContent='Analisando...';
  try{
    const r=await fetch('/inspecionar',{method:'POST',body:fd});const j=await r.json();
    if(j.erro){res.textContent='Erro: '+j.erro;return;}
    const ok=j.veredito==='VALIDADA';
    res.className=ok?'ok':'bad';
    res.innerHTML=(ok?'✅ VALIDADA':'❌ NÃO CONFORME')+
      '<small>distância '+j.distancia+' / limite '+j.limite+'</small>';
  }catch(e){res.textContent='Falha ao conectar: '+e;}
}
</script></body></html>"""


@app.route("/")
def home():
    return Response(PAGINA, mimetype="text/html")


if __name__ == "__main__":
    carregar_modelo()
    print("Servidor em http://0.0.0.0:8000  (abra pelo IP do computador no celular)")
    app.run(host="0.0.0.0", port=8000)
