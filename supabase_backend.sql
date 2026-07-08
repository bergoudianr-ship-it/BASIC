-- ============================================================================
--  Energia SaaS — Backend Supabase (schema + funções RPC)
--  Cole/rode isto no SQL Editor do Supabase (ou peça ao Lovable para aplicar).
--  Cria TUDO que o front-end (SaaS.html) chama: login por senha, gestão de
--  acessos, PLD (ipdo_cmo_pld) e as visões CCEE (agentes/consumo/garantias/
--  liquidação).
--
--  IMPORTANTE (segurança): este é o esquema de login "por senha em tabela" que
--  o app já espera hoje. As senhas são guardadas com hash bcrypt (pgcrypto).
--  As funções são SECURITY DEFINER e liberadas para o papel anon (chave
--  publishable). O ideal, a médio prazo, é migrar para o Supabase Auth nativo.
-- ============================================================================

create extension if not exists pgcrypto;

-- ────────────────────────────────────────────────────────────────────────────
-- 1) USUÁRIOS / CONTROLE DE ACESSO
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists usuarios_acesso (
  email          text primary key,
  nome           text,
  senha_hash     text not null,
  role           text not null default 'membro',   -- 'admin' | 'membro'
  ativo          boolean not null default true,
  ultimo_acesso  timestamptz,
  criado_em      timestamptz not null default now()
);

alter table usuarios_acesso enable row level security;
-- Sem policies de acesso direto: o front só toca nesta tabela via as funções
-- SECURITY DEFINER abaixo (que rodam com privilégio do dono e ignoram RLS).

-- Helper: o solicitante é admin ativo?
create or replace function _is_admin(p_admin text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from usuarios_acesso
    where email = lower(p_admin) and ativo and role = 'admin'
  );
$$;

-- Criar conta (autocadastro). O 1º usuário criado vira admin automaticamente.
create or replace function fn_criar_conta(p_email text, p_senha text)
returns text language plpgsql security definer set search_path=public as $$
declare v_email text := lower(trim(p_email)); v_role text; v_n int;
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return 'EMAIL_INVALIDO'; end if;
  if char_length(coalesce(p_senha,'')) < 6 then return 'SENHA_CURTA'; end if;
  if exists(select 1 from usuarios_acesso where email = v_email) then return 'DUPLICADO'; end if;
  select count(*) into v_n from usuarios_acesso;
  v_role := case when v_n = 0 then 'admin' else 'membro' end;
  insert into usuarios_acesso(email, nome, senha_hash, role)
  values (v_email, v_email, crypt(p_senha, gen_salt('bf')), v_role);
  return 'OK';
end $$;

-- Login por e-mail + senha. Retorna o usuário se as credenciais baterem.
create or replace function fn_login_senha(p_email text, p_senha text)
returns table(email text, nome text, role text)
language plpgsql security definer set search_path=public as $$
declare v_email text := lower(trim(p_email));
begin
  update usuarios_acesso u set ultimo_acesso = now()
   where u.email = v_email and u.ativo
     and u.senha_hash = crypt(p_senha, u.senha_hash);
  return query
    select u.email, u.nome, u.role from usuarios_acesso u
     where u.email = v_email and u.ativo
       and u.senha_hash = crypt(p_senha, u.senha_hash);
end $$;

-- Admin adiciona um usuário.
create or replace function fn_acesso_add(
  p_admin text, p_nome text, p_email text, p_senha text, p_role text)
returns text language plpgsql security definer set search_path=public as $$
declare v_email text := lower(trim(p_email));
begin
  if not _is_admin(p_admin) then return 'NAO_AUTORIZADO'; end if;
  if char_length(coalesce(p_senha,'')) < 6 then return 'SENHA_CURTA'; end if;
  if exists(select 1 from usuarios_acesso where email = v_email) then return 'DUPLICADO'; end if;
  insert into usuarios_acesso(email, nome, senha_hash, role)
  values (v_email, p_nome, crypt(p_senha, gen_salt('bf')),
          case when p_role = 'admin' then 'admin' else 'membro' end);
  return 'OK';
end $$;

-- Admin lista usuários.
create or replace function fn_acesso_listar(p_admin text)
returns table(nome text, email text, role text, ativo boolean, ultimo_acesso timestamptz)
language plpgsql security definer set search_path=public as $$
begin
  if not _is_admin(p_admin) then return; end if;
  return query
    select u.nome, u.email, u.role, u.ativo, u.ultimo_acesso
    from usuarios_acesso u order by u.criado_em;
end $$;

-- Admin (re)define senha de um usuário.
create or replace function fn_definir_senha(p_admin text, p_email text, p_senha text)
returns text language plpgsql security definer set search_path=public as $$
begin
  if not _is_admin(p_admin) then return 'NAO_AUTORIZADO'; end if;
  if char_length(coalesce(p_senha,'')) < 6 then return 'SENHA_CURTA'; end if;
  update usuarios_acesso set senha_hash = crypt(p_senha, gen_salt('bf'))
   where email = lower(trim(p_email));
  if not found then return 'NAO_ENCONTRADO'; end if;
  return 'OK';
end $$;

-- Admin ativa/desativa um usuário.
create or replace function fn_acesso_set_ativo(p_admin text, p_email text, p_ativo boolean)
returns text language plpgsql security definer set search_path=public as $$
begin
  if not _is_admin(p_admin) then return 'NAO_AUTORIZADO'; end if;
  update usuarios_acesso set ativo = p_ativo where email = lower(trim(p_email));
  return 'OK';
end $$;

-- Admin exclui um usuário.
create or replace function fn_acesso_del(p_admin text, p_email text)
returns text language plpgsql security definer set search_path=public as $$
begin
  if not _is_admin(p_admin) then return 'NAO_AUTORIZADO'; end if;
  delete from usuarios_acesso where email = lower(trim(p_email));
  return 'OK';
end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2) PLD / CMO (painel de preços) — lido direto pelo front via sb.from(...)
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists ipdo_cmo_pld (
  id             bigint generated always as identity primary key,
  subsistema     text not null,          -- 'SE/CO' | 'S' | 'NE' | 'N'
  data_operacao  date not null,
  pld            numeric,
  pld_piso       numeric,
  pld_teto       numeric,
  unique (subsistema, data_operacao)
);
alter table ipdo_cmo_pld enable row level security;
create policy "ipdo_read" on ipdo_cmo_pld for select using (true);  -- leitura pública

-- ────────────────────────────────────────────────────────────────────────────
-- 3) BACKOFFICE CCEE — tabelas + funções que o front consome
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists ccee_agentes (
  codigo_ccee text, nome text, cnpj text, perfil text, classe text,
  submercado text, garantia_fisica_mwm numeric, consumo_medio_mwm numeric,
  data_habilitacao date, status text
);
create table if not exists ccee_consumo (
  codigo_ccee text, competencia date, consumo_mwh numeric,
  medido_mwh numeric, submercado text
);
create table if not exists ccee_garantias (
  codigo_ccee text, competencia date, lastro_requerido_mwm numeric,
  lastro_disponivel_mwm numeric, garantia_aportada_rs numeric, status text
);
create table if not exists ccee_liquidacao (
  codigo_ccee text, competencia date, submercado text, exposicao_mwh numeric,
  pld_medio numeric, valor_liquidacao_rs numeric, status text
);

create or replace function fn_ccee_agentes()
returns setof ccee_agentes language sql stable security definer set search_path=public
as $$ select * from ccee_agentes order by nome $$;

create or replace function fn_ccee_consumo()
returns setof ccee_consumo language sql stable security definer set search_path=public
as $$ select * from ccee_consumo order by competencia desc $$;

create or replace function fn_ccee_garantias()
returns setof ccee_garantias language sql stable security definer set search_path=public
as $$ select * from ccee_garantias order by competencia desc $$;

create or replace function fn_ccee_liquidacao()
returns setof ccee_liquidacao language sql stable security definer set search_path=public
as $$ select * from ccee_liquidacao order by competencia desc $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 4) PERMISSÕES — a chave publishable usa o papel 'anon'
-- ────────────────────────────────────────────────────────────────────────────
grant execute on function
  fn_criar_conta, fn_login_senha, fn_acesso_add, fn_acesso_listar,
  fn_definir_senha, fn_acesso_set_ativo, fn_acesso_del,
  fn_ccee_agentes, fn_ccee_consumo, fn_ccee_garantias, fn_ccee_liquidacao
  to anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 5) (Opcional) Primeiro admin já pronto — troque o e-mail/senha antes de rodar
-- ────────────────────────────────────────────────────────────────────────────
-- select fn_criar_conta('bergoudianr@gmail.com', 'troque-esta-senha');
