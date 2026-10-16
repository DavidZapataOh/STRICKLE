import { describe, expect, it } from "vitest";
import { decide, isPublicPath } from "../src/server/access.ts";

describe("the pay page and its API under the invite gate", () => {
  it("is public in every language", () => {
    for (const path of ["/en/pay/abc", "/es/pay/abc", "/pt-br/pay/abc", "/api/pay/abc", "/api/pay/abc/claim", "/api/pay/abc/deposits", "/api/pay/abc/deposits/11111111-1111-4111-8111-111111111111"]) expect(isPublicPath(path), path).toBe(true);
  });
  it("does not open the owner routes, the invoices page or look-alikes", () => {
    for (const path of ["/api/invoices", "/api/invoices/reconcile", "/api/owner-session", "/en/invoices", "/api/payroll", "/api/pay", "/api/payment", "/en/payx/abc"]) expect(isPublicPath(path), path).toBe(false);
  });
  it("lets a visitor without an invite open a pay page when the mode is invite", () => {
    expect(decide({ pathname: "/en/pay/abc", mode: "invite", session: "missing" })).toEqual({ kind: "allow" });
    expect(decide({ pathname: "/api/invoices", mode: "invite", session: "missing" })).toMatchObject({ kind: "api", status: 401 });
  });
  it("is still closed by the emergency switch", () => {
    expect(decide({ pathname: "/en/pay/abc", mode: "closed", session: "missing" })).toEqual({ kind: "allow" });
  });
});
