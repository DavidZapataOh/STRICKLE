# Deployed agent workflow (Arc testnet)

- Workflow: `strickle-agent` in the CRE private registry (one workflow holds every handler; the organization has no more private slots).
- Current workflow ID: `0x0055ffa47a0c6061f88e59e4815b4ea84a6e1816af39e394e6031c5b85963f3c`. Redeploying changes it; run the bind script of the state plan afterwards, or `cast send <receiver> "setExpectedWorkflowId(bytes32)" <id>` for each receiver.
- Heartbeat receiver: `0xf70A7B7F3980ad337a11096e28f7ADa73Eb91ef9` (forwarder `0x76c9cf548b4179F8901cda1f8623568b58215E62`), bound to the ID above.
- State contract `AgentState`: `0xc8224D78e864476258785646a93a6884967b3973`, bound to the same ID. `AGENT_MASTER` lives in the Vault DON (`cre secrets create secrets.yaml --target production-settings --secrets-auth=browser --non-interactive --yes`).
- Live proof: a sealed profile submitted on chain (`0xa0b40ded9dad32a4d78279c5eac4e0edc1ac3c39973bb58a6fd18a2104618ff8`) was opened by the enclave and published as encrypted state version 1; the execution wrote no logs. A log trigger needs a few minutes after activation before it fires.
- First real report: transaction `0x3e3a917d2c60cd168cccb7fadf009b2621e5ff2fea27172e43b4da0e2a490ce5` (block 67396999): the workflow read the vault factory's implementation at a finalized block and the DON delivered the signed report through the forwarder.
- The workflow is paused between checks (`cre workflow pause|activate ./agent --target production-settings --non-interactive --yes`); the heartbeat schedule is every 10 minutes.
- A simulator broadcast is not used as proof of a write: its mock forwarder carries no workflow metadata, so receivers bound to a workflow ID never see it.
- Executor `AgentExecutor`: `0x62a31CAFaeff7CEc4944dc4DeDa5b88e34aBCd19`, set as `AgentState.executor` and bound to the workflow ID. The deposit poll runs every minute inside the enclave.
- Live proof: a real 1 USDC deposit into a delegated vault was split by the agent with no human step (operating +840000, profit +160000, state v3), transaction `0xb99a33a213ac47eb6fe07f12baf393cb2be67212dc40f2941bc4dc6c594c61c1`; the script then revoked the agent and returned the funds.
- Salary and tick: the executor with the `PAY_SALARY` and `TICK` actions is deployed and the daily handler runs in the enclave simulator; the live salary-day proof waits for the vault's one-day payee approval and is recorded here when it runs.
- Signed user actions: the HTTP trigger accepts requests from the gateway address `0x2dBE8E7053A1B7e1f315A91a60A9b04EF1641b01` (its key is held outside the repository); the handler runs in the enclave simulator. The live signed-approval proof waits for the vault's one-day payee approval and is recorded here when it runs. The gateway accepts one request per 30 seconds per workflow.
- Executor with the private spend: `0xB4FcFEfcDA83D274Aa466eacDB44095C50665262` (pool `0x20a16Ea01dC22D834CcC4962BB9153eeBa733D9F`), set as `AgentState.executor`; workflow ID `0x006d2d44bd7d63b31b303cbd4796e3a92ffb08694a6b99b83818dd93154429a9`, bound to the heartbeat, state and executor.
- Prover service: https://prover-production-9f66.up.railway.app (Railway). First proof after a cold start took about 23 s, warm proofs take about 0.6 s; the request to the service uses a 60 s timeout.
- Live proof of the private spend through the deployed workflow: 300000 paid to the allowlisted payee, `Spent` transaction `0xd5bfe81b2f258ebe351d8284a1fcedf025e21817654746ed150115d6886fd802` (block 67415200), the 700000 change note kept in the encrypted state.
- The public Arc RPC rate-limits back-to-back batches; the workflow reads through `https://rpc.blockdaemon.testnet.arc.network`.
- The confidential runtime has no `btoa`: base64 is written out in the prover protocol module.
