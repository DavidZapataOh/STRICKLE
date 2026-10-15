# Deployed agent workflow (Arc testnet)

- Workflow: `strickle-agent` in the CRE private registry (one workflow holds every handler; the organization has no more private slots).
- Current workflow ID: `0x00ffe1803b83a4814028e4e789071e680cf580770f4d88c9b097f20e372e70d1`. Redeploying changes it; run the bind script of the state plan afterwards, or `cast send <receiver> "setExpectedWorkflowId(bytes32)" <id>` for each receiver.
- Heartbeat receiver: `0xf70A7B7F3980ad337a11096e28f7ADa73Eb91ef9` (forwarder `0x76c9cf548b4179F8901cda1f8623568b58215E62`), bound to the ID above.
- First real report: transaction `0x3e3a917d2c60cd168cccb7fadf009b2621e5ff2fea27172e43b4da0e2a490ce5` (block 67396999): the workflow read the vault factory's implementation at a finalized block and the DON delivered the signed report through the forwarder.
- The workflow is paused between checks (`cre workflow pause|activate ./agent --target production-settings --non-interactive --yes`); the heartbeat schedule is every 10 minutes.
- A simulator broadcast is not used as proof of a write: its mock forwarder carries no workflow metadata, so receivers bound to a workflow ID never see it.
