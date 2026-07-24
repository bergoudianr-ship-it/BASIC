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


class BBCEError(Exception):
    pass


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
        """
        if not config.TRADES_PATH:
            raise BBCEError("BBCE_TRADES_PATH não configurado — endpoint de negócios "
                            "ainda desconhecido (aguardando doc do grupo Orders/Trades).")
        self.ensure_session()
        try:
            return self._request("GET", config.TRADES_PATH, auth=True)
        except BBCEError:
            # token pode ter sido invalidado por outra sessão -> relogin e 1 retry
            self.login()
            return self._request("GET", config.TRADES_PATH, auth=True)
