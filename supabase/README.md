# EnergiaSaaS — Backend (Supabase)

Backend completo do projeto Supabase `pboizjwwxcnajeuteivp` (região `sa-east-1`), usado
pelo `SaaS.html` (raiz deste repositório). Pronto para abrir no VS Code e continuar o
desenvolvimento com a [Supabase CLI](https://supabase.com/docs/guides/local-development).

## Estrutura

```
supabase/
├── config.toml                      # config do projeto para a CLI
└── migrations/
    └── 00000000000000_schema.sql    # schema completo: tabelas, RLS, funções, grants
```

O `SaaS.html` na raiz do repo é o frontend real — autossuficiente (SDK do Supabase
embutido, sem CDN) — e se conecta a este backend via `SUPABASE_URL` /
`SUPABASE_PUBLISHABLE_KEY` (veja `.env.example` na raiz).

## O que tem no banco

### Tabelas do EnergiaSaaS propriamente dito
- **usuarios** — login por e-mail/senha (bcrypt via `pgcrypto`), roles `admin`/`membro`.
- **app_estado** — estado do app por usuário (contratos, contrapartes, MtM, layout do
  dashboard etc.), chave/valor em JSONB.

### Dados de mercado (ONS / ANEEL / BBCE)
`ipdo_ear`, `ipdo_ena`, `ipdo_cmo_pld`, `ipdo_carga`, `ipdo_geracao`, `ipdo_intercambio`,
`ipdo_curtailment`, `ipdo_resumo_diario`, `ipdo_noticias`, `ipdo_alertas`,
`ipdo_analise_trader`, `pld_forward`, `aneel_bandeiras`, `ons_restricoes`, `ons_pmo`,
`acl_contratos`.

### Funções (RPC), todas `SECURITY DEFINER`
| Função | Uso |
|---|---|
| `fn_login_senha(email, senha)` | Login — retorna `email, nome, role` se a senha bater |
| `fn_criar_conta(email, senha, nome?)` | Autocadastro (signup) |
| `fn_login_permitido(email)` | Checa se o e-mail está ativo/liberado |
| `fn_is_admin()` | Helper de RLS |
| `fn_registrar_acesso()` | Atualiza `ultimo_acesso` |
| `fn_acesso_listar(admin)` | Lista usuários (só admin) |
| `fn_acesso_add(admin, nome, email, senha, role)` | Cria usuário com senha |
| `fn_acesso_add(admin, nome, email, role)` | Cria usuário sem senha (overload) |
| `fn_acesso_del(admin, email)` | Remove usuário (não pode remover a si mesmo) |
| `fn_acesso_set_ativo(admin, email, ativo)` | Ativa/desativa usuário |
| `fn_definir_senha(admin, email, senha)` | Admin redefine senha de outro usuário |
| `fn_estado_salvar(email, chave, valor jsonb)` | Salva um bloco de estado do app na nuvem |
| `fn_estado_carregar(email)` | Carrega todos os blocos de estado do usuário |

### Row Level Security
- **usuarios**: cada usuário lê/edita a si mesmo; admin lê/gerencia todos.
- **app_estado**: sem policy própria — todo acesso passa pelas RPCs `fn_estado_*`
  (`SECURITY DEFINER`).
- **Tabelas de mercado** (ONS/ANEEL/BBCE): leitura livre para `authenticated`, escrita
  restrita a admin (`fn_is_admin()`).

Todas as RPCs têm `GRANT EXECUTE` para `anon` e `authenticated` — o frontend usa sempre a
chave **publishable/anon** (nunca a `service_role`).

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
5. Para rodar tudo localmente (Postgres + Studio + API, via Docker):
   ```bash
   supabase start
   supabase db reset   # aplica as migrations do zero num banco local
   ```

## Validação

A migration `00000000000000_schema.sql` foi testada de ponta a ponta contra um Postgres
local descartável antes de ser publicada: aplica sem erros e os RPCs de
login/cadastro/estado foram exercitados com sucesso (`fn_criar_conta` → `fn_login_senha`
→ `fn_estado_salvar`/`fn_estado_carregar`).

## Segurança

- A chave incluída (`sb_publishable_...` / `anon`) é pública por design — é a mesma que já
  está embutida no `SaaS.html`. Não é secreta.
- **Nunca** exponha a chave `service_role` no frontend nem a commite no repositório.
- O projeto Supabase é do plano gratuito e **pausa por inatividade** — se as queries
  falharem com timeout, reative em Project Settings ou aguarde alguns minutos após a
  primeira requisição (cold start).
