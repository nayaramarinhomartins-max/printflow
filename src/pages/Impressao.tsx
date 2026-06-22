import { useEffect, useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Printer, Wifi, WifiOff, RefreshCw, Download, CheckCircle2,
  Clock, MonitorSpeaker, AlertTriangle, Droplets, Wrench, Star,
  ChevronDown, ChevronUp, Layers, ArrowLeft,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import Editor from "@/components/editor/Editor";
import { TourGuide } from "@/components/TourGuide";
import { resolveEditorState } from "@/lib/resolveEditorState";
import { type EditorState } from "@/components/editor/editorTypes";
import {
  getItensProducao, getCategorias, saveItensProducao,
  type ItemProducao, type Categoria,
} from "@/lib/store";

interface ImpressoraInfo {
  nome: string;
  padrao: boolean;
  online: boolean;
  status: string[];
  status_raw: number;
  driver: string;
  porta: string;
}

interface Cartucho {
  cor: string;
  nivel: number | null;
  aviso: boolean;
}

const AGENT_URL = "http://localhost:8765";

async function pingAgent(): Promise<boolean> {
  try {
    const res = await fetch(`${AGENT_URL}/ping`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

type AgentStatus = "checking" | "online" | "offline";

export default function Impressao() {
  const [itens, setItens]           = useState<ItemProducao[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [agentStatus, setAgentStatus] = useState<AgentStatus>("checking");
  const agentOnline = agentStatus === "online";

  // Gerenciamento de impressoras
  const [impressoras, setImpressoras]   = useState<ImpressoraInfo[]>([]);
  const [tintaMap, setTintaMap]         = useState<Record<string, Cartucho[]>>({});
  const [limpandoId, setLimpandoId]     = useState<string | null>(null);
  const [loadingTinta, setLoadingTinta] = useState<Record<string, boolean>>({});
  const [impressorasRecolhidas, setImpressorasRecolhidas] = useState(false);

  // Editor inline
  const [editorItem, setEditorItem]         = useState<ItemProducao | null>(null);
  const [editorState, setEditorState]       = useState<EditorState | null>(null);
  const [autoImprimirPendente, setAutoImprimirPendente] = useState(false);

  // Fila de impressão em massa
  const [filaImpressao, setFilaImpressao] = useState<ItemProducao[]>([]);
  const [impMassaDialog, setImpMassaDialog] = useState(false);
  const [selecionados, setSelecionados]     = useState<Set<string>>(new Set());

  const carregarImpressoras = useCallback(async () => {
    try {
      const r = await fetch(`${AGENT_URL}/impressoras`, { signal: AbortSignal.timeout(3000) });
      const d = await r.json();
      setImpressoras(d.impressoras ?? []);
    } catch { /* agente offline */ }
  }, []);

  async function verificarTinta(nome: string) {
    setLoadingTinta((prev) => ({ ...prev, [nome]: true }));
    try {
      const r = await fetch(`${AGENT_URL}/impressoras/${encodeURIComponent(nome)}/tinta`,
        { signal: AbortSignal.timeout(5000) });
      const d = await r.json();
      setTintaMap((prev) => ({ ...prev, [nome]: d.cartuchos ?? [] }));
      if (d.mensagem) toast({ title: d.mensagem });
    } catch {
      toast({ title: "Não foi possível obter o nível de tinta.", variant: "destructive" });
    } finally {
      setLoadingTinta((prev) => ({ ...prev, [nome]: false }));
    }
  }

  async function solicitarLimpeza(nome: string, nivel: "normal" | "profundo") {
    setLimpandoId(nome);
    try {
      const r = await fetch(`${AGENT_URL}/impressoras/${encodeURIComponent(nome)}/limpar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nivel }),
        signal: AbortSignal.timeout(10000),
      });
      const d = await r.json();
      toast({ title: d.descricao ?? "Limpeza solicitada." });
    } catch {
      toast({ title: "Falha ao solicitar limpeza.", variant: "destructive" });
    } finally {
      setLimpandoId(null);
    }
  }

  function carregar() {
    setItens(getItensProducao());
    setCategorias(getCategorias());
  }

  async function checkAgent() {
    setAgentStatus("checking");
    const ok = await pingAgent();
    setAgentStatus(ok ? "online" : "offline");
    if (ok) carregarImpressoras();
    else setImpressoras([]);
  }

  useEffect(() => {
    carregar();
    checkAgent();
    const interval = setInterval(checkAgent, 15_000);
    return () => clearInterval(interval);
  }, [carregarImpressoras]);

  const itensProntos = useMemo(
    () => itens.filter((i) => i.status === "gerado"),
    [itens]
  );

  const itensConcluidos = useMemo(
    () => itens.filter((i) => i.status === "baixado"),
    [itens]
  );

  const porCategoria = useMemo(() => {
    const map = new Map<string, { nome: string; itens: ItemProducao[] }>();
    for (const item of itensProntos) {
      const cat = categorias.find((c) => c.id === item.categoriaId);
      const catNome = cat?.nome ?? item.categoriaId;
      if (!map.has(item.categoriaId)) map.set(item.categoriaId, { nome: catNome, itens: [] });
      map.get(item.categoriaId)!.itens.push(item);
    }
    return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [itensProntos, categorias]);

  function marcarImpresso(itemId: string) {
    setItens((prev) => {
      const atualizados = prev.map((i) => i.itemId === itemId ? { ...i, status: "baixado" as const } : i);
      saveItensProducao(atualizados);
      return atualizados;
    });
  }

  function marcarTodosImpressos() {
    setItens((prev) => {
      const atualizados = prev.map((i) => i.status === "gerado" ? { ...i, status: "baixado" as const } : i);
      saveItensProducao(atualizados);
      return atualizados;
    });
    toast({ title: `${itensProntos.length} itens marcados como impressos` });
  }

  // ── Editor inline ─────────────────────────────────────────────────────────────

  function abrirEditorParaImpressao(item: ItemProducao, comAutoImprimir = true) {
    const { state, warning } = resolveEditorState(item);
    if (warning) toast({ title: warning, variant: "destructive" });
    setEditorState(state);
    setEditorItem(item);
    setAutoImprimirPendente(comAutoImprimir);
  }

  function fecharEditor() {
    setEditorItem(null);
    setEditorState(null);
    setAutoImprimirPendente(false);
    setFilaImpressao([]);
    carregar(); // recarrega lista para refletir status atualizados
  }

  function onItemImpresso(itemId: string) {
    marcarImpresso(itemId);
    if (filaImpressao.length > 0) {
      const [proximo, ...resto] = filaImpressao;
      setFilaImpressao(resto);
      setAutoImprimirPendente(true);
      // pequeno delay para o Editor desmontar/remontar limpo
      setTimeout(() => abrirEditorParaImpressao(proximo, true), 100);
    } else {
      fecharEditor();
      toast({ title: "Todos os itens foram enviados para impressão." });
    }
  }

  // ── Impressão em massa ────────────────────────────────────────────────────────

  function toggleSelecionado(itemId: string) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      next.has(itemId) ? next.delete(itemId) : next.add(itemId);
      return next;
    });
  }

  function toggleCategoria(catItens: ItemProducao[], selAll: boolean) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      catItens.forEach((i) => selAll ? next.add(i.itemId) : next.delete(i.itemId));
      return next;
    });
  }

  function iniciarImpressaoMassa() {
    const fila = itensProntos.filter((i) => selecionados.has(i.itemId));
    if (fila.length === 0) return;
    setImpMassaDialog(false);
    setSelecionados(new Set());
    if (fila.length === 1) {
      abrirEditorParaImpressao(fila[0], true);
    } else {
      const [primeiro, ...resto] = fila;
      setFilaImpressao(resto);
      abrirEditorParaImpressao(primeiro, true);
    }
  }

  // ── Render: Editor ocupa a tela toda ─────────────────────────────────────────

  if (editorItem && editorState) {
    return (
      <div className="flex flex-col h-full">
        <div className="border-b px-4 py-2 flex items-center gap-3 shrink-0 bg-background">
          <Button variant="ghost" size="sm" className="gap-2" onClick={fecharEditor}>
            <ArrowLeft className="h-4 w-4" /> Impressão
          </Button>
          <Separator orientation="vertical" className="h-5" />
          <span className="text-sm font-medium truncate">
            {editorItem.arteNome ?? editorItem.produto}
            {editorItem.personalizacao.nome ? ` — ${editorItem.personalizacao.nome}` : ""}
          </span>
          {filaImpressao.length > 0 && (
            <Badge variant="outline" className="ml-auto shrink-0">
              {filaImpressao.length} item(ns) na fila
            </Badge>
          )}
          {!agentOnline && (
            <Badge variant="outline" className="text-[hsl(var(--warning))] border-[hsl(var(--warning))] ml-auto shrink-0">
              Agente offline — impressão direta indisponível
            </Badge>
          )}
        </div>
        <div className="flex-1 overflow-hidden">
          <Editor
            key={editorItem.itemId}
            title={`${editorItem.arteNome ?? editorItem.produto} — ${editorItem.personalizacao.nome || "sem nome"}`}
            initialState={editorState}
            nomeParaBanderola={editorItem.categoriaId === "banderola" ? editorItem.personalizacao.nome : undefined}
            formatoPDF={editorItem.variacao?.toUpperCase().includes("A3") ? "a3" : "a4"}
            agentUrl={agentOnline ? AGENT_URL : undefined}
            autoImprimir={autoImprimirPendente && agentOnline}
            onPrinted={() => onItemImpresso(editorItem.itemId)}
            onSave={() => {
              marcarImpresso(editorItem.itemId);
              if (filaImpressao.length > 0) {
                const [proximo, ...resto] = filaImpressao;
                setFilaImpressao(resto);
                abrirEditorParaImpressao(proximo, false);
              } else {
                fecharEditor();
              }
            }}
            saveLabel="Salvar e marcar como gerado"
          />
        </div>
      </div>
    );
  }

  // ── Render: Tela principal de Impressão ───────────────────────────────────────

  return (
    <div className="p-6 space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Impressão</h1>
          <p className="text-sm text-muted-foreground">
            Central de impressão — gerencie os itens prontos para imprimir
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <TourGuide pageKey="impressao" steps={[
            {
              title: "Central de Impressão",
              description: "Aqui chegam todas as artes que foram geradas em Produção em Massa e estão prontas para imprimir. O envio vai direto para a impressora via Agente local.",
            },
            {
              element: "[data-tour='impressao-agente']",
              title: "Agente de Impressão",
              description: "O Agente é um programa pequeno que roda no computador da gráfica. Ele precisa estar <b>Online</b> para enviar artes diretamente para a impressora. Baixe e execute o .exe se ainda não estiver instalado.",
              side: "bottom" as const,
            },
            {
              element: "[data-tour='impressao-impressoras']",
              title: "Impressoras conectadas",
              description: "Quando o Agente está online, as impressoras aparecem aqui com status em tempo real. Você pode verificar o nível de tinta e solicitar limpeza de cabeçote sem sair do sistema.",
              side: "bottom" as const,
            },
            {
              element: "[data-tour='impressao-fila']",
              title: "Fila de impressão",
              description: "Cada card aqui é uma categoria com itens prontos. O botão <b>Imprimir</b> abre o editor com a arte já personalizada e dispara o envio para a impressora automaticamente.",
              side: "top" as const,
            },
            {
              element: "[data-tour='impressao-massa']",
              title: "Impressão em massa",
              description: "Clique aqui para selecionar várias artes de uma vez e imprimi-las em sequência. O sistema abre cada arte, envia para a impressora e passa para a próxima automaticamente.",
              side: "bottom" as const,
            },
          ]} />
          <Button variant="outline" className="gap-2" onClick={carregar}>
            <RefreshCw className="h-4 w-4" /> Atualizar
          </Button>
        </div>
      </div>

      {/* Status do agente */}
      <Card data-tour="impressao-agente" className={
        agentStatus === "online"
          ? "border-[hsl(var(--success))]"
          : agentStatus === "offline"
          ? "border-[hsl(var(--warning))]"
          : "border-border"
      }>
        <CardContent className="p-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                agentStatus === "online" ? "bg-[hsl(var(--success)/0.15)]"
                : agentStatus === "offline" ? "bg-[hsl(var(--warning)/0.12)]"
                : "bg-secondary"
              }`}>
                {agentStatus === "checking"
                  ? <MonitorSpeaker className="h-5 w-5 text-muted-foreground animate-pulse" />
                  : agentStatus === "online"
                  ? <Wifi className="h-5 w-5 text-[hsl(var(--success))]" />
                  : <WifiOff className="h-5 w-5 text-[hsl(var(--warning))]" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">Agente de Impressão</p>
                  <Badge
                    variant={agentStatus === "online" ? "default" : "outline"}
                    className={`text-[10px] ${
                      agentStatus === "online" ? "bg-[hsl(var(--success))] text-white"
                      : agentStatus === "offline" ? "text-[hsl(var(--warning))] border-[hsl(var(--warning))]"
                      : ""
                    }`}
                  >
                    {agentStatus === "checking" ? "Verificando..." : agentStatus === "online" ? "Online" : "Offline"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {agentStatus === "online"
                    ? `Conectado em ${AGENT_URL} — envio direto para impressora disponível`
                    : "Agente não encontrado — baixe e inicie o Agente de Impressão"}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="gap-2" onClick={checkAgent}>
                <RefreshCw className="h-3.5 w-3.5" /> Reconectar
              </Button>
              {agentStatus === "offline" && (
                <a href="/GestaoGraficaAgent.exe" download="GestaoGraficaAgent.exe">
                  <Button size="sm" variant="outline" className="gap-2 text-primary border-primary/40">
                    <Download className="h-3.5 w-3.5" /> Baixar Agent
                  </Button>
                </a>
              )}
            </div>
          </div>

          {agentStatus === "offline" && (
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-[hsl(var(--warning))]" />
                Como configurar o Agente de Impressão:
              </p>
              <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Baixe o <strong>GestaoGraficaAgent.exe</strong> pelo botão acima</li>
                <li>Clique duas vezes para executar — aparecerá um ícone na bandeja do sistema</li>
                <li>O agente roda em segundo plano; clique com botão direito no ícone para parar</li>
              </ol>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Gerenciamento de impressoras */}
      {agentOnline && impressoras.length > 0 && (
        <Card data-tour="impressao-impressoras">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Printer className="h-4 w-4" /> Impressoras ({impressoras.length})
              </CardTitle>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={carregarImpressoras}>
                  <RefreshCw className="h-3 w-3" /> Atualizar
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                  onClick={() => setImpressorasRecolhidas((v) => !v)}
                  title={impressorasRecolhidas ? "Expandir" : "Recolher"}>
                  {impressorasRecolhidas ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </CardHeader>
          {!impressorasRecolhidas && (
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {impressoras.map((imp) => {
                  const temAlerta = imp.status.some((s) =>
                    ["Erro", "Atolamento", "Sem papel", "Toner", "Tampa", "Requer atenção", "Offline"]
                      .some((k) => s.includes(k))
                  );
                  const cartuchos = tintaMap[imp.nome];
                  return (
                    <div key={imp.nome} className="px-4 py-3 space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className={`h-2 w-2 rounded-full shrink-0 ${imp.online ? "bg-[hsl(var(--success))]" : "bg-destructive"}`} />
                          <span className="text-sm font-medium">{imp.nome}</span>
                          {imp.padrao && (
                            <Badge variant="outline" className="text-[10px] gap-1 py-0">
                              <Star className="h-2.5 w-2.5" /> Padrão
                            </Badge>
                          )}
                          {temAlerta ? (
                            <Badge variant="destructive" className="text-[10px]">
                              <AlertTriangle className="h-2.5 w-2.5 mr-1" />
                              {imp.status.filter((s) => s !== "Pronta").join(", ")}
                            </Badge>
                          ) : imp.online ? (
                            <Badge className="text-[10px] bg-[hsl(var(--success))] text-white">Pronta</Badge>
                          ) : null}
                        </div>
                        <div className="flex gap-1.5">
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                            disabled={loadingTinta[imp.nome]}
                            onClick={() => verificarTinta(imp.nome)}>
                            <Droplets className="h-3 w-3" />
                            {loadingTinta[imp.nome] ? "..." : "Tinta"}
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                            disabled={limpandoId === imp.nome}
                            onClick={() => solicitarLimpeza(imp.nome, "normal")}>
                            <Wrench className="h-3 w-3" />
                            {limpandoId === imp.nome ? "Aguarde..." : "Limpar cabeçote"}
                          </Button>
                        </div>
                      </div>

                      {cartuchos && cartuchos.length > 0 && (
                        <div className="flex gap-3 flex-wrap">
                          {cartuchos.map((c, i) => (
                            <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <span>{c.cor}</span>
                              {c.nivel !== null ? (
                                <div className="w-16">
                                  <Progress value={c.nivel}
                                    className={`h-1.5 ${c.nivel < 20 ? "[&>div]:bg-destructive" : c.nivel < 50 ? "[&>div]:bg-[hsl(var(--warning))]" : "[&>div]:bg-[hsl(var(--success))]"}`} />
                                </div>
                              ) : c.aviso ? (
                                <span className="text-destructive">Baixo</span>
                              ) : <span>N/D</span>}
                            </div>
                          ))}
                        </div>
                      )}

                      <p className="text-[10px] text-muted-foreground">{imp.driver} — {imp.porta}</p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      <Separator />

      {/* Resumo */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" /> Aguardando impressão
            </p>
            <p className={`text-3xl font-bold ${itensProntos.length > 0 ? "text-[hsl(var(--warning))]" : ""}`}>
              {itensProntos.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Impressos
            </p>
            <p className="text-3xl font-bold text-[hsl(var(--success))]">{itensConcluidos.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Printer className="h-3 w-3" /> Categorias na fila
            </p>
            <p className="text-3xl font-bold text-primary">{porCategoria.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Fila vazia */}
      {itensProntos.length === 0 && (
        <Card>
          <CardContent className="p-12 flex flex-col items-center gap-4 text-center">
            <Printer className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">Nenhum item aguardando impressão</p>
              <p className="text-sm text-muted-foreground mt-1">
                Gere as artes em <strong>Produção em Massa</strong> — elas aparecerão aqui quando estiverem prontas.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Fila de impressão */}
      {itensProntos.length > 0 && (
        <>
          <div data-tour="impressao-fila" className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="text-base font-semibold">Fila de impressão</h2>
            <div className="flex gap-2 flex-wrap">
              <Button data-tour="impressao-massa" variant="outline" className="gap-2"
                onClick={() => { setSelecionados(new Set(itensProntos.map((i) => i.itemId))); setImpMassaDialog(true); }}>
                <Layers className="h-4 w-4" /> Imprimir em massa
              </Button>
              <Button variant="outline" className="gap-2" onClick={marcarTodosImpressos}>
                <CheckCircle2 className="h-4 w-4" /> Marcar todos como impressos
              </Button>
            </div>
          </div>

          {porCategoria.map(({ nome: catNome, itens: catItens }) => (
            <Card key={catNome}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    {catNome}
                  </CardTitle>
                  <Badge variant="outline">{catItens.length} item(ns)</Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pedido</TableHead>
                      <TableHead>Produto / Arte</TableHead>
                      <TableHead>Criança</TableHead>
                      <TableHead>Idade</TableHead>
                      <TableHead>Variação</TableHead>
                      <TableHead>Prazo</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {catItens.map((item) => (
                      <TableRow key={item.itemId}>
                        <TableCell className="font-mono text-xs">{item.pedidoId.split("_")[0]}</TableCell>
                        <TableCell className="max-w-[200px] text-sm">
                          <p className="truncate">{item.produto}</p>
                          {item.arteNome && (
                            <p className="text-xs text-muted-foreground truncate">{item.arteNome}</p>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {item.personalizacao.nome || <span className="text-muted-foreground italic">—</span>}
                        </TableCell>
                        <TableCell className="text-sm">
                          {item.personalizacao.idade
                            ? `${item.personalizacao.idade} anos`
                            : <span className="text-muted-foreground italic">—</span>}
                        </TableCell>
                        <TableCell>
                          {item.variacao
                            ? <Badge variant="outline" className="font-mono text-[10px]">{item.variacao}</Badge>
                            : <span className="text-muted-foreground text-xs italic">—</span>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{item.prazoEnvio || "—"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button size="sm" variant="default"
                              className="h-7 px-2 text-xs gap-1"
                              onClick={() => abrirEditorParaImpressao(item, agentOnline)}>
                              <Printer className="h-3 w-3" />
                              {agentOnline ? "Imprimir" : "Abrir arte"}
                            </Button>
                            <Button size="sm" variant="ghost"
                              className="h-7 px-2 text-xs gap-1"
                              onClick={() => {
                                marcarImpresso(item.itemId);
                                toast({ title: "Marcado como impresso" });
                              }}>
                              <CheckCircle2 className="h-3 w-3" /> Marcar
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </>
      )}

      {/* Histórico */}
      {itensConcluidos.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
              Impressos ({itensConcluidos.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">
              {itensConcluidos.length} arte(s) marcada(s) como impressa(s).
              O histórico completo está na aba <strong>Relatório</strong>.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Dialog — Impressão em massa */}
      <Dialog open={impMassaDialog} onOpenChange={(open) => { setImpMassaDialog(open); if (!open) setSelecionados(new Set()); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col" aria-describedby={undefined}>
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Layers className="h-4 w-4" /> Selecionar artes para imprimir em massa
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
            {!agentOnline && (
              <div className="rounded-md bg-[hsl(var(--warning)/0.1)] border border-[hsl(var(--warning)/0.4)] p-3 text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-[hsl(var(--warning))] shrink-0" />
                <span>Agente offline — o editor abrirá mas o envio direto para impressora estará indisponível.</span>
              </div>
            )}

            {porCategoria.map(({ nome: catNome, itens: catItens }) => {
              const todosSel = catItens.every((i) => selecionados.has(i.itemId));
              const algunsSel = catItens.some((i) => selecionados.has(i.itemId));
              return (
                <div key={catNome}>
                  <div className="flex items-center gap-3 mb-2">
                    <Checkbox
                      id={`cat-${catNome}`}
                      checked={todosSel}
                      data-state={!todosSel && algunsSel ? "indeterminate" : undefined}
                      onCheckedChange={(v) => toggleCategoria(catItens, !!v)}
                    />
                    <label htmlFor={`cat-${catNome}`}
                      className="text-sm font-semibold uppercase tracking-wide cursor-pointer select-none">
                      {catNome}
                    </label>
                    <Badge variant="outline" className="text-[10px]">{catItens.length} item(ns)</Badge>
                  </div>
                  <div className="space-y-1 ml-7">
                    {catItens.map((item) => (
                      <div key={item.itemId}
                        className="flex items-center gap-3 py-1.5 px-3 rounded-md hover:bg-secondary/50 cursor-pointer"
                        onClick={() => toggleSelecionado(item.itemId)}>
                        <Checkbox
                          checked={selecionados.has(item.itemId)}
                          onCheckedChange={() => toggleSelecionado(item.itemId)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium truncate block">
                            {item.personalizacao.nome || <span className="text-muted-foreground italic">sem nome</span>}
                            {item.personalizacao.idade ? ` — ${item.personalizacao.idade} anos` : ""}
                          </span>
                          <span className="text-xs text-muted-foreground truncate block">{item.produto}</span>
                        </div>
                        {item.variacao && (
                          <Badge variant="outline" className="font-mono text-[10px] shrink-0">{item.variacao}</Badge>
                        )}
                        {item.prazoEnvio && (
                          <span className="text-xs text-muted-foreground shrink-0">{item.prazoEnvio}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <DialogFooter className="shrink-0 flex items-center justify-between gap-2 flex-wrap pt-3 border-t">
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" className="text-xs"
                onClick={() => setSelecionados(new Set(itensProntos.map((i) => i.itemId)))}>
                Selecionar tudo
              </Button>
              <Button size="sm" variant="ghost" className="text-xs"
                onClick={() => setSelecionados(new Set())}>
                Limpar seleção
              </Button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setImpMassaDialog(false)}>Cancelar</Button>
              <Button
                disabled={selecionados.size === 0}
                onClick={iniciarImpressaoMassa}
                className="gap-2">
                <Printer className="h-4 w-4" />
                Imprimir {selecionados.size > 0 ? `${selecionados.size} item(ns)` : "selecionados"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
