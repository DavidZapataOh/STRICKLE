/** The documented `sessionId` field is absent from the sandbox's answer; the same id is a claim of the session token, which this server has just received from Circle. */
export function sessionIdOf(session: { sessionId?: string; sessionToken: string }): string {
  if (session.sessionId) return session.sessionId;
  try {
    const payload = session.sessionToken.split(".")[1];
    const claims = JSON.parse(Buffer.from(payload ?? "", "base64url").toString("utf8")) as { sessionId?: unknown };
    if (typeof claims.sessionId === "string" && claims.sessionId) return claims.sessionId;
  } catch {
    // falls through to the refusal below
  }
  throw new Error("Circle returned a session without a session id");
}
