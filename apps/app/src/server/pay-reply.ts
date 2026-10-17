/** Every payment and invoice answer is private to its caller and never cached. */
export const payReply = (body: unknown, status: number, extra: Record<string, string> = {}): Response =>
  Response.json(body, { status, headers: { "cache-control": "no-store", "referrer-policy": "no-referrer", "x-robots-tag": "noindex", ...extra } });

export const misconfigured = (): Response => payReply({ status: "misconfigured" }, 503);
