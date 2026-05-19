/**
 * Verifica se o servidor de desenvolvimento está a responder na porta 3000.
 */
const http = require("http");

const url = "http://127.0.0.1:3000/";

const req = http.get(url, (res) => {
  res.resume();
  console.log(`[dev:check] OK — servidor ativo (HTTP ${res.statusCode}).`);
  console.log(`[dev:check] Abra: http://127.0.0.1:3000/dashboard`);
  process.exit(0);
});

req.on("error", () => {
  console.error(
    "[dev:check] Servidor NÃO está a correr na porta 3000.\n" +
      "   Na pasta do projeto execute: npm run dev\n" +
      "   Ou duplo clique em dev.bat — e deixe a janela aberta até ver 'Ready'.",
  );
  process.exit(1);
});

req.setTimeout(3000, () => {
  req.destroy();
  console.error("[dev:check] Timeout — nada responde em 127.0.0.1:3000.");
  process.exit(1);
});
