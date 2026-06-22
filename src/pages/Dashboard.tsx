import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Package, CheckCircle2, Clock, Download, AlertTriangle, TrendingUp,
  Upload, Layers, Palette, Megaphone, ArrowRight,
} from "lucide-react";
import { TourGuide } from "@/components/TourGuide";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import {
  getItensProducao, getOrders, getAnuncios, getTemplates, getCategorias,
  type ItemProducao,
} from "@/lib/store";

export default function Dashboard() {
  const [itens, setItens]         = useState<ItemProducao[]>([]);
  const [totalPedidos, setTotalPedidos] = useState(0);
  const [semVinculo, setSemVinculo]     = useState(0);
  const [totalTemplates, setTotalTemplates] = useState(0);

  useEffect(() => {
    setItens(getItensProducao());
    setTotalPedidos(getOrders().length);
    setTotalTemplates(getTemplates().length);
    const anuncios = getAnuncios();
    setSemVinculo(anuncios.filter((a) => !a.templateId).length);
  }, []);

  const stats = useMemo(() => ({
    total:    itens.length,
    gerados:  itens.filter((i) => i.status === "gerado" || i.status === "baixado").length,
    pendentes:itens.filter((i) => i.status === "pendente").length,
    baixados: itens.filter((i) => i.status === "baixado").length,
  }), [itens]);

  const categorias = getCategorias();
  const porCategoria = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of itens) {
      const cat = categorias.find((c) => c.id === item.categoriaId);
      const nome = cat?.nome ?? item.categoriaId;
      map.set(nome, (map.get(nome) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, v }))
      .sort((a, b) => b.v - a.v);
  }, [itens, categorias]);

  const alertas: string[] = [];
  if (semVinculo > 0) alertas.push(`${semVinculo} anúncio(s) sem template vinculado`);
  if (stats.pendentes > 0) alertas.push(`${stats.pendentes} arte(s) pendente(s) de geração`);

  const statsCards = [
    { label: "Pedidos importados", value: totalPedidos, icon: Package },
    { label: "Artes geradas",      value: stats.gerados, icon: CheckCircle2 },
    { label: "Pendentes",          value: stats.pendentes, icon: Clock },
    { label: "Baixados",           value: stats.baixados, icon: Download },
  ];

  // Guia de início rápido — mostra até que tudo esteja configurado
  const primeiroUso = totalPedidos === 0 && totalTemplates === 0;
  const passos = [
    {
      num: 1,
      label: "Criar templates",
      desc: "Cadastre os temas e suas artes",
      url: "/templates",
      icon: Palette,
      feito: totalTemplates > 0,
    },
    {
      num: 2,
      label: "Vincular anúncios",
      desc: "Ligue cada produto Shopee a um tema",
      url: "/anuncios",
      icon: Megaphone,
      feito: semVinculo === 0 && getAnuncios().length > 0,
    },
    {
      num: 3,
      label: "Importar pedidos",
      desc: "Suba o relatório CSV/XLSX da Shopee",
      url: "/importar",
      icon: Upload,
      feito: totalPedidos > 0,
    },
    {
      num: 4,
      label: "Produzir",
      desc: "Gere as artes e baixe os PDFs",
      url: "/producao-massa",
      icon: Layers,
      feito: stats.gerados > 0,
    },
  ];

  const todosFeitos = passos.every((p) => p.feito);

  const tourSteps = [
    {
      title: "Bem-vindo ao Gestão Gráfica",
      description: "Este é o painel principal do sistema. Aqui você acompanha o status geral da produção. Use o botão <b>?</b> (canto superior direito desta janela) sempre que quiser rever o guia.",
    },
    {
      element: "[data-tour='dashboard-setup']",
      title: "Checklist de configuração",
      description: "Siga estes 4 passos para configurar o sistema pela primeira vez: importe pedidos, vincule anúncios, crie templates e configure as categorias.",
      side: "bottom" as const,
    },
    {
      element: "[data-tour='dashboard-stats']",
      title: "Resumo de produção",
      description: "Aqui você vê em tempo real: total de pedidos importados, artes pendentes, artes geradas e itens já impressos.",
      side: "bottom" as const,
    },
    {
      element: "[data-tour='dashboard-chart']",
      title: "Gráfico por categoria",
      description: "Distribuição das artes pelas categorias de produto (banderola, poster, etc.). Clique em qualquer barra para ir direto à produção daquela categoria.",
      side: "top" as const,
    },
    {
      element: "[data-tour='dashboard-alertas']",
      title: "Alertas e atalhos",
      description: "Aqui aparecem avisos importantes (ex: produtos sem template vinculado). Os atalhos abaixo levam direto para as seções mais usadas do sistema.",
      side: "left" as const,
    },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Visão geral da produção</p>
        </div>
        <TourGuide pageKey="dashboard" steps={tourSteps} />
      </div>

      {/* Guia de início — some quando tudo estiver feito */}
      {!todosFeitos && (
        <Card data-tour="dashboard-setup" className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {primeiroUso ? "Bem-vindo ao Gestão Gráfica — configure em 4 passos" : "Configure antes de produzir"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {passos.map((p) => (
                <Link key={p.num} to={p.url}>
                  <div className={`flex items-center gap-3 rounded-lg border p-3 transition-colors hover:border-primary/50 cursor-pointer ${
                    p.feito ? "border-[hsl(var(--success)/0.4)] bg-[hsl(var(--success)/0.06)]" : "border-border bg-secondary/30"
                  }`}>
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      p.feito ? "bg-[hsl(var(--success)/0.2)]" : "bg-secondary"
                    }`}>
                      {p.feito
                        ? <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
                        : <p.icon className="h-4 w-4 text-muted-foreground" />
                      }
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{p.num}. {p.label}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{p.desc}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cards de métricas */}
      <div data-tour="dashboard-stats" className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {statsCards.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{s.label}</span>
                <s.icon className="h-4 w-4 text-primary" />
              </div>
              <div className="mt-2 text-3xl font-bold">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Gráfico por categoria */}
        <Card data-tour="dashboard-chart" className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" /> Artes por categoria
            </CardTitle>
            <Badge variant="secondary">{itens.length} total</Badge>
          </CardHeader>
          <CardContent className="h-64">
            {porCategoria.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
                <TrendingUp className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">Nenhum dado ainda — importe um relatório e processe os pedidos</p>
                <Button asChild size="sm" variant="outline" className="gap-2">
                  <Link to="/importar">
                    <Upload className="h-3.5 w-3.5" /> Importar agora <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={porCategoria}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                    cursor={{ fill: "hsl(var(--muted))" }}
                  />
                  <Bar dataKey="v" name="Artes" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Alertas */}
        <Card data-tour="dashboard-alertas">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-[hsl(var(--warning))]" /> Alertas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {alertas.length === 0 ? (
              <div className="flex items-center gap-2 rounded-md border border-[hsl(var(--success)/0.4)] p-3 bg-[hsl(var(--success)/0.06)]">
                <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
                <span className="text-sm">Tudo em ordem!</span>
              </div>
            ) : (
              alertas.map((a) => (
                <div key={a} className="flex items-start gap-3 rounded-md border border-[hsl(var(--warning)/0.4)] p-3 bg-[hsl(var(--warning)/0.06)]">
                  <AlertTriangle className="h-4 w-4 text-[hsl(var(--warning))] mt-0.5 shrink-0" />
                  <span className="text-sm">{a}</span>
                </div>
              ))
            )}

            {/* Atalhos rápidos */}
            <div className="pt-2 space-y-1.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Atalhos</p>
              {[
                { label: "Importar pedidos",  url: "/importar",       icon: Upload },
                { label: "Produção em Massa", url: "/producao-massa", icon: Layers },
                { label: "Impressão",         url: "/impressao",      icon: Download },
              ].map((a) => (
                <Link key={a.url} to={a.url} className="flex items-center gap-2 rounded-md p-2 text-sm hover:bg-secondary transition-colors">
                  <a.icon className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span>{a.label}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground ml-auto" />
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
