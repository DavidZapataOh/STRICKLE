import { type Address, getAddress } from "viem";

const PUBLISHED = /<Publish_Date>\s*([^<]+?)\s*<\/Publish_Date>/;
const ENTRY = /<idType>\s*Digital Currency Address - [A-Z0-9]+\s*<\/idType>\s*<idNumber>\s*(0x[0-9a-fA-F]{40})\s*<\/idNumber>/g;

/** EVM addresses listed in OFAC's SDN XML (`Digital Currency Address - *` entries shaped like 0x + 40 hex). */
export function parseOfac(xml: string): { addresses: Address[]; published: string } {
  if (!xml.includes("<sdnList")) throw new Error("not an OFAC SDN list");
  const published = xml.match(PUBLISHED)?.[1];
  if (!published) throw new Error("the SDN list has no publication date");
  const found = new Set<Address>();
  for (const match of xml.matchAll(ENTRY)) found.add(getAddress(match[1] as string));
  return { addresses: [...found].sort(), published };
}

export const OFAC_SDN_URL = "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.XML";

export async function fetchOfac(fetchImpl: typeof fetch = fetch): Promise<{ addresses: Address[]; published: string }> {
  const response = await fetchImpl(OFAC_SDN_URL);
  if (!response.ok) throw new Error(`OFAC answered ${response.status}`);
  return parseOfac(await response.text());
}
