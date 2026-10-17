import type { Translated } from "../types";

export const rules: Translated = {
  en: {
    slug: "rules",
    title: "What each rule does",
    summary: "The limits on payments, how trust grows, and how an action is refused or proposed.",
    sections: [
      {
        id: "payments",
        title: "Payments go only where you said",
        body: [
          "A payment from a vault is made only to a recipient on your approved list, only up to the cap you set for a time window, and never if it would leave a box below its floor. The contract refuses anything else: the agent is not asked to behave, it is unable to do otherwise.",
          "You can pause the agent, resume it or remove it. Pausing and removing take effect in the same transaction.",
        ],
        sources: ["contracts/src/vault/BoxVault.sol"],
      },
      {
        id: "trust",
        title: "The agent earns room slowly",
        body: [
          "The agent's payment cap starts small and rises in steps, only after clean months and after tax due dates were paid without incident. Some actions, such as paying taxes in local currency, stay off until enough clean due dates have passed.",
          "Anything above the amount you set for signatures, and structural changes, are proposed to you instead of executed. A proposal that you do not answer expires and nothing moves.",
        ],
        sources: ["packages/brain/src/autonomy.ts", "packages/brain/src/proposal.ts"],
      },
      {
        id: "breaker",
        title: "A check before every action",
        body: [
          "Before acting, the agent predicts the result of the action on your boxes and refuses it if the result would break an invariant, for example money created or lost, a negative box or a box below its floor. If an invariant is ever found broken, the agent halts and tells you why.",
        ],
        sources: ["packages/brain/src/invariants.ts", "packages/brain/src/breaker.ts"],
      },
    ],
  },
  es: {
    slug: "rules",
    title: "Qué hace cada regla",
    summary: "Los límites de los pagos, cómo crece la confianza y cómo se rechaza o se propone una acción.",
    sections: [
      {
        id: "payments",
        title: "Los pagos van solo adonde dijiste",
        body: [
          "Un pago desde una bóveda solo se hace a un destinatario de tu lista aprobada, solo hasta el tope que fijaste para una ventana de tiempo y nunca si dejara una caja por debajo de su piso. El contrato rechaza cualquier otra cosa: al agente no se le pide que se porte bien, simplemente no puede hacer otra cosa.",
          "Puedes pausar al agente, reanudarlo o quitarlo. Pausar y quitar surten efecto en la misma transacción.",
        ],
        sources: ["contracts/src/vault/BoxVault.sol"],
      },
      {
        id: "trust",
        title: "El agente gana margen despacio",
        body: [
          "El tope de pagos del agente empieza pequeño y sube por escalones, solo después de meses sin incidentes y de vencimientos de impuestos pagados sin problemas. Algunas acciones, como pagar impuestos en moneda local, siguen apagadas hasta que pasan suficientes vencimientos limpios.",
          "Todo lo que supere el monto que fijaste para firmas, y los cambios estructurales, se te proponen en vez de ejecutarse. Una propuesta que no respondes caduca y no se mueve nada.",
        ],
        sources: ["packages/brain/src/autonomy.ts", "packages/brain/src/proposal.ts"],
      },
      {
        id: "breaker",
        title: "Una revisión antes de cada acción",
        body: [
          "Antes de actuar, el agente predice el resultado de la acción sobre tus cajas y la rechaza si rompiera una invariante, por ejemplo dinero creado o perdido, una caja negativa o una caja por debajo de su piso. Si alguna vez se encuentra rota una invariante, el agente se detiene y te dice por qué.",
        ],
        sources: ["packages/brain/src/invariants.ts", "packages/brain/src/breaker.ts"],
      },
    ],
  },
  "pt-br": {
    slug: "rules",
    title: "O que cada regra faz",
    summary: "Os limites dos pagamentos, como a confiança cresce e como uma ação é recusada ou proposta.",
    sections: [
      {
        id: "payments",
        title: "Os pagamentos vão só para onde você disse",
        body: [
          "Um pagamento a partir de um cofre só é feito a um destinatário da sua lista aprovada, só até o teto que você definiu para uma janela de tempo e nunca se deixar uma caixa abaixo do seu piso. O contrato recusa qualquer outra coisa: não se pede ao agente que se comporte, ele simplesmente não consegue fazer outra coisa.",
          "Você pode pausar o agente, retomá-lo ou removê-lo. Pausar e remover valem na mesma transação.",
        ],
        sources: ["contracts/src/vault/BoxVault.sol"],
      },
      {
        id: "trust",
        title: "O agente ganha margem devagar",
        body: [
          "O teto de pagamentos do agente começa pequeno e sobe em degraus, só depois de meses sem incidentes e de vencimentos de impostos pagos sem problemas. Algumas ações, como pagar impostos em moeda local, continuam desligadas até passarem vencimentos limpos suficientes.",
          "Tudo o que passar do valor que você definiu para assinaturas, e as mudanças estruturais, são propostos a você em vez de executados. Uma proposta que você não responde expira e nada se move.",
        ],
        sources: ["packages/brain/src/autonomy.ts", "packages/brain/src/proposal.ts"],
      },
      {
        id: "breaker",
        title: "Uma verificação antes de cada ação",
        body: [
          "Antes de agir, o agente prevê o resultado da ação sobre as suas caixas e a recusa se ela quebrar uma invariante, por exemplo dinheiro criado ou perdido, uma caixa negativa ou uma caixa abaixo do seu piso. Se alguma vez uma invariante for encontrada quebrada, o agente para e diz por quê.",
        ],
        sources: ["packages/brain/src/invariants.ts", "packages/brain/src/breaker.ts"],
      },
    ],
  },
};
