import { describe, expect, it } from "vitest";
import { lostReasonNamesForSelect, normalizeLostReasonName } from "./lost-reasons";

describe("lost reasons catalog", () => {
  it("normaliza espaços do nome", () => {
    expect(normalizeLostReasonName("  Não   inaugurou ")).toBe("Não inaugurou");
  });

  it("mostra só ativos e preserva o motivo atual mesmo inativo", () => {
    expect(
      lostReasonNamesForSelect(
        [
          { name: "Sem interesse", active: true },
          { name: "Outro", active: false },
          { name: "Não inaugurou", active: true },
        ],
        "Outro",
      ),
    ).toEqual(["Outro", "Sem interesse", "Não inaugurou"]);
  });
});
