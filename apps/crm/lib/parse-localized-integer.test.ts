import { describe, expect, it } from "vitest";
import { formatLocalizedInteger, parseNullableNonNegativeInt } from "./parse-localized-integer";

describe("parseNullableNonNegativeInt", () => {
  it("accepts plain digits", () => {
    expect(parseNullableNonNegativeInt("40000")).toEqual({ ok: true, value: 40000 });
  });

  it("accepts Brazilian thousands with dot", () => {
    expect(parseNullableNonNegativeInt("40.000")).toEqual({ ok: true, value: 40000 });
    expect(parseNullableNonNegativeInt("1.234.567")).toEqual({ ok: true, value: 1234567 });
  });

  it("accepts gram suffix", () => {
    expect(parseNullableNonNegativeInt("30g", { allowUnitSuffix: true })).toEqual({
      ok: true,
      value: 30,
    });
  });

  it("rejects empty as null", () => {
    expect(parseNullableNonNegativeInt("")).toEqual({ ok: true, value: null });
  });

  it("rejects invalid text", () => {
    expect(parseNullableNonNegativeInt("abc").ok).toBe(false);
  });
});

describe("formatLocalizedInteger", () => {
  it("formats with pt-BR grouping", () => {
    expect(formatLocalizedInteger(40000)).toBe("40.000");
  });
});
