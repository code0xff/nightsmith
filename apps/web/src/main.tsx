import React from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";
import { App } from "@/App";
import { ThemedToaster } from "@/components/ThemedToaster";
import "@/index.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <React.StrictMode>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <App />
      <ThemedToaster />
    </ThemeProvider>
  </React.StrictMode>,
);
