-- =============================================================================
-- Gestão Gráfica — Sistema de convites multi-usuário
-- Execute após schema.sql e limites.sql
-- =============================================================================

-- ── Tabela de convites ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.convites (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid        NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  email      text        NOT NULL,
  token      text        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  status     text        NOT NULL DEFAULT 'pendente',
    -- 'pendente' → aguardando aceite
    -- 'aceito'   → usuário vinculado
    -- 'cancelado'→ cancelado pelo owner
  expira_em  timestamptz NOT NULL DEFAULT now() + interval '7 days',
  criado_em  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT convites_status_check CHECK (status IN ('pendente', 'aceito', 'cancelado')),
  UNIQUE (account_id, email)
);

ALTER TABLE public.convites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "convites_select" ON public.convites
  FOR SELECT USING (account_id = public.my_account_id());

-- ── RPC: criar convite (owner envia link para o convidado) ────────────────────
CREATE OR REPLACE FUNCTION public.criar_convite(p_email text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_account_id  uuid;
  v_role        text;
  v_membros     int;
  v_max         int;
  v_token       text;
  v_convite_id  uuid;
BEGIN
  SELECT account_id, role INTO v_account_id, v_role
  FROM public.profiles WHERE id = auth.uid();

  IF v_role <> 'owner' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem_permissao');
  END IF;

  -- Conta membros ativos + convites pendentes
  SELECT COUNT(*) INTO v_membros
  FROM public.profiles
  WHERE account_id = v_account_id AND ativo = true;

  SELECT max_usuarios INTO v_max
  FROM public.accounts WHERE id = v_account_id;

  IF v_membros >= v_max THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'limite_usuarios', 'atual', v_membros, 'limite', v_max);
  END IF;

  -- Verifica se já é membro
  IF EXISTS (
    SELECT 1 FROM auth.users u
    JOIN public.profiles p ON p.id = u.id
    WHERE u.email = p_email AND p.account_id = v_account_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'ja_membro');
  END IF;

  -- Upsert do convite (reusa token se já existia pendente)
  INSERT INTO public.convites (account_id, email, status)
  VALUES (v_account_id, lower(trim(p_email)), 'pendente')
  ON CONFLICT (account_id, email) DO UPDATE
    SET status    = 'pendente',
        token     = encode(gen_random_bytes(32), 'hex'),
        expira_em = now() + interval '7 days'
  RETURNING token, id INTO v_token, v_convite_id;

  RETURN jsonb_build_object('ok', true, 'token', v_token, 'id', v_convite_id);
END;
$$;

-- ── RPC: aceitar convite (chamada pelo convidado após login/cadastro) ─────────
CREATE OR REPLACE FUNCTION public.aceitar_convite(p_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_convite     public.convites%ROWTYPE;
  v_minha_conta uuid;
BEGIN
  SELECT * INTO v_convite
  FROM public.convites
  WHERE token = p_token AND status = 'pendente' AND expira_em > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'convite_invalido');
  END IF;

  -- Verifica se o usuário já tem conta própria
  SELECT account_id INTO v_minha_conta
  FROM public.profiles WHERE id = auth.uid();

  IF v_minha_conta IS NOT NULL AND v_minha_conta <> v_convite.account_id THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'ja_possui_conta');
  END IF;

  -- Vincula o usuário à conta do convite
  UPDATE public.profiles
  SET account_id = v_convite.account_id,
      role       = 'operator'
  WHERE id = auth.uid();

  -- Marca convite como aceito
  UPDATE public.convites
  SET status = 'aceito'
  WHERE id = v_convite.id;

  RETURN jsonb_build_object('ok', true, 'account_id', v_convite.account_id);
END;
$$;

-- ── RPC: cancelar convite ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancelar_convite(p_convite_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_account_id uuid;
  v_role       text;
BEGIN
  SELECT account_id, role INTO v_account_id, v_role
  FROM public.profiles WHERE id = auth.uid();

  IF v_role <> 'owner' THEN
    RAISE EXCEPTION 'Somente o proprietário pode cancelar convites';
  END IF;

  UPDATE public.convites
  SET status = 'cancelado'
  WHERE id = p_convite_id AND account_id = v_account_id;
END;
$$;

-- ── View: convites pendentes da conta ─────────────────────────────────────────
CREATE OR REPLACE VIEW public.meus_convites AS
  SELECT id, email, status, expira_em, criado_em
  FROM public.convites
  WHERE account_id = public.my_account_id()
    AND status = 'pendente'
    AND expira_em > now()
  ORDER BY criado_em DESC;
