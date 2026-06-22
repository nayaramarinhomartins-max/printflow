-- =============================================================================
-- Gestão Gráfica — Limites de uso por plano (contagem de pedidos/mês)
-- Execute após planos.sql
-- =============================================================================

-- ── 1. Adiciona colunas de limite aos planos ──────────────────────────────────
ALTER TABLE public.planos
  ADD COLUMN IF NOT EXISTS limite_pedidos_mes int NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS max_agentes        int NOT NULL DEFAULT 1;

-- ── 2. Atualiza planos existentes com os novos limites e preços ───────────────
UPDATE public.planos SET
  nome               = 'Básico',
  descricao          = 'Para quem está começando',
  preco_mensal       = 0,
  max_usuarios       = 1,
  limite_pedidos_mes = 100,
  max_agentes        = 1
WHERE id = 'basico';

UPDATE public.planos SET
  nome               = 'Pro',
  descricao          = 'Para gráficas em crescimento',
  preco_mensal       = 97.00,
  max_usuarios       = 3,
  limite_pedidos_mes = 1000,
  max_agentes        = 2
WHERE id = 'pro';

UPDATE public.planos SET
  nome               = 'Enterprise',
  descricao          = 'Para grandes operações gráficas — pedidos ilimitados',
  preco_mensal       = 249.00,
  max_usuarios       = 10,
  limite_pedidos_mes = -1,
  max_agentes        = 2,
  ordem              = 3
WHERE id = 'enterprise';

-- ── 3. Adiciona plano Avançado (novo tier entre Pro e Enterprise) ─────────────
INSERT INTO public.planos (id, nome, descricao, preco_mensal, max_usuarios, ordem, limite_pedidos_mes, max_agentes, funcionalidades)
VALUES (
  'avancado',
  'Avançado',
  'Para gráficas consolidadas com alto volume',
  149.90,
  5,
  2,
  2000,
  2,
  '{
    "impressao": true,
    "relatorio": true,
    "historico": true,
    "multi_impressora": true,
    "agente": true
  }'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  nome               = EXCLUDED.nome,
  descricao          = EXCLUDED.descricao,
  preco_mensal       = EXCLUDED.preco_mensal,
  max_usuarios       = EXCLUDED.max_usuarios,
  ordem              = EXCLUDED.ordem,
  limite_pedidos_mes = EXCLUDED.limite_pedidos_mes,
  max_agentes        = EXCLUDED.max_agentes,
  funcionalidades    = EXCLUDED.funcionalidades;

-- ── 4. Tabela de uso mensal ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.uso_mensal (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id         uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  mes                date NOT NULL,            -- primeiro dia do mês, ex: 2026-05-01
  pedidos_importados int  NOT NULL DEFAULT 0,
  UNIQUE (account_id, mes)
);

ALTER TABLE public.uso_mensal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "uso_mensal_select" ON public.uso_mensal
  FOR SELECT USING (account_id = public.my_account_id());

-- INSERT/UPDATE feito apenas via função SECURITY DEFINER

-- ── 5. RPC: registrar importação de pedidos (valida limite antes de incrementar)
CREATE OR REPLACE FUNCTION public.registrar_pedidos(p_quantidade int DEFAULT 1)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_account_id uuid;
  v_limite     int;
  v_atual      int;
  v_mes        date;
BEGIN
  v_account_id := public.my_account_id();

  IF v_account_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem_conta');
  END IF;

  v_mes := date_trunc('month', now())::date;

  -- Limite do plano vigente
  SELECT p.limite_pedidos_mes INTO v_limite
  FROM public.assinaturas a
  JOIN public.planos p ON p.id = a.plano_id
  WHERE a.account_id = v_account_id
    AND a.status IN ('trial', 'ativa')
    AND (a.fim IS NULL OR a.fim > now())
  ORDER BY a.criado_em DESC
  LIMIT 1;

  IF v_limite IS NULL THEN v_limite := 100; END IF;

  -- Uso atual do mês
  SELECT COALESCE(pedidos_importados, 0) INTO v_atual
  FROM public.uso_mensal
  WHERE account_id = v_account_id AND mes = v_mes;

  IF v_atual IS NULL THEN v_atual := 0; END IF;

  -- Valida (-1 = ilimitado)
  IF v_limite >= 0 AND (v_atual + p_quantidade) > v_limite THEN
    RETURN jsonb_build_object(
      'ok',     false,
      'erro',   'limite_atingido',
      'atual',  v_atual,
      'limite', v_limite
    );
  END IF;

  -- Incrementa atomicamente
  INSERT INTO public.uso_mensal (account_id, mes, pedidos_importados)
  VALUES (v_account_id, v_mes, p_quantidade)
  ON CONFLICT (account_id, mes)
  DO UPDATE SET pedidos_importados = uso_mensal.pedidos_importados + p_quantidade;

  RETURN jsonb_build_object(
    'ok',     true,
    'atual',  v_atual + p_quantidade,
    'limite', v_limite
  );
END;
$$;

-- ── 6. View: uso e limites do mês atual da conta logada ──────────────────────
CREATE OR REPLACE VIEW public.meu_uso_mensal AS
  SELECT
    COALESCE(u.pedidos_importados, 0) AS pedidos_importados,
    p.limite_pedidos_mes,
    p.max_agentes,
    p.nome                             AS plano_nome,
    p.preco_mensal,
    a.status                           AS assinatura_status,
    a.trial_fim,
    CASE
      WHEN a.status = 'trial' AND a.trial_fim IS NOT NULL
      THEN GREATEST(0, EXTRACT(DAY FROM a.trial_fim - now())::int)
      ELSE NULL
    END AS trial_dias_restantes,
    (a.status IN ('trial', 'ativa') AND (a.fim IS NULL OR a.fim > now())) AS acesso_ativo
  FROM public.assinaturas a
  JOIN public.planos p ON p.id = a.plano_id
  LEFT JOIN public.uso_mensal u
    ON u.account_id = a.account_id
   AND u.mes = date_trunc('month', now())::date
  WHERE a.account_id = public.my_account_id()
    AND a.status IN ('trial', 'ativa', 'suspensa')
  ORDER BY a.criado_em DESC
  LIMIT 1;
