import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { invoiceKeys } from "../../src/invoice-keys.ts";
import { migrate } from "../../src/migrate.ts";
import { attachCircleSession, createOnrampSessionRow, findOnrampSession, markWebhookApplied, openSessionsFor, recordWebhook, releaseWebhook, settleOnrampSession } from "../../src/onramp.ts";
import { confirmSuggestion, createInvoice, getLinkByToken, listInvoices, settlePayment, suggestMatch } from "../../src/payments.ts";
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
    await markWebhookApplied(db.sql, "n-1");
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

describe("a webhook claim that never finished", () => {
  const event = (id: string) => ({ notificationId: id, type: "onramp.deposit.settled", payload: {} });

  it("is in flight while recent, taken over once stale, and a duplicate only after it was applied", async () => {
    expect(await recordWebhook(db.sql, event("claim-1"))).toBe("new");
    expect(await recordWebhook(db.sql, event("claim-1"))).toBe("in-flight");
    await db.sql`update circle_webhook_events set received_at = now() - interval '5 minutes' where notification_id = 'claim-1'`;
    expect(await recordWebhook(db.sql, event("claim-1"))).toBe("new");
    await markWebhookApplied(db.sql, "claim-1");
    await db.sql`update circle_webhook_events set received_at = now() - interval '5 minutes' where notification_id = 'claim-1'`;
    expect(await recordWebhook(db.sql, event("claim-1"))).toBe("duplicate");
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

describe("card suggestions", () => {
  const at = new Date();
  const transfer = (n: number, amount: bigint) => ({ chainId: 5042002, txHash: `0x${n.toString(16).padStart(64, "0")}`, logIndex: 2, vault: VAULT, payer: PAYER, amount, at });

  it("offers a transfer into a vault with one open card session as a possible card payment of any amount, never credits it, and credits it as card when the owner confirms", async () => {
    const vault = `0x${"c1".repeat(20)}`;
    const created = await createInvoice(db.sql, keys, { vault, label: "L", payeeName: "P", note: "", amount: 100_000_000n, expiresAt: null });
    const view = (await getLinkByToken(db.sql, keys, created.token))!;
    const session = await createOnrampSessionRow(db.sql, { linkId: view.linkId, vault, expiresAt: new Date(Date.now() + 1_800_000) });
    expect(await suggestMatch(db.sql, { ...transfer(100, 96_500_000n), vault })).toEqual({ suggested: true });
    const item = (await listInvoices(db.sql, keys, vault)).find((entry) => entry.id === created.id);
    expect(item).toMatchObject({ paid: 0n, status: "open" });
    expect(item?.suggestions[0]).toMatchObject({ amount: 96_500_000n, viaCard: true });
    const confirmed = await confirmSuggestion(db.sql, vault, item?.suggestions[0]?.id as string);
    expect(confirmed).toMatchObject({ outcome: "credited", status: "partial", paid: 96_500_000n });
    const [payment] = await db.sql<{ rail: string }[]>`select rail from payments where tx_hash = ${transfer(100, 1n).txHash}`;
    expect(payment?.rail).toBe("onramp");
    expect((await findOnrampSession(db.sql, { id: session }))?.status).toBe("settled");
  });

  it("does not guess when two card sessions are open: the suggestion is plain, not attributed to a card", async () => {
    const vault = `0x${"c2".repeat(20)}`;
    const created = await createInvoice(db.sql, keys, { vault, label: "L", payeeName: "P", note: "", amount: 100_000_000n, expiresAt: null });
    const view = (await getLinkByToken(db.sql, keys, created.token))!;
    for (let i = 0; i < 2; i++) await createOnrampSessionRow(db.sql, { linkId: view.linkId, vault, expiresAt: new Date(Date.now() + 1_800_000) });
    await suggestMatch(db.sql, { ...transfer(101, 100_000_000n), vault });
    const item = (await listInvoices(db.sql, keys, vault)).find((entry) => entry.id === created.id);
    expect(item?.suggestions[0]).toMatchObject({ viaCard: false });
  });

  it("remembers which card session a suggestion was attributed to, so a later session cannot change it", async () => {
    const vault = `0x${"c4".repeat(20)}`;
    const created = await createInvoice(db.sql, keys, { vault, label: "L", payeeName: "P", note: "", amount: 100_000_000n, expiresAt: null });
    const view = (await getLinkByToken(db.sql, keys, created.token))!;
    await createOnrampSessionRow(db.sql, { linkId: view.linkId, vault, expiresAt: new Date(Date.now() + 1_800_000) });
    await suggestMatch(db.sql, { ...transfer(103, 96_000_000n), vault });
    await createOnrampSessionRow(db.sql, { linkId: view.linkId, vault, expiresAt: new Date(Date.now() + 1_800_000) }); // a second session opens afterwards
    const item = (await listInvoices(db.sql, keys, vault)).find((entry) => entry.id === created.id);
    expect(item?.suggestions[0]).toMatchObject({ viaCard: true });
    expect(await confirmSuggestion(db.sql, vault, item?.suggestions[0]?.id as string)).toMatchObject({ outcome: "credited" });
    const [payment] = await db.sql<{ rail: string }[]>`select rail from payments where tx_hash = ${transfer(103, 1n).txHash}`;
    expect(payment?.rail).toBe("onramp");
  });

  it("proposes one card payment per session, not every transfer that follows", async () => {
    const vault = `0x${"c5".repeat(20)}`;
    const created = await createInvoice(db.sql, keys, { vault, label: "L", payeeName: "P", note: "", amount: 100_000_000n, expiresAt: null });
    const view = (await getLinkByToken(db.sql, keys, created.token))!;
    await createOnrampSessionRow(db.sql, { linkId: view.linkId, vault, expiresAt: new Date(Date.now() + 1_800_000) });
    expect(await suggestMatch(db.sql, { ...transfer(104, 96_000_000n), vault })).toEqual({ suggested: true });
    expect(await suggestMatch(db.sql, { ...transfer(105, 1_000_000n), vault })).toEqual({ suggested: false });
  });

  it("proposes nothing for an arbitrary amount when no card session is open", async () => {
    const vault = `0x${"c3".repeat(20)}`;
    await createInvoice(db.sql, keys, { vault, label: "L", payeeName: "P", note: "", amount: 100_000_000n, expiresAt: null });
    expect(await suggestMatch(db.sql, { ...transfer(102, 96_500_000n), vault })).toEqual({ suggested: false });
  });
});
