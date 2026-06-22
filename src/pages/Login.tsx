import { useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { MailCheck, AlertCircle } from "lucide-react";

type Modo = "login" | "cadastro" | "reset";

export default function Login() {
  const { session } = useAuth();
  const [modo, setModo]           = useState<Modo>("login");
  const [nome, setNome]           = useState("");
  const [email, setEmail]         = useState("");
  const [senha, setSenha]         = useState("");
  const [confirma, setConfirma]   = useState("");
  const [loading, setLoading]     = useState(false);
  const [erro, setErro]           = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [cadastroOk, setCadastroOk] = useState(false);

  if (session) return <Navigate to="/" replace />;

  function trocarModo(m: Modo) {
    setModo(m);
    setErro("");
    setResetSent(false);
    setCadastroOk(false);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (error) setErro("E-mail ou senha incorretos. Se acabou de criar a conta, confirme o e-mail antes de entrar.");
    setLoading(false);
  }

  async function handleCadastro(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    if (senha !== confirma) { setErro("As senhas não coincidem."); return; }
    if (senha.length < 6)   { setErro("A senha deve ter ao menos 6 caracteres."); return; }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: { data: { nome } },
    });
    if (error) setErro("Não foi possível criar a conta. Tente novamente.");
    else setCadastroOk(true);
    setLoading(false);
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });
    if (error) setErro("Não foi possível enviar o e-mail. Verifique o endereço.");
    else setResetSent(true);
    setLoading(false);
  }

  const titulos: Record<Modo, { h1: string; sub: string }> = {
    login:   { h1: "Entrar",        sub: "Acesse sua conta para continuar" },
    cadastro:{ h1: "Criar conta",   sub: "Preencha os dados para começar" },
    reset:   { h1: "Recuperar senha", sub: resetSent ? "Verifique seu e-mail para continuar." : "Informe seu e-mail e enviaremos o link de redefinição." },
  };

  return (
    <div className="min-h-screen flex bg-[hsl(220,40%,7%)]">

      {/* Painel esquerdo — visual gráfica */}
      <div className="relative hidden lg:flex lg:w-[52%] flex-col justify-between p-12 overflow-hidden bg-[hsl(220,45%,9%)]">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-cyan-400/10 blur-[80px] pointer-events-none" />
        <div className="absolute top-1/3 -left-24 w-80 h-80 rounded-full bg-pink-500/10 blur-[80px] pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] rounded-full bg-blue-600/8 blur-[100px] pointer-events-none" />
        <div className="absolute bottom-32 left-1/4 w-64 h-64 rounded-full bg-yellow-400/6 blur-[60px] pointer-events-none" />

        <div className="flex items-center gap-3 relative z-10">
          <div className="h-10 w-10 rounded-xl bg-[hsl(220,45%,14%)] flex items-center justify-center shadow-lg overflow-hidden">
            <img src="/logo.svg" alt="Gestão Gráfica" className="h-9 w-9 object-contain" />
          </div>
          <span className="text-base font-bold text-white tracking-tight">Gestão Gráfica</span>
        </div>

        <div className="space-y-8 relative z-10">
          <div className="flex items-center">
            <div className="w-14 h-14 rounded-full bg-cyan-400 opacity-80 shadow-lg shadow-cyan-400/20" />
            <div className="w-14 h-14 rounded-full bg-pink-500 opacity-80 -ml-5 shadow-lg shadow-pink-500/20" />
            <div className="w-14 h-14 rounded-full bg-yellow-400 opacity-80 -ml-5 shadow-lg shadow-yellow-400/20" />
            <div className="w-14 h-14 rounded-full bg-blue-600 opacity-80 -ml-5 shadow-lg shadow-blue-600/30" />
          </div>
          <div className="space-y-4">
            <h2 className="text-4xl font-bold text-white leading-tight">
              Sua operação<br />gráfica,<br />organizada.
            </h2>
            <p className="text-sm text-white/45 max-w-xs leading-relaxed">
              Do pedido ao PDF — gerencie templates, produza artes personalizadas e controle a impressão em um só lugar.
            </p>
          </div>
          <div
            className="absolute bottom-0 right-0 w-64 h-64 opacity-5 pointer-events-none"
            style={{ backgroundImage: "radial-gradient(circle, #ffffff 1px, transparent 1px)", backgroundSize: "12px 12px" }}
          />
        </div>

        <div className="grid grid-cols-3 gap-6 relative z-10">
          {[{ valor: "Multi", label: "Usuários" }, { valor: "PDF", label: "Automático" }, { valor: "100%", label: "Online" }].map((f) => (
            <div key={f.label} className="space-y-1">
              <p className="text-lg font-bold text-blue-400">{f.valor}</p>
              <p className="text-xs text-white/35">{f.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Painel direito — formulário */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">

        <div className="lg:hidden flex items-center gap-3 mb-10">
          <div className="h-10 w-10 rounded-xl bg-[hsl(220,45%,14%)] flex items-center justify-center overflow-hidden">
            <img src="/logo.svg" alt="Gestão Gráfica" className="h-9 w-9 object-contain" />
          </div>
          <span className="text-base font-bold text-white">Gestão Gráfica</span>
        </div>

        <div className="w-full max-w-sm space-y-7">

          <div>
            <h1 className="text-2xl font-bold text-white">{titulos[modo].h1}</h1>
            <p className="text-sm text-muted-foreground mt-1">{titulos[modo].sub}</p>
          </div>

          {/* LOGIN */}
          {modo === "login" && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-sm text-white/70">E-mail</Label>
                <Input id="email" type="email" autoComplete="email" required placeholder="seu@email.com"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  className="bg-[hsl(220,38%,13%)] border-white/10 text-white placeholder:text-white/25 focus-visible:ring-primary/50 h-11" />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="senha" className="text-sm text-white/70">Senha</Label>
                  <button type="button" onClick={() => trocarModo("reset")}
                    className="text-xs text-primary hover:text-primary/80 transition-colors">
                    Esqueci minha senha
                  </button>
                </div>
                <Input id="senha" type="password" autoComplete="current-password" required placeholder="••••••••"
                  value={senha} onChange={(e) => setSenha(e.target.value)}
                  className="bg-[hsl(220,38%,13%)] border-white/10 text-white placeholder:text-white/25 focus-visible:ring-primary/50 h-11" />
              </div>
              {erro && (
                <div className="flex gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3">
                  <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-400">{erro}</p>
                </div>
              )}
              <Button type="submit" className="w-full h-11 text-sm font-semibold" disabled={loading}>
                {loading ? <Spinner /> : "Entrar"}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Não tem conta?{" "}
                <button type="button" onClick={() => trocarModo("cadastro")}
                  className="text-primary hover:text-primary/80 font-medium transition-colors">
                  Criar conta
                </button>
              </p>
            </form>
          )}

          {/* CADASTRO */}
          {modo === "cadastro" && !cadastroOk && (
            <form onSubmit={handleCadastro} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="nome" className="text-sm text-white/70">Nome</Label>
                <Input id="nome" type="text" autoComplete="name" required placeholder="Seu nome"
                  value={nome} onChange={(e) => setNome(e.target.value)}
                  className="bg-[hsl(220,38%,13%)] border-white/10 text-white placeholder:text-white/25 focus-visible:ring-primary/50 h-11" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email-c" className="text-sm text-white/70">E-mail</Label>
                <Input id="email-c" type="email" autoComplete="email" required placeholder="seu@email.com"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  className="bg-[hsl(220,38%,13%)] border-white/10 text-white placeholder:text-white/25 focus-visible:ring-primary/50 h-11" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="senha-c" className="text-sm text-white/70">Senha</Label>
                <Input id="senha-c" type="password" autoComplete="new-password" required placeholder="Mínimo 6 caracteres"
                  value={senha} onChange={(e) => setSenha(e.target.value)}
                  className="bg-[hsl(220,38%,13%)] border-white/10 text-white placeholder:text-white/25 focus-visible:ring-primary/50 h-11" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirma" className="text-sm text-white/70">Confirmar senha</Label>
                <Input id="confirma" type="password" autoComplete="new-password" required placeholder="Repita a senha"
                  value={confirma} onChange={(e) => setConfirma(e.target.value)}
                  className="bg-[hsl(220,38%,13%)] border-white/10 text-white placeholder:text-white/25 focus-visible:ring-primary/50 h-11" />
              </div>
              {erro && <p className="text-sm text-red-400">{erro}</p>}
              <Button type="submit" className="w-full h-11 text-sm font-semibold" disabled={loading}>
                {loading ? <Spinner /> : "Criar conta"}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Já tem conta?{" "}
                <button type="button" onClick={() => trocarModo("login")}
                  className="text-primary hover:text-primary/80 font-medium transition-colors">
                  Entrar
                </button>
              </p>
            </form>
          )}

          {/* CADASTRO CONFIRMAÇÃO */}
          {modo === "cadastro" && cadastroOk && (
            <div className="space-y-4">
              <div className="rounded-lg bg-blue-500/10 border border-blue-500/30 p-5 space-y-3">
                <div className="flex items-center gap-2.5">
                  <MailCheck className="h-5 w-5 text-blue-400 shrink-0" />
                  <p className="text-sm font-semibold text-white">Confirme seu e-mail para continuar</p>
                </div>
                <p className="text-sm text-white/60 leading-relaxed">
                  Enviamos um link de confirmação para{" "}
                  <span className="text-white font-medium">{email}</span>.
                  Abra o e-mail, clique no link e depois volte aqui para entrar.
                </p>
                <p className="text-xs text-white/35">
                  Não recebeu? Verifique a caixa de spam.
                </p>
              </div>
              <Button variant="outline" className="w-full h-11 border-white/10 text-white/70 hover:bg-white/5"
                onClick={() => trocarModo("login")}>
                Já confirmei — ir para o login
              </Button>
            </div>
          )}

          {/* RESET */}
          {modo === "reset" && !resetSent && (
            <form onSubmit={handleReset} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email-r" className="text-sm text-white/70">E-mail</Label>
                <Input id="email-r" type="email" autoComplete="email" required placeholder="seu@email.com"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  className="bg-[hsl(220,38%,13%)] border-white/10 text-white placeholder:text-white/25 focus-visible:ring-primary/50 h-11" />
              </div>
              {erro && <p className="text-sm text-red-400">{erro}</p>}
              <div className="flex gap-3">
                <Button type="button" variant="outline" className="flex-1 h-11 border-white/10 text-white/70 hover:bg-white/5"
                  onClick={() => trocarModo("login")}>
                  Voltar
                </Button>
                <Button type="submit" className="flex-1 h-11" disabled={loading}>
                  {loading ? <Spinner /> : "Enviar link"}
                </Button>
              </div>
            </form>
          )}

          {/* RESET CONFIRMAÇÃO */}
          {modo === "reset" && resetSent && (
            <div className="space-y-4">
              <div className="rounded-lg bg-[hsl(220,38%,13%)] border border-white/10 p-4 text-sm text-white/70">
                Link enviado para <span className="text-white font-medium">{email}</span>. Verifique sua caixa de entrada.
              </div>
              <Button variant="outline" className="w-full h-11 border-white/10 text-white/70 hover:bg-white/5"
                onClick={() => trocarModo("login")}>
                Voltar ao login
              </Button>
            </div>
          )}

        </div>

        <p className="mt-12 text-xs text-white/20">Gestão Gráfica © {new Date().getFullYear()}</p>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <span className="flex items-center gap-2">
      <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
      Aguarde...
    </span>
  );
}
