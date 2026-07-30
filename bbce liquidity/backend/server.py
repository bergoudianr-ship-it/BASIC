"""Backend BBCE (produção): puxa os negócios direto da API, acumula por 'id',
serve a ferramenta e mantém tudo fresco atualizando a cada 10 minutos.

Endpoints:
    GET /                -> a ferramenta (liquidez.html)
    GET /health         -> {status, mode, updatedAt, count, error, refreshSeconds}
    GET /api/negocios   -> CSV "Todos os Negócios" (sempre o estado mais recente)

Rodar:
    cd "bbce liquidity/backend"
    python3 server.py                 # modo demonstração (base de exemplo)
    BBCE_MODE=live python3 server.py  # ao vivo (após configurar o .env)

As credenciais ficam só aqui (via .env); o navegador nunca as vê.
"""
import json
import os
import sys
import threading
import time
from datetime import date, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import config
import transform

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_SAMPLE = os.path.join(_ROOT, "data", "Todos_Negocios.csv")
_HTML = os.path.join(_ROOT, "liquidez.html")

_lock = threading.Lock()
_state = {"csv": None, "updated_at": 0.0, "count": 0, "error": None}
_client = None
_deals_by_id = {}          # acumulado (live), deduplicado por 'id'
_backfilled = False


# ---- coleta (modo live) --------------------------------------------------
def _load_cache():
    global _deals_by_id, _backfilled
    if os.path.exists(config.CACHE_FILE):
        try:
            with open(config.CACHE_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            _deals_by_id = {str(d.get("id")): d for d in data if d.get("id") is not None}
            _backfilled = bool(_deals_by_id)
        except (OSError, ValueError):
            _deals_by_id = {}


def _save_cache():
    try:
        with open(config.CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(list(_deals_by_id.values()), f, ensure_ascii=False)
    except OSError:
        pass


def _fetch_live():
    """Puxa a janela apropriada, acumula por 'id' e devolve (csv, total)."""
    global _client, _backfilled
    if _client is None:
        import bbce_client
        config.require_live_credentials()
        _client = bbce_client.BBCEClient()

    end = date.today()
    days = config.BACKFILL_DAYS if not _backfilled else config.REFRESH_DAYS
    start = end - timedelta(days=max(0, days))

    deals = _client.get_all_deals(
        start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d"),
        config.ORIGIN_OPERATION_TYPE or None)
    _client.enrich_products(deals)

    for d in deals:
        if d.get("id") is not None:
            _deals_by_id[str(d["id"])] = d   # dedup/atualiza por id
    _backfilled = True
    _save_cache()

    all_deals = list(_deals_by_id.values())
    return transform.to_csv(all_deals), len(all_deals)


def refresh():
    try:
        if config.MODE == "mock":
            with open(_SAMPLE, "rb") as f:
                csv = f.read().decode("latin-1")
            count = max(0, csv.count("\n") - 1)
        else:
            csv, count = _fetch_live()
        with _lock:
            _state.update(csv=csv, updated_at=time.time(), count=count, error=None)
        return True
    except Exception as exc:  # noqa: BLE001 - reporta a falha no /health
        with _lock:
            _state["error"] = str(exc)
        return False


def _bg_loop():
    while True:
        refresh()
        time.sleep(max(60, config.REFRESH_SECONDS))


# ---- HTTP ----------------------------------------------------------------
class Handler(BaseHTTPRequestHandler):
    server_version = "BBCEBridge/2.0"

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
            try:
                with open(_HTML, "rb") as f:
                    self._send(200, f.read(), "text/html; charset=utf-8")
            except FileNotFoundError:
                self._json(404, {"error": "liquidez.html não encontrado — rode scripts/build.py."})
            return
        if path == "/health":
            with _lock:
                self._json(200, {
                    "status": "ok",
                    "mode": config.MODE,
                    "updatedAt": _state["updated_at"],
                    "count": _state["count"],
                    "error": _state["error"],
                    "refreshSeconds": config.REFRESH_SECONDS,
                })
            return
        if path in ("/api/negocios", "/api/negocios.csv"):
            with _lock:
                csv, err = _state["csv"], _state["error"]
            if csv is None:
                refresh()  # primeira requisição: busca síncrona
                with _lock:
                    csv, err = _state["csv"], _state["error"]
            if csv is None:
                self._json(502, {"error": err or "sem dados"})
                return
            self._send(200, csv, "text/csv; charset=utf-8")
            return
        self._json(404, {"error": "not found"})

    def log_message(self, fmt, *args):
        pass


def _ensure_env_file():
    base = os.path.dirname(os.path.abspath(__file__))
    env_path, example = os.path.join(base, ".env"), os.path.join(base, ".env.example")
    if os.path.exists(env_path) or not os.path.exists(example):
        return
    try:
        with open(example, "r", encoding="utf-8") as src, open(env_path, "w", encoding="utf-8") as dst:
            dst.write(src.read())
        print(f"Criei {env_path} a partir de .env.example. Preencha e reinicie para o modo live.\n")
    except OSError:
        pass


def check_login():
    missing = [n for n, v in (("BBCE_API_KEY", config.API_KEY), ("BBCE_EMAIL", config.EMAIL),
                              ("BBCE_PASSWORD", config.PASSWORD)) if not v]
    if missing:
        print("Faltam variáveis no .env:", ", ".join(missing))
        return
    import bbce_client
    client = bbce_client.BBCEClient()
    print(f"Login em {config.BASE_URL} como {config.EMAIL}…")
    try:
        client.login()
    except Exception as exc:  # noqa: BLE001
        print("LOGIN FALHOU:", exc)
        return
    print("LOGIN OK — a API aceitou suas credenciais.")


def main():
    if "--check-login" in sys.argv:
        return check_login()
    _ensure_env_file()
    if config.MODE == "live":
        _load_cache()
    threading.Thread(target=_bg_loop, daemon=True).start()

    srv = ThreadingHTTPServer((config.HOST, config.PORT), Handler)
    url = f"http://{config.HOST}:{config.PORT}/"
    print("=" * 60)
    print(f"  Análise de Produtos BBCE  —  modo: {config.MODE}")
    print(f"  Abra no navegador:  {url}")
    print(f"  Atualiza sozinho a cada {config.REFRESH_SECONDS // 60} min.")
    if config.MODE == "mock":
        print("  (demonstração — preencha o .env e use BBCE_MODE=live para dados reais)")
    print("  Ctrl+C para parar.")
    print("=" * 60)
    if "--no-browser" not in sys.argv and os.environ.get("BBCE_OPEN_BROWSER", "1") != "0":
        try:
            import webbrowser
            webbrowser.open(url)
        except Exception:  # noqa: BLE001
            pass
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        srv.server_close()


if __name__ == "__main__":
    main()
