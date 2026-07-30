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
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import config
import transform

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_SAMPLE_CSV = os.path.join(_ROOT, "data", "Todos_Negocios.csv")
_HTML_PATH = os.path.join(_ROOT, "liquidez.html")

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
        if path in ("/", "/index.html", "/liquidez.html"):
            # serve a própria ferramenta: mesma origem do /api/negocios -> sem CORS,
            # sem mixed-content, sem os limites de fetch de páginas file:// ou artifact.
            try:
                with open(_HTML_PATH, "rb") as f:
                    self._send(200, f.read(), "text/html; charset=utf-8")
            except FileNotFoundError:
                self._json(404, {"error": "liquidez.html não encontrado — rode scripts/build.py primeiro."})
            return
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


def check_login():
    """Teste rápido de acesso: só faz login e diz se a BBCE aceitou as credenciais."""
    missing = [name for name, val in (
        ("BBCE_API_KEY", config.API_KEY),
        ("BBCE_COMPANY_CODE", config.COMPANY_CODE),
        ("BBCE_EMAIL", config.EMAIL),
        ("BBCE_PASSWORD", config.PASSWORD),
    ) if not val]
    if missing:
        print("Faltam variáveis no .env:", ", ".join(missing))
        print("Preencha o .env (copie de .env.example) e rode de novo.")
        return
    import bbce_client
    client = bbce_client.BBCEClient()
    print(f"Tentando login em {config.BASE_URL} como {config.EMAIL} (empresa {config.COMPANY_CODE})…")
    try:
        client.login()
    except Exception as exc:  # noqa: BLE001
        print("LOGIN FALHOU:", exc)
        print("Verifique apiKey, e-mail, senha e companyExternalCode.")
        return
    print("LOGIN OK — a API aceitou suas credenciais e devolveu um token.")
    print("Agora rode 'python3 server.py' e use a aba 'Dados BBCE' na ferramenta.")
    try:
        client.logout()
    except Exception:  # noqa: BLE001
        pass


def _ensure_env_file():
    """Cria backend/.env a partir de .env.example na primeira execução."""
    base = os.path.dirname(os.path.abspath(__file__))
    env_path, example = os.path.join(base, ".env"), os.path.join(base, ".env.example")
    if os.path.exists(env_path) or not os.path.exists(example):
        return
    try:
        with open(example, "r", encoding="utf-8") as src, open(env_path, "w", encoding="utf-8") as dst:
            dst.write(src.read())
        print(f"Criei {env_path} a partir de .env.example.")
        print("Preencha suas credenciais nele e reinicie para o modo 'live'.\n")
    except OSError:
        pass


def main():
    if "--check-login" in sys.argv:
        return check_login()
    _ensure_env_file()
    srv = ThreadingHTTPServer((config.HOST, config.PORT), Handler)
    url = f"http://{config.HOST}:{config.PORT}/"
    print("=" * 60)
    print(f"  Calculadora de Liquidez BBCE  —  modo: {config.MODE}")
    print(f"  Abra no navegador:  {url}")
    if config.MODE == "mock":
        print("  (demonstração — preencha o .env e use BBCE_MODE=live para dados reais)")
    print("  Ctrl+C para parar.")
    print("=" * 60)
    if "--no-browser" not in sys.argv and os.environ.get("BBCE_OPEN_BROWSER", "1") != "0":
        try:
            import webbrowser
            webbrowser.open(url)
        except Exception:  # noqa: BLE001 - abrir navegador é só conveniência
            pass
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        srv.server_close()


if __name__ == "__main__":
    main()
