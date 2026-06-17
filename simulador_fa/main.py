import json
import os
import sys
import csv
import io
import re
import traceback
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
from urllib.parse import urlparse

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, "data")
STATIC = os.path.join(BASE, "static")

sys.path.insert(0, BASE)
from calculadora_fa import calcular_fa
from planilha_handler import parse_planilha_ccee, parse_portfolio, gerar_modelo_portfolio


# ─── Threaded server: cada request em thread separada ────────────────────────
class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True


# ─── Helpers JSON / IO ───────────────────────────────────────────────────────
def _read_json(name):
    path = os.path.join(DATA, name)
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _write_json(name, data):
    path = os.path.join(DATA, name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _extract_file(body_bytes, content_type):
    """Extrai bytes do arquivo de um body multipart ou retorna direto se binário puro."""
    if "multipart" not in content_type:
        return body_bytes
    m = re.search(r'boundary=([^\s;]+)', content_type)
    if not m:
        return body_bytes
    boundary = m.group(1).encode('ascii')
    sep = b'--' + boundary
    idx = body_bytes.find(sep)
    if idx == -1:
        return body_bytes
    hdr_end = body_bytes.find(b'\r\n\r\n', idx)
    if hdr_end == -1:
        return body_bytes
    file_start = hdr_end + 4
    idx_next = body_bytes.find(b'\r\n' + sep, file_start)
    return body_bytes[file_start:idx_next] if idx_next != -1 else body_bytes[file_start:]


# ─── Handler ─────────────────────────────────────────────────────────────────
class Handler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        print(f"  [{self.address_string()}] {fmt % args}", flush=True)

    # ── Envio ──────────────────────────────────────────────────────────────
    def _send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _send_bytes(self, data, content_type, filename):
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(data)

    def _serve_static(self, filename, content_type):
        filepath = os.path.join(STATIC, filename)
        if not os.path.exists(filepath):
            self.send_response(404)
            self.end_headers()
            return
        with open(filepath, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(data)

    # ── Leitura do body: usa Content-Length (obrigatório para HTTP/1.1) ────
    def _read_body(self):
        length = self.headers.get("Content-Length")
        if not length:
            return b""
        return self.rfile.read(int(length))

    # ── CORS preflight ─────────────────────────────────────────────────────
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    # ── GET ────────────────────────────────────────────────────────────────
    def do_GET(self):
        path = urlparse(self.path).path
        try:
            if path in ("/", "/index.html"):
                self._serve_static("index.html", "text/html; charset=utf-8")
            elif path == "/api/premissas":
                self._send_json(_read_json("premissas.json"))
            elif path == "/api/empresa":
                self._send_json(_read_json("empresa.json"))
            elif path == "/api/historico":
                self._send_json(_read_json("historico.json"))
            elif path == "/api/calcular":
                empresa = _read_json("empresa.json")
                premissas = _read_json("premissas.json")
                self._send_json(calcular_fa(empresa, premissas))
            elif path == "/api/download/modelo":
                self._send_bytes(
                    gerar_modelo_portfolio(),
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    "modelo_portfolio.xlsx")
            elif path == "/api/download/historico_csv":
                hist = _read_json("historico.json") or []
                buf = io.StringIO()
                if hist:
                    w = csv.DictWriter(buf, fieldnames=list(hist[0].keys()))
                    w.writeheader()
                    w.writerows(hist)
                self._send_bytes(buf.getvalue().encode("utf-8-sig"), "text/csv", "historico_fa.csv")
            else:
                self.send_response(404)
                self.end_headers()
        except Exception:
            traceback.print_exc()
            self._send_json({"error": traceback.format_exc()}, 500)

    # ── POST ───────────────────────────────────────────────────────────────
    def do_POST(self):
        path = urlparse(self.path).path
        try:
            if path == "/api/premissas":
                data = json.loads(self._read_body())
                _write_json("premissas.json", data)
                self._send_json({"ok": True})

            elif path == "/api/empresa":
                data = json.loads(self._read_body())
                _write_json("empresa.json", data)
                premissas = _read_json("premissas.json")
                self._send_json(calcular_fa(data, premissas))

            elif path == "/api/historico/salvar":
                empresa = _read_json("empresa.json")
                premissas = _read_json("premissas.json")
                t = calcular_fa(empresa, premissas)["totais"]
                from datetime import date
                sem = date.today().isocalendar()
                entry = {
                    "data": premissas.get("data_referencia", str(date.today())),
                    "semana": f"{sem[1]}/{sem[0]}",
                    "fa_ris": t["fa_ris"], "fa_divulgado": t["fa_divulgado"],
                    "rwa": t["rwa"], "pnl": t["pnl"], "res_fin": t["res_fin"],
                    "pla": t["pla"], "var_tot": t["var_tot"], "stest_tot": t["stest_tot"],
                }
                hist = _read_json("historico.json") or []
                hist = [entry if h["data"] == entry["data"] else h for h in hist]
                if not any(h["data"] == entry["data"] for h in hist):
                    hist.append(entry)
                _write_json("historico.json", hist)
                self._send_json({"ok": True, "entry": entry})

            elif path == "/api/upload/premissas":
                ct = self.headers.get("Content-Type", "")
                raw = self._read_body()
                file_bytes = _extract_file(raw, ct)
                if len(file_bytes) < 100:
                    self._send_json({"ok": False, "errors": [
                        f"Arquivo não recebido ou muito pequeno ({len(file_bytes)} bytes). "
                        "Verifique se o arquivo foi selecionado corretamente."], "data": {}})
                    return
                parsed_data, errors = parse_planilha_ccee(file_bytes)
                if errors:
                    self._send_json({"ok": False, "errors": errors, "data": parsed_data})
                else:
                    premissas = _read_json("premissas.json")
                    premissas.update(parsed_data)
                    _write_json("premissas.json", premissas)
                    self._send_json({"ok": True, "data": parsed_data, "errors": []})

            elif path == "/api/upload/portfolio":
                ct = self.headers.get("Content-Type", "")
                raw = self._read_body()
                file_bytes = _extract_file(raw, ct)
                if len(file_bytes) < 100:
                    self._send_json({"ok": False, "errors": [
                        f"Arquivo não recebido ({len(file_bytes)} bytes)."], "data": {}})
                    return
                empresa_data, errors = parse_portfolio(file_bytes)
                if errors:
                    self._send_json({"ok": False, "errors": errors, "data": empresa_data})
                else:
                    self._send_json({"ok": True, "data": empresa_data, "errors": []})

            elif path == "/api/calcular/simulador":
                body = json.loads(self._read_body())
                premissas = _read_json("premissas.json")
                self._send_json(calcular_fa(body, premissas))

            else:
                self.send_response(404)
                self.end_headers()

        except Exception:
            traceback.print_exc()
            try:
                self._send_json({"ok": False, "errors": [traceback.format_exc()]}, 500)
            except Exception:
                pass


# ─── Entry point ─────────────────────────────────────────────────────────────
def run(port=8765):
    os.makedirs(DATA, exist_ok=True)
    # Garante stdout em UTF-8 para nao quebrar em consoles cp1252 (Windows)
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    server = ThreadedHTTPServer(("", port), Handler)
    print(f"\n  Simulador FA CCEE rodando em http://localhost:{port}")
    print(f"  Dados em: {DATA}")
    print("  Pressione Ctrl+C para encerrar.\n", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor encerrado.")


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    run(port)
