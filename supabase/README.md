# EnergiaSaaS — Backend (Supabase)

Backend completo do projeto Supabase `pboizjwwxcnajeuteivp` (região `sa-east-1`), usado
pelo `SaaS.html` (raiz deste repositório). Pronto para abrir no VS Code e continuar o
desenvolvimento com a [Supabase CLI](https://supabase.com/docs/guides/local-development).

## Estrutura

```
supabase/
├── config.toml                      # config do projeto para a CLI
├── migrations/
│   └── 00000000000000_schema.sql    # schema completo: tabelas, RLS, funções, grants
└── functions/
    └── pld-ccee/index.ts            # Edge Function (Deno) — busca PLD na CCEE
```

O `SaaS.html` na raiz do repo é o frontend real — autossuficiente (SDK do Supabase
embutido, sem CDN) — e se conecta a este backend via `SUPABASE_URL` /
`SUPABASE_PUBLISHABLE_KEY` (veja `.env.example` na raiz).

## O que tem no banco

### Tabelas do EnergiaSaaS propriamente dito
- **usuarios** — login por e-mail/senha (bcrypt via `pgcrypto`), roles `admin`/`membro`.
- **app_estado** — estado do app por usuário (contratos, contrapartes, MtM, layout do
  dashboard etc.), chave/valor em JSONB. Alimenta a sincronização "além do localStorage"
  do frontend.

### Dados de mercado (ONS / CCEE / ANEEL / BBCE)
Tabelas de referência do setor elétrico, alimentadas por integrações externas (não pelo
frontend do EnergiaSaaS diretamente): `ipdo_ear`, `ipdo_ena`, `ipdo_cmo_pld`, `ipdo_carga`,
`ipdo_geracao`, `ipdo_intercambio`, `ipdo_curtailment`, `ipdo_resumo_diario`, `ipdo_noticias`,
`ipdo_alertas`, `ipdo_analise_trader`, `pld_forward`, `aneel_bandeiras`, `ons_restricoes`,
`ons_pmo`, `acl_contratos`, `ccee_agentes`, `ccee_consumo`, `ccee_garantias`,
`ccee_contratos`, `ccee_medicao`, `ccee_liquidacao`, `ccee_migracao`, `ccee_alavancagem`.

> ⚠️ O frontend atual **não usa mais** essas tabelas de CCEE diretamente (a aba/telas que
> as exibiam foram removidas a pedido). As funções `fn_ccee_*` continuam no banco
> (vestigiais) caso queira reativar ou usar em outro lugar.

> ℹ️ Este mesmo projeto Supabase também hospeda a tabela `rolamentos`, de **outro app**
> (peças de poliuretano). Não faz parte do EnergiaSaaS — não incluída na migration.

### Funções (RPC), todas `SECURITY DEFINER`
| Função | Uso |
|---|---|
| `fn_login_senha(email, senha)` | Login — retorna `email, nome, role` se a senha bater |
| `fn_criar_conta(email, senha, nome?)` | Autocadastro (signup) |
| `fn_login_permitido(email)` | Checa se o e-mail está ativo/liberado |
| `fn_is_admin()` | Helper de RLS (baseado em `auth.jwt()` — só relevante se migrar para Supabase Auth) |
| `fn_registrar_acesso()` | Atualiza `ultimo_acesso` via Supabase Auth (vestigial, o login atual é por RPC) |
| `fn_acesso_listar(admin)` | Lista usuários (só admin) |
| `fn_acesso_add(admin, nome, email, senha, role)` | Cria usuário com senha |
| `fn_acesso_add(admin, nome, email, role)` | Cria usuário sem senha (overload) |
| `fn_acesso_del(admin, email)` | Remove usuário (não pode remover a si mesmo) |
| `fn_acesso_set_ativo(admin, email, ativo)` | Ativa/desativa usuário |
| `fn_definir_senha(admin, email, senha)` | Admin redefine senha de outro usuário |
| `fn_estado_salvar(email, chave, valor jsonb)` | Salva um bloco de estado do app na nuvem |
| `fn_estado_carregar(email)` | Carrega todos os blocos de estado do usuário |
| `fn_ccee_agentes/consumo/garantias/liquidacao()` | Leitura das tabelas CCEE (vestigiais) |

### Row Level Security
- **usuarios**: cada usuário lê/edita a si mesmo; admin lê/gerencia todos.
- **app_estado**: sem policy própria — todo acesso passa pelas RPCs `fn_estado_*`
  (`SECURITY DEFINER`).
- **Tabelas de mercado** (ONS/CCEE/ANEEL/etc.): leitura livre para `authenticated`,
  escrita restrita a admin (`fn_is_admin()`).

Todas as RPCs têm `GRANT EXECUTE` para `anon` e `authenticated` — o frontend usa sempre a
chave **publishable/anon** (nunca a `service_role`).

### Edge Function: `pld-ccee`
Busca o PLD médio mensal na CCEE via portal **Dados Abertos** (API CKAN,
`dadosabertos.ccee.org.br`), pois o Painel de Preços oficial bloqueia acesso automatizado
(CORS/anti-bot). Roda server-side (Deno) para contornar o bloqueio.

> ⚠️ O botão que chamava esta função no frontend ("Tentar buscar PLD na CCEE") foi
> removido junto com o restante das telas de CCEE. A função continua deployada e
> funcional — é só religar um botão a `sb.functions.invoke('pld-ccee', {body:{mes}})`
> se quiser reaproveitá-la.

## Como continuar no VS Code

1. Instale a [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started).
2. `cp .env.example .env` e preencha se for rodar scripts locais.
3. Linkar ao projeto remoto (não sobrescreve nada, só conecta a CLI):
   ```bash
   supabase login
   supabase link --project-ref pboizjwwxcnajeuteivp
   ```
4. Para editar o schema: crie uma nova migration (não edite a
   `00000000000000_schema.sql`, que é o snapshot do estado atual):
   ```bash
   supabase migration new minha_mudanca
   # edite o arquivo gerado em supabase/migrations/
   supabase db push          # aplica no projeto remoto
   ```
5. Para desenvolver a Edge Function localmente:
   ```bash
   supabase functions serve pld-ccee --no-verify-jwt
   supabase functions deploy pld-ccee
   ```
6. Para rodar tudo localmente (Postgres + Studio + API, via Docker):
   ```bash
   supabase start
   supabase db reset   # aplica as migrations do zero num banco local
   ```

## Validação

A migration `00000000000000_schema.sql` foi testada de ponta a ponta contra um Postgres
16 local descartável antes de ser publicada: aplica sem erros (26 tabelas, 17 funções, 52
policies, 2 extensões) e os RPCs de login/cadastro/estado foram exercitados com sucesso
(`fn_criar_conta` → `fn_login_senha` → `fn_estado_salvar`/`fn_estado_carregar`).

## Segurança

- A chave incluída (`sb_publishable_...` / `anon`) é pública por design — é a mesma que já
  está embutida no `SaaS.html`. Não é secreta.
- **Nunca** exponha a chave `service_role` no frontend nem a commite no repositório.
- O projeto Supabase é do plano gratuito e **pausa por inatividade** — se as queries
  falharem com timeout, reative em Project Settings ou aguarde alguns minutos após a
  primeira requisição (cold start).
