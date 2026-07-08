# Backend do Energia SaaS — Guia para o Lovable

> **Importante:** o backend **já existe e está funcionando** no Supabase
> (projeto `pboizjwwxcnajeuteivp`). Você **não precisa recriar** tabelas nem
> funções. No Lovable, basta **conectar** a este projeto Supabase.

---

## 1. Como conectar no Lovable

1. No Lovable, abra o projeto e vá em **Integrations → Supabase → Connect**.
2. Informe as credenciais do projeto existente:
   - **Project URL:** `https://pboizjwwxcnajeuteivp.supabase.co`
   - **Publishable/anon key:** a chave publishable do projeto (Supabase →
     Project Settings → API). Não cole a `service_role` no front-end.
3. Pronto — o Lovable passa a ler/gravar nas tabelas e chamar as funções RPC
   que já existem.

Para referência do schema completo, veja **`supabase_backend.sql`** (é um dump
de documentação; não precisa rodar no projeto atual).

---

## 2. Autenticação (já implementada)

Login por e-mail + senha via funções RPC (senha com hash na tabela `usuarios`):

| Função RPC                                        | Uso                          |
|---------------------------------------------------|------------------------------|
| `fn_criar_conta(p_email, p_senha, p_nome)`        | Autocadastro                 |
| `fn_login_senha(p_email, p_senha)`                | Login                        |
| `fn_login_permitido(p_email)`                     | Allowlist                    |
| `fn_registrar_acesso()`                           | Marca último acesso          |
| `fn_is_admin()`                                   | Verifica admin               |
| `fn_acesso_add / fn_acesso_listar / fn_acesso_del`| Gestão de usuários (admin)   |
| `fn_acesso_set_ativo / fn_definir_senha`          | Ativar/senha (admin)         |

> Já existe **1 usuário** cadastrado. Se precisar de um novo admin, rode no
> SQL Editor: `select fn_criar_conta('seu@email.com','sua-senha','Seu Nome');`

---

## 3. Tabelas (resumo do que já existe)

**Contratos / mercado livre**
- `acl_contratos` — carteira própria de contratos (contraparte, montante, preço, período)
- `ccee_contratos` — contratos registrados na CCEE

**CCEE (agente e liquidação)**
- `ccee_agentes`, `ccee_consumo`, `ccee_garantias`, `ccee_liquidacao`,
  `ccee_medicao`, `ccee_migracao`, `ccee_alavancagem`

**ONS / IPDO (dados diários do sistema)**
- `ipdo_cmo_pld` (PLD/CMO), `ipdo_ear`, `ipdo_ena`, `ipdo_carga`, `ipdo_geracao`,
  `ipdo_intercambio`, `ipdo_curtailment`, `ipdo_alertas`, `ipdo_noticias`,
  `ipdo_analise_trader`, `ipdo_resumo_diario`

**ONS PMO / restrições:** `ons_pmo`, `ons_restricoes`
**ANEEL / mercado:** `aneel_bandeiras`, `pld_forward`
**Dashboards (views):** `vw_dashboard_trading`, `vw_painel_diario`, `vw_pld_atual`,
`vw_ear_atual`, `vw_ear_tendencia_30d`

Funções de leitura CCEE: `fn_ccee_agentes`, `fn_ccee_consumo`,
`fn_ccee_garantias`, `fn_ccee_liquidacao`.

---

## 4. Sobre o erro "Serviço indisponível (Supabase não carregou)"

Esse aviso **não é do backend** — o backend está ok. Ele aparece quando o
**front-end não consegue carregar a biblioteca `@supabase/supabase-js`** (script
via CDN). Isso acontece em ambientes que bloqueiam scripts/rede externa (por
exemplo, o preview de artefato). Soluções:

- **Hospede o `SaaS.html`** no Lovable / Vercel / Netlify / GitHub Pages — aí o
  CDN carrega normalmente e o login conecta no Supabase.
- O `SaaS.html` já foi ajustado para tentar **dois CDNs** (jsdelivr → unpkg)
  antes de exibir o aviso.
