-- =============================================================================
-- PrintFlow — Schema completo para Supabase
-- Modelo multi-tenant: cada conta pode ter 1 proprietário + até 2 operadores
-- Execute no SQL Editor do Supabase (projeto novo, schema "public")
-- =============================================================================

-- Habilita extensão de UUID (já ativa no Supabase, mas garante)
create extension if not exists "pgcrypto";

-- =============================================================================
-- TABELA: accounts (uma conta = uma empresa/assinante)
-- =============================================================================
create table public.accounts (
  id            uuid        primary key default gen_random_uuid(),
  nome          text        not null,
  email_contato text        not null,
  plano         text        not null default 'basico',
    -- 'basico'     → 1 proprietário + 2 operadores (3 total)
    -- 'pro'        → 1 proprietário + 5 operadores (reservado para crescimento)
  max_usuarios  int         not null default 3,
  ativo         boolean     not null default true,
  criado_em     timestamptz not null default now()
);
comment on table public.accounts is 'Uma conta representa uma empresa assinante do PrintFlow.';

-- =============================================================================
-- TABELA: profiles (estende auth.users — 1 perfil por usuário)
-- =============================================================================
create table public.profiles (
  id          uuid        primary key references auth.users(id) on delete cascade,
  account_id  uuid        references public.accounts(id) on delete set null,
  nome        text,
  role        text        not null default 'operator',
    -- 'owner'    → proprietário da conta (criou a assinatura)
    -- 'operator' → usuário convidado pelo proprietário
  ativo       boolean     not null default true,
  criado_em   timestamptz not null default now(),
  constraint profiles_role_check check (role in ('owner', 'operator'))
);
comment on table public.profiles is 'Perfil de cada usuário autenticado, vinculado a uma conta.';

-- =============================================================================
-- GATILHO: cria o perfil automaticamente após signup
-- =============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
as $$
begin
  insert into public.profiles (id, nome)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- FUNÇÃO: limitar usuários por conta (máximo definido no plano)
-- =============================================================================
create or replace function public.check_user_limit()
returns trigger
language plpgsql security definer
as $$
declare
  v_count    int;
  v_max      int;
begin
  if new.account_id is null then
    return new;
  end if;
  select count(*) into v_count
    from public.profiles
   where account_id = new.account_id and ativo = true;
  select max_usuarios into v_max
    from public.accounts
   where id = new.account_id;
  if v_count >= v_max then
    raise exception 'Limite de usuários atingido para esta conta (máximo: %)', v_max;
  end if;
  return new;
end;
$$;

create trigger before_profile_account_assign
  before insert or update of account_id on public.profiles
  for each row execute function public.check_user_limit();

-- =============================================================================
-- FUNÇÃO AUXILIAR: retorna o account_id do usuário autenticado
-- =============================================================================
create or replace function public.my_account_id()
returns uuid
language sql stable security definer
as $$
  select account_id from public.profiles where id = auth.uid();
$$;

-- =============================================================================
-- TABELA: categorias (personalizável por conta)
-- =============================================================================
create table public.categorias (
  id         text        not null,
  account_id uuid        not null references public.accounts(id) on delete cascade,
  nome       text        not null,
  keywords   text[]      not null default '{}',
  ordem      int         not null default 0,
  primary key (id, account_id)
);
comment on table public.categorias is 'Categorias de produto por conta. Padrão: sacolinha, caixinha, topos, banderola, poster, nao_personalizado.';

-- =============================================================================
-- TABELA: templates (temas gráficos)
-- =============================================================================
create table public.templates (
  id         uuid        primary key default gen_random_uuid(),
  account_id uuid        not null references public.accounts(id) on delete cascade,
  nome       text        not null,
  descricao  text,
  criado_em  timestamptz not null default now()
);
comment on table public.templates is 'Cada template representa um tema (ex: Frozen, Patrulha Canina).';

-- =============================================================================
-- TABELA: artes (peças dentro de um template)
-- =============================================================================
create table public.artes (
  id           uuid        primary key default gen_random_uuid(),
  account_id   uuid        not null references public.accounts(id) on delete cascade,
  template_id  uuid        not null references public.templates(id) on delete cascade,
  nome         text        not null,
  categoria_id text        not null,
  observacao   text,
  comportamento text       not null default 'personalizado',
    -- 'personalizado' → 1 arte por pedido (tem nome/idade)
    -- 'agrupado'      → agrupa por variação, soma quantidades
    -- 'banderola'     → N páginas, 1 letra por campo
  variacao     text,
  editor_state jsonb,      -- estado completo do editor visual (bgImage, layers)
  criado_em    timestamptz not null default now(),
  constraint artes_comportamento_check check (comportamento in ('personalizado', 'agrupado', 'banderola'))
);
comment on table public.artes is 'Cada arte é uma peça do kit (sacolinha, topo, caixinha...) dentro de um template.';

-- =============================================================================
-- TABELA: anuncios (vínculo produto → template)
-- =============================================================================
create table public.anuncios (
  id                  uuid        primary key default gen_random_uuid(),
  account_id          uuid        not null references public.accounts(id) on delete cascade,
  nome_produto        text        not null,
  template_id         uuid        references public.templates(id) on delete set null,
  artes_ids           uuid[],     -- null = todas as artes do template
  tipo_personalizacao text        not null default 'personalizado',
  criado_em           timestamptz not null default now(),
  unique (account_id, nome_produto)
);
comment on table public.anuncios is 'Vincula um anúncio da plataforma de vendas a um template e suas artes.';

-- =============================================================================
-- TABELA: sessoes (cada importação de relatório = uma sessão)
-- =============================================================================
create table public.sessoes (
  id           uuid        primary key default gen_random_uuid(),
  account_id   uuid        not null references public.accounts(id) on delete cascade,
  arquivo_nome text,
  criado_por   uuid        references auth.users(id) on delete set null,
  criado_em    timestamptz not null default now()
);
comment on table public.sessoes is 'Uma sessão representa uma importação de relatório (um dia de pedidos).';

-- =============================================================================
-- TABELA: pedidos (pedidos importados do CSV/XLSX)
-- =============================================================================
create table public.pedidos (
  id               text        not null,  -- ID original da plataforma
  idx_importacao   int         not null default 0, -- garante unicidade em caso de IDs repetidos
  account_id       uuid        not null references public.accounts(id) on delete cascade,
  sessao_id        uuid        not null references public.sessoes(id) on delete cascade,
  produto          text        not null,
  variacao         text,
  quantidade       int         not null default 1,
  observacao       text,
  destinatario     text,
  prazo_envio      text,
  tipo             text        not null,
    -- 'imp_pers'         → imprime + personaliza
    -- 'imp_nao_pers'     → só imprime
    -- 'pers_nao_imp'     → só personaliza
    -- 'nem_pers_nem_imp' → sem produção
  nome_personalizado text,
  idade            text,
  personalizacao_ok boolean    not null default false,
  primary key (id, idx_importacao, sessao_id)
);
comment on table public.pedidos is 'Pedidos importados do relatório CSV/XLSX da plataforma de vendas.';

-- =============================================================================
-- TABELA: itens_producao (artes desmembradas por pedido)
-- =============================================================================
create table public.itens_producao (
  id                  uuid        primary key default gen_random_uuid(),
  account_id          uuid        not null references public.accounts(id) on delete cascade,
  sessao_id           uuid        not null references public.sessoes(id) on delete cascade,
  pedido_id           text        not null,
  produto             text        not null,
  variacao            text,
  quantidade          int         not null default 1,
  categoria_id        text        not null,
  nome_personalizado  text,
  idade               text,
  personalizacao_ok   boolean     not null default false,
  template_id         uuid        references public.templates(id) on delete set null,
  template_nome       text,
  arte_id             uuid        references public.artes(id) on delete set null,
  arte_nome           text,
  comportamento       text        not null default 'personalizado',
  status              text        not null default 'pendente',
    -- 'pendente' → aguardando geração
    -- 'gerado'   → arte gerada, aguardando impressão
    -- 'baixado'  → PDF baixado/impresso
  prazo_envio         text,
  destinatario        text,
  tipo_personalizacao text        not null default 'personalizado',
  atualizado_em       timestamptz not null default now(),
  constraint itens_status_check check (status in ('pendente', 'gerado', 'baixado')),
  constraint itens_comportamento_check check (comportamento in ('personalizado', 'agrupado', 'banderola'))
);
comment on table public.itens_producao is 'Cada linha representa uma arte a ser gerada para um pedido específico.';

-- Índices de performance
create index on public.itens_producao (account_id, sessao_id);
create index on public.itens_producao (account_id, status);
create index on public.itens_producao (account_id, categoria_id);
create index on public.pedidos (account_id, sessao_id);
create index on public.anuncios (account_id, nome_produto);

-- =============================================================================
-- TABELA: fontes (fontes customizadas em base64)
-- =============================================================================
create table public.fontes (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  nome       text not null,
  css_value  text not null,
  data_url   text not null,  -- base64 da fonte
  criado_em  timestamptz not null default now(),
  unique (account_id, nome)
);

-- =============================================================================
-- TABELA: impressoras (configuração das impressoras por conta)
-- =============================================================================
create table public.impressoras (
  id              uuid        primary key default gen_random_uuid(),
  account_id      uuid        not null references public.accounts(id) on delete cascade,
  nome_exibicao   text        not null,
  nome_sistema    text        not null, -- nome exato no Windows (win32print)
  categoria_padrao text,               -- categoria que vai para essa impressora por padrão
  ativa           boolean     not null default true,
  criado_em       timestamptz not null default now(),
  unique (account_id, nome_sistema)
);
comment on table public.impressoras is 'Impressoras configuradas para uso com o PrintFlow Agent.';

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) — isola dados por conta
-- =============================================================================

alter table public.accounts         enable row level security;
alter table public.profiles         enable row level security;
alter table public.categorias       enable row level security;
alter table public.templates        enable row level security;
alter table public.artes            enable row level security;
alter table public.anuncios         enable row level security;
alter table public.sessoes          enable row level security;
alter table public.pedidos          enable row level security;
alter table public.itens_producao   enable row level security;
alter table public.fontes           enable row level security;
alter table public.impressoras      enable row level security;

-- ── accounts ──────────────────────────────────────────────────────────────────
create policy "Usuário vê apenas sua conta"
  on public.accounts for select
  using (id = public.my_account_id());

create policy "Owner pode atualizar a conta"
  on public.accounts for update
  using (
    id = public.my_account_id()
    and (select role from public.profiles where id = auth.uid()) = 'owner'
  );

-- ── profiles ──────────────────────────────────────────────────────────────────
create policy "Usuário vê perfis da sua conta"
  on public.profiles for select
  using (account_id = public.my_account_id() or id = auth.uid());

create policy "Usuário atualiza o próprio perfil"
  on public.profiles for update
  using (id = auth.uid());

create policy "Owner gerencia perfis da conta"
  on public.profiles for all
  using (
    account_id = public.my_account_id()
    and (select role from public.profiles where id = auth.uid()) = 'owner'
  );

-- ── Macro para criar policies de conta em tabelas com account_id ──────────────
-- (aplicado individualmente abaixo para clareza)

-- categorias
create policy "select_categorias" on public.categorias for select using (account_id = public.my_account_id());
create policy "insert_categorias" on public.categorias for insert with check (account_id = public.my_account_id());
create policy "update_categorias" on public.categorias for update using (account_id = public.my_account_id());
create policy "delete_categorias" on public.categorias for delete using (account_id = public.my_account_id());

-- templates
create policy "select_templates" on public.templates for select using (account_id = public.my_account_id());
create policy "insert_templates" on public.templates for insert with check (account_id = public.my_account_id());
create policy "update_templates" on public.templates for update using (account_id = public.my_account_id());
create policy "delete_templates" on public.templates for delete using (account_id = public.my_account_id());

-- artes
create policy "select_artes" on public.artes for select using (account_id = public.my_account_id());
create policy "insert_artes" on public.artes for insert with check (account_id = public.my_account_id());
create policy "update_artes" on public.artes for update using (account_id = public.my_account_id());
create policy "delete_artes" on public.artes for delete using (account_id = public.my_account_id());

-- anuncios
create policy "select_anuncios" on public.anuncios for select using (account_id = public.my_account_id());
create policy "insert_anuncios" on public.anuncios for insert with check (account_id = public.my_account_id());
create policy "update_anuncios" on public.anuncios for update using (account_id = public.my_account_id());
create policy "delete_anuncios" on public.anuncios for delete using (account_id = public.my_account_id());

-- sessoes
create policy "select_sessoes" on public.sessoes for select using (account_id = public.my_account_id());
create policy "insert_sessoes" on public.sessoes for insert with check (account_id = public.my_account_id());
create policy "delete_sessoes" on public.sessoes for delete using (account_id = public.my_account_id());

-- pedidos
create policy "select_pedidos" on public.pedidos for select using (account_id = public.my_account_id());
create policy "insert_pedidos" on public.pedidos for insert with check (account_id = public.my_account_id());
create policy "update_pedidos" on public.pedidos for update using (account_id = public.my_account_id());
create policy "delete_pedidos" on public.pedidos for delete using (account_id = public.my_account_id());

-- itens_producao
create policy "select_itens" on public.itens_producao for select using (account_id = public.my_account_id());
create policy "insert_itens" on public.itens_producao for insert with check (account_id = public.my_account_id());
create policy "update_itens" on public.itens_producao for update using (account_id = public.my_account_id());
create policy "delete_itens" on public.itens_producao for delete using (account_id = public.my_account_id());

-- fontes
create policy "select_fontes" on public.fontes for select using (account_id = public.my_account_id());
create policy "insert_fontes" on public.fontes for insert with check (account_id = public.my_account_id());
create policy "delete_fontes" on public.fontes for delete using (account_id = public.my_account_id());

-- impressoras
create policy "select_impressoras" on public.impressoras for select using (account_id = public.my_account_id());
create policy "insert_impressoras" on public.impressoras for insert with check (account_id = public.my_account_id());
create policy "update_impressoras" on public.impressoras for update using (account_id = public.my_account_id());
create policy "delete_impressoras" on public.impressoras for delete using (account_id = public.my_account_id());

-- =============================================================================
-- FUNÇÕES UTILITÁRIAS
-- =============================================================================

-- Cria uma conta e vincula o usuário como owner (chamada após primeiro login)
create or replace function public.criar_conta(p_nome text, p_email text)
returns uuid
language plpgsql security definer
as $$
declare
  v_account_id uuid;
begin
  -- Verifica se o usuário já tem conta
  if (select account_id from public.profiles where id = auth.uid()) is not null then
    raise exception 'Usuário já possui uma conta vinculada';
  end if;

  insert into public.accounts (nome, email_contato)
  values (p_nome, p_email)
  returning id into v_account_id;

  -- Vincula o usuário à conta como owner (sem passar pelo trigger de limite)
  update public.profiles
  set account_id = v_account_id,
      role = 'owner'
  where id = auth.uid();

  -- Insere categorias padrão
  insert into public.categorias (id, account_id, nome, keywords, ordem) values
    ('sacolinha',        v_account_id, 'Sacolinha',          array['sacolinha'],                      0),
    ('caixinha',         v_account_id, 'Caixinha',           array['caixinha', 'caixa'],              1),
    ('topos',            v_account_id, 'Topos',              array['topo'],                           2),
    ('banderola',        v_account_id, 'Banderola',          array['bandeirola', 'banderola'],        3),
    ('poster',           v_account_id, 'Poster',             array['poster', 'painel'],               4),
    ('nao_personalizado',v_account_id, 'Não Personalizados', array[]::text[],                        5);

  return v_account_id;
end;
$$;

-- Convida / adiciona um operador à conta (chamada pelo owner)
create or replace function public.adicionar_operador(p_email text, p_nome text)
returns uuid
language plpgsql security definer
as $$
declare
  v_account_id uuid;
  v_role       text;
  v_user_id    uuid;
begin
  -- Verifica se quem chama é owner
  select account_id, role into v_account_id, v_role
  from public.profiles where id = auth.uid();

  if v_role <> 'owner' then
    raise exception 'Somente o proprietário pode adicionar operadores';
  end if;

  -- Busca o usuário pelo email
  select id into v_user_id
  from auth.users where email = p_email;

  if v_user_id is null then
    raise exception 'Usuário com email % não encontrado. Peça para ele criar uma conta primeiro.', p_email;
  end if;

  -- Verifica se já está na conta
  if (select account_id from public.profiles where id = v_user_id) = v_account_id then
    raise exception 'Usuário já faz parte desta conta';
  end if;

  -- Vincula — o trigger check_user_limit vai verificar o limite
  update public.profiles
  set account_id = v_account_id,
      role = 'operator',
      nome = coalesce(nome, p_nome)
  where id = v_user_id;

  return v_user_id;
end;
$$;

-- Remove um operador da conta
create or replace function public.remover_operador(p_user_id uuid)
returns void
language plpgsql security definer
as $$
declare
  v_account_id uuid;
  v_role       text;
begin
  select account_id, role into v_account_id, v_role
  from public.profiles where id = auth.uid();

  if v_role <> 'owner' then
    raise exception 'Somente o proprietário pode remover operadores';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'O proprietário não pode remover a si mesmo';
  end if;

  update public.profiles
  set account_id = null, role = 'operator', ativo = false
  where id = p_user_id and account_id = v_account_id;
end;
$$;

-- =============================================================================
-- VIEW: resumo de usuários da conta (para a tela de configurações)
-- =============================================================================
create or replace view public.usuarios_conta as
  select
    p.id,
    p.nome,
    u.email,
    p.role,
    p.ativo,
    p.criado_em,
    p.account_id
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.account_id = public.my_account_id();

-- =============================================================================
-- DADOS INICIAIS: sem dados de seed — cada conta cria os seus via criar_conta()
-- =============================================================================

-- =============================================================================
-- STORAGE: bucket para fontes e assets (opcional — fontes ficam em base64 no DB)
-- Execute separadamente no painel do Supabase > Storage se precisar:
--
-- insert into storage.buckets (id, name, public) values ('printflow-assets', 'printflow-assets', false);
-- create policy "assets_conta" on storage.objects for all
--   using (bucket_id = 'printflow-assets' and (storage.foldername(name))[1] = public.my_account_id()::text);
-- =============================================================================
