import { useEffect, useState, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { RefreshCw, Download, Search, FileBarChart2, TrendingUp } from "lucide-react";
import {
  getItensProducao, getOrders, getCategorias,
  type ItemProducao, type ParsedOrder,
} from "@/lib/store";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface LinhaRelatorio {
  anuncio: string;
  qtdVendas: number;
  topo: number;
  banderola: number;
  posterA3: number;
  posterA4: number;
  caixinha: number;
  sacolinha: number;
  naoPers: number;
  semCategoria: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ehPosterA3(item: ItemProducao): boolean {
  return item.categoriaId === "poster" && /a3/i.test(item.variacao ?? "");
}

function ehPosterA4(item: ItemProducao): boolean {
  return item.categoriaId === "poster" && /a4/i.test(item.variacao ?? "");
}

function ehPosterSemVariacao(item: ItemProducao): boolean {
  return item.categoriaId === "poster" && !/a3|a4/i.test(item.variacao ?? "");
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function Historico() {
  const [itens, setItens]   = useState<ItemProducao[]>([]);
  const [orders, setOrders] = useState<ParsedOrder[]>([]);
  const [busca, setBusca]   = useState("");
  const tableRef            = useRef<HTMLTableElement>(null);

  function carregar() {
    setItens(getItensProducao());
    setOrders(getOrders());
  }

  useEffect(() => { carregar(); }, []);

  // ── Monta a tabela pivot: 1 linha por anúncio, 1 coluna por categoria ────────
  const linhas = useMemo((): LinhaRelatorio[] => {
    if (!itens.length) return [];

    // Quantidade de vendas vem dos pedidos originais (evita contar por arte)
    const vendas = new Map<string, number>();
    for (const o of orders) {
      const key = o.produto.toLowerCase().trim();
      vendas.set(key, (vendas.get(key) ?? 0) + o.quantidade);
    }

    // Agrupa itens por produto
    const porAnuncio = new Map<string, ItemProducao[]>();
    for (const item of itens) {
      const key = item.produto.toLowerCase().trim();
      if (!porAnuncio.has(key)) porAnuncio.set(key, []);
      porAnuncio.get(key)!.push(item);
    }

    const CATS_CONHECIDAS = new Set(["topos", "banderola", "poster", "caixinha", "sacolinha", "nao_personalizado"]);

    return Array.from(porAnuncio.entries())
      .map(([key, itensProd]) => {
        const anuncio  = itensProd[0].produto;
        const qtdVendas = vendas.get(key) ?? itensProd.reduce((s, i) => s + i.quantidade, 0);

        // Soma de quantidades por categoria
        const soma = (pred: (i: ItemProducao) => boolean) =>
          itensProd.filter(pred).reduce((s, i) => s + i.quantidade, 0);

        return {
          anuncio,
          qtdVendas,
          topo:      soma((i) => i.categoriaId === "topos"),
          banderola: soma((i) => i.categoriaId === "banderola"),
          posterA3:  soma(ehPosterA3),
          posterA4:  soma(ehPosterA4),
          caixinha:  soma((i) => i.categoriaId === "caixinha"),
          sacolinha: soma((i) => i.categoriaId === "sacolinha"),
          naoPers:   soma((i) => i.categoriaId === "nao_personalizado"),
          semCategoria: soma((i) =>
            !CATS_CONHECIDAS.has(i.categoriaId) && !ehPosterA3(i) && !ehPosterA4(i) && !ehPosterSemVariacao(i)
          ),
        };
      })
      .sort((a, b) => b.qtdVendas - a.qtdVendas);
  }, [itens, orders]);

  const linhasFiltradas = useMemo(() => {
    if (!busca.trim()) return linhas;
    const q = busca.toLowerCase();
    return linhas.filter((l) => l.anuncio.toLowerCase().includes(q));
  }, [linhas, busca]);

  // ── Totais ────────────────────────────────────────────────────────────────────
  const totais = useMemo(() => ({
    qtdVendas:   linhasFiltradas.reduce((s, l) => s + l.qtdVendas, 0),
    topo:        linhasFiltradas.reduce((s, l) => s + l.topo, 0),
    banderola:   linhasFiltradas.reduce((s, l) => s + l.banderola, 0),
    posterA3:    linhasFiltradas.reduce((s, l) => s + l.posterA3, 0),
    posterA4:    linhasFiltradas.reduce((s, l) => s + l.posterA4, 0),
    caixinha:    linhasFiltradas.reduce((s, l) => s + l.caixinha, 0),
    sacolinha:   linhasFiltradas.reduce((s, l) => s + l.sacolinha, 0),
    naoPers:     linhasFiltradas.reduce((s, l) => s + l.naoPers, 0),
    semCategoria:linhasFiltradas.reduce((s, l) => s + l.semCategoria, 0),
  }), [linhasFiltradas]);

  const totalArtes = totais.topo + totais.banderola + totais.posterA3 + totais.posterA4 +
                     totais.caixinha + totais.sacolinha + totais.naoPers;

  // ── Export CSV ────────────────────────────────────────────────────────────────
  function exportarCSV() {
    const header = "Anuncio,Qtd Vendas,Topo,Banderola,Poster A3,Poster A4,Caixinha,Sacolinha,Nao Pers";
    const rows   = linhasFiltradas.map((l) =>
      `"${l.anuncio.replace(/"/g, '""')}",${l.qtdVendas},${l.topo},${l.banderola},${l.posterA3},${l.posterA4},${l.caixinha},${l.sacolinha},${l.naoPers}`
    );
    const csv  = [header, ...rows].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement("a"), {
      href: url,
      download: `relatorio-${new Date().toISOString().slice(0, 10)}.csv`,
    });
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Helpers de célula ─────────────────────────────────────────────────────────
  function Cel({ v, highlight = false }: { v: number; highlight?: boolean }) {
    if (v === 0) return <td className="px-3 py-2 text-center text-muted-foreground/40 border-r border-border text-sm">—</td>;
    return (
      <td className={`px-3 py-2 text-center border-r border-border text-sm font-semibold ${highlight ? "text-primary" : "text-foreground"}`}>
        {v}
      </td>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-5">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Relatório de Produção</h1>
          <p className="text-sm text-muted-foreground">
            Quantidade de cada peça por anúncio — baseado nos pedidos do dia
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={exportarCSV} disabled={!linhas.length}>
            <Download className="h-4 w-4" /> Exportar CSV
          </Button>
          <Button variant="outline" className="gap-2" onClick={carregar}>
            <RefreshCw className="h-4 w-4" /> Atualizar
          </Button>
        </div>
      </div>

      {/* Estado vazio */}
      {linhas.length === 0 && (
        <Card>
          <CardContent className="p-12 flex flex-col items-center gap-4 text-center">
            <FileBarChart2 className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">Nenhum dado de produção</p>
              <p className="text-sm text-muted-foreground mt-1">
                Importe um relatório e processe os pedidos em <strong>Produção em Massa</strong>.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {linhas.length > 0 && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Anúncios</p>
                <p className="text-2xl font-bold">{linhas.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Total vendido</p>
                <p className="text-2xl font-bold text-primary">{totais.qtdVendas}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Artes a produzir</p>
                <p className="text-2xl font-bold">{totalArtes}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" /> Maior volume
                </p>
                <p className="text-sm font-bold truncate" title={linhas[0]?.anuncio}>
                  {linhas[0]?.anuncio.split(" ").slice(0, 3).join(" ") ?? "—"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Busca */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Filtrar por anúncio..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>

          {/* Tabela estilo Excel */}
          <Card className="overflow-hidden">
            <CardHeader className="pb-0 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold">
                {linhasFiltradas.length} anúncio(s)
                {busca && <span className="text-muted-foreground font-normal"> filtrados</span>}
              </CardTitle>
              {busca && (
                <Badge variant="secondary" className="text-[10px]">{linhasFiltradas.length} de {linhas.length}</Badge>
              )}
            </CardHeader>
            <CardContent className="p-0 mt-3">
              <div className="overflow-x-auto">
                <table ref={tableRef} className="w-full text-sm border-collapse">
                  {/* Cabeçalho fixo */}
                  <thead>
                    <tr className="bg-secondary/60 border-b-2 border-border">
                      <th className="px-3 py-2.5 text-left font-semibold text-xs uppercase tracking-wide text-muted-foreground border-r border-border sticky left-0 bg-secondary/60 min-w-[220px]">
                        Nome do Anúncio
                      </th>
                      <th className="px-3 py-2.5 text-center font-semibold text-xs uppercase tracking-wide text-primary border-r border-border min-w-[90px]">
                        Qtd Vendas
                      </th>
                      <th className="px-3 py-2.5 text-center font-semibold text-xs uppercase tracking-wide text-muted-foreground border-r border-border min-w-[70px]">Topo</th>
                      <th className="px-3 py-2.5 text-center font-semibold text-xs uppercase tracking-wide text-muted-foreground border-r border-border min-w-[90px]">Banderola</th>
                      <th className="px-3 py-2.5 text-center font-semibold text-xs uppercase tracking-wide text-muted-foreground border-r border-border min-w-[80px]">Poster A3</th>
                      <th className="px-3 py-2.5 text-center font-semibold text-xs uppercase tracking-wide text-muted-foreground border-r border-border min-w-[80px]">Poster A4</th>
                      <th className="px-3 py-2.5 text-center font-semibold text-xs uppercase tracking-wide text-muted-foreground border-r border-border min-w-[80px]">Caixinha</th>
                      <th className="px-3 py-2.5 text-center font-semibold text-xs uppercase tracking-wide text-muted-foreground border-r border-border min-w-[85px]">Sacolinha</th>
                      <th className="px-3 py-2.5 text-center font-semibold text-xs uppercase tracking-wide text-muted-foreground min-w-[110px]">Não Pers.</th>
                    </tr>
                  </thead>

                  <tbody>
                    {linhasFiltradas.map((l, idx) => (
                      <tr
                        key={l.anuncio}
                        className={`border-b border-border hover:bg-secondary/30 transition-colors ${idx % 2 === 0 ? "" : "bg-secondary/10"}`}
                      >
                        {/* Nome — fixo à esquerda */}
                        <td className="px-3 py-2 border-r border-border sticky left-0 bg-card font-medium text-sm max-w-[280px]">
                          <span className="block truncate" title={l.anuncio}>{l.anuncio}</span>
                        </td>

                        {/* Qtd Vendas — destaque */}
                        <td className="px-3 py-2 text-center border-r border-border">
                          <span className="text-base font-bold text-primary">{l.qtdVendas}</span>
                        </td>

                        <Cel v={l.topo} />
                        <Cel v={l.banderola} />
                        <Cel v={l.posterA3} />
                        <Cel v={l.posterA4} />
                        <Cel v={l.caixinha} />
                        <Cel v={l.sacolinha} />
                        <Cel v={l.naoPers} />
                      </tr>
                    ))}
                  </tbody>

                  {/* Linha de totais */}
                  <tfoot>
                    <tr className="border-t-2 border-border bg-secondary/50 font-bold">
                      <td className="px-3 py-2.5 border-r border-border sticky left-0 bg-secondary/60 text-xs uppercase tracking-wide text-muted-foreground">
                        TOTAL ({linhasFiltradas.length} anúncios)
                      </td>
                      <td className="px-3 py-2.5 text-center border-r border-border text-primary text-base font-bold">
                        {totais.qtdVendas}
                      </td>
                      {[totais.topo, totais.banderola, totais.posterA3, totais.posterA4,
                        totais.caixinha, totais.sacolinha, totais.naoPers].map((v, i) => (
                        <td key={i} className="px-3 py-2.5 text-center border-r border-border last:border-r-0 text-sm font-bold">
                          {v > 0 ? v : <span className="text-muted-foreground font-normal">—</span>}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
