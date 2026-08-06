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

await post("ReceivedCallback (áudio do cliente)", {
  type: "ReceivedCallback",
  phone,
  fromMe: false,
  messageId: `${mid}-audio`,
  momment: Date.now(),
  audio: {
    audioUrl: "https://example.com/audio-test.ogg",
    mimeType: "audio/ogg; codecs=opus",
    viewOnce: false,
  },
});

await post("ReceivedCallback (contato compartilhado)", {
  type: "ReceivedCallback",
  phone,
  fromMe: true,
  messageId: `${mid}-contact`,
  momment: Date.now(),
  contact: {
    displayName: "Dani Top Alto",
    vCard: "BEGIN:VCARD\nVERSION:3.0\nFN:Dani Top Alto\nTEL;type=CELL;waid=5522999999999:+55 22 99999-9999\nEND:VCARD",
    phones: ["5522999999999"],
  },
});

await post("ReceivedCallback (figurinha)", {
  type: "ReceivedCallback",
  phone,
  fromMe: false,
  messageId: `${mid}-sticker`,
  momment: Date.now(),
  sticker: {
    stickerUrl: "https://www.gstatic.com/webp/gallery/1.webp",
    mimeType: "image/webp",
  },
});
