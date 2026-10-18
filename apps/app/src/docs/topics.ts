import type { Locale } from "@/i18n/config";
import { howItWorks } from "./content/how-it-works";
import { kits } from "./content/kits";
import { privacy } from "./content/privacy";
import { rules } from "./content/rules";
import { taxEstimates } from "./content/tax-estimates";
import { verify } from "./content/verify";
import type { Topic, Translated } from "./types";

const ALL: Translated[] = [howItWorks, rules, privacy, taxEstimates, verify, kits];

export const topicsFor = (lang: Locale): Topic[] => ALL.map((topic) => topic[lang]);

export const topicBySlug = (lang: Locale, slug: string): Topic | undefined => topicsFor(lang).find((topic) => topic.slug === slug);

export const TOPIC_SLUGS: string[] = ALL.map((topic) => topic.en.slug);
