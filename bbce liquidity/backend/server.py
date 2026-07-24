"""Ponte HTTP (stdlib) que entrega os negócios da BBCE para a ferramenta de liquidez.

As credenciais ficam só aqui no servidor; o navegador nunca as vê. O front consome
um único endpoint que devolve o CSV "Todos os Negócios" já no formato esperado.

Endpoints:
    GET /health         -> {"status":"ok","mode":...}
    GET /api/negocios   -> CSV "Todos os Negócios" (text/csv; charset=utf-8)

Rodar:
    cd "bbce liquidity/backend"
    python3 server.py                 # modo demonstração (base de exemplo, sem credenciais)
    BBCE_MODE=live python3 server.py  # modo ao vivo (após configurar o .env)
"""
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import config
import transform

_SAMPLE_CSV = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data", "Todos_Negocios.csv",
)

_client = None  # criado sob demanda no modo live


def get_negocios_csv():
    """Devolve o CSV de negócios conforme o modo configurado."""
    if config.MODE == "mock":
        with open(_SAMPLE_CSV, "rb") as f:
            return f.read().decode("latin-1")
    global _client
    if _client is None:
        import bbce_client
        config.require_live_credentials()
        _client = bbce_client.BBCEClient()
    return transform.to_csv(_client.fetch_negocios_raw())


class Handler(BaseHTTPRequestHandler):
    server_version = "BBCEBridge/1.0"

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", config.CORS_ORIGIN)
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _send(self, code, body, ctype):
        data = body.encode("utf-8") if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self._cors()
        self.end_headers()
        self.wfile.write(data)

    def _json(self, code, obj):
        self._send(code, json.dumps(obj, ensure_ascii=False), "application/json; charset=utf-8")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/health":
            self._json(200, {"status": "ok", "mode": config.MODE})
            return
        if path in ("/api/negocios", "/api/negocios.csv"):
            try:
                csv_text = get_negocios_csv()
            except SystemExit as exc:
                self._json(500, {"error": str(exc)})
            except Exception as exc:  # noqa: BLE001 - reporta a falha ao front
                self._json(502, {"error": str(exc)})
            else:
                self._send(200, csv_text, "text/csv; charset=utf-8")
            return
        self._json(404, {"error": "not found"})

    def log_message(self, fmt, *args):
        pass  # silencioso


def main():
    srv = ThreadingHTTPServer((config.HOST, config.PORT), Handler)
    print(f"BBCE bridge em http://{config.HOST}:{config.PORT}  (modo: {config.MODE})")
    print("  GET /health")
    print("  GET /api/negocios")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        srv.server_close()


if __name__ == "__main__":
    main()
