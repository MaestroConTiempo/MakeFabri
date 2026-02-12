import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { useEffect } from "react";
import TabBar from "@/components/TabBar";
import HighlightPage from "@/pages/Highlight";
import FogonsPage from "@/pages/Fogons";
import ReflectPage from "@/pages/Reflect";
import SettingsPage from "@/pages/Settings";
import NotFound from "@/pages/NotFound";
import OverdueHighlightPrompt from "@/components/OverdueHighlightPrompt";
import { initializeCloudSync } from "@/lib/storage";

const queryClient = new QueryClient();

const AppShell = () => {
  const location = useLocation();
  const isWideRoute = location.pathname === "/fogons" || location.pathname === "/" || location.pathname === "/reflect";
  const contentWidthClass = isWideRoute
    ? "max-w-md md:max-w-4xl lg:max-w-5xl"
    : "max-w-md";

  useEffect(() => {
    const syncNow = () => {
      void initializeCloudSync(true);
    };

    const intervalId = window.setInterval(syncNow, 20000);
    window.addEventListener("focus", syncNow);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") syncNow();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", syncNow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return (
    <div className={`w-full mx-auto min-h-screen relative ${contentWidthClass}`}>
      <Routes>
        <Route path="/" element={<HighlightPage />} />
        <Route path="/fogons" element={<FogonsPage />} />
        <Route path="/reflect" element={<ReflectPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <OverdueHighlightPrompt />
      <TabBar contentWidthClass={contentWidthClass} />
    </div>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
