-- ============================================================================
--  Energia SaaS — Schema REAL do Supabase (projeto pboizjwwxcnajeuteivp)
--  Gerado a partir do banco existente. Serve como REFERÊNCIA / documentação
--  para o Lovable. O backend JÁ EXISTE e está funcionando — você NÃO precisa
--  rodar este arquivo no seu projeto atual. Use-o só se for recriar o banco
--  do zero em outro projeto.
--
--  Funções RPC já existentes no projeto (não precisam ser recriadas):
--    fn_criar_conta(p_email, p_senha, p_nome)      -> cria conta
--    fn_login_senha(p_email, p_senha)              -> login
--    fn_login_permitido(p_email)                   -> allowlist
--    fn_registrar_acesso()                         -> marca último acesso
--    fn_is_admin()                                 -> checa admin
--    fn_acesso_add / fn_acesso_listar / fn_acesso_del / fn_acesso_set_ativo
--    fn_definir_senha(p_admin, p_email, p_senha)
--    fn_ccee_agentes / fn_ccee_consumo / fn_ccee_garantias / fn_ccee_liquidacao
-- ============================================================================

-- ─── AUTENTICAÇÃO / USUÁRIOS ────────────────────────────────────────────────
CREATE TABLE usuarios (
  id            bigint not null,
  nome          text not null,
  email         text not null,
  ativo         boolean not null default true,
  created_at    timestamptz,
  role          text not null default 'membro',   -- 'admin' | 'membro'
  criado_por    text,
  ultimo_acesso timestamptz,
  senha_hash    text
);

-- ─── CONTRATOS (ACL - mercado livre / carteira própria) ─────────────────────
CREATE TABLE acl_contratos (
  id            bigint not null default nextval('acl_contratos_id_seq'),
  codigo_contrato text,
  contraparte   text,
  tipo          text,
  montante_mwmed numeric,
  preco_rs_mwh  numeric,
  inicio_fornec date,
  fim_fornec    date,
  submercado    text default 'SE/CO',
  indexador     text default 'fixo',
  status        text default 'ativo',
  observacoes   text,
  criado_em     timestamptz default now(),
  atualizado_em timestamptz default now()
);

-- ─── CCEE (agentes, consumo, garantias, liquidação, contratos, medição, migração)
CREATE TABLE ccee_agentes (
  id bigint not null, codigo_ccee text not null, nome text, cnpj text, perfil text,
  classe text, submercado text, garantia_fisica_mwm numeric, consumo_medio_mwm numeric,
  data_habilitacao date, status text default 'ativo', fonte text default 'CCEE',
  atualizado_em timestamptz default now(), criado_em timestamptz default now()
);
CREATE TABLE ccee_consumo (
  id bigint not null, codigo_ccee text not null, competencia date not null,
  consumo_mwh numeric, medido_mwh numeric, submercado text,
  fonte text default 'CCEE', criado_em timestamptz default now()
);
CREATE TABLE ccee_garantias (
  id bigint not null, codigo_ccee text not null, competencia date not null,
  lastro_requerido_mwm numeric, lastro_disponivel_mwm numeric,
  garantia_requerida_rs numeric, garantia_aportada_rs numeric, penalidade_rs numeric,
  status text, fonte text default 'CCEE', criado_em timestamptz default now()
);
CREATE TABLE ccee_liquidacao (
  id bigint not null, codigo_ccee text not null, competencia date not null,
  submercado text, recurso_mwm numeric, requisito_mwm numeric, exposicao_mwh numeric,
  pld_medio numeric, valor_liquidacao_rs numeric, inadimplencia_rs numeric,
  status text, fonte text default 'CCEE', criado_em timestamptz default now()
);
CREATE TABLE ccee_contratos (
  id bigint not null, codigo_contrato_ccee text not null, codigo_agente_vendedor text,
  codigo_agente_comprador text, submercado text, fonte_energia text, tipo_energia text,
  montante_mwm numeric, modulacao text, sazonalizacao jsonb, flex_superior_pct numeric,
  flex_inferior_pct numeric, preco_rs_mwh numeric, inicio_fornecimento date,
  fim_fornecimento date, status text default 'registrado', fonte text default 'CCEE',
  atualizado_em timestamptz default now(), criado_em timestamptz default now()
);
CREATE TABLE ccee_medicao (
  id bigint not null, codigo_ccee text not null, ponto_medicao text, competencia date not null,
  consumo_ativo_mwh numeric, geracao_mwh numeric, perdas_mwh numeric, submercado text,
  fonte text default 'CCEE/SCDE', criado_em timestamptz default now()
);
CREATE TABLE ccee_migracao (
  id bigint not null, codigo_ccee text, cnpj text, distribuidora text,
  demanda_contratada_kw numeric, classe text, data_denuncia date, prazo_denuncia_dias integer,
  data_adesao_ccee date, data_migracao_prevista date, status text default 'em_analise',
  fonte text default 'CCEE', criado_em timestamptz default now()
);
CREATE TABLE ccee_alavancagem (
  id bigint not null default nextval('ccee_alavancagem_id_seq'),
  data_referencia date not null, fator_alavancagem numeric, limite_regulatorio numeric,
  status_alerta text, agentes_monitorados integer, observacoes text,
  fonte text default 'CCEE Dados Abertos', criado_em timestamptz default now()
);

-- ─── ONS / IPDO (dados diários do sistema) ──────────────────────────────────
CREATE TABLE ipdo_cmo_pld (
  id bigint not null default nextval('ipdo_cmo_pld_id_seq'),
  data_operacao date not null, semana_operativa text, subsistema text not null,
  patamar text default 'medio', cmo numeric, pld numeric, pld_piso numeric, pld_teto numeric,
  fonte text default 'ONS/CCEE', criado_em timestamptz default now()
);
CREATE TABLE ipdo_ear (
  id bigint not null default nextval('ipdo_ear_id_seq'),
  data_operacao date not null, subsistema text not null, ear_pct numeric, ear_mwmes numeric,
  ear_maxima_mwmes numeric, ear_minima_mwmes numeric, fonte text default 'ONS',
  criado_em timestamptz default now()
);
CREATE TABLE ipdo_ena (
  id bigint not null default nextval('ipdo_ena_id_seq'),
  data_operacao date not null, subsistema text not null, ena_mwmes numeric, ena_pct_mlt numeric,
  ena_mlt_referencia numeric, tipo text default 'verificada', fonte text default 'ONS',
  criado_em timestamptz default now()
);
CREATE TABLE ipdo_carga (
  id bigint not null default nextval('ipdo_carga_id_seq'),
  data_operacao date not null, subsistema text not null, carga_verificada_mwmed numeric,
  carga_prevista_mwmed numeric, desvio_pct numeric, fonte text default 'ONS',
  criado_em timestamptz default now()
);
CREATE TABLE ipdo_geracao (
  id bigint not null default nextval('ipdo_geracao_id_seq'),
  data_operacao date not null, subsistema text default 'SIN', fonte_geracao text not null,
  geracao_mwmed numeric, participacao_pct numeric, despacho_fora_merit boolean default false,
  fonte text default 'ONS', criado_em timestamptz default now()
);
CREATE TABLE ipdo_intercambio (
  id bigint not null default nextval('ipdo_intercambio_id_seq'),
  data_operacao date not null, de_subsistema text not null, para_subsistema text not null,
  fluxo_mwmed numeric, limite_mwmed numeric, utilizacao_pct numeric,
  restricao_ativa boolean default false, fonte text default 'ONS', criado_em timestamptz default now()
);
CREATE TABLE ipdo_curtailment (
  id bigint not null default nextval('ipdo_curtailment_id_seq'),
  data_operacao date not null, subsistema text not null, fonte_geracao text not null,
  corte_mwmed numeric, motivo text, fonte text default 'ONS', criado_em timestamptz default now()
);
CREATE TABLE ipdo_alertas (
  id bigint not null default nextval('ipdo_alertas_id_seq'),
  data_operacao date not null, tipo_alerta text not null, subsistema text, valor_atual numeric,
  limiar numeric, mensagem text, ativo boolean default true, resolvido_em timestamptz,
  criado_em timestamptz default now()
);
CREATE TABLE ipdo_noticias (
  id bigint not null default nextval('ipdo_noticias_id_seq'),
  data_operacao date not null, titulo text not null, fonte text, url text, resumo text,
  impacto_trading text, severidade text default 'info', tags text[],
  criado_em timestamptz default now()
);
CREATE TABLE ipdo_analise_trader (
  id bigint not null default nextval('ipdo_analise_trader_id_seq'),
  data_operacao date not null, cenario_atual text, drivers_cp text, riscos_mp text,
  rec_compradores text, rec_geradores text, rec_traders text,
  modelo_ia text default 'claude-sonnet', criado_em timestamptz default now()
);
CREATE TABLE ipdo_resumo_diario (
  id bigint not null default nextval('ipdo_resumo_diario_id_seq'),
  data_operacao date not null, data_arquivo date, fonte_dados text, resumo_operativo text,
  briefing_html text, ear_sin_pct numeric, pld_se_medio numeric, carga_sin_mwmed numeric,
  itens_selecionados integer, enviado_email boolean default false, criado_em timestamptz default now()
);

-- ─── ONS PMO / restrições ───────────────────────────────────────────────────
CREATE TABLE ons_pmo (
  id bigint not null default nextval('ons_pmo_id_seq'),
  semana text not null, data_inicio date not null, data_fim date not null,
  cmo_se_co numeric, cmo_sul numeric, cmo_ne numeric, cmo_norte numeric,
  ear_inicial_sin_pct numeric, ear_final_sin_pct numeric, risco_deficit_pct numeric,
  despacho_termico_mwmed numeric, observacoes text, fonte text default 'ONS/PMO',
  criado_em timestamptz default now()
);
CREATE TABLE ons_restricoes (
  id bigint not null default nextval('ons_restricoes_id_seq'),
  data_operacao date not null, codigo_restricao text, descricao text not null, tipo text,
  subsistema text, impacto_mw numeric, inicio_restricao timestamptz, fim_restricao timestamptz,
  ativa boolean default true, fonte text default 'ONS', criado_em timestamptz default now()
);

-- ─── ANEEL / mercado ────────────────────────────────────────────────────────
CREATE TABLE aneel_bandeiras (
  id bigint not null default nextval('aneel_bandeiras_id_seq'),
  ano_mes text not null, bandeira text not null, adicional_rs_kwh numeric,
  vigencia_inicio date, vigencia_fim date, resolucao_aneel text, fonte text default 'ANEEL',
  criado_em timestamptz default now()
);
CREATE TABLE pld_forward (
  id bigint not null default nextval('pld_forward_id_seq'),
  data_referencia date not null, data_entrega date not null, subsistema text not null default 'SE/CO',
  pld_forward numeric, produto text default 'flat', fonte text default 'BBCE',
  criado_em timestamptz default now()
);

-- ─── VIEWS (dashboard) — são VIEWS no banco, não tabelas ─────────────────────
--   vw_dashboard_trading, vw_painel_diario, vw_pld_atual,
--   vw_ear_atual, vw_ear_tendencia_30d
