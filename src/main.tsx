import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import App from "./App.tsx";
import "./index.css";
import { initializeCloudSync } from "./lib/storage.ts";

function InitialLoader() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background text-foreground">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 rounded-full border-4 border-primary/40 border-t-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Cargando datos...</p>
      </div>
    </div>
  );
}

function BootstrapApp() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void initializeCloudSync()
      .catch(() => {
        // Even if sync fails, we still let the app render with local data.
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) return <InitialLoader />;
  return <App />;
}

createRoot(document.getElementById("root")!).render(<BootstrapApp />);
