import { describe, expect, it } from "vitest";
import { cookieGate } from "../src/server/cookie-gate.ts";
import { ACCESS_COOKIE, mintAccess } from "../src/server/access.ts";

const SECRET = "s".repeat(40);
const NOW = 1_800_000_000;
const SID = "11111111-2222-4333-8444-555555555555";
const invite = { ACCESS_MODE: "invite", ACCESS_COOKIE_SECRET: SECRET };
const request = (cookie?: string) => new Request("https://app.test/api/agent-action", { method: "POST", headers: cookie ? { cookie: `other=1; ${ACCESS_COOKIE}=${cookie}` } : {} });
const checker = (state: "active" | "revoked" | "unknown") => ({ state: async () => state });

describe("cookieGate (the relay's gate)", () => {
  it("allows everything when open and refuses everything when closed", async () => {
    expect(await cookieGate({ ACCESS_MODE: "open" }, checker("unknown"), () => NOW)(request())).toBe("allow");
    expect(await cookieGate({ ACCESS_MODE: "closed" }, checker("active"), () => NOW)(request(mintAccess(SECRET, SID, NOW + 60)))).toBe("closed");
  });

  it("in invite mode needs a valid cookie whose session is still active", async () => {
    const good = mintAccess(SECRET, SID, NOW + 60);
    expect(await cookieGate(invite, checker("active"), () => NOW)(request(good))).toBe("allow");
    expect(await cookieGate(invite, checker("revoked"), () => NOW)(request(good))).toBe("deny");
    expect(await cookieGate(invite, checker("unknown"), () => NOW)(request(good))).toBe("deny");
    expect(await cookieGate(invite, checker("active"), () => NOW)(request())).toBe("deny");
    expect(await cookieGate(invite, checker("active"), () => NOW + 61)(request(good))).toBe("deny");
  });
});
