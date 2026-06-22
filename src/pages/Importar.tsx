import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusCircle } from "lucide-react";
import { getAnuncios } from "@/lib/store";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Sparkles,
  Link2, Trash2, ChevronLeft, ChevronRight, MessageSquare,
} from "lucide-react";
import { TourGuide } from "@/components/TourGuide";
import { toast } from "@/hooks/use-toast";
import { saveOrders, mergeAnuncios, type ParsedOrder, type Personalizacao, type OrderType } from "@/lib/store";
import { registrarPedidos } from "@/lib/usage";

const TIPO_LABEL: Record<OrderType, string> = {
  imp_pers:         "Imprime + Personaliza",
  imp_nao_pers:     "Só imprime",
  pers_nao_imp:     "Só personaliza",
  nem_pers_nem_imp: "Sem produção",
};
const TIPO_VARIANT: Record<OrderType, "default" | "secondary" | "outline" | "destructive"> = {
  imp_pers:         "default",
  imp_nao_pers:     "secondary",
  pers_nao_imp:     "outline",
  nem_pers_nem_imp: "destructive",
};

function classify(produto: string, observacao: string): OrderType {
  const p   = (produto    || "").toLowerCase();
  const obs = (observacao || "").trim();
  const imprime     = /(decora|sacolinha|painel|topo|caixa|tag|r[oó]tulo|adesivo|p[aã]o de mel|kit\s*festa|festa em casa|imprim)/i.test(p);
  const personaliza = obs.length > 0 || /personaliz/i.test(p);
  if (imprime && personaliza)  return "imp_pers";
  if (imprime && !personaliza) return "imp_nao_pers";
  if (!imprime && personaliza) return "pers_nao_imp";
  return "nem_pers_nem_imp";
}

const COL = {
  id:           ["ID do pedido", "Order ID", "Número do pedido", "order_sn", "Order SN"],
  produto:      ["Nome do Produto", "Product Name", "Nome do produto", "product_name", "Produto", "Item Name", "Nome"],
  variacao:     ["Nome da variação", "Variation Name", "Variação", "variation_name", "Opção", "SKU"],
  quantidade:   ["Quantidade", "Quantity", "Qtd", "qty", "Qtde"],
  observacao:   ["Observação do comprador", "Buyer's Note", "Observacao", "Mensagem", "Nota do comprador", "Buyer Note"],
  destinatario: ["Nome do destinatário", "Recipient Name", "Nome do Destinatário", "Destinatário", "Buyer Name"],
  prazo:        ["Data prevista de envio", "Ship by Date", "Prazo de envio", "Enviar até", "Ship By"],
};

function pick(row: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    if (row[k] != null && row[k] !== "") return String(row[k]);
  }
  const rowKeys = Object.keys(row);
  for (const k of keys) {
    const found = rowKeys.find((rk) => rk.toLowerCase().trim() === k.toLowerCase().trim());
    if (found && row[found] != null && row[found] !== "") return String(row[found]);
  }
  return "";
}

function extractPersonalizacao(observacao: string): Personalizacao {
  const obs = (observacao || "").trim();
  let nome  = "";
  let idade = "";

  if (!obs) return { nome, idade, tema: "" };

  const nomeLabel = obs.match(/(?:nome|crian[çc]a|aniversariante)\s*[:=]\s*([A-Za-zÀ-ÿ ]{2,40}?)(?:\s*[,|/\n]|$)/i);
  if (nomeLabel) nome = nomeLabel[1].trim();

  const idadeLabel = obs.match(/(?:idade)\s*[:=]\s*(\d{1,2})/i);
  if (idadeLabel) idade = idadeLabel[1];

  if (nome && idade) return { nome, idade, tema: "" };

  const nomeIdadeA = obs.match(/^([A-Za-zÀ-ÿ ]{2,40}?)\s*[-–,]?\s*(\d{1,2})\s*anos?/i);
  if (nomeIdadeA) {
    if (!nome)  nome  = nomeIdadeA[1].trim();
    if (!idade) idade = nomeIdadeA[2];
  }

  if (!nome || !idade) {
    const idadeNome = obs.match(/^(\d{1,2})\s*anos?\s*[-–,]\s*([A-Za-zÀ-ÿ ]{2,40})/i);
    if (idadeNome) {
      if (!idade) idade = idadeNome[1];
      if (!nome)  nome  = idadeNome[2].trim();
    }
  }

  if (!nome || !idade) {
    const tresPartes = obs.match(/^([A-Za-zÀ-ÿ ]{2,40}?)\s*[-–]\s*(\d{1,2})\s*[-–]/i);
    if (tresPartes) {
      if (!nome)  nome  = tresPartes[1].trim();
      if (!idade) idade = tresPartes[2];
    }
  }

  if (!idade) {
    const soIdade = obs.match(/\b(\d{1,2})\s*anos?\b/i);
    if (soIdade) idade = soIdade[1];
  }

  if (!nome) {
    const primeiraCapital = obs.match(/^([A-ZÁÉÍÓÚÀÂÊÔÃÕÇ][a-záéíóúàâêôãõç]{1,}(?:\s+[A-ZÁÉÍÓÚÀÂÊÔÃÕÇ][a-záéíóúàâêôãõç]{1,})*)/);
    if (primeiraCapital && primeiraCapital[1].length >= 3) {
      nome = primeiraCapital[1].trim();
    }
  }

  return { nome, idade, tema: "" };
}

const PAGE_SIZE = 50;

export default function Importar() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [orders, setOrders]         = useState<ParsedOrder[]>([]);
  const [fileName, setFileName]     = useState<string>("");
  const [novosAnuncios, setNovosAnuncios] = useState(0);
  const [page, setPage]             = useState(0);
  const [obsDialog, setObsDialog]   = useState<string | null>(null);
  const [filtroOrigem, setFiltroOrigem] = useState<"todos" | "importados" | "manuais">("todos");

  // Pedido manual
  const [manualDialog, setManualDialog] = useState(false);
  const [manualProduto, setManualProduto] = useState("");
  const [manualProdutoCustom, setManualProdutoCustom] = useState("");
  const [manualVariacao, setManualVariacao]   = useState("");
  const [manualNome, setManualNome]           = useState("");
  const [manualIdade, setManualIdade]         = useState("");
  const [manualQtd, setManualQtd]             = useState(1);
  const [manualPrazo, setManualPrazo]         = useState("");
  const [manualObs, setManualObs]             = useState("");
  const [manualSaving, setManualSaving]       = useState(false);

  function resetManual() {
    setManualProduto("");
    setManualProdutoCustom("");
    setManualVariacao("");
    setManualNome("");
    setManualIdade("");
    setManualQtd(1);
    setManualPrazo("");
    setManualObs("");
  }

  async function adicionarManual() {
    const produto = (manualProduto === "__outro" ? manualProdutoCustom : manualProduto).trim();
    if (!produto) { toast({ title: "Informe o produto", variant: "destructive" }); return; }
    setManualSaving(true);
    try {
      const resultado = await registrarPedidos(1);
      if (!resultado.ok && resultado.erro === "limite_atingido") {
        toast({
          title: "Limite de pedidos atingido",
          description: `Seu plano permite ${resultado.limite?.toLocaleString("pt-BR")} pedidos/mês. Faça upgrade para continuar.`,
          variant: "destructive",
        });
        return;
      }
      const obs = manualObs.trim() ||
        (manualNome ? `Nome: ${manualNome}${manualIdade ? `, ${manualIdade} anos` : ""}` : "");
      const newOrder: ParsedOrder = {
        id: `MANUAL_${Date.now()}`,
        produto,
        variacao:     manualVariacao.trim(),
        quantidade:   manualQtd || 1,
        observacao:   obs,
        destinatario: manualNome.trim(),
        prazoEnvio:   manualPrazo.trim(),
        tipo:         classify(produto, obs),
        personalizacao: { nome: manualNome.trim(), idade: manualIdade.trim(), tema: "" },
        personalizacaoOk: !!(manualNome.trim() && manualIdade.trim()),
      };
      const novosOrders = [...orders, newOrder];
      setOrders(novosOrders);
      const produtosUnicos = Array.from(new Set(novosOrders.map((o) => o.produto)));
      const anunciosAtuais = mergeAnuncios(produtosUnicos);
      setNovosAnuncios(anunciosAtuais.filter((a) => !a.templateId).length);
      resetManual();
      setManualDialog(false);
      toast({ title: "Pedido adicionado com sucesso" });
    } finally {
      setManualSaving(false);
    }
  }

  function limparPedidos() {
    setOrders([]);
    setFileName("");
    setNovosAnuncios(0);
    setPage(0);
    localStorage.removeItem("printflow.orders");
    localStorage.removeItem("printflow.producao");
    toast({ title: "Pedidos limpos", description: "Pronto para importar um novo relatório." });
  }

  useEffect(() => {
    const raw = localStorage.getItem("printflow.orders");
    if (raw) {
      try {
        const data = JSON.parse(raw);
        if (Array.isArray(data.orders)) {
          setOrders(data.orders);
          setFileName(data.fileName || "");
        }
      } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    if (orders.length) saveOrders(orders, fileName);
  }, [orders, fileName]);

  function updatePerso(globalIdx: number, field: keyof Personalizacao, value: string) {
    setOrders((prev) => {
      const next = [...prev];
      const o    = { ...next[globalIdx] };
      o.personalizacao = { ...o.personalizacao, [field]: value };
      o.personalizacaoOk = !!(
        (field === "nome"  ? value : o.personalizacao.nome).trim() &&
        (field === "idade" ? value : o.personalizacao.idade).trim()
      );
      next[globalIdx] = o;
      return next;
    });
  }

  async function handleFile(file: File) {
    try {
      const buf  = await file.arrayBuffer();
      const wb   = XLSX.read(buf, { type: "array" });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

      if (!rows.length) { toast({ title: "Planilha vazia", variant: "destructive" }); return; }

      const parsed: ParsedOrder[] = rows
        .map((r, idx) => {
          const id = pick(r, COL.id);
          if (!id) return null;
          const produto    = pick(r, COL.produto);
          const observacao = pick(r, COL.observacao);
          const personalizacao = extractPersonalizacao(observacao);
          return {
            id: `${id}_${idx}`,
            produto,
            variacao:     pick(r, COL.variacao),
            quantidade:   Number(pick(r, COL.quantidade)) || 1,
            observacao,
            destinatario: pick(r, COL.destinatario),
            prazoEnvio:   pick(r, COL.prazo),
            tipo:         classify(produto, observacao),
            personalizacao,
            personalizacaoOk: !!(personalizacao.nome && personalizacao.idade),
          };
        })
        .filter((x): x is ParsedOrder => !!x);

      // Valida e registra o uso no Supabase antes de salvar
      const resultado = await registrarPedidos(parsed.length);
      if (!resultado.ok) {
        if (resultado.erro === "limite_atingido") {
          toast({
            title: "Limite de pedidos atingido",
            description: `Seu plano permite ${resultado.limite?.toLocaleString("pt-BR")} pedidos/mês. Você já importou ${resultado.atual?.toLocaleString("pt-BR")}. Faça upgrade para continuar.`,
            variant: "destructive",
          });
          return;
        }
        // Se erro de conta (usuário sem conta no Supabase), permite continuar offline
      }

      setOrders(parsed);
      setFileName(file.name);
      setPage(0);

      const produtosUnicos = Array.from(new Set(parsed.map((p) => p.produto)));
      const anunciosAtuais = mergeAnuncios(produtosUnicos);
      const semVinculo     = anunciosAtuais.filter((a) => !a.templateId).length;
      setNovosAnuncios(semVinculo);

      toast({
        title: `${parsed.length} pedidos importados`,
        description: semVinculo > 0
          ? `${semVinculo} anúncio(s) sem template — configure em Anúncios.`
          : "Todos os anúncios já têm template vinculado.",
      });
    } catch (e) {
      toast({ title: "Erro ao ler arquivo", description: String(e), variant: "destructive" });
    }
  }

  const counts = orders.reduce<Record<OrderType, number>>(
    (acc, o) => ({ ...acc, [o.tipo]: (acc[o.tipo] || 0) + 1 }),
    { imp_pers: 0, imp_nao_pers: 0, pers_nao_imp: 0, nem_pers_nem_imp: 0 }
  );
  const prontos = orders.filter((o) => o.personalizacaoOk).length;

  const ordersVisiveis = orders.filter((o) => {
    if (filtroOrigem === "manuais")    return o.id.startsWith("MANUAL_");
    if (filtroOrigem === "importados") return !o.id.startsWith("MANUAL_");
    return true;
  });
  const totalPages = Math.ceil(ordersVisiveis.length / PAGE_SIZE);
  const pageOrders = ordersVisiveis.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="p-6 space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Importar Pedidos</h1>
          <p className="text-sm text-muted-foreground">
            Envie a planilha exportada da Shopee — edite nome e idade direto na tabela
          </p>
        </div>
        <TourGuide pageKey="importar" steps={[
          {
            title: "Importar pedidos",
            description: "Aqui você alimenta o sistema com os pedidos. Exporte o relatório da Shopee como CSV ou XLSX e faça o upload — ou adicione pedidos manualmente clicando em <b>+ Pedido Manual</b>.",
          },
          {
            element: "[data-tour='importar-upload']",
            title: "Upload do arquivo",
            description: "Arraste o arquivo CSV/XLSX aqui ou clique no botão <b>Selecionar</b>. O sistema lê automaticamente os pedidos e extrai nome, idade e produto.",
            side: "bottom" as const,
          },
          {
            element: "[data-tour='importar-tabela']",
            title: "Tabela de pedidos",
            description: "Após o upload, todos os pedidos aparecem aqui. Você pode editar o nome e a idade diretamente na tabela clicando na célula.",
            side: "top" as const,
          },
          {
            element: "[data-tour='importar-aviso']",
            title: "Anúncios sem template",
            description: "Se aparecer este aviso, significa que há produtos novos sem template vinculado. Vá até a aba <b>Anúncios</b> para vincular antes de ir para Produção.",
            side: "bottom" as const,
          },
        ]} />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setManualDialog(true)}>
            <PlusCircle className="h-4 w-4" /> Pedido Manual
          </Button>
          {orders.length > 0 && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground">
                <Trash2 className="h-4 w-4" /> Limpar
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Limpar todos os pedidos?</AlertDialogTitle>
                <AlertDialogDescription>
                  Os {orders.length} pedidos e os itens de produção serão removidos. Vínculos de anúncios e templates são mantidos.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={limparPedidos}>Limpar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          )}
        </div>
      </div>

      {/* Upload — compacto */}
      <div
        data-tour="importar-upload"
        className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-secondary/20 px-4 py-3 cursor-pointer hover:bg-secondary/40 transition"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
      >
        <FileSpreadsheet className="h-5 w-5 text-muted-foreground shrink-0" />
        <span className="text-sm text-muted-foreground flex-1">
          {fileName
            ? <><span className="text-foreground font-medium">{fileName}</span> — clique para substituir</>
            : "Arraste o CSV/XLSX aqui ou clique para selecionar"}
        </span>
        <Button size="sm" className="gap-1.5 shrink-0" type="button" onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}>
          <Upload className="h-3.5 w-3.5" /> Selecionar
        </Button>
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      </div>

      {/* Aviso sem vínculo */}
      {novosAnuncios > 0 && (
        <div data-tour="importar-aviso" className="flex items-center gap-3 rounded-lg border border-[hsl(var(--warning))] bg-[hsl(var(--warning)/0.06)] px-4 py-2.5">
          <Link2 className="h-4 w-4 text-[hsl(var(--warning))] shrink-0" />
          <p className="text-sm">
            <span className="font-medium">{novosAnuncios} anúncio(s) sem template vinculado.</span>{" "}
            <span className="text-muted-foreground">Acesse <strong>Anúncios</strong> para vincular.</span>
          </p>
        </div>
      )}

      {orders.length > 0 && (
        <>
          {/* Stats em linha */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {(Object.keys(TIPO_LABEL) as OrderType[]).map((t) => (
              <Card key={t}>
                <CardContent className="p-3">
                  <p className="text-[10px] text-muted-foreground leading-tight">{TIPO_LABEL[t]}</p>
                  <p className="text-xl font-bold mt-0.5">{counts[t]}</p>
                </CardContent>
              </Card>
            ))}
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="p-3 flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-muted-foreground">Personalização OK</p>
                  <p className="text-xl font-bold mt-0.5">
                    {prontos}<span className="text-sm font-normal text-muted-foreground">/{orders.length}</span>
                  </p>
                </div>
                <Sparkles className="h-4 w-4 text-primary" />
              </CardContent>
            </Card>
          </div>

          {/* Tabela */}
          <Card data-tour="importar-tabela">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
                {orders.length} pedidos
                {totalPages > 1 && (
                  <span className="text-xs text-muted-foreground font-normal">
                    — página {page + 1} de {totalPages}
                  </span>
                )}
              </CardTitle>
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-7 w-7" disabled={page === 0}
                    onClick={() => setPage((p) => p - 1)}>
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <span className="text-xs text-muted-foreground px-1">{page + 1}/{totalPages}</span>
                  <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages - 1}
                    onClick={() => setPage((p) => p + 1)}>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">Pedido</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead>Variação</TableHead>
                    <TableHead className="w-8">Qtd</TableHead>
                    <TableHead className="min-w-[120px]">Nome</TableHead>
                    <TableHead className="min-w-[72px]">Idade</TableHead>
                    <TableHead>Observação</TableHead>
                    <TableHead>Prazo</TableHead>
                    <TableHead>Tipo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageOrders.map((o, localIdx) => {
                    const globalIdx = page * PAGE_SIZE + localIdx;
                    return (
                      <TableRow key={`${o.id}_${globalIdx}`}>
                        <TableCell className="font-mono text-xs whitespace-nowrap">
                          {o.id.startsWith("MANUAL_") ? (
                            <Badge variant="outline" className="text-[10px] font-normal border-primary/50 text-primary">
                              Manual
                            </Badge>
                          ) : (
                            o.id.replace(/_\d+$/, "")
                          )}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-sm" title={o.produto}>
                          {o.produto || <span className="text-muted-foreground italic">—</span>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {o.variacao || "—"}
                        </TableCell>
                        <TableCell className="text-sm font-medium">{o.quantidade}</TableCell>

                        <TableCell className="p-1">
                          <div className="flex items-center gap-1">
                            {o.personalizacaoOk
                              ? <CheckCircle2 className="h-3 w-3 text-[hsl(var(--success))] shrink-0" />
                              : <AlertCircle className="h-3 w-3 text-[hsl(var(--warning))] shrink-0" />
                            }
                            <Input
                              value={o.personalizacao.nome}
                              onChange={(e) => updatePerso(globalIdx, "nome", e.target.value)}
                              placeholder="Nome"
                              className="h-7 text-xs px-2 min-w-[100px]"
                            />
                          </div>
                        </TableCell>

                        <TableCell className="p-1">
                          <Input
                            value={o.personalizacao.idade}
                            onChange={(e) => updatePerso(globalIdx, "idade", e.target.value)}
                            placeholder="Idade"
                            className="h-7 text-xs px-2 w-14"
                          />
                        </TableCell>

                        <TableCell className="max-w-[160px]">
                          {o.observacao ? (
                            <button
                              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors text-left w-full"
                              onClick={() => setObsDialog(o.observacao)}
                            >
                              <MessageSquare className="h-3 w-3 shrink-0 text-primary" />
                              <span className="truncate">{o.observacao}</span>
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">—</span>
                          )}
                        </TableCell>

                        <TableCell className="text-xs whitespace-nowrap">{o.prazoEnvio || "—"}</TableCell>

                        <TableCell>
                          <Badge variant={TIPO_VARIANT[o.tipo]} className="text-[10px]">
                            {TIPO_LABEL[o.tipo]}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {/* Paginação rodapé */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-2 border-t border-border">
                  <span className="text-xs text-muted-foreground">
                    {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, orders.length)} de {orders.length} pedidos
                  </span>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" className="h-7 gap-1" disabled={page === 0}
                      onClick={() => setPage((p) => p - 1)}>
                      <ChevronLeft className="h-3.5 w-3.5" /> Anterior
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 gap-1" disabled={page >= totalPages - 1}
                      onClick={() => setPage((p) => p + 1)}>
                      Próxima <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Dialog — Pedido Manual */}
      <Dialog open={manualDialog} onOpenChange={(open) => { setManualDialog(open); if (!open) resetManual(); }}>
        <DialogContent className="max-w-lg" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PlusCircle className="h-4 w-4" /> Adicionar pedido manual
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Produto */}
            <div className="space-y-1.5">
              <Label>Produto</Label>
              <Select value={manualProduto} onValueChange={setManualProduto}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione ou escolha 'Outro'..." />
                </SelectTrigger>
                <SelectContent>
                  {getAnuncios().map((a) => (
                    <SelectItem key={a.nomeProduto} value={a.nomeProduto}>{a.nomeProduto}</SelectItem>
                  ))}
                  <SelectItem value="__outro">Outro (digitar nome)...</SelectItem>
                </SelectContent>
              </Select>
              {manualProduto === "__outro" && (
                <Input
                  placeholder="Nome do produto"
                  value={manualProdutoCustom}
                  onChange={(e) => setManualProdutoCustom(e.target.value)}
                  autoFocus
                />
              )}
            </div>

            {/* Variação + Quantidade */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Variação <span className="text-muted-foreground text-xs">(opcional)</span></Label>
                <Input placeholder="Ex: A4, Azul, G..." value={manualVariacao} onChange={(e) => setManualVariacao(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Quantidade</Label>
                <Input type="number" min={1} value={manualQtd} onChange={(e) => setManualQtd(Number(e.target.value) || 1)} />
              </div>
            </div>

            {/* Personalização */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nome da criança</Label>
                <Input placeholder="Ex: Maria" value={manualNome} onChange={(e) => setManualNome(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Idade</Label>
                <Input placeholder="Ex: 7" value={manualIdade} onChange={(e) => setManualIdade(e.target.value)} />
              </div>
            </div>

            {/* Prazo */}
            <div className="space-y-1.5">
              <Label>Prazo de envio <span className="text-muted-foreground text-xs">(opcional)</span></Label>
              <Input placeholder="Ex: 25/05/2025" value={manualPrazo} onChange={(e) => setManualPrazo(e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setManualDialog(false)}>Cancelar</Button>
            <Button onClick={adicionarManual} disabled={manualSaving} className="gap-2">
              <PlusCircle className="h-4 w-4" />
              {manualSaving ? "Salvando..." : "Adicionar pedido"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog observação completa */}
      <Dialog open={obsDialog !== null} onOpenChange={(o) => !o && setObsDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <MessageSquare className="h-4 w-4 text-primary" /> Observação do comprador
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">{obsDialog}</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
