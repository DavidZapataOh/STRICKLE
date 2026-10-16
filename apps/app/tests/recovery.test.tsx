import { renderToStaticMarkup } from "react-dom/server";
import { getAddress } from "viem";
import { describe, expect, it } from "vitest";
import { RecoveryStep } from "../src/components/RecoveryStep.tsx";
import { RestoreKey } from "../src/components/RestoreKey.tsx";
import en from "../src/i18n/dictionaries/en.json";
import { generateNoticeKey } from "../src/keys/notice-key.ts";
import { encodeRecoveryCode } from "../src/keys/recovery-code.ts";

describe("the recovery step", () => {
  const code = encodeRecoveryCode(generateNoticeKey().secret);
  const out = renderToStaticMarkup(<RecoveryStep t={en} code={code} onConfirmed={() => undefined} />);

  it("shows every group of the code, numbered, in an ordered list", () => {
    for (const group of code.split("-")) expect(out).toContain(group);
    expect(out.match(/class="recovery-group"/g)).toHaveLength(11);
    expect(out).toContain("<ol");
  });

  it("asks for groups three and eight, in the user's own count", () => {
    expect(out).toContain("Type group 3 and group 8 of the code.");
    expect(out).toContain('for="recovery-group-2"');
    expect(out).toContain('for="recovery-group-7"');
  });

  it("warns that Strickle cannot recover the code", () => {
    expect(out).toContain("Strickle cannot recover it for you.");
  });
});

describe("the restore form", () => {
  it("asks for the code and offers to continue without notices only when the caller allows it", () => {
    const vault = getAddress("0x00000000000000000000000000000000000000a1");
    const withSkip = renderToStaticMarkup(<RestoreKey vault={vault} t={en} onRestored={() => undefined} onSkip={() => undefined} />);
    const without = renderToStaticMarkup(<RestoreKey vault={vault} t={en} onRestored={() => undefined} />);
    expect(withSkip).toContain("Recovery code");
    expect(withSkip).toContain("Continue without notices");
    expect(without).not.toContain("Continue without notices");
  });
});
