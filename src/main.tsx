import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { LisaProvider } from "./app/LisaContext";
import "./styles/globals.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LisaProvider>
      <App />
    </LisaProvider>
  </React.StrictMode>
);
