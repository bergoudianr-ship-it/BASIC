import json
import os
import sys
import csv
import io
import re
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs


def _parse_multipart(body_bytes, content_type):
    """Extract first file payload from multipart/form-data body (binary safe)."""
    m = re.search(r'boundary=([^\s;]+)', content_type)
    if not m:
        return body_bytes
    boundary = m.group(1).encode('ascii')
    sep = b'--' + boundary
    end = b'--' + boundary + b'--'
    # Split on boundary markers
    idx_start = body_bytes.find(sep)
    if idx_start == -1:
        return body_bytes
    # Find headers end (double CRLF) in first part
    headers_end = body_bytes.find(b'\r\n\r\n', idx_start)
    if headers_end == -1:
        return body_bytes
    file_start = headers_end + 4  # skip \r\n\r\n
    # Find next boundary
    idx_next = body_bytes.find(b'\r\n' + sep, file_start)
    if idx_next == -1:
        idx_next = body_bytes.find(sep, file_start)
        if idx_next == -1:
            return body_bytes[file_start:]
        return body_bytes[file_start:idx_next]
    return body_bytes[file_start:idx_next]

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, "data")
STATIC = os.path.join(BASE, "static")

sys.path.insert(0, BASE)
from calculadora_fa import calcular_fa
from planilha_handler import parse_planilha_ccee, parse_portfolio, gerar_modelo_portfolio


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


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"[{self.address_string()}] {fmt % args}")

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
        self.end_headers()
        self.wfile.write(data)

    def _read_body(self):
        length = int(self.headers.get("Content-Length", 0))
        return self.rfile.read(length)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/" or path == "/index.html":
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
            resultado = calcular_fa(empresa, premissas)
            self._send_json(resultado)
        elif path == "/api/download/modelo":
            data = gerar_modelo_portfolio()
            self._send_bytes(data,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "modelo_portfolio.xlsx")
        elif path == "/api/download/historico_csv":
            historico = _read_json("historico.json") or []
            buf = io.StringIO()
            if historico:
                w = csv.DictWriter(buf, fieldnames=list(historico[0].keys()))
                w.writeheader()
                w.writerows(historico)
            self._send_bytes(buf.getvalue().encode("utf-8-sig"), "text/csv", "historico_fa.csv")
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/premissas":
            data = json.loads(self._read_body())
            _write_json("premissas.json", data)
            self._send_json({"ok": True})

        elif path == "/api/empresa":
            data = json.loads(self._read_body())
            _write_json("empresa.json", data)
            premissas = _read_json("premissas.json")
            resultado = calcular_fa(data, premissas)
            self._send_json(resultado)

        elif path == "/api/historico/salvar":
            empresa = _read_json("empresa.json")
            premissas = _read_json("premissas.json")
            resultado = calcular_fa(empresa, premissas)
            t = resultado["totais"]
            from datetime import date
            semana = date.today().isocalendar()
            entry = {
                "data": premissas.get("data_referencia", str(date.today())),
                "semana": f"{semana[1]}/{semana[0]}",
                "fa_ris": t["fa_ris"],
                "fa_divulgado": t["fa_divulgado"],
                "rwa": t["rwa"],
                "pnl": t["pnl"],
                "res_fin": t["res_fin"],
                "pla": t["pla"],
                "var_tot": t["var_tot"],
                "stest_tot": t["stest_tot"],
            }
            hist = _read_json("historico.json") or []
            # Replace if same data_referencia else append
            exists = any(h["data"] == entry["data"] for h in hist)
            if exists:
                hist = [entry if h["data"] == entry["data"] else h for h in hist]
            else:
                hist.append(entry)
            _write_json("historico.json", hist)
            self._send_json({"ok": True, "entry": entry})

        elif path == "/api/upload/premissas":
            ct = self.headers.get("Content-Type", "")
            body = self._read_body()
            file_bytes = _parse_multipart(body, ct) if "multipart" in ct else body
            try:
                parsed_data, errors = parse_planilha_ccee(file_bytes)
                if errors:
                    self._send_json({"ok": False, "errors": errors, "data": parsed_data})
                else:
                    premissas = _read_json("premissas.json")
                    premissas.update(parsed_data)
                    _write_json("premissas.json", premissas)
                    self._send_json({"ok": True, "data": parsed_data, "errors": []})
            except Exception as e:
                self._send_json({"ok": False, "errors": [str(e)], "data": {}})

        elif path == "/api/upload/portfolio":
            ct = self.headers.get("Content-Type", "")
            body = self._read_body()
            file_bytes = _parse_multipart(body, ct) if "multipart" in ct else body
            try:
                empresa_data, errors = parse_portfolio(file_bytes)
                if errors:
                    self._send_json({"ok": False, "errors": errors, "data": empresa_data})
                else:
                    self._send_json({"ok": True, "data": empresa_data, "errors": []})
            except Exception as e:
                self._send_json({"ok": False, "errors": [str(e)], "data": {}})

        elif path == "/api/calcular/simulador":
            body = json.loads(self._read_body())
            premissas = _read_json("premissas.json")
            resultado = calcular_fa(body, premissas)
            self._send_json(resultado)

        else:
            self.send_response(404)
            self.end_headers()

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
        self.end_headers()
        self.wfile.write(data)


def run(port=8765):
    server = HTTPServer(("", port), Handler)
    print(f"Simulador FA CCEE rodando em http://localhost:{port}")
    server.serve_forever()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    run(port)
