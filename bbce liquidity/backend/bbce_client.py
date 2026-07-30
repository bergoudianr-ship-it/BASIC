"""Cliente da API BBCE de produção (baseado no fluxo do pega_negociacoes_bbce.py).

Endpoints:
  POST /v2/login              -> idToken
  GET  /v1/all-deals/report   -> negócios (paginação via header 'page' e
                                  x-number-of-pages / x-page na resposta)
  GET  /v2/tickers/{tickerId} -> description (nome do produto)

Credenciais vêm de config (variáveis de ambiente); nunca são enviadas ao navegador.
"""
import json
import urllib.error
import urllib.parse
import urllib.request

import config


class BBCEError(Exception):
    pass


class BBCEClient:
    def __init__(self):
        self._id_token = None
        self._ticker_cache = {}

    def _request(self, method, path, params=None, body=None, auth=False, extra_headers=None):
        url = config.BASE_URL + path
        if params:
            url += "?" + urllib.parse.urlencode(params)
        headers = {"accept": "application/json", "apiKey": config.API_KEY}
        if body is not None:
            headers["Content-Type"] = "application/json"
        if auth:
            headers["Authorization"] = "Bearer " + (self._id_token or "")
        if extra_headers:
            headers.update(extra_headers)
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                raw = resp.read().decode("utf-8")
                return dict(resp.headers), (json.loads(raw) if raw else None)
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:400]
            raise BBCEError(f"{method} {path} -> HTTP {exc.code}: {detail}") from None
        except urllib.error.URLError as exc:
            raise BBCEError(f"{method} {path} -> falha de rede: {exc.reason}") from None

    # ---- auth -------------------------------------------------------------
    def login(self):
        payload = {
            "email": config.EMAIL,
            "password": config.PASSWORD,
            "companyExternalCode": config.COMPANY_ID,
        }
        _, data = self._request("POST", "/v2/login", body=payload)
        self._id_token = (data or {}).get("idToken")
        if not self._id_token:
            raise BBCEError("Login OK, mas 'idToken' ausente.")

    def ensure_login(self):
        if not self._id_token:
            self.login()

    # ---- negócios ---------------------------------------------------------
    def get_all_deals(self, initial_period, final_period, origin_operation_type=None):
        self.ensure_login()
        params = {"initialPeriod": initial_period, "finalPeriod": final_period}
        if origin_operation_type:
            params["originOperationType"] = origin_operation_type

        page, rows = 1, []
        while True:
            try:
                headers, data = self._request(
                    "GET", "/v1/all-deals/report", params=params, auth=True,
                    extra_headers={"page": str(page)})
            except BBCEError:
                # token pode ter expirado -> relogin e 1 retry
                self.login()
                headers, data = self._request(
                    "GET", "/v1/all-deals/report", params=params, auth=True,
                    extra_headers={"page": str(page)})
            if not isinstance(data, list):
                data = []
            rows.extend(data)
            num_pages = int(headers.get("x-number-of-pages", "1") or "1")
            curr = int(headers.get("x-page", str(page)) or str(page))
            if curr >= num_pages or not data:
                break
            page += 1
        return rows

    # ---- enriquecimento (nome do produto) --------------------------------
    def ticker_description(self, ticker_id):
        if ticker_id in self._ticker_cache:
            return self._ticker_cache[ticker_id]
        try:
            _, data = self._request("GET", f"/v2/tickers/{ticker_id}", auth=True)
            desc = (data or {}).get("description")
        except BBCEError:
            desc = None
        self._ticker_cache[ticker_id] = desc
        return desc

    def enrich_products(self, deals):
        """Adiciona 'produto_nome' a cada negócio via productId -> /v2/tickers."""
        pids = {d.get("productId") for d in deals if d.get("productId") is not None}
        for pid in pids:
            self.ticker_description(pid)
        for d in deals:
            d["produto_nome"] = self._ticker_cache.get(d.get("productId"))
        return deals
