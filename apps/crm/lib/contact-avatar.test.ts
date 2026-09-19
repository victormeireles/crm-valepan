import { describe, expect, it } from "vitest";
import { resolveContactAvatarSrc } from "./contact-avatar";

describe("resolveContactAvatarSrc", () => {
  it("usa a foto já conhecida e não dispara fallback remoto na lista", () => {
    expect(resolveContactAvatarSrc({
      src: "https://example.com/ana.jpg",
      phone: "+5511999999999",
      allowRemoteFallback: false,
      allowRefresh: false,
    })).toBe("https://example.com/ana.jpg");

    expect(resolveContactAvatarSrc({
      phone: "+5511999999999",
      allowRemoteFallback: false,
      allowRefresh: false,
    })).toBeNull();
  });

  it("só pede refresh da Z-API quando isso for pedido explicitamente", () => {
    const phone = "+5511999999999";
    const proxy = `/api/contacts/avatar?phone=${encodeURIComponent(phone)}`;
    expect(resolveContactAvatarSrc({
      phone,
      failedSources: new Set([proxy]),
      allowRemoteFallback: true,
      allowRefresh: false,
    })).toBeNull();
    expect(resolveContactAvatarSrc({
      phone,
      failedSources: new Set([proxy]),
      allowRemoteFallback: true,
      allowRefresh: true,
    })).toBe(`${proxy}&refresh=1`);
  });
});
