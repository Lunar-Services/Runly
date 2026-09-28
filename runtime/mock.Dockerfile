FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv bash ca-certificates curl \
    && python3 -m venv /opt/bridge-env \
    && /opt/bridge-env/bin/pip install --no-cache-dir websocket-client==1.8.0 \
    && rm -rf /var/lib/apt/lists/*
COPY bridge.py /opt/runly/bridge.py
ENV PATH="/opt/bridge-env/bin:${PATH}"
USER node
WORKDIR /workspace
CMD ["sleep", "infinity"]
