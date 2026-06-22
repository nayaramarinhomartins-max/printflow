import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

export default function AceitarConvite() {
  const [params]          = useSearchParams();
  const { session, loading: authLoading } = useAuth();
  const navigate          = useNavigate();
  const token             = params.get("token") ?? "";

  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "erro">("idle");
  const [erro, setErro]     = useState("");

  // Guarda o token no localStorage para sobreviver ao fluxo de login/cadastro
  useEffect(() => {
    if (token) localStorage.setItem("gg_convite_token", token);
  }, [token]);

  useEffect(() => {
    if (authLoading) return;
    if (!session) return; // aguarda login

    const t = token || localStorage.getItem("gg_convite_token") || "";
    if (!t) { setErro("Token de convite inválido ou ausente."); setStatus("erro"); return; }

    setStatus("loading");

    supabase.rpc("aceitar_convite", { p_token: t }).then(({ data, error }) => {
      if (error || !data?.ok) {
        const msg: Record<string, string> = {
          convite_invalido: "Este convite não existe, já foi usado ou expirou.",
          ja_possui_conta:  "Você já possui uma conta ativa no sistema. Entre em contato com o suporte.",
          ja_membro:        "Você já é membro desta conta.",
        };
        setErro(msg[data?.erro] ?? "Não foi possível aceitar o convite. Tente novamente.");
        setStatus("erro");
        return;
      }
      localStorage.removeItem("gg_convite_token");
      setStatus("ok");
      // Redireciona após 2s
      setTimeout(() => navigate("/", { replace: true }), 2000);
    });
  }, [session, authLoading, token, navigate]);

  if (authLoading || (status === "idle" && session)) {
    return <Tela><Loader2 className="h-8 w-8 animate-spin text-primary" /></Tela>;
  }

  if (!session) {
    return (
      <Tela>
        <div className="space-y-4 text-center max-w-sm">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <img src="/logo.svg" alt="Gestão Gráfica" className="h-9 w-9" />
          </div>
          <h1 className="text-xl font-bold text-white">Você foi convidado</h1>
          <p className="text-sm text-white/60">
            Para aceitar o convite, faça login ou crie uma conta. O sistema vinculará você à conta automaticamente.
          </p>
          <div className="flex flex-col gap-2">
            <Button className="w-full" onClick={() => navigate("/login")}>
              Entrar / Criar conta
            </Button>
          </div>
        </div>
      </Tela>
    );
  }

  if (status === "loading") {
    return <Tela><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="text-sm text-white/60 mt-3">Vinculando conta...</p></Tela>;
  }

  if (status === "ok") {
    return (
      <Tela>
        <CheckCircle2 className="h-12 w-12 text-[hsl(var(--success))]" />
        <h1 className="text-xl font-bold text-white mt-4">Convite aceito!</h1>
        <p className="text-sm text-white/60 mt-2">Você agora faz parte da equipe. Redirecionando...</p>
      </Tela>
    );
  }

  return (
    <Tela>
      <AlertCircle className="h-12 w-12 text-destructive" />
      <h1 className="text-xl font-bold text-white mt-4">Não foi possível aceitar</h1>
      <p className="text-sm text-white/60 mt-2 text-center max-w-xs">{erro}</p>
      <Button variant="outline" className="mt-4 border-white/10 text-white/70" onClick={() => navigate("/")}>
        Voltar ao início
      </Button>
    </Tela>
  );
}

function Tela({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[hsl(220,40%,7%)] flex flex-col items-center justify-center px-4">
      {children}
    </div>
  );
}
