import { describe, expect, it } from "vitest";
import { INBOX_CLASSIFICATION_OPTIONS, isInboxClassification } from "./inbox-classifications";

describe("inbox classifications", () => {
  it("mantém as novas classificações no fim do seletor", () => {
    expect(INBOX_CLASSIFICATION_OPTIONS.slice(-3)).toEqual([
      "JÁ É CLIENTE",
      "NÃO INAUGUROU",
      "SEM PEDIDO MÍNIMO",
    ]);
  });

  it.each(["JÁ É CLIENTE", "NÃO INAUGUROU", "SEM PEDIDO MÍNIMO"])(
    "aceita %s como classificação",
    (classification) => {
      expect(isInboxClassification(classification)).toBe(true);
    },
  );
});
