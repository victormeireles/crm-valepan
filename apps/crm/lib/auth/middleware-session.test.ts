import { AuthRetryableFetchError } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => ({
  getClaims: vi.fn(),
  renewedCookies: [] as { name: string; value: string; options?: Record<string, unknown> }[],
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _key: string,
    options: {
      cookies: {
        setAll: (
          cookies: { name: string; value: string; options?: Record<string, unknown> }[],
        ) => void;
      };
    },
  ) => ({
    auth: {
      getClaims: async () => {
        if (authMock.renewedCookies.length > 0) {
          options.cookies.setAll(authMock.renewedCookies);
        }
        return authMock.getClaims();
      },
    },
  }),
}));

import { middleware } from "../../middleware";

describe("middleware session continuity", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    authMock.renewedCookies = [];
    authMock.getClaims.mockReset();
  });

  it("renews cookies while keeping an authenticated protected route", async () => {
    authMock.getClaims.mockResolvedValue({
      data: { claims: { sub: "user-1" } },
      error: null,
    });
    authMock.renewedCookies = [
      { name: "sb-project-auth-token", value: "renewed", options: { path: "/" } },
    ];

    const response = await middleware(
      new NextRequest("https://crm.example.com/pipeline?owner=user-1"),
    );

    expect(response.headers.get("location")).toBeNull();
    expect(response.cookies.get("sb-project-auth-token")?.value).toBe("renewed");
  });

  it("preserves the full selected route if login is actually required", async () => {
    authMock.getClaims.mockResolvedValue({ data: null, error: null });

    const response = await middleware(
      new NextRequest("https://crm.example.com/inbox?tab=groups&cid=conversation-1"),
    );
    const location = new URL(response.headers.get("location") ?? "");

    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe(
      "/inbox?tab=groups&cid=conversation-1",
    );
  });

  it("returns from login to the selected route and carries renewed cookies", async () => {
    authMock.getClaims.mockResolvedValue({
      data: { claims: { sub: "user-1" } },
      error: null,
    });
    authMock.renewedCookies = [
      { name: "sb-project-auth-token", value: "renewed", options: { path: "/" } },
    ];

    const response = await middleware(
      new NextRequest(
        "https://crm.example.com/login?next=%2Finbox%3Ftab%3Dpipeline%26cid%3Dconversation-2",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "https://crm.example.com/inbox?tab=pipeline&cid=conversation-2",
    );
    expect(response.cookies.get("sb-project-auth-token")?.value).toBe("renewed");
  });

  it("does not change routes during a transient authentication outage", async () => {
    authMock.getClaims.mockResolvedValue({
      data: null,
      error: new AuthRetryableFetchError("temporary outage", 503),
    });

    const response = await middleware(
      new NextRequest("https://crm.example.com/tasks?view=calendar"),
    );

    expect(response.headers.get("location")).toBeNull();
  });
});
