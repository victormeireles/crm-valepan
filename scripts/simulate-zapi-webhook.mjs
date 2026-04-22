/**
 * Testa o endpoint local do webhook com payloads parecidos com a Z-API.
 * Uso (na raiz do repo, com o Next rodando):
 *   node scripts/simulate-zapi-webhook.mjs https://SEU-NGROK.ngrok-free.dev/api/webhooks/zapi 5511999999999
 *
 * Opcional: defina ZAPI_WEBHOOK_SECRET no ambiente se o endpoint exigir o header.
 */
const url = process.argv[2];
const phone = process.argv[3] ?? "5511999999999";

if (!url) {
  console.error(
    "Uso: node scripts/simulate-zapi-webhook.mjs <URL do webhook> [DDD+número, só dígitos]",
  );
  process.exit(1);
}

const secret = process.env.ZAPI_WEBHOOK_SECRET;

async function post(label, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { "x-zapi-secret": secret } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log(`\n--- ${label} ---\nHTTP ${res.status}\n${text}`);
}

const mid = `TEST-${Date.now()}`;

await post("DeliveryCallback (confirmação de envio — sem texto)", {
  type: "DeliveryCallback",
  phone,
  messageId: mid,
  zaapId: mid,
  instanceId: "test-instance",
});

await post("ReceivedCallback (mensagem enviada por você — com texto)", {
  type: "ReceivedCallback",
  phone,
  fromMe: true,
  messageId: `${mid}-recv`,
  momment: Date.now(),
  text: { message: "Teste de envio simulado pelo script" },
});

await post("ReceivedCallback (cliente)", {
  type: "ReceivedCallback",
  phone,
  fromMe: false,
  messageId: `${mid}-in`,
  momment: Date.now(),
  text: { message: "Resposta do cliente (teste)" },
});
