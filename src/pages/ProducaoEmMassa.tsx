import { useEffect, useState, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { TourGuide } from "@/components/TourGuide";
import {
  Wand2, Download, CheckCircle2, AlertCircle, Settings2,
  Plus, Trash2, GripVertical, RefreshCw, Copy, ArrowLeft, ImageIcon, MessageSquare,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  type ItemProducao, type Categoria, type ItemAgrupado,
  getOrders, getAnuncios, getCategorias, saveCategorias,
  getItensProducao, saveItensProducao, desmembrarPedidos, getTemplates,
  agruparItensTamanho, getTemplateById,
} from "@/lib/store";
import Editor from "@/components/editor/Editor";
import { type EditorState, type TextLayer } from "@/components/editor/editorTypes";

// Categorias que por padrão agrupam (para badge na config)
const CATS_AGRUPADAS = ["poster", "nao_personalizado"];

const STATUS_LABEL: Record<ItemProducao["status"], string> = {
  pendente: "Pendente", gerado: "Gerado", baixado: "Baixado",
};
const STATUS_VARIANT: Record<ItemProducao["status"], "outline" | "default" | "secondary"> = {
  pendente: "outline", gerado: "default", baixado: "secondary",
};

const AGENT_URL = "http://localhost:8765";


async function pingAgent(): Promise<boolean> {
  try {
    const r = await fetch(`${AGENT_URL}/ping`, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch { return false; }
}

export default function ProducaoEmMassa() {
  const [searchParams, setSearchParams] = useSearchParams();
  const autoImprimirId = searchParams.get("imprimir");
  const autoImprimirDisparado = useRef(false);
  const [autoImprimirPendente, setAutoImprimirPendente] = useState(false);

  const [itens, setItens]           = useState<ItemProducao[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [activeTab, setActiveTab]   = useState<string>("");
  const [showConfig, setShowConfig] = useState(false);
  const [configDraft, setConfigDraft] = useState<Categoria[]>([]);
  const [agentOnline, setAgentOnline] = useState(false);

  // Editor de arte
  const [editorItem, setEditorItem] = useState<ItemProducao | null>(null);
  const [editorState, setEditorState] = useState<EditorState | null>(null);

  // Filtros
  const [temaFiltro, setTemaFiltro]     = useState<string>("todos");
  const [origemFiltro, setOrigemFiltro] = useState<"todos" | "importados" | "manuais">("todos");
  const [obsDialog, setObsDialog]       = useState<string | null>(null);

  useEffect(() => {
    const cats = getCategorias();
    setCategorias(cats);
    setActiveTab(cats[0]?.id ?? "");

    // Reprocessa automaticamente ao entrar na página
    // para refletir qualquer mudança em anúncios ou templates
    const orders = getOrders();
    if (orders.length > 0) {
      const anuncios  = getAnuncios();
      const templates = getTemplates();
      const itensAtuais = getItensProducao();

      const novos = desmembrarPedidos(orders, anuncios, cats, templates);

      // Preserva status e personalizações já editadas
      // Chave: pedidoId + arteId/categoriaId para não confundir itens do mesmo pedido
      const statusMap = new Map(itensAtuais.map((i) => [
        `${i.pedidoId}-${i.arteId ?? i.categoriaId}`, i,
      ]));
      const merged = novos.map((item) => {
        const key = `${item.pedidoId}-${item.arteId ?? item.categoriaId}`;
        const anterior = statusMap.get(key);
        if (!anterior) return item;
        return {
          ...item,
          status: anterior.status,
          personalizacao: anterior.personalizacao.nome || anterior.personalizacao.idade
            ? anterior.personalizacao
            : item.personalizacao,
          personalizacaoOk: anterior.personalizacao.nome || anterior.personalizacao.idade
            ? anterior.personalizacaoOk
            : item.personalizacaoOk,
        };
      });

      setItens(merged);
      saveItensProducao(merged);
    } else {
      setItens(getItensProducao());
    }
  }, []);

  useEffect(() => {
    if (itens.length) saveItensProducao(itens);
  }, [itens]);

  useEffect(() => {
    pingAgent().then(setAgentOnline);
    const iv = setInterval(() => pingAgent().then(setAgentOnline), 15_000);
    return () => clearInterval(iv);
  }, []);

  // Auto-abre editor quando navegou de Impressão com ?imprimir=itemId
  useEffect(() => {
    if (!autoImprimirId || autoImprimirDisparado.current || itens.length === 0) return;
    const item = itens.find((i) => i.itemId === autoImprimirId);
    if (!item) return;
    autoImprimirDisparado.current = true;
    setSearchParams({}, { replace: true }); // limpa o param da URL
    setAutoImprimirPendente(true);           // mantém o sinal para o Editor
    abrirEditor(item);
  }, [autoImprimirId, itens]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reprocessar ─────────────────────────────────────────────────────────────
  function reprocessar() {
    const orders    = getOrders();
    const anuncios  = getAnuncios();
    const cats      = getCategorias();
    const templates = getTemplates();
    if (!orders.length) {
      toast({ title: "Nenhum pedido importado", description: "Importe um relatório primeiro.", variant: "destructive" });
      return;
    }
    const novos = desmembrarPedidos(orders, anuncios, cats, templates);

    // Preserva status e personalizações já editadas
    // Chave: pedidoId + arteId/categoriaId para não confundir itens do mesmo pedido
    const itensAtuais = getItensProducao();
    const anteriorMap = new Map(itensAtuais.map((i) => [
      `${i.pedidoId}-${i.arteId ?? i.categoriaId}`, i,
    ]));

    const ordersMap = new Map(orders.map((o) => [o.id, o]));

    const merged = novos.map((item) => {
      const key = `${item.pedidoId}-${item.arteId ?? item.categoriaId}`;
      const anterior = anteriorMap.get(key);

      // Personalização: prioridade — pedido original > item anterior > item novo
      const order = ordersMap.get(item.pedidoId);
      const perso = order && (order.personalizacao.nome || order.personalizacao.idade)
        ? { personalizacao: { ...order.personalizacao }, personalizacaoOk: order.personalizacaoOk }
        : anterior && (anterior.personalizacao.nome || anterior.personalizacao.idade)
          ? { personalizacao: { ...anterior.personalizacao }, personalizacaoOk: anterior.personalizacaoOk }
          : {};

      return {
        ...item,
        ...perso,
        status: anterior?.status ?? item.status,
      };
    });

    setItens(merged);
    saveItensProducao(merged);
    toast({ title: `${merged.length} itens processados`, description: "Produção em massa atualizada." });
  }

  // ── Temas disponíveis para filtro ────────────────────────────────────────────
  const temasDisponiveis = useMemo(() => {
    const set = new Set<string>();
    for (const item of itens) if (item.templateNome) set.add(item.templateNome);
    return Array.from(set).sort();
  }, [itens]);

  // ── Itens filtrados por tema e origem ────────────────────────────────────────
  const itensFiltrados = useMemo(() => {
    let result = temaFiltro === "todos" ? itens : itens.filter((i) => i.templateNome === temaFiltro);
    if (origemFiltro === "importados") result = result.filter((i) => !i.pedidoId.startsWith("MANUAL_"));
    if (origemFiltro === "manuais")    result = result.filter((i) => i.pedidoId.startsWith("MANUAL_"));
    return result;
  }, [itens, temaFiltro, origemFiltro]);

  // ── Itens por categoria ──────────────────────────────────────────────────────
  const itensPorCategoria = useMemo(() => {
    const map = new Map<string, ItemProducao[]>();
    for (const cat of categorias) map.set(cat.id, []);
    map.set("outros", []);
    for (const item of itensFiltrados) {
      const key = map.has(item.categoriaId) ? item.categoriaId : "outros";
      map.get(key)!.push(item);
    }
    return map;
  }, [itensFiltrados, categorias]);

  // ── Abrir editor para um item ────────────────────────────────────────────────
  function abrirEditor(item: ItemProducao) {
    // Busca template: primeiro pelo templateId do item,
    // se não tiver, busca pelo anúncio vinculado ao produto
    const todosTemplates = getTemplates();
    const todosAnuncios  = getAnuncios();

    let templateId = item.templateId;

    // Se o item não tem templateId, tenta achar pelo anúncio
    if (!templateId) {
      const anuncio = todosAnuncios.find(
        (a) => a.nomeProduto.toLowerCase().trim() === item.produto.toLowerCase().trim()
      );
      templateId = anuncio?.templateId ?? null;
    }

    const template = templateId
      ? todosTemplates.find((t) => t.id === templateId) ?? null
      : null;

    console.log("[PrintFlow] abrirEditor:", {
      produto: item.produto,
      templateId,
      templateNome: template?.nome,
      artesDisponiveis: template?.artes.map((a) => ({ nome: a.nome, cat: a.categoriaId, temBg: !!a.editorState?.bgImage })),
    });

    if (!template) {
      toast({
        title: "Template não encontrado",
        description: `Vá em Anúncios, vincule o template ao produto "${item.produto.slice(0, 40)}..." e clique em Processar pedidos.`,
        variant: "destructive",
      });
    }

    // ── Seleção inteligente de arte ──────────────────────────────────────────
    // Para banderola: escolhe a arte com base no nome (simples vs composto)
    // Para outras categorias: usa nome da arte, categoria, ou primeira disponível
    const nome = item.personalizacao.nome ?? "";
    const nomeComposto = nome.trim().includes(" "); // tem espaço = nome composto

    let arte = null;

    if (template) {
      const artesCategoria = template.artes.filter(
        (a) => a.categoriaId === item.categoriaId
      );

      if (item.categoriaId === "banderola" && artesCategoria.length > 1) {
        // Banderola com múltiplas artes — escolhe pela quantidade de campos de letra
        const artesComLetra = artesCategoria.map((a) => ({
          arte: a,
          qtdLetra: (a.editorState?.layers as any[] ?? []).filter(
            (l: any) => l.tipo === "letra"
          ).length,
        }));

        if (nomeComposto) {
          // Nome composto → prefere arte com 3 campos de letra
          arte = artesComLetra.find((x) => x.qtdLetra === 3)?.arte
            ?? artesComLetra.find((x) => x.qtdLetra > 2)?.arte
            ?? artesComLetra[0]?.arte
            ?? null;
        } else {
          // Nome simples → prefere arte com 2 campos de letra
          arte = artesComLetra.find((x) => x.qtdLetra === 2)?.arte
            ?? artesComLetra.find((x) => x.qtdLetra > 0)?.arte
            ?? artesComLetra[0]?.arte
            ?? null;
        }

        console.log("[PrintFlow] Banderola — nome composto:", nomeComposto,
          "| arte escolhida:", arte?.nome,
          "| campos de letra:", (arte?.editorState?.layers as any[] ?? []).filter((l: any) => l.tipo === "letra").length
        );
      } else {
        // Não é banderola ou só tem 1 arte — lógica padrão
        arte = template.artes.find((a) => a.nome === item.arteNome)
          ?? artesCategoria[0]
          ?? template.artes[0]
          ?? null;
      }
    }

    if (template && !arte?.editorState?.bgImage) {
      toast({
        title: arte ? `Arte "${arte.nome}" sem PDF` : "Arte não configurada",
        description: `Vá em Templates → "${template.nome}" → abra o editor da arte e suba o PDF.`,
        variant: "destructive",
      });
    }

    let state: EditorState;

    if (arte?.editorState) {
      const layersArte = arte.editorState.layers as TextLayer[];
      const temCamposLetra = layersArte.some((l) => l.tipo === "letra");

      const layers = layersArte.map((layer) => {
        // Se a arte tem campos de letra (banderola), NÃO preenche nome/idade
        // Os campos de letra serão preenchidos letra a letra na geração
        if (temCamposLetra) return layer;

        // Arte normal — preenche nome e idade
        const label = layer.label?.toLowerCase() ?? "";
        if (label === "nome" || label.includes("nome")) {
          return { ...layer, text: item.personalizacao.nome || layer.text };
        }
        if (label === "idade" || label.includes("idade")) {
          if (!item.personalizacao.idade) return layer;
          const idadeNum = item.personalizacao.idade.replace(/\D/g, "");
          return { ...layer, text: `${idadeNum} anos` };
        }
        return layer;
      });
      state = {
        orientation: arte.editorState.orientation as "portrait" | "landscape",
        bgImage: arte.editorState.bgImage,
        layers,
      };

      // Para poster: sobrescreve orientação baseado na variação do pedido
      // A3 = landscape (297x420mm), A4 = portrait (210x297mm)
      if (item.categoriaId === "poster" && item.variacao) {
        const v = item.variacao.toUpperCase();
        if (v.includes("A3")) state = { ...state, orientation: "landscape" };
        else if (v.includes("A4")) state = { ...state, orientation: "portrait" };
      }
    } else {
      // Sem arte salva — abre editor em branco com nome/idade nos campos padrão
      state = {
        orientation: "portrait",
        bgImage: null,
        layers: [
          {
            id: crypto.randomUUID(),
            label: "Nome",
            text: item.personalizacao.nome || "Nome",
            x: 50, y: 30,
            rotation: 0, fontSize: 64,
            fontFamily: "Montserrat, sans-serif",
            color: "#1a1a1a", colors: [],
            bold: true, italic: false,
            borderWidth: 0, borderColor: "#000000",
            padding: 8, bgColor: "#ffffff", bgEnabled: false,
            effect: "none", effectColor: "#7c3aed", letterSpacing: 0,
          },
          {
            id: crypto.randomUUID(),
            label: "Idade",
            text: item.personalizacao.idade ? `${item.personalizacao.idade} anos` : "Idade",
            x: 50, y: 45,
            rotation: 0, fontSize: 48,
            fontFamily: "Montserrat, sans-serif",
            color: "#1a1a1a", colors: [],
            bold: false, italic: false,
            borderWidth: 0, borderColor: "#000000",
            padding: 8, bgColor: "#ffffff", bgEnabled: false,
            effect: "none", effectColor: "#7c3aed", letterSpacing: 0,
          },
        ],
      };
    }

    setEditorState(state);
    setEditorItem(item);
  }

  function fecharEditor() {
    setEditorItem(null);
    setEditorState(null);
    setAutoImprimirPendente(false);
  }

  function onEditorDownload() {
    // Marca como gerado após baixar
    if (editorItem) {
      marcarStatus(editorItem.itemId, "baixado");
      toast({ title: "Marcado como baixado" });
    }
  }
  function updateItemPerso(itemId: string, field: "nome" | "idade", value: string) {
    setItens((prev) => prev.map((i) => {
      if (i.itemId !== itemId) return i;
      const perso = { ...i.personalizacao, [field]: value };
      return {
        ...i,
        personalizacao: perso,
        personalizacaoOk: !!(perso.nome.trim() && perso.idade.trim()),
      };
    }));
  }

  function marcarStatus(itemId: string, status: ItemProducao["status"]) {
    setItens((prev) => prev.map((i) => i.itemId === itemId ? { ...i, status } : i));
  }
  function marcarStatusGrupo(itemIds: string[], status: ItemProducao["status"]) {
    setItens((prev) => prev.map((i) => itemIds.includes(i.itemId) ? { ...i, status } : i));
  }

  // ── Configurações ────────────────────────────────────────────────────────────
  function openConfig() {
    setConfigDraft(categorias.map((c) => ({ ...c })));
    setShowConfig(true);
  }
  function saveConfig() {
    const valid = configDraft.filter((c) => c.nome.trim());
    saveCategorias(valid);
    setCategorias(valid);
    if (!valid.find((c) => c.id === activeTab)) setActiveTab(valid[0]?.id ?? "");
    setShowConfig(false);
    toast({ title: "Categorias salvas" });
  }

  const temOutros   = (itensPorCategoria.get("outros")?.length ?? 0) > 0;

  // ── Render de aba agrupada (poster / não personalizado) ──────────────────────
  function renderAbaAgrupada(catId: string, catNome: string, catItens: ItemProducao[]) {
    // Separa: agrupados ficam na tabela de quantidade, personalizados ficam abaixo
    const itensAgrupados      = catItens.filter((i) => i.comportamento === "agrupado");
    const itensPersonalizados = catItens.filter((i) => i.comportamento === "personalizado" || i.comportamento === "banderola");
    const grupos = agruparItensTamanho(itensAgrupados);
    const pendentes = grupos.filter((g) => g.status === "pendente").length
      + itensPersonalizados.filter((i) => i.status === "pendente").length;

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">{catNome}</h2>
            <Badge variant="outline">{grupos.length} arte(s)</Badge>
            <Badge variant="secondary" className="text-xs">
              {catItens.reduce((s, i) => s + i.quantidade, 0)} unidades total
            </Badge>
            {pendentes > 0 && (
              <Badge variant="outline" className="text-[hsl(var(--warning))] border-[hsl(var(--warning))]">
                {pendentes} pendentes
              </Badge>
            )}
          </div>
        </div>

        {grupos.length === 0 && itensPersonalizados.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Nenhum item nesta categoria</CardContent></Card>
        ) : (
          <>
            {grupos.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground uppercase tracking-wide">
                    Agrupados por variação — imprimir 1 arte × quantidade
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produto / Arte</TableHead>
                        <TableHead>Variação / Tamanho</TableHead>
                        <TableHead><span className="flex items-center gap-1"><Copy className="h-3 w-3" /> Qtd total</span></TableHead>
                        <TableHead>Template</TableHead>
                        <TableHead>Pedidos</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {grupos.map((g) => (
                        <TableRow key={g.chave}>
                          <TableCell className="font-medium text-sm">
                            <div>
                              <p className="truncate max-w-[220px]" title={g.produto}>{g.produto}</p>
                              {g.arteNome && <p className="text-xs text-muted-foreground">{g.arteNome}</p>}
                            </div>
                          </TableCell>
                          <TableCell>
                            {g.variacao
                              ? <Badge variant="outline" className="font-mono text-xs">{g.variacao}</Badge>
                              : <span className="text-muted-foreground text-xs italic">—</span>}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="text-2xl font-bold text-primary">{g.quantidadeTotal}</span>
                              <span className="text-xs text-muted-foreground">unid.</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs font-mono">
                            {g.templateNome ?? <span className="text-muted-foreground italic">—</span>}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{g.pedidoIds.length} pedido(s)</TableCell>
                          <TableCell>
                            <Badge variant={STATUS_VARIANT[g.status]}>{STATUS_LABEL[g.status]}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {g.status === "pendente" && (
                                <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1"
                                  onClick={() => {
                                    const rep = itens.find((i) => g.itemIds.includes(i.itemId));
                                    if (rep) abrirEditor(rep);
                                  }}>
                                  <Wand2 className="h-3 w-3" /> Gerar
                                </Button>
                              )}
                              {g.status === "gerado" && (
                                <Button size="sm" variant="default" className="h-7 px-2 text-xs gap-1"
                                  onClick={() => marcarStatusGrupo(g.itemIds, "baixado")}>
                                  <Download className="h-3 w-3" /> Baixar
                                </Button>
                              )}
                              {g.status === "baixado" && (
                                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground"
                                  onClick={() => marcarStatusGrupo(g.itemIds, "pendente")}>Refazer</Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {itensPersonalizados.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                  Personalizados nesta categoria
                </p>
                {renderAbaPersonalizada(catId, catNome, itensPersonalizados)}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // ── Render de aba personalizada (sacolinha, topo, caixinha, banderola) ────────
  function renderAbaPersonalizada(catId: string, catNome: string, catItens: ItemProducao[]) {
    const pendentes = catItens.filter((i) => i.status === "pendente").length;
    const semPerso  = catItens.filter((i) => i.tipoPersonalizacao === "personalizado" && !i.personalizacaoOk).length;

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">{catNome}</h2>
            <Badge variant="outline">{catItens.length} itens</Badge>
            {pendentes > 0 && (
              <Badge variant="outline" className="text-[hsl(var(--warning))] border-[hsl(var(--warning))]">
                {pendentes} pendentes
              </Badge>
            )}
            {semPerso > 0 && (
              <Badge variant="outline" className="text-destructive border-destructive">
                {semPerso} sem personalização
              </Badge>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1"
              onClick={() => {
                const ids = catItens.filter((i) => i.status === "pendente").map((i) => i.itemId);
                if (!ids.length) { toast({ title: "Nenhum item pendente" }); return; }
                setItens((prev) => prev.map((i) => ids.includes(i.itemId) ? { ...i, status: "gerado" } : i));
                toast({ title: `${ids.length} item(ns) marcado(s) como gerado` });
              }}>
              <Wand2 className="h-3.5 w-3.5" /> Gerar em lote
            </Button>
          </div>
        </div>

        {catItens.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Nenhum item nesta categoria</CardContent></Card>
        ) : (
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead>Variação</TableHead>
                    <TableHead>Qtd</TableHead>
                    <TableHead className="min-w-[120px]">Nome</TableHead>
                    <TableHead className="min-w-[70px]">Idade</TableHead>
                    <TableHead>Obs.</TableHead>
                    <TableHead>Prazo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {catItens.map((item, idx) => (
                    <TableRow key={item.itemId} {...(idx === 0 ? { "data-tour": "producao-item" } : {})}>
                      <TableCell className="font-mono text-xs">{item.pedidoId.replace(/_\d+$/, "")}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm" title={item.produto}>
                        {item.produto}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{item.variacao || "—"}</TableCell>
                      <TableCell>
                        <span className="font-bold text-primary">{item.quantidade}</span>
                        <span className="text-xs text-muted-foreground ml-1">×</span>
                      </TableCell>

                      {/* Nome inline */}
                      <TableCell className="p-1">
                        {item.tipoPersonalizacao === "tamanho" ? (
                          <Badge variant="secondary" className="text-[10px]">Só tamanho</Badge>
                        ) : (
                          <div className="flex items-center gap-1">
                            {item.personalizacaoOk
                              ? <CheckCircle2 className="h-3 w-3 text-[hsl(var(--success))] shrink-0" />
                              : <AlertCircle className="h-3 w-3 text-[hsl(var(--warning))] shrink-0" />
                            }
                            <Input
                              value={item.personalizacao.nome}
                              onChange={(e) => updateItemPerso(item.itemId, "nome", e.target.value)}
                              placeholder="Nome"
                              className="h-7 text-xs px-2"
                            />
                          </div>
                        )}
                      </TableCell>

                      {/* Idade inline */}
                      <TableCell className="p-1">
                        {item.tipoPersonalizacao !== "tamanho" && (
                          <Input
                            value={item.personalizacao.idade}
                            onChange={(e) => updateItemPerso(item.itemId, "idade", e.target.value)}
                            placeholder="Idade"
                            className="h-7 text-xs px-2 w-16"
                          />
                        )}
                      </TableCell>

                      {/* Observação */}
                      <TableCell>
                        {item.observacao ? (
                          <button
                            onClick={() => setObsDialog(item.observacao)}
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors max-w-[100px]"
                            title={item.observacao}
                          >
                            <MessageSquare className="h-3 w-3 shrink-0" />
                            <span className="truncate">{item.observacao}</span>
                          </button>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>

                      <TableCell className="text-xs">{item.prazoEnvio || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[item.status]}>{STATUS_LABEL[item.status]}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {item.status === "pendente" && (
                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1"
                              data-tour="producao-editar"
                              onClick={() => abrirEditor(item)}>
                              <Wand2 className="h-3 w-3" /> Gerar
                            </Button>
                          )}
                          {item.status === "gerado" && (
                            <Button size="sm" variant="default" className="h-7 px-2 text-xs gap-1"
                              onClick={() => abrirEditor(item)}>
                              <Download className="h-3 w-3" /> Baixar PDF
                            </Button>
                          )}
                          {item.status === "baixado" && (
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground"
                              onClick={() => marcarStatus(item.itemId, "pendente")}>Refazer</Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* ── Editor de arte em tela cheia ─────────────────────────────────────── */}
      {editorItem && editorState && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
          <div className="flex items-center gap-3 px-4 py-2 border-b bg-card/80 shrink-0">
            <Button variant="ghost" size="sm" className="gap-2" onClick={fecharEditor}>
              <ArrowLeft className="h-4 w-4" /> Voltar para produção
            </Button>
            <div className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{editorItem.produto}</span>
              {editorItem.personalizacao.nome && (
                <span className="ml-2">— {editorItem.personalizacao.nome}, {editorItem.personalizacao.idade} anos</span>
              )}
              {editorItem.variacao && (
                <span className="ml-2 font-mono text-xs bg-secondary px-1.5 py-0.5 rounded">
                  {editorItem.variacao}
                </span>
              )}
            </div>
            {!editorItem.templateId && (
              <Badge variant="outline" className="text-[hsl(var(--warning))] border-[hsl(var(--warning))] text-xs">
                <ImageIcon className="h-3 w-3 mr-1" /> Sem template vinculado — configure em Anúncios
              </Badge>
            )}
            {editorItem.templateId && !editorState?.bgImage && (
              <Badge variant="outline" className="text-[hsl(var(--warning))] border-[hsl(var(--warning))] text-xs">
                <ImageIcon className="h-3 w-3 mr-1" /> Arte sem PDF/imagem — abra Templates e adicione o fundo na arte "{editorItem.arteNome}"
              </Badge>
            )}
          </div>
          <div className="flex-1 overflow-hidden">
            <Editor
              title={`${editorItem.arteNome ?? editorItem.produto} — ${editorItem.personalizacao.nome || "sem nome"}`}
              initialState={editorState}
              nomeParaBanderola={editorItem.categoriaId === "banderola" ? editorItem.personalizacao.nome : undefined}
              formatoPDF={editorItem.variacao?.toUpperCase().includes("A3") ? "a3" : "a4"}
              agentUrl={agentOnline ? AGENT_URL : undefined}
              autoImprimir={autoImprimirPendente && agentOnline}
              onPrinted={() => {
                setAutoImprimirPendente(false);
                marcarStatus(editorItem.itemId, "baixado");
                fecharEditor();
                toast({ title: "Arte enviada para impressão e marcada como impressa" });
              }}
              onSave={(state) => {
                marcarStatus(editorItem.itemId, "gerado");
                fecharEditor();
                toast({ title: "Arte salva e marcada como gerada" });
              }}
              saveLabel="Salvar e marcar como gerado"
            />
          </div>
        </div>
      )}

      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Produção em Massa</h1>
          <p className="text-sm text-muted-foreground">Pedidos agrupados por tipo de produto</p>
        </div>
        <div className="flex gap-2 items-center">
          <TourGuide pageKey="producao-massa" steps={[
            {
              title: "Produção em Massa",
              description: "Aqui ficam todos os itens que precisam ter a arte gerada. O sistema organiza automaticamente os pedidos por categoria de produto.",
            },
            {
              element: "[data-tour='producao-processar']",
              title: "Processar pedidos",
              description: "Clique aqui para reprocessar os pedidos importados. Use isso quando fizer alterações em anúncios, templates ou categorias para atualizar os itens.",
              side: "bottom" as const,
              align: "end" as const,
            },
            {
              element: "[data-tour='producao-tabs']",
              title: "Categorias de produto",
              description: "Os itens são separados por categoria (banderola, poster, etc.). Clique em cada aba para ver os pedidos daquela categoria.",
              side: "bottom" as const,
            },
            {
              element: "[data-tour='producao-item']",
              title: "Itens de produção",
              description: "Cada linha é um item de pedido. As colunas mostram nome, idade, variação e prazo. O ícone colorido indica o status: cinza = pendente, amarelo = gerado, verde = impresso.",
              side: "top" as const,
            },
            {
              element: "[data-tour='producao-editar']",
              title: "Abrir editor de arte",
              description: "Clique no ícone de lápis (<b>Editar arte</b>) para abrir o editor e personalizar a arte com o nome e idade do cliente. Após salvar, o item vai para a fila de Impressão.",
              side: "left" as const,
            },
          ]} />
          <Button variant="outline" className="gap-2" onClick={openConfig}>
            <Settings2 className="h-4 w-4" /> Configurar categorias
          </Button>
          <Button data-tour="producao-processar" className="gap-2" onClick={reprocessar}>
            <RefreshCw className="h-4 w-4" /> Processar pedidos
          </Button>
        </div>
      </div>

      {/* Resumo */}
      {itens.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total de itens</p>
            <p className="text-2xl font-bold">{itens.length}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Pendentes</p>
            <p className="text-2xl font-bold text-[hsl(var(--warning))]">{itens.filter((i) => i.status === "pendente").length}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Gerados / Baixados</p>
            <p className="text-2xl font-bold text-[hsl(var(--success))]">{itens.filter((i) => i.status !== "pendente").length}</p>
          </CardContent></Card>
        </div>
      )}

      {/* Estado vazio */}
      {itens.length === 0 && (
        <Card>
          <CardContent className="p-12 flex flex-col items-center gap-4 text-center">
            <Wand2 className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">Nenhum item processado ainda</p>
              <p className="text-sm text-muted-foreground mt-1">
                Importe um relatório, vincule os anúncios e clique em <strong>Processar pedidos</strong>.
              </p>
            </div>
            <Button className="gap-2" onClick={reprocessar}>
              <RefreshCw className="h-4 w-4" /> Processar agora
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Filtros */}
      {itens.length > 0 && (
        <div className="flex flex-wrap items-center gap-4">
          {/* Filtro de origem */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Origem:</span>
            <Select value={origemFiltro} onValueChange={(v) => setOrigemFiltro(v as typeof origemFiltro)}>
              <SelectTrigger className="w-40 h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="importados">Importados</SelectItem>
                <SelectItem value="manuais">Manuais</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Filtro de tema */}
          {temasDisponiveis.length > 1 && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Tema:</span>
              <Select value={temaFiltro} onValueChange={setTemaFiltro}>
                <SelectTrigger className="w-56 h-8 text-sm">
                  <SelectValue placeholder="Todos os temas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os temas</SelectItem>
                  {temasDisponiveis.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {temaFiltro !== "todos" && (
                <button
                  onClick={() => setTemaFiltro("todos")}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Limpar
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Abas */}
      {itens.length > 0 && (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList data-tour="producao-tabs" className="flex-wrap h-auto gap-1">
            {categorias.map((cat) => {
              const count = itensPorCategoria.get(cat.id)?.length ?? 0;
              const isAgrupada = CATS_AGRUPADAS.includes(cat.id);
              return (
                <TabsTrigger key={cat.id} value={cat.id} className="gap-1.5">
                  {cat.nome}
                  {isAgrupada && count > 0 && (
                    <span className="ml-1 text-[10px] text-muted-foreground">(agrupado)</span>
                  )}
                  {count > 0 && (
                    <span className="ml-1 rounded-full bg-primary/20 text-primary text-[10px] font-bold px-1.5 py-0.5">
                      {count}
                    </span>
                  )}
                </TabsTrigger>
              );
            })}
            {temOutros && (
              <TabsTrigger value="outros">
                Outros
                <span className="ml-1 rounded-full bg-muted text-muted-foreground text-[10px] font-bold px-1.5 py-0.5">
                  {itensPorCategoria.get("outros")?.length}
                </span>
              </TabsTrigger>
            )}
          </TabsList>

          {[...categorias.map((c) => c.id), ...(temOutros ? ["outros"] : [])].map((catId) => {
            const catItens = itensPorCategoria.get(catId) ?? [];
            const cat      = categorias.find((c) => c.id === catId);
            const catNome  = cat?.nome ?? "Outros";
            // Aba é agrupada se a maioria dos itens tem comportamento "agrupado"
            // Banderola e personalizado ficam na aba de linhas individuais
            const qtdAgrupados = catItens.filter((i) => i.comportamento === "agrupado").length;
            const isAgrupada   = qtdAgrupados > catItens.length / 2 || CATS_AGRUPADAS.includes(catId);

            return (
              <TabsContent key={catId} value={catId} className="mt-4">
                {isAgrupada
                  ? renderAbaAgrupada(catId, catNome, catItens)
                  : renderAbaPersonalizada(catId, catNome, catItens)
                }
              </TabsContent>
            );
          })}
        </Tabs>
      )}

      {/* Dialog: observação completa */}
      <Dialog open={obsDialog !== null} onOpenChange={(o) => !o && setObsDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" /> Observação do pedido
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{obsDialog}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setObsDialog(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: configurar categorias */}
      <Dialog open={showConfig} onOpenChange={(o) => !o && setShowConfig(false)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" /> Configurar categorias
            </DialogTitle>
            <DialogDescription>
              Renomeie, adicione ou remova categorias. Palavras-chave determinam o agrupamento automático.
              Categorias <strong>Poster</strong> e <strong>Não Personalizados</strong> agrupam por variação e somam quantidades.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {configDraft.map((cat) => (
              <div key={cat.id} className="flex items-start gap-3 rounded-md border border-border p-3 bg-secondary/20">
                <GripVertical className="h-4 w-4 text-muted-foreground mt-2.5 shrink-0" />
                <div className="flex-1 grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Nome da aba</Label>
                    <Input value={cat.nome}
                      onChange={(e) => setConfigDraft((p) => p.map((c) => c.id === cat.id ? { ...c, nome: e.target.value } : c))}
                      placeholder="ex: Sacolinha" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Palavras-chave (vírgula)</Label>
                    <Input value={cat.keywords.join(", ")}
                      onChange={(e) => {
                        const kw = e.target.value.split(",").map((k) => k.trim()).filter(Boolean);
                        setConfigDraft((p) => p.map((c) => c.id === cat.id ? { ...c, keywords: kw } : c));
                      }}
                      placeholder="ex: sacolinha, sacola" />
                  </div>
                </div>
                {CATS_AGRUPADAS.includes(cat.id) && (
                  <Badge variant="secondary" className="text-[10px] mt-2 shrink-0">Agrupado</Badge>
                )}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive mt-1 shrink-0">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remover categoria?</AlertDialogTitle>
                      <AlertDialogDescription>Os itens serão movidos para "Outros".</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => setConfigDraft((p) => p.filter((c) => c.id !== cat.id))}>
                        Remover
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
            <Button variant="outline" className="w-full gap-2"
              onClick={() => setConfigDraft((p) => [...p, { id: `cat_${Date.now()}`, nome: "", keywords: [], ordem: p.length }])}>
              <Plus className="h-4 w-4" /> Adicionar categoria
            </Button>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="ghost" onClick={() => setShowConfig(false)}>Cancelar</Button>
            <Button onClick={saveConfig}>Salvar categorias</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
