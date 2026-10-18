import type { Translated } from "../types";

export const taxEstimates: Translated = {
  en: {
    slug: "tax-estimates",
    title: "How tax estimates are made",
    summary: "Where each reserve comes from, how sure it is and where it stops.",
    sections: [
      {
        id: "rules",
        title: "A rule, a source and a status",
        body: [
          "For the regimes the engine covers (Mexico RESICO, Argentina monotributo, Colombia SIMPLE, Brazil MEI, the United States estimated-tax safe harbor, the Philippines 8% option, and the export-of-services rules of Pakistan, Brazil and Mexico) the reserve is the amount the rule gives for your income, computed with whole-number arithmetic in the smallest unit of the currency.",
          "Every rule carries the public source it was taken from and a verification status. A rule shows as unverified until a named person has checked it against its source; the status is shown with the number.",
        ],
        sources: ["packages/tax-engine/src/reserve.ts", "packages/tax-engine/src/rule.ts", "packages/tax-engine/rules"],
      },
      {
        id: "fallback",
        title: "When there is no rule",
        body: [
          "For a country or regime without a rule, the engine uses a stated effective rate and the result is labelled as an estimate from that fallback, never as a rule. Due dates are the statutory dates and are not moved for weekends or holidays.",
        ],
        sources: ["packages/tax-engine/src/due-dates.ts", "packages/tax-engine/rules/ZZ/fallback-effective-rate.json"],
      },
      {
        id: "limits",
        title: "Where it stops",
        body: [
          "Strickle sets money aside and shows the figure; it does not file or pay your taxes and it is not tax advice. Rules change, and a rule can be out of date until it is reviewed. If your situation differs from the rule's assumptions, check with an accountant, who can open your vault read-only.",
        ],
        sources: ["packages/tax-engine/src/load.ts"],
      },
    ],
  },
  es: {
    slug: "tax-estimates",
    title: "Cómo se calculan los impuestos estimados",
    summary: "De dónde sale cada reserva, qué tan segura es y dónde termina.",
    sections: [
      {
        id: "rules",
        title: "Una regla, una fuente y un estado",
        body: [
          "Para los regímenes que el motor cubre (RESICO de México, monotributo de Argentina, SIMPLE de Colombia, MEI de Brasil, el safe harbor de impuestos estimados de Estados Unidos, la opción del 8 % de Filipinas y las reglas de exportación de servicios de Pakistán, Brasil y México) la reserva es el monto que la regla da para tus ingresos, calculado con aritmética de números enteros en la unidad más pequeña de la moneda.",
          "Cada regla lleva la fuente pública de la que se tomó y un estado de verificación. Una regla aparece como no verificada hasta que una persona con nombre la contrasta con su fuente; el estado se muestra junto al número.",
        ],
        sources: ["packages/tax-engine/src/reserve.ts", "packages/tax-engine/src/rule.ts", "packages/tax-engine/rules"],
      },
      {
        id: "fallback",
        title: "Cuando no hay regla",
        body: [
          "Para un país o régimen sin regla, el motor usa una tasa efectiva declarada y el resultado se rotula como estimación de ese respaldo, nunca como regla. Las fechas de vencimiento son las legales y no se mueven por fines de semana ni feriados.",
        ],
        sources: ["packages/tax-engine/src/due-dates.ts", "packages/tax-engine/rules/ZZ/fallback-effective-rate.json"],
      },
      {
        id: "limits",
        title: "Dónde termina",
        body: [
          "Strickle aparta dinero y muestra la cifra; no presenta ni paga tus impuestos y no es asesoría fiscal. Las reglas cambian, y una regla puede estar desactualizada hasta que se revisa. Si tu situación difiere de los supuestos de la regla, consulta a un contador, que puede abrir tu bóveda en modo lectura.",
        ],
        sources: ["packages/tax-engine/src/load.ts"],
      },
    ],
  },
  "pt-br": {
    slug: "tax-estimates",
    title: "Como as estimativas de impostos são feitas",
    summary: "De onde vem cada reserva, quão segura ela é e onde termina.",
    sections: [
      {
        id: "rules",
        title: "Uma regra, uma fonte e um status",
        body: [
          "Para os regimes que o motor cobre (RESICO do México, monotributo da Argentina, SIMPLE da Colômbia, MEI do Brasil, o safe harbor de impostos estimados dos Estados Unidos, a opção de 8 % das Filipinas e as regras de exportação de serviços do Paquistão, do Brasil e do México) a reserva é o valor que a regra dá para a sua renda, calculado com aritmética de números inteiros na menor unidade da moeda.",
          "Cada regra traz a fonte pública da qual foi tirada e um status de verificação. Uma regra aparece como não verificada até que uma pessoa identificada a confira com a fonte; o status é mostrado junto com o número.",
        ],
        sources: ["packages/tax-engine/src/reserve.ts", "packages/tax-engine/src/rule.ts", "packages/tax-engine/rules"],
      },
      {
        id: "fallback",
        title: "Quando não há regra",
        body: [
          "Para um país ou regime sem regra, o motor usa uma taxa efetiva declarada e o resultado é rotulado como estimativa desse reserva, nunca como regra. As datas de vencimento são as legais e não são movidas por fins de semana nem feriados.",
        ],
        sources: ["packages/tax-engine/src/due-dates.ts", "packages/tax-engine/rules/ZZ/fallback-effective-rate.json"],
      },
      {
        id: "limits",
        title: "Onde termina",
        body: [
          "A Strickle separa dinheiro e mostra o valor; ela não declara nem paga seus impostos e não é consultoria tributária. As regras mudam, e uma regra pode estar desatualizada até ser revisada. Se a sua situação difere das premissas da regra, consulte um contador, que pode abrir seu cofre em modo leitura.",
        ],
        sources: ["packages/tax-engine/src/load.ts"],
      },
    ],
  },
};
