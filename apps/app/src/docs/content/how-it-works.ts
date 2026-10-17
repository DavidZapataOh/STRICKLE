import type { Translated } from "../types";

export const howItWorks: Translated = {
  en: {
    slug: "how-it-works",
    title: "How the agent works",
    summary: "What happens to a payment, how the salary is set and what the agent can and cannot do.",
    sections: [
      {
        id: "boxes",
        title: "Every payment is split into boxes",
        body: [
          "Your money lives in a vault you own, divided into boxes: taxes, payroll, salary, operating, emergency and profit. When a payment arrives, the agent splits it in a fixed order: first the share set aside for taxes (with a small buffer that is returned as a refund later), then the gap for the payroll and bills due in the next 30 days, then the liquidity floor, then what the salary box is owed, then the liquidity target, then the emergency cushion. Whatever is left goes to the remainder.",
          "The order is code, not a preference the agent can reinterpret: the same payment always produces the same split, and every step is explained in a receipt.",
        ],
        sources: ["packages/core/src/cascade.ts", "packages/brain/src/receipt.ts"],
      },
      {
        id: "salary",
        title: "The salary is regular because it is smoothed",
        body: [
          "The salary is a fixed amount paid on the same day each month. The agent proposes an amount from your history and a forecast, and the proposal is held back by whatever binds it: taxes not yet covered, too little history, an unknown spending level, the cushion floor or the risk in the worst scenarios. Each receipt names the limit that applied, so you can see why the number is what it is.",
          "The salary box is never invested: it exists to pay you.",
        ],
        sources: ["packages/brain/src/salary.ts", "packages/brain/src/forecast.ts"],
      },
      {
        id: "limits",
        title: "What the agent can and cannot do",
        body: [
          "The vault enforces the agent's limits in the contract itself. The agent can only move money to recipients you approved, up to a cap per window, and never below the floor of a box. It cannot withdraw to an address you did not approve, and it cannot change these limits. Only you can withdraw, pause the agent or remove it, each in one transaction.",
          "Above an amount you choose, the agent does not act: it proposes, and nothing happens until you approve. A circuit breaker stops it altogether if an action would break an invariant of the box accounts.",
        ],
        sources: ["contracts/src/vault/BoxVault.sol", "packages/brain/src/breaker.ts", "packages/brain/src/autonomy.ts"],
      },
    ],
  },
  es: {
    slug: "how-it-works",
    title: "Cómo funciona el agente",
    summary: "Qué pasa con un pago, cómo se fija el sueldo y qué puede y qué no puede hacer el agente.",
    sections: [
      {
        id: "boxes",
        title: "Cada pago se reparte en cajas",
        body: [
          "Tu dinero vive en una bóveda que es tuya, dividida en cajas: impuestos, nómina, sueldo, operación, emergencia y utilidades. Cuando llega un pago, el agente lo reparte en un orden fijo: primero la parte apartada para impuestos (con un pequeño margen que se devuelve después como reembolso), luego el hueco de la nómina y las cuentas de los próximos 30 días, luego el piso de liquidez, luego lo que se le debe a la caja del sueldo, luego la meta de liquidez y luego el colchón de emergencia. Lo que sobra va al remanente.",
          "El orden es código, no una preferencia que el agente pueda reinterpretar: el mismo pago siempre produce el mismo reparto y cada paso se explica en un recibo.",
        ],
        sources: ["packages/core/src/cascade.ts", "packages/brain/src/receipt.ts"],
      },
      {
        id: "salary",
        title: "El sueldo es regular porque se suaviza",
        body: [
          "El sueldo es un monto fijo que se paga el mismo día de cada mes. El agente propone un monto a partir de tu historial y de un pronóstico, y la propuesta la frena lo que la limite: impuestos aún sin cubrir, poco historial, un gasto desconocido, el piso del colchón o el riesgo en los peores escenarios. Cada recibo nombra el límite que se aplicó, para que veas por qué el número es el que es.",
          "La caja del sueldo nunca se invierte: existe para pagarte.",
        ],
        sources: ["packages/brain/src/salary.ts", "packages/brain/src/forecast.ts"],
      },
      {
        id: "limits",
        title: "Qué puede y qué no puede hacer el agente",
        body: [
          "La bóveda hace cumplir los límites del agente en el propio contrato. El agente solo puede mover dinero a destinatarios que aprobaste, hasta un tope por ventana, y nunca por debajo del piso de una caja. No puede retirar a una dirección que no aprobaste ni cambiar estos límites. Solo tú puedes retirar, pausar al agente o quitarlo, cada cosa en una transacción.",
          "Por encima de un monto que tú eliges, el agente no actúa: propone, y no pasa nada hasta que apruebas. Un cortacircuitos lo detiene por completo si una acción rompiera una invariante de las cuentas de las cajas.",
        ],
        sources: ["contracts/src/vault/BoxVault.sol", "packages/brain/src/breaker.ts", "packages/brain/src/autonomy.ts"],
      },
    ],
  },
  "pt-br": {
    slug: "how-it-works",
    title: "Como o agente funciona",
    summary: "O que acontece com um pagamento, como o salário é definido e o que o agente pode e não pode fazer.",
    sections: [
      {
        id: "boxes",
        title: "Cada pagamento é dividido em caixas",
        body: [
          "Seu dinheiro fica em um cofre que é seu, dividido em caixas: impostos, folha, salário, operação, emergência e lucro. Quando um pagamento chega, o agente o divide em uma ordem fixa: primeiro a parte reservada para impostos (com uma pequena margem devolvida depois como restituição), depois a lacuna da folha e das contas dos próximos 30 dias, depois o piso de liquidez, depois o que a caixa do salário deve receber, depois a meta de liquidez e depois a reserva de emergência. O que sobra vai para o restante.",
          "A ordem é código, não uma preferência que o agente possa reinterpretar: o mesmo pagamento sempre gera a mesma divisão e cada passo é explicado em um recibo.",
        ],
        sources: ["packages/core/src/cascade.ts", "packages/brain/src/receipt.ts"],
      },
      {
        id: "salary",
        title: "O salário é regular porque é suavizado",
        body: [
          "O salário é um valor fixo pago no mesmo dia de cada mês. O agente propõe um valor a partir do seu histórico e de uma previsão, e a proposta é limitada pelo que a restringir: impostos ainda não cobertos, pouco histórico, gasto desconhecido, o piso da reserva ou o risco nos piores cenários. Cada recibo diz qual limite foi aplicado, para você ver por que o número é o que é.",
          "A caixa do salário nunca é investida: ela existe para pagar você.",
        ],
        sources: ["packages/brain/src/salary.ts", "packages/brain/src/forecast.ts"],
      },
      {
        id: "limits",
        title: "O que o agente pode e não pode fazer",
        body: [
          "O cofre faz valer os limites do agente no próprio contrato. O agente só pode mover dinheiro para destinatários que você aprovou, até um teto por janela, e nunca abaixo do piso de uma caixa. Ele não pode sacar para um endereço que você não aprovou nem alterar esses limites. Só você pode sacar, pausar o agente ou removê-lo, cada coisa em uma transação.",
          "Acima de um valor que você escolhe, o agente não age: ele propõe, e nada acontece até você aprovar. Um disjuntor o interrompe por completo se uma ação quebrar uma invariante das contas das caixas.",
        ],
        sources: ["contracts/src/vault/BoxVault.sol", "packages/brain/src/breaker.ts", "packages/brain/src/autonomy.ts"],
      },
    ],
  },
};
