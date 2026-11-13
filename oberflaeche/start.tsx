// Einstieg der Oberfläche
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Anwendung } from "./Anwendung.tsx";
import "./stil.css";

createRoot(document.getElementById("anwendung")!).render(
  <StrictMode>
    <Anwendung />
  </StrictMode>,
);
