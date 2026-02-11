import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initializeCloudSync } from "./lib/storage.ts";

async function bootstrap() {
  await initializeCloudSync();
  createRoot(document.getElementById("root")!).render(<App />);
}

void bootstrap();
