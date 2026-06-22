import { Outlet, useLocation } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";

const ROUTE_LABELS: Record<string, string> = {
  "/":               "Dashboard",
  "/importar":       "Importar Pedidos",
  "/producao":       "Produção",
  "/producao-massa": "Produção em Massa",
  "/templates":      "Templates",
  "/anuncios":       "Anúncios",
  "/impressao":      "Impressão",
  "/historico":      "Relatório",
  "/configuracoes":  "Configurações",
};

function getPageLabel(pathname: string): string {
  return ROUTE_LABELS[pathname] ?? ROUTE_LABELS[Object.keys(ROUTE_LABELS).find((k) => k !== "/" && pathname.startsWith(k)) ?? ""] ?? "Gestão Gráfica";
}

function getDataFormatada(): string {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long", day: "2-digit", month: "long",
  }).format(new Date());
}

export default function AppLayout() {
  const { pathname } = useLocation();
  const pageLabel = getPageLabel(pathname);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center justify-between border-b border-border px-4 bg-card/50 backdrop-blur shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-sm">
                <span className="text-muted-foreground hidden sm:block">Gestão Gráfica</span>
                <span className="text-muted-foreground hidden sm:block">/</span>
                <span className="font-medium text-foreground">{pageLabel}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground capitalize hidden md:block">
                {getDataFormatada()}
              </span>
            </div>
          </header>
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
