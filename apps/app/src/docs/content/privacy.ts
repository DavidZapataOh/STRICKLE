import type { Translated } from "../types";

export const privacy: Translated = {
  en: {
    slug: "privacy",
    title: "What is private and what is public",
    summary: "Which parts of your finances anyone can see, which only you and the agent can, and what the private pool adds.",
    sections: [
      {
        id: "public",
        title: "What is public",
        body: [
          "Your vault, its balances by box and every transaction are public on Arc. Anyone who has the address of a vault can open it read-only, which is how an accountant or a partner can look without being able to change anything. Payment links reveal the receiving address and nothing else about you.",
        ],
        sources: ["contracts/src/vault/BoxVault.sol", "apps/app/src/app/[lang]/view/[vault]/page.tsx"],
      },
      {
        id: "sealed",
        title: "What is sealed",
        body: [
          "What the agent knows about you, such as your country, your regime, your goals and its forecast, is kept sealed inside a confidential enclave of Chainlink CRE. It is not written to the chain or to a log. The app sends the agent only actions you signed, and the agent writes back only what it did.",
        ],
        sources: ["workflows/agent/enclave/profile.ts", "workflows/agent/enclave/signed.ts"],
      },
      {
        id: "pool",
        title: "The private pool",
        body: [
          "The shielded pool hides amounts, owners and which note a spend consumes, and its notes carry their own rules. It is off on mainnet because its contract has not had an audit. On testnet it works with test USDC.",
        ],
        sources: ["contracts/src/pool/PolicyPool.sol", "packages/pool/src/note.ts"],
      },
    ],
  },
  es: {
    slug: "privacy",
    title: "Qué es privado y qué es público",
    summary: "Qué partes de tus finanzas puede ver cualquiera, cuáles solo tú y el agente, y qué añade el pool privado.",
    sections: [
      {
        id: "public",
        title: "Qué es público",
        body: [
          "Tu bóveda, sus saldos por caja y cada transacción son públicos en Arc. Quien tenga la dirección de una bóveda puede abrirla en modo lectura, así es como un contador o un socio puede mirar sin poder cambiar nada. Los enlaces de pago revelan la dirección que recibe y nada más sobre ti.",
        ],
        sources: ["contracts/src/vault/BoxVault.sol", "apps/app/src/app/[lang]/view/[vault]/page.tsx"],
      },
      {
        id: "sealed",
        title: "Qué está sellado",
        body: [
          "Lo que el agente sabe de ti, como tu país, tu régimen, tus metas y su pronóstico, se guarda sellado dentro de un enclave confidencial de Chainlink CRE. No se escribe en la cadena ni en un registro. La app le envía al agente solo acciones que firmaste, y el agente escribe de vuelta solo lo que hizo.",
        ],
        sources: ["workflows/agent/enclave/profile.ts", "workflows/agent/enclave/signed.ts"],
      },
      {
        id: "pool",
        title: "El pool privado",
        body: [
          "El pool blindado oculta los montos, los dueños y qué nota consume un gasto, y sus notas llevan sus propias reglas. Está apagado en mainnet porque su contrato no ha tenido una auditoría. En testnet funciona con USDC de prueba.",
        ],
        sources: ["contracts/src/pool/PolicyPool.sol", "packages/pool/src/note.ts"],
      },
    ],
  },
  "pt-br": {
    slug: "privacy",
    title: "O que é privado e o que é público",
    summary: "Quais partes das suas finanças qualquer pessoa pode ver, quais só você e o agente veem, e o que o pool privado acrescenta.",
    sections: [
      {
        id: "public",
        title: "O que é público",
        body: [
          "Seu cofre, seus saldos por caixa e cada transação são públicos na Arc. Quem tem o endereço de um cofre pode abri-lo em modo leitura, que é como um contador ou um sócio pode olhar sem poder mudar nada. Os links de pagamento revelam o endereço que recebe e nada mais sobre você.",
        ],
        sources: ["contracts/src/vault/BoxVault.sol", "apps/app/src/app/[lang]/view/[vault]/page.tsx"],
      },
      {
        id: "sealed",
        title: "O que fica selado",
        body: [
          "O que o agente sabe sobre você, como seu país, seu regime, suas metas e sua previsão, fica selado dentro de um enclave confidencial do Chainlink CRE. Não é escrito na cadeia nem em um registro. O app envia ao agente apenas ações que você assinou, e o agente escreve de volta apenas o que fez.",
        ],
        sources: ["workflows/agent/enclave/profile.ts", "workflows/agent/enclave/signed.ts"],
      },
      {
        id: "pool",
        title: "O pool privado",
        body: [
          "O pool blindado esconde valores, donos e qual nota um gasto consome, e suas notas carregam suas próprias regras. Ele está desligado na mainnet porque o contrato ainda não passou por uma auditoria. Na testnet funciona com USDC de teste.",
        ],
        sources: ["contracts/src/pool/PolicyPool.sol", "packages/pool/src/note.ts"],
      },
    ],
  },
};
