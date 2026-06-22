import { useRef, useState, useCallback, useEffect } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import * as pdfjsLib from "pdfjs-dist";

// Configura o worker do pdfjs — tenta local primeiro, CDN como fallback
try {
  const pdfWorkerUrl = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).href;
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
} catch {
  // Fallback para CDN
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
}
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Download, RotateCw, Type, Palette, Sparkles, Upload,
  Trash2, Plus, MoveDiagonal, FileText, RectangleVertical, RectangleHorizontal, Save, CheckCircle2,
  Printer,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { type Orientation, type EffectType, type TextLayer, type EditorState, defaultLayer } from "./editorTypes";
import { getFontesCustom, saveFontesCustom, type FonteCustom } from "@/lib/store";

const BUILTIN_FONTS = [
  { name: "Inter", value: "Inter, sans-serif" },
  { name: "Playfair Display", value: "'Playfair Display', serif" },
  { name: "Montserrat", value: "Montserrat, sans-serif" },
  { name: "Bebas Neue", value: "'Bebas Neue', sans-serif" },
  { name: "Dancing Script", value: "'Dancing Script', cursive" },
  { name: "Pacifico", value: "Pacifico, cursive" },
  { name: "Lobster", value: "Lobster, cursive" },
  { name: "Oswald", value: "Oswald, sans-serif" },
  { name: "Roboto Slab", value: "'Roboto Slab', serif" },
  { name: "Permanent Marker", value: "'Permanent Marker', cursive" },
  { name: "Great Vibes", value: "'Great Vibes', cursive" },
  { name: "Anton", value: "Anton, sans-serif" },
];

function loadGoogleFonts() {
  const id = "gf-editor";
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Anton&family=Bebas+Neue&family=Dancing+Script:wght@400;700&family=Great+Vibes&family=Inter:wght@400;700&family=Lobster&family=Montserrat:wght@400;700;900&family=Oswald:wght@400;700&family=Pacifico&family=Permanent+Marker&family=Playfair+Display:wght@400;700;900&family=Roboto+Slab:wght@400;700;900&display=swap";
  document.head.appendChild(link);
}

// Injeta @font-face via <style> tag (necessário para html2canvas e preview do Select)
// e também registra no FontFace API. Idempotente — só injeta uma vez por nome.
function injectFontFace(name: string, dataUrl: string) {
  const styleId = `pf-font-${name.replace(/[^a-zA-Z0-9]/g, "-")}`;
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `@font-face { font-family: '${name}'; src: url('${dataUrl}'); }`;
    document.head.appendChild(style);
  }
  const font = new FontFace(name, `url(${dataUrl})`);
  font.load().then((loaded) => document.fonts.add(loaded)).catch(() => {});
}

const A4_RATIO = 297 / 210;

function effectStyle(layer: TextLayer): React.CSSProperties {
  // Borda na letra via WebkitTextStroke (se tiver largura > 0)
  const strokeStyle: React.CSSProperties = layer.borderWidth > 0
    ? { WebkitTextStroke: `${layer.borderWidth}px ${layer.borderColor}` } as React.CSSProperties
    : {};

  switch (layer.effect) {
    case "shadow":  return { ...strokeStyle, textShadow: `2px 2px 6px ${layer.effectColor}` };
    case "glow":    return { ...strokeStyle, textShadow: `0 0 8px ${layer.effectColor}, 0 0 16px ${layer.effectColor}` };
    case "outline": return { ...strokeStyle, WebkitTextStroke: `${Math.max(layer.borderWidth, 1.5)}px ${layer.borderWidth > 0 ? layer.borderColor : layer.effectColor}` } as React.CSSProperties;
    case "neon":    return { ...strokeStyle, textShadow: `0 0 4px ${layer.effectColor}, 0 0 12px ${layer.effectColor}, 0 0 24px ${layer.effectColor}` };
    default:        return strokeStyle;
  }
}

interface EditorProps {
  initialState?: EditorState;
  title?: string;
  onSave?: (state: EditorState) => void;
  saveLabel?: string;
  nomeParaBanderola?: string;
  formatoPDF?: "a4" | "a3";
  agentUrl?: string;
  /** Abre o diálogo de impressão automaticamente ao montar */
  autoImprimir?: boolean;
  /** Chamado após impressão bem-sucedida */
  onPrinted?: () => void;
}

function buildDefaultLayers(): TextLayer[] {
  return [
    { ...defaultLayer("Nome", "Seu Nome", 30), fontSize: 64, bold: true },
    { ...defaultLayer("Idade", "5 anos", 45) },
    { ...defaultLayer("Texto 1", "Texto fixo 1", 60) },
    { ...defaultLayer("Texto 2", "Texto fixo 2", 75) },
  ];
}

export default function Editor({ initialState, title, onSave, saveLabel, nomeParaBanderola, formatoPDF = "a4", agentUrl, autoImprimir, onPrinted }: EditorProps) {
  const [orientation, setOrientation] = useState<Orientation>(initialState?.orientation ?? "portrait");
  const [bgImage, setBgImage] = useState<string | null>(initialState?.bgImage ?? null);
  const [layers, setLayers] = useState<TextLayer[]>(
    initialState?.layers?.length ? (initialState.layers as TextLayer[]) : buildDefaultLayers()
  );
  const [selectedId, setSelectedId] = useState<string>(() => layers[0]?.id ?? "");
  // Aba controlada — ao clicar num layer vai direto para Estilo
  const [activeTab, setActiveTab] = useState("layers");
  const [customFonts, setCustomFonts] = useState<FonteCustom[]>([]);
  const [exporting, setExporting] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  // ── Impressão via agente ──────────────────────────────────────────────────
  const [printDialog, setPrintDialog]     = useState(false);
  const [impressoras, setImpressoras]     = useState<{ nome: string; padrao: boolean }[]>([]);
  const [impressoraSel, setImpressoraSel] = useState("");
  const [printing, setPrinting]           = useState(false);

  async function abrirDialogImpressao() {
    setPrintDialog(true);
    try {
      const r = await fetch(`${agentUrl}/impressoras`, { signal: AbortSignal.timeout(3000) });
      const d = await r.json();
      const lista: { nome: string; padrao: boolean }[] = d.impressoras ?? [];
      setImpressoras(lista);
      const pad = lista.find((p) => p.padrao);
      setImpressoraSel(pad?.nome ?? lista[0]?.nome ?? "");
    } catch {
      toast.error("Não foi possível obter a lista de impressoras do agente.");
      setPrintDialog(false);
    }
  }

  async function enviarParaImpressora() {
    if (!impressoraSel || !canvasRef.current) return;
    setPrinting(true);
    const prevSelected = selectedId;
    setSelectedId("");
    await new Promise((r) => setTimeout(r, 120));
    try {
      const el     = canvasRef.current;
      const rect   = el.getBoundingClientRect();
      const canvas = await html2canvas(el, {
        scale: 3, useCORS: true, allowTaint: true, backgroundColor: "#ffffff",
        width: rect.width, height: rect.height,
        windowWidth: rect.width, windowHeight: rect.height, logging: false,
      });
      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      const pageW = formatoPDF === "a3" ? 297 : 210;
      const pageH = formatoPDF === "a3" ? 420 : 297;
      const pdf = new jsPDF({ orientation, unit: "mm", format: formatoPDF, compress: true });
      pdf.addImage(imgData, "JPEG", 0, 0, pageW, pageH);
      const pdfBlob = pdf.output("blob");

      const form = new FormData();
      form.append("arquivo", pdfBlob, "arte.pdf");
      const res = await fetch(
        `${agentUrl}/imprimir?impressora=${encodeURIComponent(impressoraSel)}&copias=1`,
        { method: "POST", body: form, signal: AbortSignal.timeout(30000) }
      );
      if (!res.ok) throw new Error(await res.text());
      toast.success(`Enviado para ${impressoraSel}`);
      setPrintDialog(false);
      onPrinted?.();
    } catch (err) {
      toast.error(`Erro ao imprimir: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setPrinting(false);
      setSelectedId(prevSelected);
    }
  }

  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; startX: number; startY: number; ox: number; oy: number } | null>(null);
  const resizeRef = useRef<{ id: string; startX: number; startY: number; ofs: number } | null>(null);

  // Carrega fontes salvas e registra no browser
  useEffect(() => {
    loadGoogleFonts();
    const saved = getFontesCustom();
    saved.forEach((f) => injectFontFace(f.name, f.dataUrl));
    setCustomFonts(saved);
  }, []);

  useEffect(() => {
    if (autoImprimir && agentUrl) {
      const timer = setTimeout(() => abrirDialogImpressao(), 600);
      return () => clearTimeout(timer);
    }
  }, [autoImprimir, agentUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = layers.find((l) => l.id === selectedId) ?? null;

  const update = (id: string, patch: Partial<TextLayer>) =>
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  // Seleciona layer E abre aba Estilo automaticamente
  function selectLayer(id: string) {
    setSelectedId(id);
    setActiveTab("style");
  }

  // Drag no canvas
  const onPointerDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    selectLayer(id);
    const layer = layers.find((l) => l.id === id);
    if (!layer) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { id, startX: e.clientX, startY: e.clientY, ox: layer.x, oy: layer.y };
  };

  // Clique no fundo do canvas — deseleciona APENAS se não houve drag
  const canvasClickRef = useRef(false);
  const onCanvasPointerDown = () => { canvasClickRef.current = true; };
  const onCanvasPointerMove = (e: React.PointerEvent) => {
    if (canvasClickRef.current) canvasClickRef.current = false; // houve movimento = drag
    onPointerMove(e);
  };
  const onCanvasClick = () => {
    if (canvasClickRef.current) {
      setSelectedId("");
      canvasClickRef.current = false;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (resizeRef.current) {
      const delta = Math.max(e.clientX - resizeRef.current.startX, e.clientY - resizeRef.current.startY);
      const next = Math.round(Math.max(8, Math.min(300, resizeRef.current.ofs + delta * 0.5)));
      update(resizeRef.current.id, { fontSize: next });
      return;
    }
    if (!dragRef.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    update(dragRef.current.id, {
      x: Math.max(0, Math.min(100, dragRef.current.ox + ((e.clientX - dragRef.current.startX) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, dragRef.current.oy + ((e.clientY - dragRef.current.startY) / rect.height) * 100)),
    });
  };

  const onPointerUp = () => { dragRef.current = null; resizeRef.current = null; };

  // Alça de resize (canto inferior direito)
  const onResizeDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    const layer = layers.find((l) => l.id === id);
    if (!layer) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    resizeRef.current = { id, startX: e.clientX, startY: e.clientY, ofs: layer.fontSize };
  };

  const handleBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setBgImage(reader.result as string);
    reader.readAsDataURL(f);
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    e.target.value = ""; // reset para permitir reselecionar o mesmo arquivo

    toast.loading("Carregando PDF...", { id: "pdf-load" });
    try {
      const buf = await f.arrayBuffer();

      // Garante que o worker está configurado
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
      }

      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buf) });
      const pdf      = await loadingTask.promise;
      const page     = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 3 });

      const canvas   = document.createElement("canvas");
      canvas.width   = viewport.width;
      canvas.height  = viewport.height;
      const ctx      = canvas.getContext("2d")!;

      await page.render({ canvasContext: ctx, viewport }).promise;

      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      setBgImage(dataUrl);
      setOrientation(viewport.width > viewport.height ? "landscape" : "portrait");
      toast.success("PDF carregado como fundo", { id: "pdf-load" });
    } catch (err) {
      console.error("[PrintFlow] Erro ao carregar PDF:", err);
      toast.error(`Erro ao ler PDF: ${err instanceof Error ? err.message : String(err)}`, { id: "pdf-load" });
    }
  };

  const handleFontUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const buffer = await f.arrayBuffer();
    // Converte para dataUrl base64 para persistir
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "woff2";
    const mimeMap: Record<string, string> = { ttf: "font/ttf", otf: "font/otf", woff: "font/woff", woff2: "font/woff2" };
    const mime = mimeMap[ext] ?? "font/woff2";
    const dataUrl = `data:${mime};base64,${base64}`;
    const name = f.name.replace(/\.[^.]+$/, "");
    injectFontFace(name, dataUrl);
    const value = `'${name}', sans-serif`;
    const novaFonte: FonteCustom = { name, value, dataUrl };
    const updated = [...customFonts.filter((x) => x.name !== name), novaFonte];
    setCustomFonts(updated);
    saveFontesCustom(updated);
    if (selected) update(selected.id, { fontFamily: value });
    toast.success(`Fonte "${name}" carregada e salva`);
    e.target.value = "";
  };

  const addLayer = () => {
    const l = defaultLayer(`Texto ${layers.length + 1}`, "Novo texto", 50);
    setLayers((p) => [...p, l]);
    selectLayer(l.id);
  };

  const exportPDF = useCallback(async () => {
    if (!canvasRef.current) return;

    // Verifica se é banderola (tem campos de letra)
    const camposLetra = layers.filter((l) => l.tipo === "letra");
    if (camposLetra.length > 0) {
      await exportBanderola(camposLetra);
      return;
    }

    setExporting(true);
    const prevSelected = selectedId;
    setSelectedId("");
    await new Promise((r) => setTimeout(r, 120));

    try {
      const el   = canvasRef.current;
      const rect = el.getBoundingClientRect();
      const canvas = await html2canvas(el, {
        scale: 3, useCORS: true, allowTaint: true,
        backgroundColor: "#ffffff",
        width: rect.width, height: rect.height,
        windowWidth: rect.width, windowHeight: rect.height,
        logging: false,
      });
      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      const pdf = new jsPDF({ orientation, unit: "mm", format: formatoPDF, compress: true });
      // A4: portrait=210x297, landscape=297x210 | A3: portrait=297x420, landscape=420x297
      const pageW = formatoPDF === "a3"
        ? (orientation === "portrait" ? 297 : 420)
        : (orientation === "portrait" ? 210 : 297);
      const pageH = formatoPDF === "a3"
        ? (orientation === "portrait" ? 420 : 297)
        : (orientation === "portrait" ? 297 : 210);
      pdf.addImage(imgData, "JPEG", 0, 0, pageW, pageH);
      const pdfBlob = pdf.output("blob");
      const blobUrl = URL.createObjectURL(pdfBlob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `arte-${Date.now()}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
      toast.success("PDF baixado com sucesso!");
    } catch (err) {
      toast.error(`Erro ao gerar PDF: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExporting(false);
      setSelectedId(prevSelected);
    }
  }, [orientation, selectedId, layers]);

  /**
   * Geração especial para banderola:
   * - Divide o nome letra a letra
   * - Agrupa pelo número de campos de letra na arte
   * - Gera 1 página por grupo (pode sobrar campos vazios)
   */
  const exportBanderola = useCallback(async (camposLetra: typeof layers) => {
    if (!canvasRef.current) return;
    setExporting(true);

    // Pega o nome: primeiro usa o prop nomeParaBanderola (passado pela Produção em Massa),
    // senão busca no campo "Nome" dos layers
    const campoNome = layers.find((l) => l.tipo !== "letra" && (l.label.toLowerCase().includes("nome") || l.label.toLowerCase() === "nome"));
    const nomeCompleto = (nomeParaBanderola ?? campoNome?.text ?? "").trim().toUpperCase();

    if (!nomeCompleto) {
      toast.error("Preencha o campo Nome antes de gerar a banderola");
      setExporting(false);
      return;
    }

    // Divide em letras — remove espaços (nome composto vira sequência contínua)
    const letras = nomeCompleto.replace(/\s+/g, "").split("");
    const porFolha = camposLetra.length; // 2 ou 3 campos = 2 ou 3 banderolas por folha

    // Agrupa as letras em grupos do tamanho da arte
    const grupos: string[][] = [];
    for (let i = 0; i < letras.length; i += porFolha) {
      grupos.push(letras.slice(i, i + porFolha));
    }

    toast.loading(`Gerando ${grupos.length} folha(s) para "${nomeCompleto}"...`, { id: "banderola-gen" });

    try {
      const pdf = new jsPDF({ orientation, unit: "mm", format: "a4", compress: true });
      const pageW = orientation === "portrait" ? 210 : 297;
      const pageH = orientation === "portrait" ? 297 : 210;

      for (let gi = 0; gi < grupos.length; gi++) {
        const grupo = grupos[gi];

        // Atualiza os campos de letra com as letras do grupo atual
        const layersGrupo = layers.map((l) => {
          if (l.tipo !== "letra") return l;
          const idxCampo = camposLetra.findIndex((c) => c.id === l.id);
          const letra = grupo[idxCampo] ?? ""; // vazio se sobrar
          return { ...l, text: letra };
        });

        // Renderiza temporariamente com as letras do grupo
        setLayers(layersGrupo);
        setSelectedId("");
        await new Promise((r) => setTimeout(r, 100));

        const el   = canvasRef.current!;
        const rect = el.getBoundingClientRect();
        const canvas = await html2canvas(el, {
          scale: 3, useCORS: true, allowTaint: true,
          backgroundColor: "#ffffff",
          width: rect.width, height: rect.height,
          windowWidth: rect.width, windowHeight: rect.height,
          logging: false,
        });

        const imgData = canvas.toDataURL("image/jpeg", 0.95);
        if (gi > 0) pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, 0, pageW, pageH);
      }

      // Restaura layers originais
      setLayers(layers);

      const pdfBlob = pdf.output("blob");
      const blobUrl = URL.createObjectURL(pdfBlob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `banderola-${nomeCompleto}-${Date.now()}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);

      toast.success(`Banderola gerada! ${grupos.length} folha(s) para "${nomeCompleto}"`, { id: "banderola-gen" });
    } catch (err) {
      toast.error(`Erro ao gerar banderola: ${err instanceof Error ? err.message : String(err)}`, { id: "banderola-gen" });
      setLayers(layers); // restaura em caso de erro
    } finally {
      setExporting(false);
    }
  }, [orientation, layers]);

  const handleSave = () => {
    if (!onSave) return;
    onSave({ orientation, bgImage, layers });
    setSavedOk(true);
    setTimeout(() => setSavedOk(false), 3000);
    toast.success("Arte salva no template!");
  };

  const allFonts = [
    ...BUILTIN_FONTS,
    ...customFonts.map((f) => ({ name: f.name, value: f.value })),
  ];

  return (
    <>
    {/* Dialog seleção de impressora */}
    <Dialog open={printDialog} onOpenChange={setPrintDialog}>
      <DialogContent className="sm:max-w-sm" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" /> Enviar para impressora
          </DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-3">
          <p className="text-sm text-muted-foreground">Selecione a impressora para enviar a arte:</p>
          <Select value={impressoraSel} onValueChange={setImpressoraSel}>
            <SelectTrigger>
              <SelectValue placeholder="Selecionar impressora..." />
            </SelectTrigger>
            <SelectContent>
              {impressoras.map((p) => (
                <SelectItem key={p.nome} value={p.nome}>
                  {p.nome}{p.padrao ? " (padrão)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setPrintDialog(false)}>Cancelar</Button>
          <Button onClick={enviarParaImpressora} disabled={printing || !impressoraSel} className="gap-2">
            <Printer className="h-4 w-4" />
            {printing ? "Enviando..." : "Imprimir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur shrink-0 z-20">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-[image:var(--gradient-primary)] grid place-items-center">
              <Type className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <p className="text-sm font-bold leading-tight">{title ?? "Editor Visual A4"}</p>
              <p className="text-xs text-muted-foreground">Clique num texto para selecionar</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant={orientation === "portrait" ? "default" : "outline"} size="sm" onClick={() => setOrientation("portrait")}>
              <RectangleVertical className="h-4 w-4 mr-1" /> Vertical
            </Button>
            <Button variant={orientation === "landscape" ? "default" : "outline"} size="sm" onClick={() => setOrientation("landscape")}>
              <RectangleHorizontal className="h-4 w-4 mr-1" /> Horizontal
            </Button>
            {agentUrl && (
              <Button variant="outline" onClick={abrirDialogImpressao} disabled={exporting || printing}
                className="gap-2 border-[hsl(var(--success)/0.5)] text-[hsl(var(--success))] hover:bg-[hsl(var(--success)/0.08)]">
                <Printer className="h-4 w-4" />
                {printing ? "Enviando..." : "Imprimir"}
              </Button>
            )}
            <Button variant="outline" onClick={exportPDF} disabled={exporting}>
              <Download className="h-4 w-4 mr-1" />
              {exporting
                ? "Gerando..."
                : layers.some((l) => l.tipo === "letra")
                  ? "Baixar PDF Banderola"
                  : "Baixar PDF"
              }
            </Button>
            {onSave && (
              <Button
                onClick={handleSave}
                className={`gap-2 transition-all ${savedOk ? "bg-[hsl(var(--success))] hover:bg-[hsl(var(--success))]" : ""}`}
              >
                {savedOk
                  ? <><CheckCircle2 className="h-4 w-4" /> Salvo!</>
                  : <><Save className="h-4 w-4" />{saveLabel ?? "Salvar arte"}</>
                }
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-auto">
        <div className="container grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 py-6">

          {/* Canvas A4 */}
          <div className="flex items-start justify-center">
            <div className="relative w-full" style={{ maxWidth: orientation === "portrait" ? "min(100%, 560px)" : "min(100%, 860px)" }}>
              <div
                ref={canvasRef}
                data-export-canvas
                onPointerDown={onCanvasPointerDown}
                onPointerMove={onCanvasPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
                onClick={onCanvasClick}
                className="relative w-full bg-white shadow-[var(--shadow-elegant)] rounded-md overflow-hidden select-none touch-none"
                style={{
                  aspectRatio: orientation === "portrait" ? `1 / ${A4_RATIO}` : `${A4_RATIO} / 1`,
                  backgroundImage: bgImage ? `url(${bgImage})` : "none",
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              >
                {layers.map((layer) => {
                  const isSel = layer.id === selectedId;
                  const hasMulti = layer.colors?.length > 1;
                  return (
                    <div
                      key={layer.id}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        canvasClickRef.current = false; // texto clicado, não deseleciona
                        onPointerDown(e, layer.id);
                      }}
                      className={`absolute cursor-move ${isSel ? "ring-2 ring-primary ring-offset-2" : ""}`}
                      style={{
                        left: `${layer.x}%`, top: `${layer.y}%`,
                        transform: `translate(-50%, -50%) rotate(${layer.rotation}deg)`,
                        fontFamily: layer.fontFamily, fontSize: `${layer.fontSize}px`,
                        color: layer.color, fontWeight: layer.bold ? 700 : 400,
                        fontStyle: layer.italic ? "italic" : "normal",
                        letterSpacing: `${layer.letterSpacing}px`, padding: `${layer.padding}px`,
                        background: layer.bgEnabled ? layer.bgColor : "transparent",
                        whiteSpace: "nowrap", lineHeight: 1.1,
                        ...effectStyle(layer),
                      }}
                    >
                      {hasMulti
                        ? Array.from(layer.text || " ").map((ch, i) => (
                            <span key={i} style={{ color: layer.colors[i % layer.colors.length] }}>{ch}</span>
                          ))
                        : (layer.text || " ")}
                      {isSel && (
                        <span
                          onPointerDown={(e) => onResizeDown(e, layer.id)}
                          className="absolute -bottom-2 -right-2 h-5 w-5 bg-primary border-2 border-background rounded-sm cursor-nwse-resize z-10"
                          style={{ fontSize: 0, touchAction: "none" }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground text-center mt-2 flex items-center justify-center gap-1">
                <MoveDiagonal className="h-3 w-3" /> Clique para selecionar · Arraste para mover · Alça azul para redimensionar
              </p>
            </div>
          </div>

          {/* Painel lateral */}
          <div className="space-y-4">
            <Card className="p-4">
              {/* Tabs controladas — sem disabled */}
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="layers">Textos</TabsTrigger>
                  <TabsTrigger value="style">Estilo</TabsTrigger>
                  <TabsTrigger value="canvas">Arte</TabsTrigger>
                </TabsList>

                {/* Aba Textos */}
                <TabsContent value="layers" className="space-y-3 mt-4">
                  {layers.map((l) => (
                    <div
                      key={l.id}
                      className={`rounded-md border p-3 cursor-pointer transition-colors ${l.id === selectedId ? "border-primary bg-accent/50" : "hover:bg-accent/30"}`}
                      onClick={() => selectLayer(l.id)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Label className="text-xs uppercase tracking-wide text-muted-foreground">{l.label}</Label>
                          {/* Badge indicando se é campo de letra (banderola) */}
                          {l.tipo === "letra" && (
                            <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-bold">
                              LETRA
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          {/* Toggle: texto normal ↔ letra de banderola */}
                          <button
                            className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                              l.tipo === "letra"
                                ? "bg-primary text-primary-foreground border-primary"
                                : "border-border text-muted-foreground hover:border-primary"
                            }`}
                            title={l.tipo === "letra" ? "Campo de letra (banderola) — clique para voltar a texto normal" : "Marcar como letra de banderola"}
                            onClick={() => update(l.id, { tipo: l.tipo === "letra" ? "texto" : "letra" })}
                          >
                            {l.tipo === "letra" ? "🔤 Banderola" : "Banderola?"}
                          </button>
                          <Button variant="ghost" size="icon" className="h-6 w-6"
                            onClick={() => setLayers((p) => p.filter((x) => x.id !== l.id))}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <Input value={l.text} placeholder={l.tipo === "letra" ? "Ex: A (prévia)" : l.label}
                        onChange={(e) => update(l.id, { text: e.target.value })}
                        onClick={(e) => e.stopPropagation()} />
                      {l.tipo === "letra" && (
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Este campo receberá 1 letra por vez na geração da banderola
                        </p>
                      )}
                    </div>
                  ))}
                  <Button onClick={addLayer} variant="outline" className="w-full">
                    <Plus className="h-4 w-4 mr-1" /> Adicionar texto
                  </Button>
                  {/* Resumo de campos de letra */}
                  {layers.filter((l) => l.tipo === "letra").length > 0 && (
                    <div className="rounded-md bg-primary/10 border border-primary/20 p-3 text-xs space-y-1">
                      <p className="font-medium text-primary">
                        🔤 {layers.filter((l) => l.tipo === "letra").length} campo(s) de letra configurado(s)
                      </p>
                      <p className="text-muted-foreground">
                        Esta arte gera <strong>{layers.filter((l) => l.tipo === "letra").length} banderola(s) por folha</strong>.
                        Para "MARCELO" (7 letras) = {Math.ceil(7 / layers.filter((l) => l.tipo === "letra").length)} folhas.
                      </p>
                    </div>
                  )}
                </TabsContent>

                {/* Aba Estilo */}
                <TabsContent value="style" className="space-y-4 mt-4">
                  {!selected ? (
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground text-center py-2">
                        Selecione um texto para editar:
                      </p>
                      {layers.map((l) => (
                        <button
                          key={l.id}
                          className="w-full text-left rounded-md border p-2.5 text-sm hover:bg-accent/50 transition-colors"
                          onClick={() => setSelectedId(l.id)}
                        >
                          <span className="text-xs text-muted-foreground uppercase tracking-wide mr-2">{l.label}</span>
                          <span className="font-medium">{l.text}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <>
                      <div>
                        <Label className="text-xs">Fonte</Label>
                        <Select value={selected.fontFamily} onValueChange={(v) => update(selected.id, { fontFamily: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {allFonts.map((f) => (
                              <SelectItem key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button variant="outline" size="sm" className="w-full mt-2"
                          onClick={() => setLayers((p) => p.map((l) => ({ ...l, fontFamily: selected.fontFamily })))}>
                          Aplicar fonte em todos
                        </Button>
                      </div>
                      <div>
                        <Label className="text-xs flex items-center gap-1"><Upload className="h-3 w-3" /> Subir fonte (.ttf/.otf/.woff)</Label>
                        <Input type="file" accept=".ttf,.otf,.woff,.woff2" onChange={handleFontUpload} className="text-xs" />
                      </div>
                      <div>
                        <Label className="text-xs">Tamanho: {selected.fontSize}px</Label>
                        <Slider
                          value={[selected.fontSize]} min={8} max={300} step={1}
                          onValueChange={(vals: number[]) => update(selected.id, { fontSize: vals[0] })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs flex items-center gap-1"><RotateCw className="h-3 w-3" /> Rotação: {selected.rotation}°</Label>
                        <Slider
                          value={[selected.rotation]} min={-180} max={180} step={1}
                          onValueChange={(vals: number[]) => update(selected.id, { rotation: vals[0] })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Espaçamento: {selected.letterSpacing}px</Label>
                        <Slider
                          value={[selected.letterSpacing]} min={-5} max={30} step={0.5}
                          onValueChange={(vals: number[]) => update(selected.id, { letterSpacing: vals[0] })}
                        />
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <Switch checked={selected.bold} onCheckedChange={(v) => update(selected.id, { bold: v })} />
                          <Label className="text-xs">Negrito</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch checked={selected.italic} onCheckedChange={(v) => update(selected.id, { italic: v })} />
                          <Label className="text-xs">Itálico</Label>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs flex items-center gap-1"><Palette className="h-3 w-3" /> Cor do texto</Label>
                          <Input type="color" value={selected.color}
                            onChange={(e) => update(selected.id, { color: e.target.value })} className="h-9 p-1 w-full" />
                        </div>
                        <div>
                          <Label className="text-xs">Cor da borda (letra)</Label>
                          <Input type="color" value={selected.borderColor}
                            onChange={(e) => update(selected.id, { borderColor: e.target.value })} className="h-9 p-1 w-full" />
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs">Espessura borda na letra: {selected.borderWidth}px</Label>
                        <Slider value={[selected.borderWidth]} min={0} max={12} step={0.5}
                          onValueChange={(vals: number[]) => update(selected.id, { borderWidth: vals[0] })} />
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Aumenta a espessura do contorno ao redor de cada letra
                        </p>
                      </div>
                      <div>
                        <Label className="text-xs">Padding: {selected.padding}px</Label>
                        <Slider value={[selected.padding]} min={0} max={48} step={1}
                          onValueChange={(vals: number[]) => update(selected.id, { padding: vals[0] })} />
                      </div>
                      <Separator />
                      <div className="flex items-center gap-2">
                        <Switch checked={selected.bgEnabled} onCheckedChange={(v) => update(selected.id, { bgEnabled: v })} />
                        <Label className="text-xs">Fundo no texto</Label>
                        <Input type="color" value={selected.bgColor}
                          onChange={(e) => update(selected.id, { bgColor: e.target.value })}
                          className="h-8 p-1 w-14 ml-auto" />
                      </div>
                      <div>
                        <Label className="text-xs flex items-center gap-1"><Sparkles className="h-3 w-3" /> Efeito</Label>
                        <Select value={selected.effect} onValueChange={(v: EffectType) => update(selected.id, { effect: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Nenhum</SelectItem>
                            <SelectItem value="shadow">Sombra</SelectItem>
                            <SelectItem value="glow">Brilho</SelectItem>
                            <SelectItem value="outline">Contorno</SelectItem>
                            <SelectItem value="neon">Neon</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {selected.effect !== "none" && (
                        <div>
                          <Label className="text-xs">Cor do efeito</Label>
                          <Input type="color" value={selected.effectColor}
                            onChange={(e) => update(selected.id, { effectColor: e.target.value })} className="h-9 p-1 w-full" />
                        </div>
                      )}
                      <Separator />
                      <div className="rounded-md border p-2 space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">Cores alternadas por letra</Label>
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs"
                            onClick={() => update(selected.id, { colors: [...selected.colors, selected.color] })}>
                            <Plus className="h-3 w-3 mr-1" /> Cor
                          </Button>
                        </div>
                        {selected.colors.length === 0 && (
                          <p className="text-[10px] text-muted-foreground">Adicione 2+ cores para alternar entre letras</p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          {selected.colors.map((c, i) => (
                            <div key={i} className="flex items-center gap-1">
                              <Input type="color" value={c} className="h-8 w-10 p-1"
                                onChange={(e) => { const n = [...selected.colors]; n[i] = e.target.value; update(selected.id, { colors: n }); }} />
                              <Button size="icon" variant="ghost" className="h-6 w-6"
                                onClick={() => update(selected.id, { colors: selected.colors.filter((_, j) => j !== i) })}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </TabsContent>

                {/* Aba Arte */}
                <TabsContent value="canvas" className="space-y-4 mt-4">
                  <div>
                    <Label className="text-xs flex items-center gap-1"><FileText className="h-3 w-3" /> Imagem de fundo</Label>
                    <Input type="file" accept="image/*" onChange={handleBgUpload} className="text-xs" />
                  </div>
                  <div>
                    <Label className="text-xs flex items-center gap-1"><FileText className="h-3 w-3" /> PDF de fundo</Label>
                    <Input type="file" accept="application/pdf" onChange={handlePdfUpload} className="text-xs" />
                    <p className="text-xs text-muted-foreground mt-1">Carrega a 1ª página do PDF como fundo</p>
                  </div>
                  {bgImage && (
                    <Button variant="outline" size="sm" onClick={() => setBgImage(null)} className="w-full">
                      Remover fundo
                    </Button>
                  )}
                </TabsContent>
              </Tabs>
            </Card>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
