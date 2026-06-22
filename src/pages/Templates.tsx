import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Palette, Plus, Pencil, Trash2, ChevronRight, ArrowLeft, Layers, ImageIcon,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  type Template, type ArteTemplate, type Categoria,
  getTemplates, saveTemplates, getCategorias,
} from "@/lib/store";
import Editor from "@/components/editor/Editor";
import { type EditorState } from "@/components/editor/editorTypes";

// ─── Componente principal ─────────────────────────────────────────────────────

export default function Templates() {
  const [templates, setTemplates]   = useState<Template[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [view, setView]             = useState<"list" | "detail" | "editor">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingArteEditor, setEditingArteEditor] = useState<ArteTemplate | null>(null);

  // Dialog novo/editar template
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [templateDraft, setTemplateDraft] = useState<{ nome: string; descricao: string }>({ nome: "", descricao: "" });
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);

  // Dialog nova/editar arte
  const [showArteDialog, setShowArteDialog] = useState(false);
  const [arteDraft, setArteDraft] = useState<{ nome: string; categoriaId: string; observacao: string; comportamento: "personalizado" | "agrupado" | "banderola"; variacao: string }>({
    nome: "", categoriaId: "", observacao: "", comportamento: "personalizado", variacao: "",
  });
  const [editingArteId, setEditingArteId] = useState<string | null>(null);

  useEffect(() => {
    setTemplates(getTemplates());
    setCategorias(getCategorias());
  }, []);

  const selectedTemplate = templates.find((t) => t.id === selectedId) ?? null;

  // ── Salvar templates ─────────────────────────────────────────────────────────
  function persist(list: Template[]) {
    setTemplates(list);
    saveTemplates(list);
  }

  // ── Criar / editar template ──────────────────────────────────────────────────
  function openNewTemplate() {
    setTemplateDraft({ nome: "", descricao: "" });
    setEditingTemplateId(null);
    setShowTemplateDialog(true);
  }

  function openEditTemplate(t: Template) {
    setTemplateDraft({ nome: t.nome, descricao: t.descricao });
    setEditingTemplateId(t.id);
    setShowTemplateDialog(true);
  }

  function saveTemplate() {
    if (!templateDraft.nome.trim()) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }
    if (editingTemplateId) {
      persist(templates.map((t) =>
        t.id === editingTemplateId ? { ...t, ...templateDraft } : t
      ));
      toast({ title: "Template atualizado" });
    } else {
      const novo: Template = {
        id: crypto.randomUUID(),
        nome: templateDraft.nome.trim(),
        descricao: templateDraft.descricao.trim(),
        artes: [],
        criadoEm: new Date().toISOString(),
      };
      persist([...templates, novo]);
      toast({ title: "Template criado", description: novo.nome });
    }
    setShowTemplateDialog(false);
  }

  function deleteTemplate(id: string) {
    persist(templates.filter((t) => t.id !== id));
    if (selectedId === id) { setSelectedId(null); setView("list"); }
    toast({ title: "Template removido" });
  }

  // ── Criar / editar arte ──────────────────────────────────────────────────────
  function openNewArte() {
    setArteDraft({ nome: "", categoriaId: categorias[0]?.id ?? "", observacao: "", comportamento: "personalizado", variacao: "" });
    setEditingArteId(null);
    setShowArteDialog(true);
  }

  function openEditArte(arte: ArteTemplate) {
    setArteDraft({ nome: arte.nome, categoriaId: arte.categoriaId, observacao: arte.observacao, comportamento: (arte.comportamento ?? "personalizado") as "personalizado" | "agrupado" | "banderola", variacao: arte.variacao ?? "" });
    setEditingArteId(arte.id);
    setShowArteDialog(true);
  }

  function openEditorArte(arte: ArteTemplate) {
    setEditingArteEditor(arte);
    setView("editor");
  }

  function saveEditorState(state: EditorState) {
    if (!selectedId || !editingArteEditor) return;

    // Comprime o bgImage para reduzir tamanho no localStorage
    const comprimirBg = (bgImage: string | null): Promise<string | null> => {
      if (!bgImage) return Promise.resolve(null);
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          // Limita resolução para economizar espaço (max 1200px de largura)
          const maxW = 1200;
          const scale = img.width > maxW ? maxW / img.width : 1;
          canvas.width  = img.width  * scale;
          canvas.height = img.height * scale;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.85));
        };
        img.onerror = () => resolve(bgImage); // fallback: usa original
        img.src = bgImage;
      });
    };

    comprimirBg(state.bgImage).then((bgComprimido) => {
      const stateComprimido = { ...state, bgImage: bgComprimido };
      const novaLista = templates.map((t) => {
        if (t.id !== selectedId) return t;
        return {
          ...t,
          artes: t.artes.map((a) =>
            a.id === editingArteEditor.id ? { ...a, editorState: stateComprimido } : a
          ),
        };
      });

      try {
        persist(novaLista);
        toast({ title: "Arte salva no template!", description: editingArteEditor.nome });
      } catch (e) {
        // localStorage cheio — tenta sem o bgImage
        console.error("Erro ao salvar arte:", e);
        toast({
          title: "Erro ao salvar",
          description: "O arquivo PDF é muito grande para o armazenamento local. Tente um PDF menor.",
          variant: "destructive",
        });
      }

      setView("detail");
      setEditingArteEditor(null);
    });
  }

  function saveArte() {
    if (!arteDraft.nome.trim()) {
      toast({ title: "Nome da arte obrigatório", variant: "destructive" });
      return;
    }
    if (!arteDraft.categoriaId) {
      toast({ title: "Selecione uma categoria", variant: "destructive" });
      return;
    }
    if (!selectedId) return;

    persist(templates.map((t) => {
      if (t.id !== selectedId) return t;
      if (editingArteId) {
        return {
          ...t,
          artes: t.artes.map((a) =>
            a.id === editingArteId ? { ...a, ...arteDraft } : a
          ),
        };
      } else {
        const nova: ArteTemplate = {
          id: crypto.randomUUID(),
          nome: arteDraft.nome.trim(),
          categoriaId: arteDraft.categoriaId,
          observacao: arteDraft.observacao.trim(),
          comportamento: arteDraft.comportamento,
          variacao: arteDraft.variacao.trim() || undefined,
        };
        return { ...t, artes: [...t.artes, nova] };
      }
    }));

    toast({ title: editingArteId ? "Arte atualizada" : "Arte adicionada" });
    setShowArteDialog(false);
  }

  function deleteArte(arteId: string) {
    if (!selectedId) return;
    persist(templates.map((t) =>
      t.id === selectedId ? { ...t, artes: t.artes.filter((a) => a.id !== arteId) } : t
    ));
    toast({ title: "Arte removida" });
  }

  // ── Render: editor de arte ───────────────────────────────────────────────────
  if (view === "editor" && editingArteEditor) {
    return (
      <div className="h-[calc(100vh-3.5rem)] flex flex-col">
        <div className="flex items-center gap-3 px-4 py-2 border-b bg-card/50 shrink-0">
          <Button variant="ghost" size="sm" className="gap-2" onClick={() => { setView("detail"); setEditingArteEditor(null); }}>
            <ArrowLeft className="h-4 w-4" /> Voltar para o template
          </Button>
          <span className="text-sm text-muted-foreground">
            {selectedTemplate?.nome} → {editingArteEditor.nome}
          </span>
        </div>
        <div className="flex-1 overflow-hidden">
          <Editor
            title={editingArteEditor.nome}
            initialState={editingArteEditor.editorState as EditorState | undefined}
            onSave={saveEditorState}
            saveLabel="Salvar arte no template"
          />
        </div>
      </div>
    );
  }

  // ── Render: lista de templates ───────────────────────────────────────────────
  if (view === "list") {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Templates</h1>
            <p className="text-sm text-muted-foreground">
              Cadastre temas e suas artes por categoria de produto
            </p>
          </div>
          <Button className="gap-2" onClick={openNewTemplate}>
            <Plus className="h-4 w-4" /> Novo template
          </Button>
        </div>

        {templates.length === 0 ? (
          <Card>
            <CardContent className="p-12 flex flex-col items-center gap-4 text-center">
              <Palette className="h-10 w-10 text-muted-foreground" />
              <div>
                <p className="font-medium">Nenhum template cadastrado</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Crie um template para cada tema (ex: Frozen, Patrulha Canina, Kpop) e adicione as artes de cada categoria.
                </p>
              </div>
              <Button className="gap-2" onClick={openNewTemplate}>
                <Plus className="h-4 w-4" /> Criar primeiro template
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => {
              const catIds = Array.from(new Set(t.artes.map((a) => a.categoriaId)));
              return (
                <Card
                  key={t.id}
                  className="cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => { setSelectedId(t.id); setView("detail"); }}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-base">{t.nome}</CardTitle>
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button size="icon" variant="ghost" className="h-7 w-7"
                          onClick={() => openEditTemplate(t)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost"
                              className="h-7 w-7 text-destructive hover:text-destructive">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remover template?</AlertDialogTitle>
                              <AlertDialogDescription>
                                O template "{t.nome}" e todas as suas artes serão removidos. Os vínculos em Anúncios serão desfeitos.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteTemplate(t.id)}>Remover</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                    {t.descricao && (
                      <p className="text-xs text-muted-foreground">{t.descricao}</p>
                    )}
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-wrap gap-1">
                        {catIds.length === 0 ? (
                          <span className="text-xs text-muted-foreground italic">Sem artes</span>
                        ) : catIds.map((cid) => {
                          const cat = categorias.find((c) => c.id === cid);
                          return (
                            <Badge key={cid} variant="secondary" className="text-[10px]">
                              {cat?.nome ?? cid}
                            </Badge>
                          );
                        })}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Layers className="h-3 w-3" />
                        {t.artes.length} arte(s)
                        <ChevronRight className="h-3.5 w-3.5 ml-1" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Dialog criar/editar template */}
        <Dialog open={showTemplateDialog} onOpenChange={(o) => !o && setShowTemplateDialog(false)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingTemplateId ? "Editar template" : "Novo template"}</DialogTitle>
              <DialogDescription>
                Um template representa um tema completo com todas as suas artes.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome do tema</Label>
                <Input
                  placeholder="ex: Guerreiras do Kpop, Frozen, Patrulha Canina"
                  value={templateDraft.nome}
                  onChange={(e) => setTemplateDraft((d) => ({ ...d, nome: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Descrição (opcional)</Label>
                <Textarea
                  placeholder="Observações sobre este tema..."
                  value={templateDraft.descricao}
                  onChange={(e) => setTemplateDraft((d) => ({ ...d, descricao: e.target.value }))}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowTemplateDialog(false)}>Cancelar</Button>
              <Button onClick={saveTemplate}>
                {editingTemplateId ? "Salvar" : "Criar template"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ── Render: detalhe do template (artes) ──────────────────────────────────────
  if (!selectedTemplate) { setView("list"); return null; }

  const artesPorCategoria = categorias.map((cat) => ({
    cat,
    artes: selectedTemplate.artes.filter((a) => a.categoriaId === cat.id),
  })).filter((g) => g.artes.length > 0);

  const semCategoria = selectedTemplate.artes.filter(
    (a) => !categorias.find((c) => c.id === a.categoriaId)
  );

  return (
    <div className="p-6 space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setView("list")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{selectedTemplate.nome}</h1>
            {selectedTemplate.descricao && (
              <p className="text-sm text-muted-foreground">{selectedTemplate.descricao}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => openEditTemplate(selectedTemplate)}>
            <Pencil className="h-4 w-4" /> Editar tema
          </Button>
          <Button className="gap-2" onClick={openNewArte}>
            <Plus className="h-4 w-4" /> Adicionar arte
          </Button>
        </div>
      </div>

      {/* Resumo */}
      <div className="flex flex-wrap gap-2">
        {categorias.map((cat) => {
          const count = selectedTemplate.artes.filter((a) => a.categoriaId === cat.id).length;
          if (!count) return null;
          return (
            <Badge key={cat.id} variant="default" className="gap-1">
              {cat.nome} <span className="opacity-70">({count})</span>
            </Badge>
          );
        })}
        {selectedTemplate.artes.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma arte cadastrada ainda.</p>
        )}
      </div>

      {/* Artes agrupadas por categoria */}
      {artesPorCategoria.map(({ cat, artes }) => (
        <Card key={cat.id}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {cat.nome}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome da arte</TableHead>
                  <TableHead>Observação</TableHead>
                  <TableHead>Comportamento</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {artes.map((arte) => (
                  <TableRow key={arte.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {arte.editorState?.bgImage
                          ? <span className="h-2 w-2 rounded-full bg-[hsl(var(--success))] shrink-0" title="Arte configurada" />
                          : <span className="h-2 w-2 rounded-full bg-border shrink-0" title="Sem arte" />
                        }
                        {arte.nome}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {arte.observacao || <span className="italic">—</span>}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={arte.comportamento === "agrupado" ? "secondary" : arte.comportamento === "banderola" ? "default" : "outline"}
                        className="text-[10px]"
                      >
                        {arte.comportamento === "agrupado" ? "Agrupado" : arte.comportamento === "banderola" ? "🔤 Banderola" : "Personalizado"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs"
                          onClick={() => openEditorArte(arte)}>
                          <ImageIcon className="h-3 w-3" />
                          {arte.editorState?.bgImage ? "Editar arte" : "Abrir editor"}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                          onClick={() => openEditArte(arte)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="ghost"
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remover arte?</AlertDialogTitle>
                              <AlertDialogDescription>
                                A arte "{arte.nome}" será removida deste template.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteArte(arte.id)}>Remover</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      {/* Artes sem categoria conhecida */}
      {semCategoria.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Outros
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableBody>
                {semCategoria.map((arte) => (
                  <TableRow key={arte.id}>
                    <TableCell className="font-medium">{arte.nome}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{arte.observacao || "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                        onClick={() => openEditArte(arte)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {selectedTemplate.artes.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center">
            <p className="text-sm text-muted-foreground mb-4">
              Adicione as artes deste tema — uma para cada tipo de produto (sacolinha, topo, caixinha, etc.)
            </p>
            <Button className="gap-2" onClick={openNewArte}>
              <Plus className="h-4 w-4" /> Adicionar primeira arte
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Dialog criar/editar arte */}
      <Dialog open={showArteDialog} onOpenChange={(o) => !o && setShowArteDialog(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingArteId ? "Editar arte" : "Nova arte"}</DialogTitle>
            <DialogDescription>
              Adicione uma arte ao template <strong>{selectedTemplate.nome}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select
                value={arteDraft.categoriaId}
                onValueChange={(v) => setArteDraft((d) => ({ ...d, categoriaId: v }))}
              >
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {categorias.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Nome da arte</Label>
              <Input
                placeholder="ex: Sacolinha frente, Topo redondo 15cm"
                value={arteDraft.nome}
                onChange={(e) => setArteDraft((d) => ({ ...d, nome: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Observação (opcional)</Label>
              <Textarea
                placeholder="Tamanho, formato, instruções de impressão..."
                value={arteDraft.observacao}
                onChange={(e) => setArteDraft((d) => ({ ...d, observacao: e.target.value }))}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Comportamento na produção</Label>
              <Select
                value={arteDraft.comportamento}
                onValueChange={(v: "personalizado" | "agrupado" | "banderola") =>
                  setArteDraft((d) => ({ ...d, comportamento: v }))
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="personalizado">
                    Personalizado — 1 arte por pedido (tem nome/idade)
                  </SelectItem>
                  <SelectItem value="agrupado">
                    Agrupado — 1 arte × quantidade total (poster, peça sem personalização)
                  </SelectItem>
                  <SelectItem value="banderola">
                    Banderola — gera N páginas, 1 letra por campo (configure os campos no editor)
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {arteDraft.comportamento === "agrupado"
                  ? "Ex: 30 pedidos de Poster A3 → aparece como 1 linha com quantidade 30"
                  : arteDraft.comportamento === "banderola"
                  ? "Ex: nome MARCELO com 2 campos de letra = 4 folhas (M+A / R+C / E+L / O+_)"
                  : "Ex: 20 sacolinhas personalizadas → aparece como 20 linhas, 1 por criança"}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowArteDialog(false)}>Cancelar</Button>
            <Button onClick={saveArte}>{editingArteId ? "Salvar" : "Adicionar arte"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog editar template (reutilizado) */}
      <Dialog open={showTemplateDialog} onOpenChange={(o) => !o && setShowTemplateDialog(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome do tema</Label>
              <Input
                value={templateDraft.nome}
                onChange={(e) => setTemplateDraft((d) => ({ ...d, nome: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea
                value={templateDraft.descricao}
                onChange={(e) => setTemplateDraft((d) => ({ ...d, descricao: e.target.value }))}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowTemplateDialog(false)}>Cancelar</Button>
            <Button onClick={saveTemplate}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
