-- =============================================================================
-- Gestão Gráfica — Módulo de Planos e Assinaturas
-- Execute após schema.sql
-- =============================================================================

-- =============================================================================
-- TABELA: planos (catálogo de planos disponíveis)
-- =============================================================================
create table public.planos (
  id              text          primary key,
  nome            text          not null,
  descricao       text,
  preco_mensal    numeric(10,2) not null default 0,
  max_usuarios    int           not null default 3,
  max_sessoes_mes int,          -- null = ilimitado
  funcionalidades jsonb         not null default '{}',
  ativo           boolean       not null default true,
  ordem           int           not null default 0,
  criado_em       timestamptz   not null default now()
);
comment on table public.planos is 'Catálogo de planos SaaS disponíveis. Gerenciado pelo admin.';

-- Seed: planos iniciais
-- Limites definitivos de pedidos/mês e agentes são definidos em limites.sql
insert into public.planos (id, nome, descricao, preco_mensal, max_usuarios, ordem, funcionalidades) values
  (
    'basico',
    'Básico',
    'Para quem está começando — 100 pedidos/mês',
    0,
    1,
    0,
    '{
      "impressao": true,
      "relatorio": true,
      "historico": false,
      "multi_impressora": false,
      "agente": true
    }'::jsonb
  ),
  (
    'pro',
    'Pro',
    'Para gráficas em crescimento — 1.000 pedidos/mês',
    97.00,
    3,
    1,
    '{
      "impressao": true,
      "relatorio": true,
      "historico": true,
      "multi_impressora": true,
      "agente": true
    }'::jsonb
  ),
  (
    'avancado',
    'Avançado',
    'Para gráficas consolidadas — 2.000 pedidos/mês',
    149.90,
    5,
    2,
    '{
      "impressao": true,
      "relatorio": true,
      "historico": true,
      "multi_impressora": true,
      "agente": true
    }'::jsonb
  ),
  (
    'enterprise',
    'Enterprise',
    'Para grandes operações gráficas — pedidos ilimitados',
    249.00,
    10,
    3,
    '{
      "impressao": true,
      "relatorio": true,
      "historico": true,
      "multi_impressora": true,
      "agente": true,
      "api": true
    }'::jsonb
  );

-- =============================================================================
-- TABELA: assinaturas (histórico de assinaturas por conta)
-- Uma conta pode ter várias linhas — a vigente é a mais recente com status ativo
-- =============================================================================
create table public.assinaturas (
  id           uuid          primary key default gen_random_uuid(),
  account_id   uuid          not null references public.accounts(id) on delete cascade,
  plano_id     text          not null references public.planos(id),
  status       text          not null default 'trial',
    -- 'trial'     → período de teste gratuito
    -- 'ativa'     → assinatura paga e vigente
    -- 'suspensa'  → pagamento pendente, acesso bloqueado
    -- 'cancelada' → encerrada
  trial_fim    timestamptz,  -- quando o trial expira
  inicio       timestamptz   not null default now(),
  fim          timestamptz,  -- null = sem vencimento definido (mensal recorrente)
  renovacao_em timestamptz,
  cancelado_em timestamptz,
  gateway      text,         -- 'stripe', 'hotmart', 'manual', etc.
  gateway_id   text,         -- ID da assinatura no gateway
  observacao   text,
  criado_em    timestamptz   not null default now(),
  constraint assinaturas_status_check check (status in ('trial', 'ativa', 'suspensa', 'cancelada'))
);
comment on table public.assinaturas is 'Histórico de assinaturas por conta. A vigente é a mais recente não cancelada.';

create index on public.assinaturas (account_id, status, criado_em desc);

-- =============================================================================
-- FUNÇÃO: retorna a assinatura vigente de uma conta
-- =============================================================================
create or replace function public.assinatura_vigente(p_account_id uuid)
returns public.assinaturas
language sql stable security definer
as $$
  select * from public.assinaturas
  where account_id = p_account_id
    and status in ('trial', 'ativa', 'suspensa')
  order by criado_em desc
  limit 1;
$$;

-- =============================================================================
-- TRIGGER: sincroniza accounts.plano e accounts.max_usuarios ao mudar assinatura
-- =============================================================================
create or replace function public.sync_plano_conta()
returns trigger
language plpgsql security definer
as $$
declare
  v_max_usuarios int;
begin
  -- Só sincroniza se o status for ativo (não para cancelamentos parciais)
  if new.status in ('trial', 'ativa') then
    select max_usuarios into v_max_usuarios
    from public.planos where id = new.plano_id;

    update public.accounts
    set plano        = new.plano_id,
        max_usuarios = v_max_usuarios
    where id = new.account_id;
  end if;

  return new;
end;
$$;

create trigger on_assinatura_change
  after insert or update on public.assinaturas
  for each row execute function public.sync_plano_conta();

-- =============================================================================
-- ATUALIZA criar_conta() para já criar assinatura trial ao cadastrar
-- =============================================================================
create or replace function public.criar_conta(p_nome text, p_email text, p_plano text default 'basico')
returns uuid
language plpgsql security definer
as $$
declare
  v_account_id uuid;
begin
  if (select account_id from public.profiles where id = auth.uid()) is not null then
    raise exception 'Usuário já possui uma conta vinculada';
  end if;

  insert into public.accounts (nome, email_contato, plano)
  values (p_nome, p_email, p_plano)
  returning id into v_account_id;

  update public.profiles
  set account_id = v_account_id,
      role       = 'owner'
  where id = auth.uid();

  -- Trial de 14 dias
  insert into public.assinaturas (account_id, plano_id, status, trial_fim, renovacao_em)
  values (
    v_account_id,
    p_plano,
    'trial',
    now() + interval '14 days',
    now() + interval '14 days'
  );

  -- Categorias padrão
  insert into public.categorias (id, account_id, nome, keywords, ordem) values
    ('sacolinha',         v_account_id, 'Sacolinha',          array['sacolinha'],               0),
    ('caixinha',          v_account_id, 'Caixinha',           array['caixinha', 'caixa'],       1),
    ('topos',             v_account_id, 'Topos',              array['topo'],                    2),
    ('banderola',         v_account_id, 'Banderola',          array['bandeirola', 'banderola'], 3),
    ('poster',            v_account_id, 'Poster',             array['poster', 'painel'],        4),
    ('nao_personalizado', v_account_id, 'Não Personalizados', array[]::text[],                  5);

  return v_account_id;
end;
$$;

-- =============================================================================
-- FUNÇÃO: atualizar plano de uma conta (chamada pelo admin ou webhook de pagamento)
-- =============================================================================
create or replace function public.atualizar_plano(
  p_account_id uuid,
  p_plano_id   text,
  p_status     text    default 'ativa',
  p_dias       int     default null,   -- null = sem vencimento fixo
  p_gateway    text    default null,
  p_gateway_id text    default null
)
returns uuid
language plpgsql security definer
as $$
declare
  v_id uuid;
begin
  -- Cancela a assinatura vigente antes de criar nova
  update public.assinaturas
  set status       = 'cancelada',
      cancelado_em = now()
  where account_id = p_account_id
    and status in ('trial', 'ativa', 'suspensa');

  insert into public.assinaturas (
    account_id, plano_id, status,
    renovacao_em, fim,
    gateway, gateway_id
  )
  values (
    p_account_id,
    p_plano_id,
    p_status,
    case when p_dias is not null then now() + (p_dias || ' days')::interval else null end,
    case when p_dias is not null then now() + (p_dias || ' days')::interval else null end,
    p_gateway,
    p_gateway_id
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- =============================================================================
-- FUNÇÃO: cancelar assinatura da conta logada
-- =============================================================================
create or replace function public.cancelar_assinatura()
returns void
language plpgsql security definer
as $$
declare
  v_account_id uuid;
begin
  select account_id into v_account_id
  from public.profiles where id = auth.uid();

  update public.assinaturas
  set status       = 'cancelada',
      cancelado_em = now()
  where account_id = v_account_id
    and status in ('trial', 'ativa', 'suspensa');
end;
$$;

-- =============================================================================
-- RLS: planos são leitura pública (catálogo)
-- =============================================================================
alter table public.planos enable row level security;
create policy "planos_leitura_publica" on public.planos
  for select using (ativo = true);

-- =============================================================================
-- RLS: assinaturas — conta vê apenas a própria
-- =============================================================================
alter table public.assinaturas enable row level security;
create policy "select_assinatura" on public.assinaturas
  for select using (account_id = public.my_account_id());

-- =============================================================================
-- VIEW: resumo da assinatura vigente da conta logada
-- =============================================================================
create or replace view public.minha_assinatura as
  select
    a.id,
    a.account_id,
    a.plano_id,
    p.nome            as plano_nome,
    p.descricao       as plano_descricao,
    p.preco_mensal,
    p.max_usuarios,
    p.max_sessoes_mes,
    p.funcionalidades,
    a.status,
    a.trial_fim,
    a.inicio,
    a.fim,
    a.renovacao_em,
    a.gateway,
    a.criado_em,
    -- dias restantes do trial
    case
      when a.status = 'trial' and a.trial_fim is not null
      then greatest(0, extract(day from a.trial_fim - now())::int)
      else null
    end as trial_dias_restantes,
    -- plano está ativo (trial ou pago vigente)?
    (a.status in ('trial', 'ativa') and (a.fim is null or a.fim > now())) as acesso_ativo
  from public.assinaturas a
  join public.planos p on p.id = a.plano_id
  where a.account_id = public.my_account_id()
    and a.status in ('trial', 'ativa', 'suspensa')
  order by a.criado_em desc
  limit 1;
