"use client";

import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { getPublicClient } from "@/chain/client";
import { fetchLogs } from "@/chain/logs";
import { latestHeld, latestPlan, openedNotices } from "@/chain/plan";
import { earnTotals } from "@/activity/earn";
import { type BoxState, type VaultState, readVault } from "@/chain/vault";
import { conversionStatus, swapSetupCalls } from "@/boxes/currency";
import { appNetwork } from "@/config/network";
import { networks } from "@strickle/arc/networks";
import type { Locale } from "@/i18n/config";
import { fill } from "@/i18n/fill";
import type { SettingsText } from "@/i18n/slices";
import { loadNoticeKey } from "@/keys/notice-key";
import { usd } from "@/onboarding/answers";
import { type AdjustError, type AdjustResult, currencyChange, cushionChange, cushionRanges, parseWholeDollars, presetChange, salaryChange, settingsMatch, yieldChange } from "@/settings/adjust";
import type { Account } from "@/settings/account";
import { type Call, approveRecipientCalls, setAgentCalls } from "@/settings/calls";
import { type SettingsChain, approvalKey, approvalState, readSettingsChain } from "@/settings/chain";
import { settingsModel } from "@/settings/model";
import { sendOwnerCalls } from "@/settings/send";
import { type TxPhase, runTx } from "@/settings/tx";
import { useAdjust } from "@/settings/use-adjust";
import { isPasskeyCancelled } from "@/wallet/errors";
import { earnVaultsFor } from "@/config/earn";
import { earnAction, INVEST_BOXES } from "@/yield/actions";
import { earnSetupCalls } from "@/yield/calls";
import { investRoom } from "@/yield/room";
import { earnStatus } from "@/yield/status";
import { useEarn } from "@/yield/use-earn";
import type { VaultQuote } from "@/yield/vaults";
import { AgentOnly } from "@/lib/agent-only";
import { ALL_DOLLARS, CurrencyControl } from "./CurrencyControl";
import { EarnControl, type EarnRow } from "./EarnControl";
import { EditRow } from "./EditRow";
import { RulesPanel } from "./RulesPanel";
import { ShareLink } from "./ShareLink";
import { type SettingsState, SettingsView } from "./SettingsView";

const dollars = (units: bigint): string => String(units / 1_000_000n);
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The live yield of the vault, best effort: a service that is down is no rate, never a broken screen. */
async function fetchQuote(): Promise<VaultQuote | undefined> {
  try {
    const response = await fetch("/api/vaults");
    const body = (await response.json()) as { vaults?: VaultQuote[] };
    return body.vaults?.[0];
  } catch {
    return undefined;
  }
}

type Extras = { quote?: VaultQuote; yieldEnabled?: boolean; totals?: { gain: bigint; fee: bigint }; agent: Address; boxes: BoxState[]; pending: SettingsChain["pending"]; now: number; vault: VaultState; currencies: typeof ALL_DOLLARS; held: ReturnType<typeof latestHeld> };

/** What is in force for a signed-in account, and the changes the person can make: the vault's own through the owner's transaction, the agent's through a signed request. */
export function SettingsActive({ lang, t, account }: { lang: Locale; t: SettingsText; account: Account }) {
  const s = t.settings;
  const [state, setState] = useState<SettingsState>({ status: "loading" });
  const [extras, setExtras] = useState<Extras | null>(null);
  const [txPhase, setTxPhase] = useState<TxPhase>("idle");
  const [round, setRound] = useState(0);
  const adjust = useAdjust(account);
  const earnRun = useEarn(account);
  const { vault } = account;

  useEffect(() => {
    const load = async () => {
      try {
        const key = await loadNoticeKey(vault);
        const logs = key ? ((await fetchLogs("notice", vault).catch(() => null))?.logs ?? null) : null;
        const plan = key && logs ? latestPlan(logs, key, vault) : null;
        const payees = plan ? [{ box: 3, who: plan.settings.payee as Address }] : [];
        const [chain, vaultState, quote] = await Promise.all([readSettingsChain(getPublicClient(), vault, payees), readVault(vault), fetchQuote()]);
        const now = Math.floor(Date.now() / 1000);
        setExtras({ quote, yieldEnabled: plan?.settings.yieldEnabled, totals: key && logs ? earnTotals(openedNotices(logs, key, vault).map((entry) => ({ notice: entry.notice, timestamp: 0 }))) : undefined, agent: chain.limits.agent, boxes: vaultState.boxes, pending: chain.pending, now, vault: vaultState, currencies: plan?.settings.currencies ?? ALL_DOLLARS, held: key && logs ? latestHeld(logs, key, vault) : undefined });
        setState({ status: "ready", model: settingsModel({ chain, plan, todayIso: new Date(now * 1000).toISOString().slice(0, 10), now }) });
      } catch {
        setState((current) => (current.status === "ready" ? current : { status: "error" }));
      }
    };
    void load();
    const tick = () => {
      if (document.visibilityState === "visible") void load();
    };
    const id = setInterval(tick, 30_000);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", tick);
    };
  }, [vault, round]);

  const reload = useCallback(() => setRound((value) => value + 1), []);

  const ownerTx = useCallback(
    async (calls: Call[], confirmed: () => Promise<boolean>): Promise<TxPhase> => {
      const outcome = await runTx({ send: () => sendOwnerCalls(account, calls), confirmed, sleep, now: Date.now, isCancelled: isPasskeyCancelled }, setTxPhase);
      reload();
      return outcome;
    },
    [account, reload],
  );

  if (state.status !== "ready" || !extras) {
    return <SettingsView lang={lang} t={t} state={state} slots={{ retry: <button type="button" className="btn" onClick={reload}>{s.retry}</button> }} />;
  }

  const model = state.model;
  const status = adjust.phase !== "idle" ? s.phase[adjust.phase] : txPhase !== "idle" ? t.pause[txPhase] : "";
  const rowText = { changeLabel: s.change, saveLabel: s.save, cancelLabel: s.cancel };
  const current = model.cushion ?? { floorDays: 14, targetDays: 42 };
  // The executor refuses every report for a paused vault, so a change meant for the agent would never be applied while it is paused or stopped.
  const enclaveBlocked = model.agent.state !== "running";
  const blockedNote = enclaveBlocked ? s.agent.enclaveBlocked : undefined;
  const ranges = cushionRanges(current);

  const errorText = (error: AdjustError): string => {
    if (error === "floor") return fill(s.errors.floor, { min: ranges.floor[0], max: ranges.floor[1] });
    if (error === "target") return fill(s.errors.target, { min: ranges.target[0], max: ranges.target[1] });
    if (error === "box" || error === "currency") return t.currency.errors[error];
    return s.errors[error];
  };
  const apply = async (result: AdjustResult): Promise<void> => {
    if (!result.ok) throw new Error(errorText(result.error));
    const changes = result.action.changes;
    await adjust.run(result.action, (plan) => settingsMatch(changes, plan.settings));
  };
  const field = (form: FormData, name: string) => String(form.get(name) ?? "");
  const working = adjust.phase === "signing" || adjust.phase === "sending" || adjust.phase === "busy" || adjust.phase === "waiting";

  const offered = earnVaultsFor(appNetwork())[0];
  const earnState = offered ? earnStatus({ earn: extras.vault.earn, conversions: extras.vault.conversions, expectedAdapter: networks[appNetwork()].swapAdapter, vault: offered.address, now: extras.vault.now }) : ({ kind: "unavailable" } as const);
  const earnPosition = offered && extras.vault.earn?.supported ? extras.vault.earn.vaults.find((row) => row.vault.toLowerCase() === offered.address.toLowerCase()) : undefined;
  const earnRows: EarnRow[] =
    offered && extras.vault.earn?.supported
      ? INVEST_BOXES.map((box) => {
          const cash = extras.vault.boxes.find((candidate) => candidate.kind === box)?.usdc ?? 0n;
          const bps = extras.vault.earn?.supported ? (extras.vault.earn.maxInvestBps[box] ?? 0) : 0;
          const put = extras.vault.earn?.supported ? (extras.vault.earn.invested[box] ?? 0n) : 0n;
          return { box, position: earnPosition?.value[box] ?? 0n, available: cash, room: investRoom({ cash, working: put, maxBps: bps }), maxInvestBps: bps };
        })
      : [];
  const earnMessage = earnRun.phase === "confirmed" ? t.earn.requested : earnRun.phase !== "idle" ? s.phase[earnRun.phase] : txPhase !== "idle" ? t.pause[txPhase] : undefined;
  const moveEarn = async (kind: "invest" | "divest", box: (typeof INVEST_BOXES)[number], text: string): Promise<void> => {
    if (!offered) throw new Error(t.earn.errors.vault);
    const result = earnAction({ kind, box, vault: offered.address, dollars: text }, [offered]);
    if (!result.ok) throw new Error(t.earn.errors[result.error]);
    const row = earnRows.find((candidate) => candidate.box === box);
    if (kind === "invest" && BigInt(result.action.amount) > (row?.available ?? 0n)) throw new Error(t.earn.errors.tooMuch);
    if (kind === "invest" && BigInt(result.action.amount) > (row?.room ?? 0n)) throw new Error(t.earn.errors.limit);
    await earnRun.run(result.action);
  };

  const slots = {
    resume: (
      <AgentOnly capability="agentSettings" t={t}>
        <button type="button" className="btn" data-variant="primary" disabled={working} onClick={() => void adjust.run({ kind: "resume" }, (plan) => !plan.settings.halted)}>
          {s.agent.resumeInAgent}
        </button>
      </AgentOnly>
    ),
    agentEdit:
      model.agent.state === "none" ? null : (
        <EditRow
          {...rowText}
          label={s.agent.limitsEdit}
          value={`${dollars(model.limits.capUnits)} / ${model.limits.windowHours} h`}
          note={s.agent.immediate}
          status={status}
          onSave={async (form) => {
            const whole = parseWholeDollars(field(form, "cap"));
            const hours = parseWholeDollars(field(form, "hours"));
            if (whole === null || hours === null || hours === 0) throw new Error(s.errors.amount);
            const cap = usd(whole);
            const windowSeconds = hours * 3600;
            await ownerTx(setAgentCalls({ vault, agent: extras.agent, cap, windowSeconds, paused: model.agent.state === "paused" }), async () => {
              const read = await readSettingsChain(getPublicClient(), vault);
              return read.limits.cap === cap && read.limits.windowSeconds === windowSeconds;
            });
          }}
        >
          <label>
            {s.agent.limitsEdit}
            <input name="cap" inputMode="numeric" defaultValue={dollars(model.limits.capUnits)} />
          </label>
          <label>
            {s.agent.windowEdit}
            <input name="hours" inputMode="numeric" defaultValue={String(model.limits.windowHours)} />
          </label>
        </EditRow>
      ),
    autonomy: (
      <AgentOnly capability="agentSettings" t={t}>
      <EditRow {...rowText} label={s.autonomy.title} value={model.autonomy === "ask" ? s.autonomy.ask : s.autonomy.auto} status={status} disabled={enclaveBlocked} note={blockedNote} onSave={async (form) => apply(presetChange(field(form, "preset") === "auto" ? "auto" : "ask", field(form, "upTo")))}>
        <label>
          <input type="radio" name="preset" value="ask" defaultChecked={model.autonomy === "ask"} /> {s.autonomy.ask}
        </label>
        <label>
          <input type="radio" name="preset" value="auto" defaultChecked={model.autonomy === "auto"} /> {s.autonomy.auto}
        </label>
        <input name="upTo" inputMode="numeric" aria-label={s.autonomy.auto} defaultValue={model.salary ? dollars(model.salary.proposed) : "0"} />
      </EditRow>
      </AgentOnly>
    ),
    salary: model.salary ? (
      <AgentOnly capability="agentSettings" t={t}>
        <EditRow {...rowText} label={s.salary.amount} value={dollars(model.salary.proposed)} status={status} disabled={enclaveBlocked} note={blockedNote} onSave={async (form) => apply(salaryChange({ proposedDollars: field(form, "amount") }))}>
          <input name="amount" inputMode="numeric" aria-label={s.salary.amount} defaultValue={dollars(model.salary.proposed)} />
        </EditRow>
        <EditRow {...rowText} label={s.salary.day} value={String(model.salary.day)} status={status} disabled={enclaveBlocked} note={blockedNote} onSave={async (form) => apply(salaryChange({ day: field(form, "day") }))}>
          <input name="day" inputMode="numeric" aria-label={s.salary.day} defaultValue={String(model.salary.day)} />
        </EditRow>
        <EditRow
          {...rowText}
          label={s.salary.approve}
          value=""
          note={blockedNote ?? fill(s.salary.waitNote, { hours: 24 })}
          status={status}
          disabled={enclaveBlocked}
          onSave={async (form) => {
            const who = field(form, "who");
            const result = salaryChange({ payee: who });
            if (!result.ok) throw new Error(errorText(result.error));
            await ownerTx(approveRecipientCalls({ vault, box: 3, who: who as Address }), async () => {
              const read = await readSettingsChain(getPublicClient(), vault, [{ box: 3, who: who as Address }]);
              return read.approvals[approvalKey(3, who as Address)] !== null;
            });
          }}
        >
          <input name="who" aria-label={s.salary.approve} placeholder="0x…" />
        </EditRow>
        <EditRow
          {...rowText}
          label={s.salary.use}
          value=""
          status={status}
          disabled={enclaveBlocked}
          note={blockedNote}
          onSave={async (form) => {
            const who = field(form, "who");
            const result = salaryChange({ payee: who });
            if (!result.ok) throw new Error(errorText(result.error));
            const read = await readSettingsChain(getPublicClient(), vault, [{ box: 3, who: who as Address }]);
            if (approvalState(read.approvals[approvalKey(3, who as Address)] ?? null, Math.floor(Date.now() / 1000)) !== "effective") throw new Error(s.salary.notApproved);
            await apply(result);
          }}
        >
          <input name="who" aria-label={s.salary.use} placeholder="0x…" />
        </EditRow>
      </AgentOnly>
    ) : null,
    cushion: model.cushion ? (
      <AgentOnly capability="agentSettings" t={t}>
        <EditRow {...rowText} label={fill(s.cushion.floor, { max: ranges.floor[1] })} value={String(current.floorDays)} status={status} disabled={enclaveBlocked} note={blockedNote} onSave={async (form) => apply(cushionChange({ floorDays: field(form, "floor"), current }))}>
          <input name="floor" inputMode="numeric" aria-label={s.cushion.floor} defaultValue={String(current.floorDays)} />
        </EditRow>
        <EditRow {...rowText} label={fill(s.cushion.target, { min: ranges.target[0] })} value={String(current.targetDays)} status={status} disabled={enclaveBlocked} note={blockedNote} onSave={async (form) => apply(cushionChange({ targetDays: field(form, "target"), current }))}>
          <input name="target" inputMode="numeric" aria-label={s.cushion.target} defaultValue={String(current.targetDays)} />
        </EditRow>
      </AgentOnly>
    ) : null,
    currency: (
      <AgentOnly capability="agentSettings" t={t}>
      <CurrencyControl
        lang={lang}
        t={t}
        currencies={extras.currencies}
        status={conversionStatus(extras.vault, networks[appNetwork()].swapAdapter, extras.held)}
        working={working || txPhase === "signing" || txPhase === "confirming"}
        message={status || undefined}
        onChoose={(box, to) => void apply(currencyChange({ box, to })).catch(() => undefined)}
        onAllow={() =>
          void ownerTx(swapSetupCalls(vault, networks[appNetwork()].swapAdapter), async () => {
            const read = await readVault(vault);
            return read.conversions.supported && read.conversions.adapter.toLowerCase() === networks[appNetwork()].swapAdapter.toLowerCase();
          })
        }
      />
      </AgentOnly>
    ),
    earn: (
        <EarnControl
          lang={lang}
          t={t}
          status={earnState}
          rows={earnRows}
          quote={extras.quote}
          working={working || earnRun.phase === "signing" || earnRun.phase === "sending" || earnRun.phase === "busy" || earnRun.phase === "waiting" || txPhase === "signing" || txPhase === "confirming"}
          message={earnMessage}
          automatic={extras.yieldEnabled}
          totals={extras.totals}
          onSwitch={(enabled) => apply(yieldChange(enabled))}
          onMove={moveEarn}
          onAllow={() => {
            if (earnState.kind !== "not-allowed" || !offered) return;
            void ownerTx(earnSetupCalls({ vault, adapter: networks[appNetwork()].swapAdapter, earnVault: offered.address, needs: earnState.needs }), async () => {
              const read = await readVault(vault);
              return earnStatus({ earn: read.earn, conversions: read.conversions, expectedAdapter: networks[appNetwork()].swapAdapter, vault: offered.address, now: read.now }).kind !== "not-allowed";
            });
          }}
        />
    ),
    rules: (
      <RulesPanel
        lang={lang}
        t={t}
        vault={vault}
        boxes={extras.boxes}
        pending={extras.pending}
        now={extras.now}
        busy={txPhase === "signing" || txPhase === "confirming"}
        onRun={ownerTx}
        readBox={async (box) => {
          const [vaultState, chain] = await Promise.all([readVault(vault), readSettingsChain(getPublicClient(), vault)]);
          return { rule: (vaultState.boxes[box - 1] as BoxState).rule, pending: chain.pending[box - 1] ?? null };
        }}
      />
    ),
    accountant: (
      <>
        <p>{t.view.shareIntro}</p>
        <ShareLink href={`${window.location.origin}/${lang}/view/${vault}`} t={t} />
        <p>{t.view.keysIntro}</p>
      </>
    ),
  };

  return <SettingsView lang={lang} t={t} state={state} slots={slots} />;
}
