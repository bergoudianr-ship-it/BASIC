# Backend do Energia SaaS — Especificação para o Lovable

Este documento descreve o **backend completo** do "Energia SaaS — Gestão de Contratos"
(mercado livre de energia / ACL). Hoje o app é 100% client-side e guarda tudo no
`localStorage` do navegador. Para virar uma plataforma real no **Lovable**, esses dados
precisam ir para um banco (Supabase/Postgres, que é o backend nativo do Lovable), com
autenticação e API.

Cole este arquivo no chat do Lovable como especificação. Ele contém: o modelo de dados,
o schema SQL pronto (Supabase), as regras de segurança (RLS) e os endpoints esperados
pelo frontend (`SaaS.html`).

---

## 1. Visão geral

- **Domínio:** gestão de contratos de compra e venda de energia no Mercado Livre (ACL).
- **Usuários:** trader/back-office de uma comercializadora de energia.
- **Entidades principais:** Contratos, Propostas, Contrapartes, Garantias, MTM
  (marcação a mercado), Curva horária, Premissas de mercado e Usuário/Empresa.
- **Multi-tenant:** cada usuário (ou organização) só enxerga os próprios dados.

### Chaves usadas hoje no `localStorage` (mapeamento 1:1 para tabelas)

| Chave localStorage      | Vira tabela        | Conteúdo                                   |
|-------------------------|--------------------|--------------------------------------------|
| `saas_contracts`        | `contracts`        | Contratos/operações fechadas               |
| `saas_proposals`        | `proposals`        | Propostas comerciais                       |
| `saas_contrapartes`     | `counterparties`   | Contrapartes (razão social, CNPJ, etc.)    |
| `saas_garantias`        | `guarantees`       | Garantias do agente (CCEE · Bloco 4)       |
| `saas_mtm`              | `mtm`              | Marcação a mercado por período             |
| `saas_curvahoraria`     | `hourly_curve`     | Curva horária/mensal importada por CSV     |
| `saas_local_user`       | `auth.users`+`profiles` | Usuário logado                        |
| `saas_dashboard_layout` | `dashboard_prefs`  | Layout/preferências do dashboard           |
| `saas_prop_seq`         | `sequences`        | Sequencial de proposta (`PROP-0001`)       |
| `saas_contract_seq`     | `sequences`        | Sequencial de contrato (`CT-0001`)         |

---

## 2. Modelo de dados (Supabase / Postgres)

> Todas as tabelas têm `id uuid`, `owner_id uuid` (dono = usuário logado),
> `created_at` e `updated_at`. RLS liga `owner_id = auth.uid()`.

```sql
-- ─────────────────────────────────────────────────────────────
-- Extensões
-- ─────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────────────────────
-- Perfis (1:1 com auth.users)
-- ─────────────────────────────────────────────────────────────
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nome        text,
  empresa     text default 'Minha Empresa',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────
-- Contrapartes
-- ─────────────────────────────────────────────────────────────
create table counterparties (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users(id) on delete cascade,
  razao_social   text not null,
  nome_fantasia  text,
  cnpj           text,
  perfil_ccee    text,              -- 'Conforme curva de carga' | 'Modulação'
  forma_pagamento text,             -- 'PIX' | 'TED' | 'Boleto' | 'DOC'
  contato        text,
  email          text,
  telefone       text,
  observacoes    text,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────
-- Propostas comerciais
-- ─────────────────────────────────────────────────────────────
create table proposals (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  codigo        text unique,        -- 'PROP-0001'
  negocio       text,               -- nome/identificação do negócio
  tipo_op       text,               -- 'Compra' | 'Venda'
  counterparty_id uuid references counterparties(id) on delete set null,
  submercado    text,               -- 'SE/CO' | 'SUL' | 'NE' | 'N'
  fonte         text,               -- convencional / incentivada (I0,I5,I8,I1)
  inicio        date,
  fim           date,
  data_base     date,
  prim_reaj     date,
  volume_mwm    numeric,
  preco         numeric,
  indexador     text,
  saz_tipo      text default 'Flat',
  saz_sup       numeric,            -- limite superior sazonalização (%)
  saz_inf       numeric,            -- limite inferior sazonalização (%)
  flex_sup      numeric,            -- flexibilidade superior (%)
  flex_inf      numeric,            -- flexibilidade inferior (%)
  status        text default 'Aberta', -- Aberta | Aceita | Recusada | Expirada
  dados         jsonb,              -- campos extras livres do PDF/proposta
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────
-- Contratos / operações
-- ─────────────────────────────────────────────────────────────
create table contracts (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references auth.users(id) on delete cascade,
  codigo             text unique,   -- 'CT-0001'
  proposal_id        uuid references proposals(id) on delete set null,
  counterparty_id    uuid references counterparties(id) on delete set null,
  tipo_op            text,          -- 'Compra' | 'Venda'
  submercado         text,
  fonte              text,
  data_criacao       date,
  inicio_forn        date,
  fim_forn           date,
  dat_ini_cond_pag   date,
  dat_fim_cond_pag   date,
  data_prim_reaj     date,
  data_base          date,
  volume_mwm         numeric,
  preco              numeric,
  indexador          text,
  saz_tipo           text,
  flex_sup           numeric,
  flex_inf           numeric,
  status             text default 'Ativo', -- Ativo | Encerrado | Cancelado
  dados              jsonb,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────
-- Garantias (CCEE · Bloco 4)
-- ─────────────────────────────────────────────────────────────
create table guarantees (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  descricao    text,
  tipo         text,               -- fiança, seguro garantia, aporte, etc.
  valor        numeric,
  vencimento   date,
  contract_id  uuid references contracts(id) on delete set null,
  dados        jsonb,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────
-- Marcação a mercado (MTM)
-- ─────────────────────────────────────────────────────────────
create table mtm (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  referencia   text,               -- período de referência (ex.: 'M+0', '2026-05')
  payload      jsonb,              -- valores de MTM por contrato/submercado
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────
-- Curva horária / mensal (importada por CSV)
-- ─────────────────────────────────────────────────────────────
create table hourly_curve (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  tipo         text,               -- 'horaria' | 'mensal'
  payload      jsonb,              -- série temporal { timestamp: valor }
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────
-- Premissas de mercado (forward, volatilidades, PLD, etc.)
-- ─────────────────────────────────────────────────────────────
create table market_assumptions (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  data_referencia date,
  forward         jsonb,   -- preços forward por mês/submercado
  volatilidades   jsonb,
  stress_long     jsonb,
  stress_short    jsonb,
  horas           jsonb,
  pld_min         numeric,
  pld_max         numeric,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────
-- Sequenciais de código (PROP-000x / CT-000x) e preferências
-- ─────────────────────────────────────────────────────────────
create table sequences (
  owner_id  uuid not null references auth.users(id) on delete cascade,
  nome      text not null,          -- 'prop' | 'contract'
  valor     int  not null default 0,
  primary key (owner_id, nome)
);

create table dashboard_prefs (
  owner_id  uuid primary key references auth.users(id) on delete cascade,
  layout    jsonb,
  known     jsonb,
  updated_at timestamptz default now()
);
```

---

## 3. Segurança (RLS)

Ative RLS em todas as tabelas e aplique a política padrão "dono só vê o que é dele".

```sql
-- repita para cada tabela com coluna owner_id
alter table contracts enable row level security;

create policy "owner_all" on contracts
  for all
  using  (owner_id = auth.uid())
  with check (owner_id = auth.uid());
```

Para `profiles`, a policy usa `id = auth.uid()`.

Trigger para criar o profile automaticamente no signup:

```sql
create function handle_new_user() returns trigger as $$
begin
  insert into profiles (id, nome, empresa)
  values (new.id, new.raw_user_meta_data->>'nome', 'Minha Empresa');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
```

---

## 4. API esperada pelo frontend

O `SaaS.html` foi feito para um backend HTTP com estas rotas (do protótipo em Python,
`simulador_fa/main.py`). No Lovable/Supabase o mais simples é usar o SDK do Supabase
direto (CRUD nas tabelas acima). Se preferir manter os endpoints REST, crie Edge
Functions equivalentes:

| Método | Rota                              | Função                                   |
|--------|-----------------------------------|------------------------------------------|
| GET    | `/api/empresa`                    | Dados da empresa/perfil                  |
| GET    | `/api/premissas`                  | Premissas de mercado                     |
| POST   | `/api/premissas`                  | Salvar premissas                         |
| POST   | `/api/empresa`                    | Salvar empresa/perfil                    |
| GET    | `/api/historico`                  | Histórico de simulações                  |
| POST   | `/api/historico/salvar`           | Salvar item de histórico                 |
| GET    | `/api/calcular`                   | Calcular FA (fator de ajuste/risco)      |
| POST   | `/api/calcular/simulador`         | Rodar simulador                          |
| POST   | `/api/calcular/extra-preview`     | Preview de portfólio extra               |
| GET    | `/api/portfolio_extra`            | Portfólio extra                          |
| POST   | `/api/portfolio_extra`            | Salvar portfólio extra                   |
| POST   | `/api/upload/premissas`           | Upload de planilha de premissas          |
| POST   | `/api/upload/portfolio`           | Upload de planilha de portfólio (CCEE)   |
| POST   | `/api/upload/portfolio_extra_csv` | Upload de portfólio extra (CSV)          |
| GET    | `/api/download/modelo`            | Baixar modelo de planilha                |
| GET    | `/api/download/modelo_extra_csv`  | Baixar modelo CSV extra                  |
| GET    | `/api/download/historico_csv`     | Exportar histórico em CSV                |

### Recomendação para o Lovable
Não recrie os endpoints REST manualmente. Peça ao Lovable para:
1. Criar as tabelas do schema acima no Supabase.
2. Ativar autenticação por e-mail/senha.
3. Gerar telas de CRUD para **Contratos, Propostas, Contrapartes e Garantias**.
4. Fazer o Dashboard ler de `contracts`/`mtm`.
5. Manter os cálculos de FA/simulador como uma **Edge Function** (portar de
   `simulador_fa/calculadora_fa.py`).

---

## 5. Prompt pronto para colar no Lovable

> Crie uma plataforma SaaS de gestão de contratos de energia no Mercado Livre (ACL),
> em português (pt-BR), tema escuro. Use Supabase com autenticação por e-mail/senha e
> multi-tenant (cada usuário só vê seus dados via RLS `owner_id = auth.uid()`).
> Crie as tabelas: profiles, counterparties, proposals, contracts, guarantees, mtm,
> hourly_curve, market_assumptions, sequences, dashboard_prefs (schema em anexo).
> Telas: (1) Dashboard com KPIs de volume, MTM e exposição; (2) Backoffice de
> Contratos com filtros por mês/data e busca; (3) Propostas com geração de PDF;
> (4) Contrapartes; (5) Garantias (CCEE Bloco 4); (6) Configurações/Premissas.
> Gere código sequencial CT-0001 e PROP-0001 via tabela `sequences`.
> Importação de curva horária/mensal por CSV. Cálculo de FA/risco como Edge Function.
```
```
