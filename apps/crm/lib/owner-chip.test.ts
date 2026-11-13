import { describe, expect, it } from "vitest";
import { OWNER_CHIP_PALETTE, ownerChipColor, ownerInitial } from "./owner-chip";

describe("owner-chip", () => {
  it("returns a stable palette color for the same owner id", () => {
    const id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    expect(ownerChipColor(id)).toEqual(ownerChipColor(id));
    expect(OWNER_CHIP_PALETTE).toContainEqual(ownerChipColor(id));
  });

  it("picks the first alphanumeric initial", () => {
    expect(ownerInitial("Maria Silva")).toBe("M");
    expect(ownerInitial("  joão")).toBe("J");
    expect(ownerInitial("")).toBe("?");
  });
});
