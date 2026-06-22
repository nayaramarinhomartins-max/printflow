import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Upload, Layers, Palette, Megaphone,
  FileBarChart2, Printer, Settings, ChevronLeft, ChevronRight,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, useSidebar,
} from "@/components/ui/sidebar";

const items = [
  { title: "Dashboard",         url: "/",               icon: LayoutDashboard },
  { title: "Importar Pedidos",  url: "/importar",       icon: Upload },
  { title: "Produção em Massa", url: "/producao-massa", icon: Layers },
  { title: "Templates",         url: "/templates",      icon: Palette },
  { title: "Anúncios",          url: "/anuncios",       icon: Megaphone },
  { title: "Impressão",         url: "/impressao",      icon: Printer },
  { title: "Relatório",         url: "/historico",      icon: FileBarChart2 },
];

const itemsConfig = [
  { title: "Configurações",     url: "/configuracoes",  icon: Settings },
];

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const isActive = (path: string) => path === "/" ? pathname === "/" : pathname.startsWith(path);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border p-0">
        <div className="flex items-center h-14 px-3 gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg overflow-hidden bg-[hsl(220,45%,14%)]">
            <img src="/logo.svg" alt="Gestão Gráfica" className="h-7 w-7 object-contain" />
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-sm font-bold tracking-tight text-foreground leading-tight">Gestão Gráfica</span>
              <span className="text-[10px] text-muted-foreground">Produção gráfica</span>
            </div>
          )}
          <button
            onClick={toggleSidebar}
            className="shrink-0 h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-sidebar-accent rounded-md transition-colors"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Produção</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <NavLink to={item.url} className="flex items-center gap-2">
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              {itemsConfig.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <NavLink to={item.url} className="flex items-center gap-2">
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
