import type { Translated } from "../types";

export const verify: Translated = {
  en: {
    slug: "verify",
    title: "How to check Strickle yourself",
    summary: "What you can read and recompute without trusting us.",
    sections: [
      {
        id: "vault",
        title: "Read any vault",
        body: [
          "A vault is a public contract on Arc. Its balances by box, its approved recipients, the agent's cap and every payment it made are readable on the explorer, and the app shows the same data read-only at the vault's address. The code is in the repository and the rules above are the contract's own functions and errors.",
        ],
        sources: ["contracts/src/vault/BoxVault.sol", "contracts/src/vault/BoxVaultFactory.sol"],
      },
      {
        id: "agent",
        title: "What the agent writes",
        body: [
          "The agent is a Chainlink CRE workflow whose source is in the repository. Its reports reach the contracts through the CRE forwarder, and each receiving contract accepts only the workflow ID it was bound to. Recomputing that ID from the published source is how anyone can check that the code running is the code published.",
        ],
        sources: ["workflows/agent", "contracts/src/cre/AgentExecutor.sol", "contracts/src/cre/CreReceiver.sol"],
      },
      {
        id: "certificates",
        title: "Certificates of income",
        body: [
          "Certificates of income are not issued yet. Nothing on this page should be read as a certificate; when they exist, the Verify screen will check one.",
        ],
        sources: ["apps/app/src/app/[lang]/verify/page.tsx"],
      },
    ],
  },
  es: {
    slug: "verify",
    title: "Cómo comprobar Strickle por tu cuenta",
    summary: "Qué puedes leer y recalcular sin confiar en nosotros.",
    sections: [
      {
        id: "vault",
        title: "Lee cualquier bóveda",
        body: [
          "Una bóveda es un contrato público en Arc. Sus saldos por caja, sus destinatarios aprobados, el tope del agente y cada pago que hizo se pueden leer en el explorador, y la app muestra los mismos datos en modo lectura en la dirección de la bóveda. El código está en el repositorio y las reglas de arriba son las funciones y los errores del propio contrato.",
        ],
        sources: ["contracts/src/vault/BoxVault.sol", "contracts/src/vault/BoxVaultFactory.sol"],
      },
      {
        id: "agent",
        title: "Qué escribe el agente",
        body: [
          "El agente es un workflow de Chainlink CRE cuyo código fuente está en el repositorio. Sus reportes llegan a los contratos por el forwarder de CRE, y cada contrato receptor acepta solo el ID de workflow al que fue vinculado. Recalcular ese ID desde el código publicado es la forma en que cualquiera puede comprobar que el código que corre es el código publicado.",
        ],
        sources: ["workflows/agent", "contracts/src/cre/AgentExecutor.sol", "contracts/src/cre/CreReceiver.sol"],
      },
      {
        id: "certificates",
        title: "Certificados de ingresos",
        body: [
          "Los certificados de ingresos todavía no se emiten. Nada de esta página debe leerse como un certificado; cuando existan, la pantalla Verificar comprobará uno.",
        ],
        sources: ["apps/app/src/app/[lang]/verify/page.tsx"],
      },
    ],
  },
  "pt-br": {
    slug: "verify",
    title: "Como conferir a Strickle por conta própria",
    summary: "O que você pode ler e recalcular sem confiar em nós.",
    sections: [
      {
        id: "vault",
        title: "Leia qualquer cofre",
        body: [
          "Um cofre é um contrato público na Arc. Seus saldos por caixa, seus destinatários aprovados, o teto do agente e cada pagamento que ele fez podem ser lidos no explorador, e o app mostra os mesmos dados em modo leitura no endereço do cofre. O código está no repositório e as regras acima são as funções e os erros do próprio contrato.",
        ],
        sources: ["contracts/src/vault/BoxVault.sol", "contracts/src/vault/BoxVaultFactory.sol"],
      },
      {
        id: "agent",
        title: "O que o agente escreve",
        body: [
          "O agente é um workflow do Chainlink CRE cujo código-fonte está no repositório. Seus relatórios chegam aos contratos pelo forwarder do CRE, e cada contrato receptor aceita apenas o ID de workflow ao qual foi vinculado. Recalcular esse ID a partir do código publicado é como qualquer pessoa pode conferir que o código em execução é o código publicado.",
        ],
        sources: ["workflows/agent", "contracts/src/cre/AgentExecutor.sol", "contracts/src/cre/CreReceiver.sol"],
      },
      {
        id: "certificates",
        title: "Certificados de renda",
        body: [
          "Os certificados de renda ainda não são emitidos. Nada nesta página deve ser lido como um certificado; quando existirem, a tela Verificar conferirá um.",
        ],
        sources: ["apps/app/src/app/[lang]/verify/page.tsx"],
      },
    ],
  },
};
