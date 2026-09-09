import { describe, expect, it } from "vitest";
import {
  isProtectedRoute,
  requestReturnPath,
  safeAuthenticatedPath,
} from "./session-navigation";

describe("session navigation", () => {
  it("recognizes only protected route boundaries", () => {
    expect(isProtectedRoute("/pipeline")).toBe(true);
    expect(isProtectedRoute("/leads/123")).toBe(true);
    expect(isProtectedRoute("/pipeline-old")).toBe(false);
    expect(isProtectedRoute("/login")).toBe(false);
  });

  it("preserves the selected screen and its query parameters", () => {
    const url = new URL("https://crm.example.com/inbox?tab=groups&cid=conversation-1");
    expect(requestReturnPath(url)).toBe("/inbox?tab=groups&cid=conversation-1");
    expect(safeAuthenticatedPath(requestReturnPath(url))).toBe(
      "/inbox?tab=groups&cid=conversation-1",
    );
  });

  it.each([
    "https://attacker.example/path",
    "//attacker.example/path",
    "/login",
    "",
  ])("rejects an unsafe or looping return path: %s", (candidate) => {
    expect(safeAuthenticatedPath(candidate)).toBe("/dashboard");
  });
});
