import { shouldInvite } from "@strickle/brain";
import { type PlainDate, daysBetween, formatPlainDate, parsePlainDate } from "@strickle/core";
import type { Notice } from "./notice-schema.ts";
import type { Profile } from "./profile.ts";

/** The days between the first thing the account's history records and today; zero when it records nothing. */
const historyDays = (profile: Profile, today: PlainDate): number => {
  const first = profile.history.map(([date]) => date).sort()[0];
  return first === undefined ? 0 : Math.max(0, daysBetween(parsePlainDate(first), today));
};

/** Whether an invitation could be raised for this account once a rate is known: used to skip the look at the vaults for everyone else. */
export const inviteDue = (profile: Profile, today: PlainDate): boolean => shouldInvite({ enabled: profile.yield.enabled, invitedOn: profile.yield.invitedOn, historyDays: historyDays(profile, today), apyBps: 1 });

/** Tells an account that has yield off, once, that it can switch it on: after four weeks of history, quoting the rate the agent saw, never promising it. */
export function inviteStep(input: { profile: Profile; today: PlainDate; apyBps: number | null }): { next: Profile; notices: Notice[] } {
  const { profile } = input;
  if (!shouldInvite({ enabled: profile.yield.enabled, invitedOn: profile.yield.invitedOn, historyDays: historyDays(profile, input.today), apyBps: input.apyBps })) return { next: profile, notices: [] };
  return { next: { ...profile, yield: { ...profile.yield, invitedOn: formatPlainDate(input.today) } }, notices: [{ kind: "yield-invite", apyBps: input.apyBps as number }] };
}
