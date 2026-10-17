import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { invoiceKeys } from "../../src/invoice-keys.ts";
import { migrate } from "../../src/migrate.ts";
import { attachCircleSession, createOnrampSessionRow, findOnrampSession, openSessionsFor, recordWebhook, releaseWebhook, settleOnrampSession } from "../../src/onramp.ts";
import { createInvoice, getLinkByToken, settlePayment } from "../../src/payments.ts";
import { createTestDatabase } from "../../src/testing.ts";

const keys = invoiceKeys(randomBytes(32).toString("base64"));
const VAULT = `0x${"ab".repeat(20)}`;
const PAYER = `0x${"ee".repeat(20)}`;
let db: Awaited<ReturnType<typeof createTestDatabase>>;
beforeAll(async () => {
  db = await createTestDatabase();
  await migrate(db.sql);
});
afterAll(async () => db.drop());

async function link() {
  const created = await createInvoice(db.sql, keys, { vault: VAULT, label: "L", payeeName: "P", note: "", amount: 100_000_000n, expiresAt: null });
  return { created, view: (await getLinkByToken(db.sql, keys, created.token)) as NonNullable<Awaited<ReturnType<typeof getLinkByToken>>> };
}

describe("onramp sessions", () => {
  it("are found by our id and by Circle's, and settle once", async () => {
    const { view } = await link();
    const id = await createOnrampSessionRow(db.sql, { linkId: view.linkId, vault: VAULT, expiresAt: new Date(Date.now() + 1_800_000) });
    await attachCircleSession(db.sql, id, "circle-session-1");
    expect(await findOnrampSession(db.sql, { id })).toMatchObject({ circleSessionId: "circle-session-1", status: "minted", vault: VAULT });
    expect(await findOnrampSession(db.sql, { circleSessionId: "circle-session-1" })).toMatchObject({ id });
    expect(await findOnrampSession(db.sql, { circleSessionId: "nope" })).toBeNull();
    expect(await settleOnrampSession(db.sql, id, `0x${"11".repeat(32)}`)).toBe(true);
    expect(await settleOnrampSession(db.sql, id, `0x${"11".repeat(32)}`)).toBe(false);
    expect((await findOnrampSession(db.sql, { id }))?.status).toBe("settled");
  });

  it("lists the vault's open sessions since a moment", async () => {
    const { view } = await link();
    const before = new Date(Date.now() - 1000);
    const id = await createOnrampSessionRow(db.sql, { linkId: view.linkId, vault: VAULT, expiresAt: new Date(Date.now() + 1_800_000) });
    const open = await openSessionsFor(db.sql, VAULT, before);
    expect(open.map((row) => row.id)).toContain(id);
    await settleOnrampSession(db.sql, id, `0x${"22".repeat(32)}`);
    expect((await openSessionsFor(db.sql, VAULT, before)).map((row) => row.id)).not.toContain(id);
  });

  it("refuses a session for a link that does not exist", async () => {
    await expect(createOnrampSessionRow(db.sql, { linkId: "11111111-1111-4111-8111-111111111111", vault: VAULT, expiresAt: new Date() })).rejects.toThrow();
  });
});

describe("webhook events", () => {
  it("record a notification once and say so the second time", async () => {
    expect(await recordWebhook(db.sql, { notificationId: "n-1", type: "onramp.deposit.settled", payload: { a: 1 } })).toBe("new");
    expect(await recordWebhook(db.sql, { notificationId: "n-1", type: "onramp.deposit.settled", payload: { a: 1 } })).toBe("duplicate");
  });

  it("can be released, so a failed application is retried", async () => {
    await recordWebhook(db.sql, { notificationId: "n-2", type: "onramp.deposit.settled", payload: {} });
    await releaseWebhook(db.sql, "n-2");
    expect(await recordWebhook(db.sql, { notificationId: "n-2", type: "onramp.deposit.settled", payload: {} })).toBe("new");
  });

  it("keep the raw verified payload", async () => {
    await recordWebhook(db.sql, { notificationId: "n-3", type: "webhooks.test", payload: { hello: "world" } });
    const [row] = await db.sql<{ payload: { hello: string } }[]>`select payload from circle_webhook_events where notification_id = 'n-3'`;
    expect(row?.payload).toEqual({ hello: "world" });
  });
});

describe("the onramp rail", () => {
  it("credits an invoice through its link, like any other rail, and a second call is a duplicate", async () => {
    const { view } = await link();
    const input = { chainId: 5042002, txHash: `0x${"33".repeat(32)}`, logIndex: 5, vault: VAULT, payer: PAYER, amount: 95_000_000n, rail: "onramp" as const, linkId: view.linkId, at: new Date() };
    expect(await settlePayment(db.sql, input)).toMatchObject({ outcome: "credited", status: "partial", paid: 95_000_000n });
    expect(await settlePayment(db.sql, input)).toEqual({ outcome: "duplicate" });
  });
});
