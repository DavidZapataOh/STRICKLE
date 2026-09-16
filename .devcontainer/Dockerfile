FROM mcr.microsoft.com/devcontainers/typescript-node:24-trixie

RUN apt-get update && apt-get install -y --no-install-recommends unzip xz-utils \
  && rm -rf /var/lib/apt/lists/*

COPY .compact-version /workspace/.compact-version
COPY .devcontainer/install-tools.sh /tmp/install-tools.sh
RUN bash /tmp/install-tools.sh && rm /tmp/install-tools.sh
