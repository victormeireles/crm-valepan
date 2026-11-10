# Alerta por e-mail: Z-API comercial desconectada

**Data:** 2026-11-10  
**Status:** aprovado para implementação (usuário pediu seguir até implementação)

## Objetivo

Avisar por e-mail quando o número comercial da Z-API desconectar, sem spam enquanto continuar offline.

## Gatilhos

1. Webhook `DisconnectedCallback`
2. Falha de chamada HTTP à Z-API cuja resposta indique instância desconectada
3. Cron `/api/cron/zapi-connection-health` a cada 10 min (`GET /status`); offline → notify, online → clear

## Deduplicação

Só o **primeiro** alerta até reconectar (`ConnectedCallback` ou limpeza equivalente). Estado em `crm.zapi_connection_alerts` com claim atômico via RPC.

## Entrega

- Resend (`RESEND_API_KEY`, `RESEND_FROM_EMAIL` → `RESEND_ERRORS_TO_EMAIL`)
- Módulo `apps/crm/lib/zapi/disconnect-alert.ts`
- Hook no webhook Z-API e nos erros HTTP de `send.ts`
