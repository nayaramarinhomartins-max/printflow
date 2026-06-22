import { supabase } from "./supabase";

export interface UsoMensal {
  pedidos_importados: number;
  limite_pedidos_mes: number;  // -1 = ilimitado
  max_agentes: number;
  plano_nome: string;
  preco_mensal: number;
  assinatura_status: string;
  trial_fim: string | null;
  trial_dias_restantes: number | null;
  acesso_ativo: boolean;
}

export interface ResultadoRegistro {
  ok: boolean;
  erro?: "limite_atingido" | "sem_conta";
  atual?: number;
  limite?: number;
}

export async function getMeuUso(): Promise<UsoMensal | null> {
  const { data, error } = await supabase
    .from("meu_uso_mensal")
    .select("*")
    .single();
  if (error || !data) return null;
  return data as UsoMensal;
}

export async function registrarPedidos(quantidade: number): Promise<ResultadoRegistro> {
  const { data, error } = await supabase.rpc("registrar_pedidos", { p_quantidade: quantidade });
  if (error) return { ok: false, erro: "sem_conta" };
  return data as ResultadoRegistro;
}

export function limiteLabel(limite: number): string {
  return limite === -1 ? "Ilimitado" : limite.toLocaleString("pt-BR");
}

export function pctUso(atual: number, limite: number): number {
  if (limite === -1 || limite === 0) return 0;
  return Math.min(100, Math.round((atual / limite) * 100));
}
