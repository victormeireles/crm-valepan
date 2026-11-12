import { describe, expect, it } from "vitest";
import { isInboxSearchQuery, isPhoneSearchQuery } from "./phone-search-query";

describe("isPhoneSearchQuery", () => {
  it.each(["11999999999", "+55 (11) 99999-9999", "9999", "11 9999.9999"])(
    "reconhece uma busca de telefone: %s",
    (query) => expect(isPhoneSearchQuery(query)).toBe(true),
  );

  it.each(["", "123", "Padaria 11999999999", "cliente@example.com"])(
    "não confunde texto com telefone: %s",
    (query) => expect(isPhoneSearchQuery(query)).toBe(false),
  );
});

describe("isInboxSearchQuery", () => {
  it.each(["An", "Ana", "11999999999", "9999"])(
    "ativa busca no inbox: %s",
    (query) => expect(isInboxSearchQuery(query)).toBe(true),
  );

  it.each(["", " ", "A"])(
    "ignora query curta demais: %s",
    (query) => expect(isInboxSearchQuery(query)).toBe(false),
  );
});
