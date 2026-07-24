"""Configuração do backend BBCE, lida exclusivamente de variáveis de ambiente.

NUNCA coloque credenciais neste arquivo nem no repositório. Preencha um arquivo
`.env` local (veja `.env.example`) ou exporte as variáveis no ambiente antes de
rodar. O `.env` está no `.gitignore` — não faça commit dele com valores reais.
"""
import os


def _load_dotenv():
    """Carrega backend/.env se existir, sem sobrescrever variáveis já definidas."""
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


# 'mock' serve a base de exemplo embutida (sem credenciais); 'live' chama a API BBCE.
MODE = _get("BBCE_MODE", "mock").strip().lower()

BASE_URL = _get("BBCE_BASE_URL", "https://api-beta.qa.bbce.tech/bus").rstrip("/")
API_KEY = _get("BBCE_API_KEY")
COMPANY_CODE = _get("BBCE_COMPANY_CODE")
EMAIL = _get("BBCE_EMAIL")
PASSWORD = _get("BBCE_PASSWORD")

# --- de onde vêm os negócios (duas formas alternativas) ---
# (a) endpoint único que já devolve TODOS os negócios de uma vez (se existir):
TRADES_PATH = _get("BBCE_TRADES_PATH")
# (b) busca por ticker via /v1/negotiation-data/{tickerId} e junta:
NEGOTIATION_PATH = _get("BBCE_NEGOTIATION_PATH", "/v1/negotiation-data/{tickerId}")
TICKER_IDS = [t.strip() for t in _get("BBCE_TICKER_IDS").split(",") if t.strip()]

# CORS: origem permitida para o front. '*' é aceitável pois o endpoint só devolve
# negócios agregados (sem credenciais). Restrinja se hospedar o front num domínio fixo.
CORS_ORIGIN = _get("BBCE_CORS_ORIGIN", "*")

HOST = _get("BBCE_HOST", "127.0.0.1")
PORT = int(_get("BBCE_PORT", "8787") or "8787")


def require_live_credentials():
    """Falha cedo, com mensagem clara, se faltar algo para o modo 'live'."""
    missing = [name for name, val in (
        ("BBCE_API_KEY", API_KEY),
        ("BBCE_COMPANY_CODE", COMPANY_CODE),
        ("BBCE_EMAIL", EMAIL),
        ("BBCE_PASSWORD", PASSWORD),
    ) if not val]
    if missing:
        raise SystemExit("Modo 'live' exige as variáveis: " + ", ".join(missing))
    if not TRADES_PATH and not TICKER_IDS:
        raise SystemExit("Modo 'live' exige BBCE_TRADES_PATH (endpoint único) ou "
                         "BBCE_TICKER_IDS (lista de tickers para /v1/negotiation-data).")
