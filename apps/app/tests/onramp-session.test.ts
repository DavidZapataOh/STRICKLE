import { describe, expect, it } from "vitest";
import { sessionIdOf } from "../src/server/onramp-session.ts";

// The sandbox returns no sessionId field: the id is a claim of the session token. The token here is made up for the test, in the shape the sandbox returned (three parts, a JSON payload).
const token = (claims: Record<string, unknown>) => ["e30", Buffer.from(JSON.stringify(claims)).toString("base64url"), "c2ln"].join(".");

describe("sessionIdOf", () => {
  it("prefers the field the kit documents when it is there", () => {
    expect(sessionIdOf({ sessionId: "from-field", sessionToken: token({ sessionId: "from-token" }) })).toBe("from-field");
  });

  it("reads the id from the session token when the field is missing, as the sandbox returns it", () => {
    expect(sessionIdOf({ sessionToken: token({ sessionId: "from-token", appUserId: "x" }) })).toBe("from-token");
  });

  it("refuses a session it cannot identify, so no row is attached to nothing", () => {
    expect(() => sessionIdOf({ sessionToken: token({ appUserId: "x" }) })).toThrow(/session id/);
    expect(() => sessionIdOf({ sessionToken: "not a token" })).toThrow(/session id/);
    expect(() => sessionIdOf({ sessionToken: token({ sessionId: 42 }) })).toThrow(/session id/);
  });
});
