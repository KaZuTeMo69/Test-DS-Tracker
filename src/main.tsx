import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import L from "leaflet";
import App from "./App.tsx";
import "./index.css";

// Expose Leaflet globally for the Leaflet Routing Machine script CDN
(window as any).L = L;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
