"""Cliente da API BBCE Connect: autenticação (login/refresh/logout) e busca de negócios.

As credenciais vêm de `config` (variáveis de ambiente) e permanecem SEMPRE no
servidor — nunca são enviadas ao navegador. A BBCE permite apenas UMA sessão ativa
por usuário: se a mesma conta logar em outro lugar, este cliente recebe 401 e refaz
o login automaticamente.
"""
import json
import time
import urllib.error
import urllib.request

import config
import transform


class BBCEError(Exception):
    pass


def _ticker_meta(ticker):
    """Deriva PRODUTO e unidades no formato da ferramenta a partir do ticker.

    O campo `description` vem sem o prefixo de classe (ex.: "SE CON MEN SET/25 -
    Preço Fixo"), mas a ferramenta espera "FEN - SE CON MEN SET/25 - Preço Fixo".
    O prefixo é reconstruído de stamp.classAbbreviation + stamp.productAbbreviation
    (ex.: "F" + "EN" = "FEN"), mantendo o mesmo formato do export "Todos os Negócios".
    """
    stamp = ticker.get("stamp") or {}
    prefix = (str(stamp.get("classAbbreviation", "")) +
              str(stamp.get("productAbbreviation", ""))).strip()
    desc = str(ticker.get("description", "")).strip()
    product = (prefix + " - " + desc) if (prefix and desc) else desc
    return {
        "_product": product,
        "_tradingUnit": ticker.get("tradingUnit", ""),
        "_measurementUnit": ticker.get("measurementUnit", ""),
    }


class BBCEClient:
    def __init__(self):
        self._id_token = None
        self._refresh_token = None
        self._expires_at = 0.0  # epoch (segundos)

    # ---- HTTP -------------------------------------------------------------
    def _request(self, method, path, body=None, auth=False):
        url = config.BASE_URL + path
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "apiKey": config.API_KEY,
        }
        if auth:
            headers["Authorization"] = "Bearer " + (self._id_token or "")
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                raw = resp.read().decode("utf-8")
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:500]
            raise BBCEError(f"{method} {path} -> HTTP {exc.code}: {detail}") from None
        except urllib.error.URLError as exc:
            raise BBCEError(f"{method} {path} -> falha de rede: {exc.reason}") from None

    # ---- autenticação -----------------------------------------------------
    def login(self):
        code = config.COMPANY_CODE
        payload = {
            "companyExternalCode": int(code) if str(code).isdigit() else code,
            "email": config.EMAIL,
            "password": config.PASSWORD,
        }
        self._apply_tokens(self._request("POST", "/v2/login", body=payload))

    def refresh(self):
        if not self._refresh_token:
            self.login()
            return
        try:
            data = self._request("POST", "/v1/refresh-token",
                                  body={"refreshToken": self._refresh_token}, auth=True)
            self._apply_tokens(data)
        except BBCEError:
            self.login()

    def logout(self):
        if self._id_token:
            try:
                self._request("POST", "/v1/logout", body={}, auth=True)
            except BBCEError:
                pass
        self._id_token = self._refresh_token = None
        self._expires_at = 0.0

    def _apply_tokens(self, data):
        self._id_token = data.get("idToken") or data.get("accessToken")
        self._refresh_token = data.get("refreshToken", self._refresh_token)
        expires_in = int(data.get("expiresIn", 14400))
        self._expires_at = time.time() + max(60, expires_in - 60)  # renova 60s antes

    def ensure_session(self):
        if not self._id_token:
            self.login()
        elif time.time() >= self._expires_at:
            self.refresh()

    # ---- dados ------------------------------------------------------------
    def fetch_negocios_raw(self):
        """Busca os negócios executados na BBCE.

        TODO(confirmar): o método/caminho/paginação dependem da doc do grupo
        Orders/Trades da BBCE, ainda não recebida. Assim que o endpoint for
        conhecido, defina `BBCE_TRADES_PATH` e ajuste aqui se houver paginação.

        Três formas de configurar (ver .env):
          (a) BBCE_TRADES_PATH -> um endpoint que já devolve TODOS os negócios.
          (b) BBCE_WALLET_IDS  -> enumera os tickers de cada carteira via
              /v1/negotiable-tickers e busca negotiation-data de cada um.
          (c) BBCE_TICKER_IDS  -> lista fixa de tickers (pula a enumeração).
        """
        if config.TRADES_PATH:
            return self._get_with_retry(config.TRADES_PATH)

        # monta {tickerId: metadados do produto} a partir dos tickers negociáveis
        meta_by_ticker = {}
        if config.TICKER_IDS:
            ticker_ids = list(dict.fromkeys(config.TICKER_IDS))
        else:
            ticker_ids = []
            for wallet_id in self._wallet_ids():
                for ticker in self.list_tickers(wallet_id):
                    if not isinstance(ticker, dict) or "id" not in ticker:
                        continue
                    tid = str(ticker["id"])
                    if tid not in meta_by_ticker:
                        ticker_ids.append(tid)
                        meta_by_ticker[tid] = _ticker_meta(ticker)

        if not ticker_ids:
            raise BBCEError("Nenhum ticker para buscar. Configure BBCE_WALLET_IDS ou BBCE_TICKER_IDS.")

        combined = []
        for tid in ticker_ids:
            data = self.fetch_negotiation_data(tid)
            records = data if isinstance(data, list) else (transform.extract_records(data) or [data])
            meta = meta_by_ticker.get(tid, {})
            for rec in records:
                if not isinstance(rec, dict):
                    continue
                rec.setdefault("tickerId", tid)
                for key, val in meta.items():  # PRODUTO/unidades vêm do ticker
                    if val:
                        rec.setdefault(key, val)
                combined.append(rec)
            if config.REQUEST_DELAY:
                time.sleep(config.REQUEST_DELAY)
        return {"data": combined}

    def _wallet_ids(self):
        if config.WALLET_IDS:
            return config.WALLET_IDS
        data = self._get_with_retry(config.WALLETS_PATH)
        wallets = data if isinstance(data, list) else (
            data.get("wallets") or data.get("data") or [])
        return [str(w["id"]) for w in wallets if isinstance(w, dict) and "id" in w]

    def list_tickers(self, wallet_id):
        """GET /v1/negotiable-tickers?walletId=X — ativos negociáveis da carteira."""
        path = config.TICKERS_PATH + "?walletId=" + str(wallet_id)
        data = self._get_with_retry(path)
        tickers = data.get("tickers") if isinstance(data, dict) else data
        return tickers or []

    def fetch_negotiation_data(self, ticker_id):
        """GET /v1/negotiation-data/{tickerId} — resumo de preços do dia do ticker."""
        path = config.NEGOTIATION_PATH.replace("{tickerId}", str(ticker_id))
        return self._get_with_retry(path)

    def _get_with_retry(self, path):
        self.ensure_session()
        try:
            return self._request("GET", path, auth=True)
        except BBCEError:
            # token pode ter sido invalidado por outra sessão -> relogin e 1 retry
            self.login()
            return self._request("GET", path, auth=True)
