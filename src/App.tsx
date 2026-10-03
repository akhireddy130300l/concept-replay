import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Portfolio from "./pages/Portfolio";
import Speaking from "./pages/Speaking";
import StockInsight from "./pages/StockInsight";
import MLTraining from "./pages/MLTraining";
import AmericanShadow from "./pages/AmericanShadow";
import NotFound from "./pages/NotFound";

const FEATURE_PORTFOLIO_AGENT = String(import.meta.env.VITE_FEATURE_PORTFOLIO_AGENT ?? "").toLowerCase() === "true";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/dashboard" element={<Dashboard />} />
          {FEATURE_PORTFOLIO_AGENT && <Route path="/portfolio" element={<Portfolio />} />}
          <Route path="/speaking-gym" element={<Speaking />} />
          <Route path="/stock-insight" element={<StockInsight />} />
          <Route path="/ml-training" element={<MLTraining />} />
          <Route path="/american-shadow" element={<AmericanShadow />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
