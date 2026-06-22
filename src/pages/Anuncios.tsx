import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Link2, Pencil, AlertCircle, CheckCircle2, Palette } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  type Anuncio, type Template, type Categoria,
  getAnuncios, saveAnuncios, getCategorias, getTemplates,
} from "@/lib/store";

export default function Anuncios() {
  const [anuncios, setAnuncios]     = useState<Anuncio[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [templates, setTemplates]   = useState<Template[]>([]);
  const [editingNome, setEditingNome] = useState<string | null>(null);
  const [draft, setDraft]           = useState<Partial<Anuncio>>({});
  const [artesDisponiveis, setArtesDisponiveis] = useState<{ id: string; nome: string; categoriaId: string; comportamento?: string }[]>([]);

  useEffect(() => {
    setAnuncios(getAnuncios());
    setCategorias(getCategorias());
    setTemplates(getTemplates());
  }, []);

  useEffect(() => { saveAnuncios(anuncios); }, [anuncios]);

  useEffect(() => {
    if (draft.templateId) {
      const tpl = templates.find((t) => t.id === draft.templateId);
      setArtesDisponiveis(tpl?.artes ?? []);
    } else {
      setArtesDisponiveis([]);
    }
  }, [draft.templateId, templates]);

  function openEdit(nome: string) {
    const a = anuncios.find((x) => x.nomeProduto === nome);
    if (!a) return;
    setDraft({ ...a });
    setEditingNome(nome);
    if (a.templateId) {
      const tpl = templates.find((t) => t.id === a.templateId);
      setArtesDisponiveis(tpl?.artes ?? []);
    } else {
      setArtesDisponiveis([]);
    }
  }

  function toggleArte(arteId: string) {
    const current = draft.artesIds ?? [];
    const next = current.includes(arteId)
      ? current.filter((id) => id !== arteId)
      : [...current, arteId];
    setDraft((d) => ({ ...d, artesIds: next.length > 0 ? next : null }));
  }

  function saveDraft() {
    if (!editingNome) return;
    setAnuncios((prev) =>
      prev.map((a) => (a.nomeProduto === editingNome ? { ...a, ...draft } : a))
    );
    toast({ title: "Vínculo salvo", description: editingNome });
    setEditingNome(null);
  }

  const vinculados     = anuncios.filter((a) => a.templateId).length;
  const semVinculo     = anuncios.length - vinculados;
  const editingAnuncio = anuncios.find((a) => a.nomeProduto === editingNome);
  const templateSelecionado = templates.find((t) => t.id === draft.templateId) ?? null;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Anúncios</h1>
        <p className="text-sm text-muted-foreground">
          Vincule cada anúncio a um template. As categorias são definidas pelas artes do template.
        </p>
      </div>

      {anuncios.length === 0 && (
        <Card>
          <CardContent className="p-12 flex flex-col items-center gap-4 text-center">
            <Link2 className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">Nenhum anúncio detectado ainda</p>
              <p className="text-sm text-muted-foreground mt-1">
                Importe um relatório em <strong>Importar Pedidos</strong>.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {anuncios.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-2xl font-bold">{anuncios.length}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Com template</p>
            <p className="text-2xl font-bold text-[hsl(var(--success))]">{vinculados}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Sem template</p>
            <p className="text-2xl font-bold text-[hsl(var(--warning))]">{semVinculo}</p>
          </CardContent></Card>
        </div>
      )}

      {anuncios.length > 0 && templates.length === 0 && (
        <Card className="border-[hsl(var(--warning))]">
          <CardContent className="p-4 flex items-center gap-3">
            <Palette className="h-5 w-5 text-[hsl(var(--warning))] shrink-0" />
            <p className="text-sm">Nenhum template cadastrado. Acesse <strong>Templates</strong> primeiro.</p>
          </CardContent>
        </Card>
      )}

      {anuncios.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Link2 className="h-4 w-4 text-primary" /> Vínculos ({anuncios.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto (anúncio)</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Peças do kit</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {anuncios.map((a) => {
                  const tpl = templates.find((t) => t.id === a.templateId);
                  // Artes efetivas (todas ou só as selecionadas)
                  const artesEfetivas = tpl
                    ? (a.artesIds?.length
                        ? tpl.artes.filter((x) => a.artesIds!.includes(x.id))
                        : tpl.artes)
                    : [];
                  return (
                    <TableRow key={a.nomeProduto}>
                      <TableCell className="max-w-[280px] truncate font-medium text-sm" title={a.nomeProduto}>
                        {a.nomeProduto}
                      </TableCell>
                      <TableCell>
                        {tpl
                          ? <span className="text-sm font-medium">{tpl.nome}</span>
                          : <span className="text-xs text-muted-foreground italic">—</span>}
                      </TableCell>
                      <TableCell>
                        {artesEfetivas.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {artesEfetivas.map((arte) => {
                              const cat = categorias.find((c) => c.id === arte.categoriaId);
                              return (
                                <Badge key={arte.id} variant="secondary" className="text-[10px]">
                                  {cat?.nome ?? arte.categoriaId}
                                </Badge>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {a.templateId
                          ? <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
                          : <AlertCircle className="h-4 w-4 text-[hsl(var(--warning))]" />}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" className="gap-1" onClick={() => openEdit(a.nomeProduto)}>
                          <Pencil className="h-3 w-3" /> Vincular
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Dialog de vínculo — SEM campo Categoria */}
      <Dialog open={!!editingNome} onOpenChange={(o) => !o && setEditingNome(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Vincular anúncio</DialogTitle>
            <DialogDescription className="text-xs truncate">{editingAnuncio?.nomeProduto}</DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {/* Template */}
            <div className="space-y-2">
              <Label>Template (tema)</Label>
              {templates.length === 0 ? (
                <p className="text-xs text-muted-foreground p-2 rounded border border-border bg-secondary/30">
                  Nenhum template cadastrado. Crie em <strong>Templates</strong> primeiro.
                </p>
              ) : (
                <Select
                  value={draft.templateId ?? ""}
                  onValueChange={(v) => setDraft((d) => ({ ...d, templateId: v || null, artesIds: null, categoriaId: null }))}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione o tema..." /></SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.nome}
                        {t.artes.length > 0 && (
                          <span className="text-muted-foreground ml-2 text-xs">({t.artes.length} peça(s))</span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Peças do template — mostra as categorias automaticamente */}
            {templateSelecionado && templateSelecionado.artes.length > 0 && (
              <div className="space-y-2">
                <Label>
                  Peças incluídas{" "}
                  <span className="text-muted-foreground font-normal text-xs">
                    (desmarque para excluir do kit)
                  </span>
                </Label>
                <div className="rounded-md border border-border divide-y divide-border">
                  {templateSelecionado.artes.map((arte) => {
                    const cat = categorias.find((c) => c.id === arte.categoriaId);
                    const checked = draft.artesIds ? draft.artesIds.includes(arte.id) : true;
                    return (
                      <div key={arte.id} className="flex items-center gap-3 px-3 py-2.5">
                        <Checkbox
                          id={`arte-${arte.id}`}
                          checked={checked}
                          onCheckedChange={() => toggleArte(arte.id)}
                        />
                        <label htmlFor={`arte-${arte.id}`} className="flex-1 cursor-pointer">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{arte.nome}</span>
                            {cat && <Badge variant="secondary" className="text-[10px]">{cat.nome}</Badge>}
                            {arte.comportamento && arte.comportamento !== "personalizado" && (
                              <Badge variant="outline" className="text-[10px]">
                                {arte.comportamento === "agrupado" ? "Agrupado" : arte.comportamento === "banderola" ? "🔤 Banderola" : arte.comportamento}
                              </Badge>
                            )}
                          </div>
                          {arte.observacao && (
                            <p className="text-xs text-muted-foreground mt-0.5">{arte.observacao}</p>
                          )}
                        </label>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  {draft.artesIds
                    ? `${draft.artesIds.length} peça(s) selecionada(s)`
                    : `Todas as ${templateSelecionado.artes.length} peça(s) incluídas`}
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingNome(null)}>Cancelar</Button>
            <Button onClick={saveDraft}>Salvar vínculo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
