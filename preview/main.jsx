import React from "react";
import ReactDOM from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import Landing from "../src/pages/Landing";
import "../src/styles.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <MemoryRouter><Landing /></MemoryRouter>
);
