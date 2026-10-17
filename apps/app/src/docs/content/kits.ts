import type { Translated } from "../types";

export const kits: Translated = {
  en: {
    slug: "kits",
    title: "The open kits",
    summary: "The parts of Strickle that work on their own.",
    sections: [
      {
        id: "tax-engine",
        title: "Tax engine",
        body: [
          "@strickle/tax-engine holds the versioned rules, their sources, the reserve arithmetic, due dates and holiday calendars. It has no network dependency: the foreign-exchange rate is supplied by the caller.",
        ],
        sources: ["packages/tax-engine/src/index.ts", "packages/tax-engine/rules"],
      },
      {
        id: "policy-pool",
        title: "Policy pool",
        body: [
          "@strickle/pool is the client of the shielded pool whose notes carry their own rules: notes and commitments, policies, the witness builders for the shield and spend circuits and a Node prover. The contracts are unaudited.",
        ],
        sources: ["packages/pool/src/index.ts", "circuits/spend"],
      },
    ],
  },
  es: {
    slug: "kits",
    title: "Los kits abiertos",
    summary: "Las partes de Strickle que funcionan por sí solas.",
    sections: [
      {
        id: "tax-engine",
        title: "Motor de impuestos",
        body: [
          "@strickle/tax-engine contiene las reglas versionadas, sus fuentes, la aritmética de la reserva, las fechas de vencimiento y los calendarios de feriados. No depende de la red: el tipo de cambio lo aporta quien llama.",
        ],
        sources: ["packages/tax-engine/src/index.ts", "packages/tax-engine/rules"],
      },
      {
        id: "policy-pool",
        title: "Pool de políticas",
        body: [
          "@strickle/pool es el cliente del pool blindado cuyas notas llevan sus propias reglas: notas y compromisos, políticas, los constructores de testigos para los circuitos de depósito y gasto y un probador para Node. Los contratos no están auditados.",
        ],
        sources: ["packages/pool/src/index.ts", "circuits/spend"],
      },
    ],
  },
  "pt-br": {
    slug: "kits",
    title: "Os kits abertos",
    summary: "As partes da Strickle que funcionam por conta própria.",
    sections: [
      {
        id: "tax-engine",
        title: "Motor de impostos",
        body: [
          "@strickle/tax-engine reúne as regras versionadas, suas fontes, a aritmética da reserva, as datas de vencimento e os calendários de feriados. Não depende da rede: a taxa de câmbio é fornecida por quem chama.",
        ],
        sources: ["packages/tax-engine/src/index.ts", "packages/tax-engine/rules"],
      },
      {
        id: "policy-pool",
        title: "Pool de políticas",
        body: [
          "@strickle/pool é o cliente do pool blindado cujas notas carregam suas próprias regras: notas e compromissos, políticas, os construtores de testemunhas para os circuitos de depósito e gasto e um provador para Node. Os contratos não foram auditados.",
        ],
        sources: ["packages/pool/src/index.ts", "circuits/spend"],
      },
    ],
  },
};
