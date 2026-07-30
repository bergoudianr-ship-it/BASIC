"""Configuração do backend BBCE (produção), lida só de variáveis de ambiente / .env.

NUNCA coloque credenciais neste arquivo nem no repositório. Preencha o backend/.env
(veja .env.example). O .env está no .gitignore.
"""
import os


def _load_dotenv():
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))


_load_dotenv()


def _get(name, default=""):
    return os.environ.get(name, default)


# 'mock' serve a base de exemplo embutida; 'live' puxa da API BBCE de produção.
MODE = _get("BBCE_MODE", "mock").strip().lower()

BASE_URL = _get("BBCE_BASE_URL", "https://api-ehub.bbce.com.br/bus").rstrip("/")
API_KEY = _get("BBCE_API_KEY")
EMAIL = _get("BBCE_EMAIL") or _get("BBCE_USERNAME")
PASSWORD = _get("BBCE_PASSWORD")
COMPANY_ID = _get("BBCE_COMPANY_ID") or _get("BBCE_COMPANY_CODE") or "1266"

# opcional: filtrar por tipo de operação (ex.: "Negócio/Balcão"). Vazio = todos.
ORIGIN_OPERATION_TYPE = _get("BBCE_ORIGIN_OPERATION_TYPE")

# Janela de histórico: no 1º arranque puxa BACKFILL_DAYS; a cada refresh, os
# últimos REFRESH_DAYS. Os negócios são acumulados por 'id' (dedup) e persistidos.
BACKFILL_DAYS = int(_get("BBCE_BACKFILL_DAYS", "180") or "180")
REFRESH_DAYS = int(_get("BBCE_REFRESH_DAYS", "3") or "3")
REFRESH_SECONDS = int(_get("BBCE_REFRESH_SECONDS", "600") or "600")  # 10 min

CACHE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache_negocios.json")

CORS_ORIGIN = _get("BBCE_CORS_ORIGIN", "*")
HOST = _get("BBCE_HOST", "127.0.0.1")
PORT = int(_get("BBCE_PORT", "8787") or "8787")


def require_live_credentials():
    missing = [name for name, val in (
        ("BBCE_API_KEY", API_KEY),
        ("BBCE_EMAIL (ou BBCE_USERNAME)", EMAIL),
        ("BBCE_PASSWORD", PASSWORD),
        ("BBCE_COMPANY_ID", COMPANY_ID),
    ) if not val]
    if missing:
        raise SystemExit("Modo 'live' exige as variáveis: " + ", ".join(missing))
