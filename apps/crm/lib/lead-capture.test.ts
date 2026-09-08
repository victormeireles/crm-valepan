import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { formatCapturePhone, formatCaptureZip, leadCaptureSchema } from "./lead-capture";
import { formatCpfCnpj, isValidCpfCnpj } from "./cpf-cnpj";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({}),
  crmTables: () => ({ rpc }),
}));
import { POST } from "@/app/api/cadastro/ifood/route";

const valid = { name: "  Ana  Souza ", phone: "(11) 98765-4321", clientType: "hamburgueria", zipCode: "01310-100" };
const request = (body: unknown, headers: Record<string, string> = {}) => new Request("https://crm.example/cadastro", {
  method: "POST", headers: { origin: "https://crm.example", "content-type": "application/json", ...headers },
  body: JSON.stringify(body),
});

beforeEach(() => { rpc.mockReset().mockResolvedValue({ data: { ok: true }, error: null }); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only-service-secret"); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("validação do formulário", () => {
  it.each(["529.982.247-25", "11.222.333/0001-81", "12.ABC.345/01DE-35"])("aceita CPF/CNPJ válido: %s", (document) => {
    expect(isValidCpfCnpj(document)).toBe(true);
    expect(leadCaptureSchema.safeParse({ ...valid, document }).success).toBe(true);
  });
  it.each(["111.111.111-11", "00000000000000", "52998224724", "11222333000180", "12ABC34501DE34", "12ABC34501DE3A", "123", "#52998224725"])("recusa documento inválido: %s", (document) => {
    expect(leadCaptureSchema.safeParse({ ...valid, document }).success).toBe(false);
  });
  it("mantém CPF/CNPJ opcional e normaliza letras e pontuação", () => {
    expect(leadCaptureSchema.safeParse(valid).success).toBe(true);
    expect(leadCaptureSchema.safeParse({ ...valid, document: "" }).success).toBe(true);
    expect(leadCaptureSchema.parse({ ...valid, document: "12.abc.345/01de-35" }).document).toBe("12ABC34501DE35");
    expect(formatCpfCnpj("52998224725")).toBe("529.982.247-25");
    expect(formatCpfCnpj("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatCpfCnpj("12abc34501de35")).toBe("12.ABC.345/01DE-35");
  });
  it("normaliza nome, telefone brasileiro e CEP", () => {
    expect(leadCaptureSchema.parse(valid)).toMatchObject({ name: "Ana Souza", phone: "+5511987654321", zipCode: "01310100" });
    expect(leadCaptureSchema.parse({ ...valid, phone: "+55 21 2345-6789", clientType: "distribuidor" }).phone).toBe("+552123456789");
  });
  it.each([
    { phone: "(20) 98765-4321" }, { phone: "(11) 12345-6789" }, { phone: "(11) 99999-9999" },
    { phone: "111" }, { zipCode: "00000000" }, { zipCode: "12345" }, { name: " " },
    { clientType: "parceiros" }, { source: "manual" },
  ])("recusa dados inválidos ou origem manipulada: %j", (patch) => {
    expect(leadCaptureSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
  it("formata colagem de telefone com +55 e CEP sem eliminar zeros iniciais", () => {
    expect(formatCapturePhone("+55 11 98765-4321")).toBe("(11) 98765-4321");
    expect(formatCapturePhone("1123456789")).toBe("(11) 2345-6789");
    expect(formatCaptureZip("01310100")).toBe("01310-100");
  });
});

describe("endpoint público", () => {
  it("envia o CPF/CNPJ normalizado ao banco e não o expõe na resposta", async () => {
    const response = await POST(request({ ...valid, document: "529.982.247-25" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("register_public_lead", expect.objectContaining({ p_document: "52998224725" }));
  });
  it("não grava CPF/CNPJ com dígitos verificadores incorretos", async () => {
    const response = await POST(request({ ...valid, document: "529.982.247-24" }));
    expect(response.status).toBe(400);
    expect((await response.json()).fields.document).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("fixa campanha e aviso no servidor, sem expor o lead ou segredo", async () => {
    const response = await POST(request(valid));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("register_public_lead", expect.objectContaining({
      p_source: "ifood_event", p_phone: "+5511987654321", p_name: "Ana Souza",
      p_notice_version: "2026-09-07", p_request_key: expect.stringMatching(/^[a-f0-9]{64}$/),
    }));
  });
  it("valida antes de gravar", async () => {
    const response = await POST(request({ ...valid, phone: "123" }));
    expect(response.status).toBe(400);
    expect((await response.json()).fields.phone).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rejeita origem externa e formatos não suportados", async () => {
    expect((await POST(request(valid, { origin: "https://outside.example" }))).status).toBe(403);
    expect((await POST(request(valid, { "content-type": "text/plain" }))).status).toBe(415);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("aceita endereço público no Host quando o Next usa URL interna", async () => {
    const response = await POST(new Request("http://localhost:3002/api/cadastro/ifood", {
      method: "POST", headers: { origin: "http://127.0.0.1:3002", host: "127.0.0.1:3002", "content-type": "application/json" },
      body: JSON.stringify(valid),
    }));
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("rejeita domínio parecido e origem ausente mesmo com Host válido", async () => {
    expect((await POST(request(valid, { host: "crm.example", origin: "https://crm.example.evil.test" }))).status).toBe(403);
    expect((await POST(request(valid, { host: "crm.example", origin: "null" }))).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("limita corpo mesmo sem content-length", async () => {
    expect((await POST(request({ ...valid, name: "a".repeat(5000) }))).status).toBe(413);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("descarta preenchimento do campo anti-spam", async () => {
    expect((await POST(request({ ...valid, website: "spam.example" }))).status).toBe(200);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("retorna erro seguro e nunca confirma gravação que falhou", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValue({ error: { code: "P0001", message: "private database detail" } });
    const response = await POST(request(valid));
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(JSON.stringify(body)).not.toContain("private database detail");
  });
  it("informa espera ao atingir limite compartilhado", async () => {
    rpc.mockResolvedValue({ error: { code: "P0429" } });
    const response = await POST(request(valid));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
  });
});
