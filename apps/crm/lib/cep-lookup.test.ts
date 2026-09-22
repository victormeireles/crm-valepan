import { describe, expect, it, vi } from "vitest";
import { lookupCep, parseLeadAddress } from "./cep-lookup";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("parseLeadAddress", () => {
  it("mantém CEP, logradouro, bairro, cidade e UF normalizados", () => {
    expect(parseLeadAddress({
      zipCode: "01310-100",
      street: "  Avenida Paulista ",
      neighborhood: "Bela Vista",
      city: "São Paulo",
      state: "sp",
    })).toEqual({
      ok: true,
      address: {
        zipCode: "01310100",
        street: "Avenida Paulista",
        neighborhood: "Bela Vista",
        city: "São Paulo",
        state: "SP",
      },
    });
  });

  it("recusa CEP incompleto e UF inválida", () => {
    expect(parseLeadAddress({ zipCode: "123" }).ok).toBe(false);
    expect(parseLeadAddress({ zipCode: "00000000" }).ok).toBe(false);
    expect(parseLeadAddress({ state: "São Paulo" }).ok).toBe(false);
  });
});

describe("lookupCep", () => {
  it("consulta a ViaCEP só com os números do CEP", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      cep: "01001-000",
      logradouro: "Praça da Sé",
      bairro: "Sé",
      localidade: "São Paulo",
      uf: "SP",
    }));

    const result = await lookupCep("01001-000", fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://viacep.com.br/ws/01001000/json/",
      expect.objectContaining({ headers: { accept: "application/json" } }),
    );
    expect(result).toEqual({
      ok: true,
      address: {
        zipCode: "01001000",
        street: "Praça da Sé",
        neighborhood: "Sé",
        city: "São Paulo",
        state: "SP",
      },
    });
  });

  it("aceita logradouro vazio e trata CEP inexistente", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ localidade: "Rio de Janeiro", uf: "RJ", logradouro: "", bairro: "" }))
      .mockResolvedValueOnce(jsonResponse({ erro: true }));

    await expect(lookupCep("20040002", fetchImpl)).resolves.toMatchObject({
      ok: true,
      address: { street: null, neighborhood: null, city: "Rio de Janeiro", state: "RJ" },
    });
    await expect(lookupCep("12345678", fetchImpl)).resolves.toEqual({
      ok: false,
      error: "CEP não encontrado.",
    });
  });

  it("não chama a API quando o CEP é inválido", async () => {
    const fetchImpl = vi.fn();
    await expect(lookupCep("123", fetchImpl)).resolves.toMatchObject({ ok: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
