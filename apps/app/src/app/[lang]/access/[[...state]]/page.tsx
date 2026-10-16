import { notFound } from "next/navigation";
import { appNetwork } from "@/config/network";
import { hasLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { StartFrame } from "@/ui/StartFrame";

const STATES = ["invalid", "slow", "error"] as const;
type AccessState = (typeof STATES)[number];

// The answer to a wrong code travels in the path, not in a query string: reading the query would make the page dynamic.
export const generateStaticParams = () => [{ state: [] }, ...STATES.map((state) => ({ state: [state] }))];

export default async function AccessPage({ params }: PageProps<"/[lang]/access/[[...state]]">) {
  const { lang, state } = await params;
  if (!hasLocale(lang)) notFound();
  const [given, ...rest] = state ?? [];
  if (rest.length > 0 || (given !== undefined && !(STATES as readonly string[]).includes(given))) notFound();
  const first = given as AccessState | undefined;
  const t = await getDictionary(lang);
  const a = t.access;
  return (
    <StartFrame lang={lang} brand={t.shell.brand} skip={t.nav.skip} progress={null} testnet={appNetwork() === "mainnet" ? null : t.start.testnet}>
      <h1 className="screen-title">{a.title}</h1>
      <p>{a.body}</p>
      <form className="access-form" method="post" action="/api/access">
        <input type="hidden" name="lang" value={lang} />
        <div className="field">
          <label htmlFor="access-code">{a.label}</label>
          <input id="access-code" name="code" autoComplete="off" autoCapitalize="characters" inputMode="text" spellCheck={false} required />
        </div>
        {first ? (
          <p className="field-error" role="alert">
            {a[first]}
          </p>
        ) : null}
        <button type="submit" className="btn" data-variant="primary">
          {a.submit}
        </button>
      </form>
    </StartFrame>
  );
}
