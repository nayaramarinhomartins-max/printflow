import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Printer, Database, Trash2, Download,
  CheckCircle2, ShieldCheck, User, Package, LogOut, Mail, Calendar,
  Plus, Pencil, X, Wifi, Users, Copy, Clock, Crown,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  getAnuncios, getTemplates, getItensProducao, getCategorias,
  DEFAULT_CATEGORIAS, saveCategorias,
  type AgenteConfig, getAgentes, saveAgentes, MAX_AGENTES,
} from "@/lib/store";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { useUsage } from "@/hooks/useUsage";
import { limiteLabel, pctUso } from "@/lib/usage";

async function pingAgente(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/ping`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

function calcStorageUsage(): string {
  let total = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i) ?? "";
    if (key.startsWith("printflow.")) {
      total += (localStorage.getItem(key) ?? "").length * 2;
    }
  }
  if (total < 1024) return `${total} B`;
  if (total < 1024 * 1024) return `${(total / 1024).toFixed(1)} KB`;
  return `${(total / (1024 * 1024)).toFixed(2)} MB`;
}

function formatarData(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(iso));
}

export default function Configuracoes() {
  const { user, signOut } = useAuth();
  const { uso, loading: usoLoading } = useUsage();

  // Equipe
  interface Membro { id: string; nome: string; email: string; role: string; criado_em: string; }
  interface Convite { id: string; email: string; expira_em: string; }
  const [membros, setMembros]           = useState<Membro[]>([]);
  const [convites, setConvites]         = useState<Convite[]>([]);
  const [myRole, setMyRole]             = useState<string | null>(null);
  const [emailConvite, setEmailConvite] = useState("");
  const [linkConvite, setLinkConvite]   = useState<string | null>(null);
  const [loadingConvite, setLoadingConvite] = useState(false);
  const [copiadoId, setCopiadoId]       = useState<string | null>(null);

  async function carregarEquipe() {
    // Busca o role diretamente — independe de account_id estar configurado
    const { data: perfil } = await supabase
      .from("profiles").select("role").eq("id", user?.id ?? "").single();
    setMyRole(perfil?.role ?? null);

    const { data: m } = await supabase.from("usuarios_conta").select("*");
    if (m) setMembros(m as Membro[]);
    const { data: c } = await supabase.from("meus_convites").select("*");
    if (c) setConvites(c as Convite[]);
  }

  async function enviarConvite() {
    if (!emailConvite.trim()) return;
    setLoadingConvite(true);
    setLinkConvite(null);
    const { data, error } = await supabase.rpc("criar_convite", { p_email: emailConvite.trim() });
    setLoadingConvite(false);
    if (error || !data?.ok) {
      const msgs: Record<string, string> = {
        sem_permissao:   "Somente o proprietário pode convidar membros.",
        limite_usuarios: `Limite de usuários do plano atingido (${data?.atual}/${data?.limite}).`,
        ja_membro:       "Este e-mail já é membro da conta.",
      };
      toast({ title: msgs[data?.erro] ?? "Não foi possível criar o convite.", variant: "destructive" });
      return;
    }
    const link = `${window.location.origin}/convite?token=${data.token}`;
    setLinkConvite(link);
    setEmailConvite("");
    carregarEquipe();
  }

  async function cancelarConvite(id: string) {
    await supabase.rpc("cancelar_convite", { p_convite_id: id });
    setConvites((prev) => prev.filter((c) => c.id !== id));
  }

  async function removerMembro(id: string) {
    const { error } = await supabase.rpc("remover_operador", { p_user_id: id });
    if (error) { toast({ title: "Erro ao remover membro.", variant: "destructive" }); return; }
    setMembros((prev) => prev.filter((m) => m.id !== id));
    toast({ title: "Membro removido." });
  }

  function copiarLink(link: string, id?: string) {
    navigator.clipboard.writeText(link);
    toast({ title: "Link copiado!" });
    if (id) { setCopiadoId(id); setTimeout(() => setCopiadoId(null), 2000); }
  }

  // Owner = role é owner OU é o único usuário logado (conta ainda não configurada no Supabase)
  const isOwner = myRole === "owner" || myRole === null;
  const [storageUsage, setStorageUsage] = useState("—");
  const [stats, setStats] = useState({ anuncios: 0, templates: 0, itens: 0, categorias: 0 });

  // Agentes
  const [agentes, setAgentes]           = useState<AgenteConfig[]>([]);
  const [statusAgentes, setStatusAgentes] = useState<Record<string, boolean | null>>({});
  const [editandoId, setEditandoId]     = useState<string | null>(null);
  const [draftNome, setDraftNome]       = useState("");
  const [draftUrl, setDraftUrl]         = useState("");

  useEffect(() => {
    setStorageUsage(calcStorageUsage());
    setStats({
      anuncios:   getAnuncios().length,
      templates:  getTemplates().length,
      itens:      getItensProducao().length,
      categorias: getCategorias().length,
    });
    carregarEquipe();

    const lista = getAgentes();
    setAgentes(lista);
    // Pinga todos em paralelo
    const nullMap: Record<string, null> = {};
    lista.forEach((a) => (nullMap[a.id] = null));
    setStatusAgentes(nullMap);
    lista.forEach((a) =>
      pingAgente(a.url).then((ok) =>
        setStatusAgentes((prev) => ({ ...prev, [a.id]: ok }))
      )
    );
  }, []);

  function salvarAgente() {
    if (!draftNome.trim() || !draftUrl.trim()) return;
    const nova = agentes.map((a) =>
      a.id === editandoId ? { ...a, nome: draftNome.trim(), url: draftUrl.trim() } : a
    );
    setAgentes(nova);
    saveAgentes(nova);
    setEditandoId(null);
    // Re-pinga o agente editado
    const editado = nova.find((a) => a.id === editandoId);
    if (editado) {
      setStatusAgentes((prev) => ({ ...prev, [editado.id]: null }));
      pingAgente(editado.url).then((ok) =>
        setStatusAgentes((prev) => ({ ...prev, [editado.id]: ok }))
      );
    }
    toast({ title: "Agente atualizado" });
  }

  function adicionarAgente() {
    const limiteAgentes = uso?.max_agentes ?? MAX_AGENTES;
    if (agentes.length >= limiteAgentes) {
      toast({ title: `Seu plano permite até ${limiteAgentes} agente(s)`, description: "Faça upgrade para adicionar mais.", variant: "destructive" });
      return;
    }
    const novo: AgenteConfig = {
      id: `agente-${Date.now()}`,
      nome: `PC ${agentes.length + 1}`,
      url: "http://192.168.1.X:8765",
    };
    const lista = [...agentes, novo];
    setAgentes(lista);
    saveAgentes(lista);
    setStatusAgentes((prev) => ({ ...prev, [novo.id]: null }));
    setEditandoId(novo.id);
    setDraftNome(novo.nome);
    setDraftUrl(novo.url);
  }

  function removerAgente(id: string) {
    if (agentes.length <= 1) { toast({ title: "É necessário ao menos 1 agente" }); return; }
    const lista = agentes.filter((a) => a.id !== id);
    setAgentes(lista);
    saveAgentes(lista);
    setStatusAgentes((prev) => { const n = { ...prev }; delete n[id]; return n; });
  }

  function iniciarEdicao(a: AgenteConfig) {
    setEditandoId(a.id);
    setDraftNome(a.nome);
    setDraftUrl(a.url);
  }

  function repingAgente(a: AgenteConfig) {
    setStatusAgentes((prev) => ({ ...prev, [a.id]: null }));
    pingAgente(a.url).then((ok) =>
      setStatusAgentes((prev) => ({ ...prev, [a.id]: ok }))
    );
  }

  function exportarDados() {
    const dados = {
      exportadoEm: new Date().toISOString(),
      anuncios:    getAnuncios(),
      templates:   getTemplates(),
      categorias:  getCategorias(),
    };
    const blob = new Blob([JSON.stringify(dados, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement("a"), { href: url, download: `gestaografica-backup-${new Date().toISOString().slice(0, 10)}.json` });
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Backup exportado com sucesso" });
  }

  function importarDados(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const dados = JSON.parse(e.target?.result as string);
        if (dados.anuncios)   localStorage.setItem("printflow.anuncios",   JSON.stringify(dados.anuncios));
        if (dados.templates)  localStorage.setItem("printflow.templates",  JSON.stringify(dados.templates));
        if (dados.categorias) localStorage.setItem("printflow.categorias", JSON.stringify(dados.categorias));
        toast({ title: "Backup restaurado", description: "Recarregue a página para aplicar." });
      } catch {
        toast({ title: "Arquivo inválido", variant: "destructive" });
      }
    };
    reader.readAsText(file);
  }

  function limparProducao() {
    localStorage.removeItem("printflow.orders");
    localStorage.removeItem("printflow.producao");
    setStats((s) => ({ ...s, itens: 0 }));
    setStorageUsage(calcStorageUsage());
    toast({ title: "Produção limpa", description: "Pedidos e itens removidos. Templates e anúncios mantidos." });
  }

  function resetarCategorias() {
    saveCategorias(DEFAULT_CATEGORIAS);
    setStats((s) => ({ ...s, categorias: DEFAULT_CATEGORIAS.length }));
    toast({ title: "Categorias restauradas para o padrão" });
  }

  const nomeUsuario = user?.user_metadata?.nome as string | undefined;
  const emailUsuario = user?.email ?? "—";
  const membroDesde = user?.created_at ? formatarData(user.created_at) : "—";

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">Gerencie o sistema, dados e integrações</p>
      </div>

      {/* Conta */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4 text-primary" /> Conta
          </CardTitle>
          <CardDescription>Informações do usuário autenticado</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {nomeUsuario && (
              <div className="rounded-lg border border-border bg-secondary/20 p-3 flex items-start gap-3">
                <User className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Nome</p>
                  <p className="text-sm font-medium">{nomeUsuario}</p>
                </div>
              </div>
            )}
            <div className="rounded-lg border border-border bg-secondary/20 p-3 flex items-start gap-3">
              <Mail className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">E-mail</p>
                <p className="text-sm font-medium">{emailUsuario}</p>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-secondary/20 p-3 flex items-start gap-3">
              <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Membro desde</p>
                <p className="text-sm font-medium capitalize">{membroDesde}</p>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-secondary/20 p-3 flex items-start gap-3">
              <ShieldCheck className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Autenticação</p>
                <p className="text-sm font-medium">E-mail / senha</p>
              </div>
            </div>
          </div>

          {/* Plano e uso mensal */}
          {!usoLoading && uso && (
            <div className="rounded-lg border border-border bg-secondary/20 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Plano atual</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-sm font-semibold">{uso.plano_nome}</p>
                    {uso.assinatura_status === "trial" && (
                      <Badge variant="outline" className="text-[10px] text-[hsl(var(--warning))] border-[hsl(var(--warning))]">
                        Trial — {uso.trial_dias_restantes ?? 0} dia(s) restante(s)
                      </Badge>
                    )}
                    {uso.assinatura_status === "ativa" && (
                      <Badge className="text-[10px] bg-[hsl(var(--success))] text-white">Ativa</Badge>
                    )}
                  </div>
                </div>
                {uso.preco_mensal > 0 && (
                  <p className="text-sm font-medium text-muted-foreground">
                    R$ {uso.preco_mensal.toFixed(2).replace(".", ",")}/mês
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Pedidos importados este mês</span>
                  <span className="font-medium tabular-nums">
                    {uso.pedidos_importados.toLocaleString("pt-BR")}
                    {" / "}
                    {limiteLabel(uso.limite_pedidos_mes)}
                  </span>
                </div>
                {uso.limite_pedidos_mes > 0 && (
                  <div className="w-full h-2 rounded-full bg-secondary overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        pctUso(uso.pedidos_importados, uso.limite_pedidos_mes) >= 90
                          ? "bg-destructive"
                          : pctUso(uso.pedidos_importados, uso.limite_pedidos_mes) >= 70
                            ? "bg-[hsl(var(--warning))]"
                            : "bg-primary"
                      }`}
                      style={{ width: `${pctUso(uso.pedidos_importados, uso.limite_pedidos_mes)}%` }}
                    />
                  </div>
                )}
                {uso.limite_pedidos_mes !== -1 &&
                  pctUso(uso.pedidos_importados, uso.limite_pedidos_mes) >= 90 && (
                  <p className="text-xs text-destructive">
                    Você está próximo do limite. Considere fazer upgrade do plano.
                  </p>
                )}
              </div>
            </div>
          )}

          <Separator />

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 text-destructive border-destructive/40 hover:bg-destructive/10">
                <LogOut className="h-3.5 w-3.5" /> Sair da conta
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Sair da conta?</AlertDialogTitle>
                <AlertDialogDescription>Você será redirecionado para a tela de login.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => signOut()}
                >
                  Sair
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      {/* Equipe */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" /> Equipe
            {membros.length > 0 && uso && (
              <Badge variant="secondary" className="text-[10px] font-normal ml-1">
                {membros.length} / {uso.max_agentes} usuário(s)
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Adicione membros à sua conta. Cada um acessa com o próprio e-mail e senha e vê os mesmos dados.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">

          {/* Convidar membro — sempre visível para o owner */}
          <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
            <div>
              <p className="text-sm font-semibold">Convidar membro</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Digite o e-mail, gere o link e envie por WhatsApp ou e-mail. A pessoa acessa o link, cria uma conta e entra na sua equipe automaticamente.
              </p>
            </div>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="email@exemplo.com"
                value={emailConvite}
                onChange={(e) => setEmailConvite(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && enviarConvite()}
                className="h-9 text-sm"
              />
              <Button
                size="sm"
                className="h-9 gap-1.5 shrink-0"
                onClick={enviarConvite}
                disabled={loadingConvite || !emailConvite.trim()}
              >
                <Plus className="h-3.5 w-3.5" />
                {loadingConvite ? "Gerando..." : "Gerar link"}
              </Button>
            </div>

            {linkConvite && (
              <div className="space-y-2 pt-1 border-t border-primary/20">
                <p className="text-xs font-medium text-foreground">Link gerado — copie e envie:</p>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={linkConvite}
                    className="h-8 text-xs font-mono bg-background/50"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <Button
                    size="sm"
                    variant="default"
                    className="h-8 gap-1.5 shrink-0"
                    onClick={() => copiarLink(linkConvite, "novo")}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {copiadoId === "novo" ? "Copiado!" : "Copiar"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Valido por 7 dias. A pessoa acessa o link, cria ou entra na conta e fica vinculada automaticamente.
                </p>
              </div>
            )}
          </div>

          {/* Lista de membros */}
          {membros.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Membros ativos</p>
              {membros.map((m) => (
                <div key={m.id} className="flex items-center gap-3 rounded-lg border border-border bg-secondary/10 p-3">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-xs font-bold text-primary">
                    {(m.nome || m.email).slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{m.nome || "—"}</p>
                    <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {m.role === "owner"
                      ? <Badge variant="default" className="text-[10px] gap-1"><Crown className="h-3 w-3" />Dono</Badge>
                      : <Badge variant="secondary" className="text-[10px]">Operador</Badge>
                    }
                    {isOwner && m.id !== user?.id && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive">
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remover {m.nome || m.email}?</AlertDialogTitle>
                            <AlertDialogDescription>O usuário perderá acesso à conta imediatamente.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => removerMembro(m.id)}
                            >Remover</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Convites pendentes */}
          {convites.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Convites pendentes</p>
              {convites.map((c) => (
                <div key={c.id} className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-secondary/5 p-3">
                  <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{c.email}</p>
                    <p className="text-xs text-muted-foreground">Expira em {new Date(c.expira_em).toLocaleDateString("pt-BR")}</p>
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive shrink-0"
                    onClick={() => cancelarConvite(c.id)}>
                    Cancelar
                  </Button>
                </div>
              ))}
            </div>
          )}

        </CardContent>
      </Card>

      {/* Dados do sistema */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" /> Dados locais
          </CardTitle>
          <CardDescription>
            Todos os dados são salvos localmente neste navegador.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Anúncios",  value: stats.anuncios },
              { label: "Templates", value: stats.templates },
              { label: "Categorias",value: stats.categorias },
              { label: "Itens prod",value: stats.itens },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-border bg-secondary/30 p-3">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-xl font-bold">{s.value}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/20 p-3">
            <div>
              <p className="text-sm font-medium">Espaço utilizado</p>
              <p className="text-xs text-muted-foreground">Dados do sistema no localStorage</p>
            </div>
            <Badge variant="outline" className="font-mono">{storageUsage}</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Backup */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" /> Backup e restauração
          </CardTitle>
          <CardDescription>
            Exporte anúncios, templates e categorias. Pedidos da produção não são incluídos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-3 flex-wrap">
            <Button variant="outline" className="gap-2" onClick={exportarDados}>
              <Download className="h-4 w-4" /> Exportar backup (JSON)
            </Button>
            <div>
              <input
                type="file"
                accept=".json"
                className="hidden"
                id="import-backup"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) importarDados(f); e.target.value = ""; }}
              />
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => document.getElementById("import-backup")?.click()}
              >
                Restaurar backup
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Agentes de impressão */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Printer className="h-4 w-4 text-primary" /> Agentes de Impressão
            <Badge variant="secondary" className="text-[10px] font-normal ml-1">
              {agentes.length}/{MAX_AGENTES}
            </Badge>
          </CardTitle>
          <CardDescription>
            Cada agente roda em um PC de produção. Configure o nome e o endereço (IP local) de cada máquina.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {agentes.map((a) => {
            const status = statusAgentes[a.id];
            const editando = editandoId === a.id;
            return (
              <div key={a.id} className="rounded-lg border border-border bg-secondary/10 p-3 space-y-3">
                {/* Cabeçalho do agente */}
                <div className="flex items-center gap-3">
                  <div className={`h-2 w-2 rounded-full shrink-0 ${
                    status === null ? "bg-muted animate-pulse" :
                    status ? "bg-[hsl(var(--success))]" : "bg-[hsl(var(--warning))]"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{a.nome}</p>
                    <p className="text-xs text-muted-foreground font-mono truncate">{a.url}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {status === null
                      ? <Badge variant="outline" className="text-[10px]">Verificando...</Badge>
                      : status
                        ? <Badge className="bg-[hsl(var(--success))] text-white text-[10px]">Online</Badge>
                        : <Badge variant="outline" className="text-[10px] text-[hsl(var(--warning))] border-[hsl(var(--warning))]">Offline</Badge>
                    }
                    <Button size="icon" variant="ghost" className="h-7 w-7" title="Verificar conexão"
                      onClick={() => repingAgente(a)}>
                      <Wifi className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" title="Editar"
                      onClick={() => editando ? setEditandoId(null) : iniciarEdicao(a)}>
                      {editando ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                    </Button>
                    {agentes.length > 1 && (
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                        title="Remover agente" onClick={() => removerAgente(a.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Formulário de edição inline */}
                {editando && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-border">
                    <div className="space-y-1">
                      <Label className="text-xs">Nome do PC</Label>
                      <Input
                        value={draftNome}
                        onChange={(e) => setDraftNome(e.target.value)}
                        placeholder="ex: PC Produção 1"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">URL do agente</Label>
                      <Input
                        value={draftUrl}
                        onChange={(e) => setDraftUrl(e.target.value)}
                        placeholder="ex: http://192.168.1.10:8765"
                        className="h-8 text-sm font-mono"
                      />
                    </div>
                    <div className="sm:col-span-2 flex gap-2">
                      <Button size="sm" className="h-8 text-xs" onClick={salvarAgente}>Salvar</Button>
                      <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setEditandoId(null)}>Cancelar</Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <div className="flex items-center gap-3 flex-wrap">
            {agentes.length < MAX_AGENTES && (
              <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={adicionarAgente}>
                <Plus className="h-3.5 w-3.5" /> Adicionar agente
              </Button>
            )}
            <a href="/GestaoGraficaAgent.exe" download="GestaoGraficaAgent.exe">
              <Button variant="ghost" size="sm" className="gap-2 text-xs text-muted-foreground">
                <Download className="h-3.5 w-3.5" /> Baixar agente (.exe)
              </Button>
            </a>
          </div>

          <div className="rounded-lg bg-secondary/30 border border-border p-3 space-y-1.5">
            <p className="text-xs font-medium">Como instalar em cada PC:</p>
            <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Baixe <strong>GestaoGraficaAgent.exe</strong> e copie para o PC de produção</li>
              <li>Clique duas vezes para executar — aparece um ícone na bandeja do sistema</li>
              <li>Clique com botão direito no ícone para ver o log ou parar o agente</li>
              <li>Anote o IP local do PC (<code className="bg-secondary px-1 rounded">ipconfig</code>) e configure acima</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Zona de perigo */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Zona de risco</h2>

        <Card className="border-[hsl(var(--warning)/0.4)]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Limpar produção atual</p>
                <p className="text-xs text-muted-foreground">
                  Remove pedidos e itens de produção. Templates e anúncios são mantidos.
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2 text-[hsl(var(--warning))] border-[hsl(var(--warning)/0.5)] shrink-0">
                    <Trash2 className="h-3.5 w-3.5" /> Limpar produção
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Limpar produção?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Os pedidos importados e todos os itens de produção serão removidos. Templates e anúncios são mantidos.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={limparProducao}>Limpar</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>

        <Card className="border-[hsl(var(--warning)/0.4)]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Restaurar categorias padrão</p>
                <p className="text-xs text-muted-foreground">
                  Volta as categorias para: Sacolinha, Caixinha, Topos, Banderola, Poster, Não Personalizados.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 shrink-0"
                onClick={resetarCategorias}
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Restaurar padrão
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-destructive/40">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-destructive">Apagar todos os dados</p>
                <p className="text-xs text-muted-foreground">
                  Remove tudo: pedidos, templates, anúncios, categorias. Irreversível.
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" className="gap-2 shrink-0">
                    <Trash2 className="h-3.5 w-3.5" /> Apagar tudo
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Apagar TODOS os dados?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta ação é irreversível. Todos os templates, anúncios, categorias e pedidos serão removidos permanentemente. Faça um backup antes.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => {
                        Object.keys(localStorage)
                          .filter((k) => k.startsWith("printflow."))
                          .forEach((k) => localStorage.removeItem(k));
                        window.location.reload();
                      }}
                    >
                      Sim, apagar tudo
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
