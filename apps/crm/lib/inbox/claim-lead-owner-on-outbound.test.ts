import { describe, expect, it } from "vitest";
import {
  claimLeadOwnerOnOutbound,
  type ClaimLeadOwnerCrm,
} from "./claim-lead-owner-on-outbound";

type SoftClaimCall = {
  table: "leads" | "opportunities";
  payload: { owner_id: string; updated_at: string };
  eq: { column: string; value: string };
  is: { column: string; value: null };
};

function createMockCrm(options?: {
  leadError?: string | null;
  opportunityError?: string | null;
}): { crm: ClaimLeadOwnerCrm; calls: SoftClaimCall[] } {
  const calls: SoftClaimCall[] = [];
  const crm: ClaimLeadOwnerCrm = {
    from(table) {
      return {
        update(payload) {
          return {
            eq(column, value) {
              return {
                is(isColumn, isValue) {
                  calls.push({
                    table,
                    payload,
                    eq: { column, value },
                    is: { column: isColumn, value: isValue },
                  });
                  const errorMessage =
                    table === "leads" ? options?.leadError : options?.opportunityError;
                  return Promise.resolve({
                    error: errorMessage ? { message: errorMessage } : null,
                  });
                },
              };
            },
          };
        },
      };
    },
  };
  return { crm, calls };
}

describe("claimLeadOwnerOnOutbound", () => {
  it("faz soft-claim do lead e das oportunidades sem dono", async () => {
    const { crm, calls } = createMockCrm();
    const result = await claimLeadOwnerOnOutbound(crm, {
      leadId: "lead-1",
      userId: "user-1",
    });

    expect(result).toEqual({ ok: true });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
      table: "leads",
      payload: { owner_id: "user-1" },
      eq: { column: "id", value: "lead-1" },
      is: { column: "owner_id", value: null },
    });
    expect(calls[1]).toMatchObject({
      table: "opportunities",
      payload: { owner_id: "user-1" },
      eq: { column: "lead_id", value: "lead-1" },
      is: { column: "owner_id", value: null },
    });
    expect(calls[0]?.payload.updated_at).toEqual(calls[1]?.payload.updated_at);
  });

  it("não sobrescreve owner existente (filtro owner_id IS NULL)", async () => {
    const { crm, calls } = createMockCrm();
    await claimLeadOwnerOnOutbound(crm, {
      leadId: "lead-owned",
      userId: "user-2",
    });

    expect(calls.every((call) => call.is.column === "owner_id" && call.is.value === null)).toBe(
      true,
    );
  });

  it("rejeita ids vazios sem chamar o banco", async () => {
    const { crm, calls } = createMockCrm();
    const result = await claimLeadOwnerOnOutbound(crm, {
      leadId: "  ",
      userId: "user-1",
    });

    expect(result).toEqual({
      ok: false,
      error: "Dados incompletos para atribuir responsável.",
    });
    expect(calls).toHaveLength(0);
  });

  it("propaga erro do update do lead", async () => {
    const { crm } = createMockCrm({ leadError: "rls denied" });
    const result = await claimLeadOwnerOnOutbound(crm, {
      leadId: "lead-1",
      userId: "user-1",
    });

    expect(result).toEqual({ ok: false, error: "rls denied" });
  });

  it("propaga erro do update das oportunidades", async () => {
    const { crm } = createMockCrm({ opportunityError: "opp failed" });
    const result = await claimLeadOwnerOnOutbound(crm, {
      leadId: "lead-1",
      userId: "user-1",
    });

    expect(result).toEqual({ ok: false, error: "opp failed" });
  });
});
