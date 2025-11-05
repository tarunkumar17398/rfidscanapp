import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ScannerProvider } from "./contexts/ScannerContext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import ImportInventory from "./pages/ImportInventory";
import LiveScans from "./pages/LiveScans";
import MissingItems from "./pages/MissingItems";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <ScannerProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter basename="/rfidscanapp">
          <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/import" element={<ImportInventory />} />
            <Route path="/live-scans" element={<LiveScans />} />
            <Route path="/missing" element={<MissingItems />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </ScannerProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
