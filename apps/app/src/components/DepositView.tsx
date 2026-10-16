import { type DepositQuote, bridgeLegOf } from "@strickle/arc/bridge/types";
import { sourceChain, sourceChainsFor, usdtChainsFor } from "@strickle/arc/bridge/chains";
import { formatMoney } from "@strickle/design/format";
import { formatUnits } from "viem";
import type { DepositEvent, DepositState } from "@/deposit/flow";
import { describeError } from "@/deposit/messages";
import { explorerLink } from "@/config/network";
import type { Locale } from "@/i18n/config";
import { fill } from "@/i18n/fill";
import type { DepositText } from "@/i18n/slices";
import type { InjectedWallet } from "@/wallet/injected";
import { ChoiceGroup } from "@/ui/ChoiceGroup";
import { Card } from "@/ui/Card";
import { AmountField } from "./AmountField";
import { DepositQuoteCard } from "./DepositQuoteCard";
import { DirectPanel } from "./DirectPanel";

/** What the buttons do that are not edits of the state. The view itself only renders. */
export interface DepositActions {
  connect(): void;
  pick(wallet: InjectedWallet): void;
  confirm(): void;
  check(): void;
  refresh(): void;
}

const noActions: DepositActions = { connect: () => {}, pick: () => {}, confirm: () => {}, check: () => {}, refresh: () => {} };
const EDITABLE = ["chain", "wallet", "quote"];
const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

function feeOf(quote: DepositQuote | null): bigint | null {
  const leg = quote ? bridgeLegOf(quote) : undefined;
  return leg ? leg.fees.reduce((sum, fee) => sum + fee.amount, 0n) : null;
}

export function DepositView({ lang, t, state, wallets, vault, onEvent, actions = noActions, discovered = false }: { lang: Locale; t: DepositText; state: DepositState; wallets: InjectedWallet[]; vault: string; onEvent: (event: DepositEvent) => void; actions?: DepositActions; discovered?: boolean }) {
  const d = t.deposit;
  const chains = sourceChainsFor(state.network);
  const fee = feeOf(state.quote);
  const speedHint = (speed: "fast" | "slow") => (state.speed === speed && fee !== null ? fill(d.speed.feeFrom, { fee: formatMoney(fee, lang) }) : undefined);

  if (state.step === "sending") {
    return (
      <div className="deposit">
        <p role="status">{state.inputToken === "USDT" && !state.swapTx ? d.states.converting : d.states.sending}</p>
      </div>
    );
  }

  if (state.step === "held") {
    const conversionLink = state.swapTx && state.sourceId ? `${sourceChain(state.network, state.sourceId).explorerUrl}/tx/${state.swapTx}` : null;
    return (
      <div className="deposit">
        <Card as="section" aria-labelledby="deposit-held">
          <h2 id="deposit-held">{d.held.title}</h2>
          <p>{fill(d.held.body, { amount: state.amount !== null ? formatMoney(state.amount, lang) : "" })}</p>
          <button type="button" className="btn" onClick={() => onEvent({ type: "resume-held" })}>
            {d.held.send}
          </button>
          {conversionLink ? (
            <a href={conversionLink} rel="noreferrer" target="_blank">
              {d.held.tx}
            </a>
          ) : null}
        </Card>
      </div>
    );
  }

  if (state.step === "waiting" || state.step === "arrived" || state.step === "failed") {
    const burnLink = state.burnTx && state.sourceId ? `${sourceChain(state.network, state.sourceId).explorerUrl}/tx/${state.burnTx}` : null;
    return (
      <div className="deposit">
        <Card as="section" aria-labelledby="deposit-state">
          <h2 id="deposit-state">{state.step === "arrived" ? d.states.arrived : state.step === "waiting" ? d.states.waiting : d.states.failed}</h2>
          {state.step === "arrived" ? (
            <>
              {state.received !== null ? <p className="amount">{formatMoney(state.received, lang)}</p> : null}
              <p>{d.states.arrivedBody}</p>
              {state.forwardTx ? (
                <a href={explorerLink("tx", state.forwardTx, state.network)} rel="noreferrer" target="_blank">
                  {d.states.viewTx}
                </a>
              ) : null}
              <button type="button" className="btn" data-variant="quiet" onClick={() => onEvent({ type: "reset" })}>
                {d.states.another}
              </button>
            </>
          ) : null}
          {state.step === "waiting" ? (
            <>
              {state.appliedSpeed !== null && state.appliedSpeed !== state.speed ? (
                <p role="status">{fill(d.speed.appliedNote, { speed: d.speed.names[state.appliedSpeed] })}</p>
              ) : null}
              {state.error ? <p role="status">{describeError(state.error, t)}</p> : null}
              {burnLink ? (
                <a href={burnLink} rel="noreferrer" target="_blank">
                  {d.states.viewTx}
                </a>
              ) : null}
              {state.error ? (
                <button type="button" className="btn" onClick={actions.check}>
                  {d.states.retry}
                </button>
              ) : null}
            </>
          ) : null}
          {state.step === "failed" ? (
            <>
              <p role="alert">{state.error ? describeError(state.error, t) : d.states.failedBody}</p>
              {state.burnTx ? (
                <>
                  {state.error ? <p>{d.states.failedBody}</p> : null}
                  <button type="button" className="btn" onClick={actions.check}>
                    {d.states.retry}
                  </button>
                </>
              ) : null}
              <button type="button" className="btn" data-variant="quiet" onClick={() => onEvent({ type: "reset" })}>
                {d.states.another}
              </button>
            </>
          ) : null}
        </Card>
      </div>
    );
  }

  return (
    <div className="deposit">
      {EDITABLE.includes(state.step) && state.error ? <p className="note" role="alert">{describeError(state.error, t)}</p> : null}
      <Card as="section" aria-labelledby="deposit-what">
        <h2 id="deposit-what" className="sr-only">
          {d.title}
        </h2>
        <ChoiceGroup
          name="deposit-chain"
          legend={d.chainLabel}
          options={chains.map((chain) => ({ value: chain.id, label: d.chains[chain.label as keyof typeof d.chains] ?? chain.label }))}
          value={state.sourceId}
          onChange={(id) => onEvent({ type: "chain", id })}
        />
        {state.sourceId && usdtChainsFor(state.network).some((chain) => chain.id === state.sourceId) ? (
          <ChoiceGroup
            name="deposit-token"
            legend={d.token.label}
            options={[
              { value: "USDC" as const, label: d.token.usdc },
              { value: "USDT" as const, label: d.token.usdt, hint: d.token.usdtNote },
            ]}
            value={state.inputToken}
            onChange={(value) => onEvent({ type: "token", value })}
          />
        ) : null}
        <AmountField id="deposit-amount" initial={state.amount !== null ? formatUnits(state.amount, 6) : ""} label={d.amountLabel} hint={d.amountHint} onValue={(value) => onEvent({ type: "amount", value })} />
        <ChoiceGroup
          name="deposit-speed"
          legend={d.speed.label}
          options={[
            { value: "fast" as const, label: d.speed.fast, hint: speedHint("fast") },
            { value: "slow" as const, label: d.speed.standard, hint: speedHint("slow") },
          ]}
          value={state.speed}
          onChange={(value) => onEvent({ type: "speed", value })}
        />
      </Card>

      <Card as="section" aria-labelledby="deposit-wallet">
        <h2 id="deposit-wallet" className="sr-only">
          {d.wallet.connect}
        </h2>
        {state.account ? (
          <p>{fill(d.wallet.connected, { address: short(state.account) })}</p>
        ) : wallets.length > 0 ? (
          <div role="group" aria-label={d.wallet.choose} className="wallet-list">
            {wallets.map((wallet) => (
              <button key={wallet.uuid} type="button" className="btn" data-variant="quiet" onClick={() => actions.pick(wallet)}>
                {/* eslint-disable-next-line @next/next/no-img-element -- an inline data: image announced by the wallet, never fetched */}
                <img src={wallet.icon} alt="" width={24} height={24} />
                {wallet.name}
              </button>
            ))}
          </div>
        ) : (
          <>
            {discovered ? (
              <>
                <p>{d.wallet.none}</p>
                <p className="field-hint">{d.wallet.noneBody}</p>
              </>
            ) : null}
            <button type="button" className="btn" onClick={actions.connect}>
              {d.wallet.connect}
            </button>
          </>
        )}
      </Card>

      {state.account && !state.quote && state.error && state.sourceId && state.amount ? (
        <button type="button" className="btn" data-variant="quiet" onClick={actions.refresh}>
          {d.quote.refresh}
        </button>
      ) : null}

      {state.quote ? (
        <>
          <DepositQuoteCard lang={lang} t={t} quote={state.quote} />
          <button type="button" className="btn" onClick={actions.confirm}>
            {d.confirm}
          </button>
        </>
      ) : null}

      <DirectPanel t={t} vault={vault} />
    </div>
  );
}
