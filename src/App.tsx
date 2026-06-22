import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "./components/layout/AppLayout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Importar from "./pages/Importar";
import Producao from "./pages/Producao";
import ProducaoEmMassa from "./pages/ProducaoEmMassa";
import Templates from "./pages/Templates";
import Anuncios from "./pages/Anuncios";
import Historico from "./pages/Historico";
import Impressao from "./pages/Impressao";
import Configuracoes from "./pages/Configuracoes";
import AceitarConvite from "./pages/AceitarConvite";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/convite" element={<AceitarConvite />} />
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<Dashboard />} />
              <Route path="/importar" element={<Importar />} />
              <Route path="/producao" element={<Producao />} />
              <Route path="/producao-massa" element={<ProducaoEmMassa />} />
              <Route path="/templates" element={<Templates />} />
              <Route path="/anuncios" element={<Anuncios />} />
              <Route path="/impressao" element={<Impressao />} />
              <Route path="/historico" element={<Historico />} />
              <Route path="/configuracoes" element={<Configuracoes />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
