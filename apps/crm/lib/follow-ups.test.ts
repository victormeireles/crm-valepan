import { describe, expect, it } from "vitest";
import { indexFollowUpsByLead, toFollowUpDTO } from "./follow-ups";

describe("toFollowUpDTO", () => {
  it("só cria um follow-up quando existe prazo", () => {
    expect(toFollowUpDTO({
      id: "follow-up-1",
      title: "Ligar para confirmar o pedido",
      due_at: "2026-09-08T12:00:00.000Z",
      assignee_id: "user-1",
    })).toEqual({
      id: "follow-up-1",
      title: "Ligar para confirmar o pedido",
      due_at: "2026-09-08T12:00:00.000Z",
      assignee_id: "user-1",
    });

    expect(toFollowUpDTO({
      id: "follow-up-2",
      title: "Sem data",
      due_at: null,
      assignee_id: null,
    })).toBeNull();
  });
});

describe("indexFollowUpsByLead", () => {
  it("mantém um único follow-up por lead e ignora registros sem vínculo", () => {
    const indexed = indexFollowUpsByLead([
      {
        id: "follow-up-1",
        lead_id: "lead-1",
        title: "Primeiro",
        due_at: "2026-09-08T12:00:00.000Z",
        assignee_id: null,
      },
      {
        id: "follow-up-2",
        lead_id: "lead-1",
        title: "Duplicado",
        due_at: "2026-09-09T12:00:00.000Z",
        assignee_id: null,
      },
      {
        id: "follow-up-3",
        lead_id: null,
        title: "Sem lead",
        due_at: "2026-09-10T12:00:00.000Z",
        assignee_id: null,
      },
    ]);

    expect([...indexed.entries()]).toEqual([
      ["lead-1", {
        id: "follow-up-1",
        title: "Primeiro",
        due_at: "2026-09-08T12:00:00.000Z",
        assignee_id: null,
      }],
    ]);
  });
});
