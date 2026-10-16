# apps/prover/Dockerfile (built from the repository root)
FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl git tar && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
RUN npm ci --workspace=@strickle/prover-service --include-workspace-root
RUN node scripts/toolchain.mjs install && npm run circuits:compile
ENV PROVER_CIRCUITS=/app/circuits/target HOST=0.0.0.0
WORKDIR /app/apps/prover
CMD ["node", "src/main.ts"]
