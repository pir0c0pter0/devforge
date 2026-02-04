# Claude Code + VS Code Combined Base Image
# Production-ready container with Claude Code, VS Code Server, and multi-language support
# Optimized for size with multi-stage builds

# ==============================================================================
# Stage 1: Build tools and language runtimes
# ==============================================================================
FROM node:22-bookworm AS builder

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive \
    GO_VERSION=1.22.0 \
    RUST_VERSION=1.75.0

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Download and prepare Go
RUN curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-$(dpkg --print-architecture).tar.gz" \
    -o /tmp/go.tar.gz \
    && tar -C /tmp -xzf /tmp/go.tar.gz

# ==============================================================================
# Stage 2: Final runtime image
# ==============================================================================
FROM node:22-bookworm-slim

LABEL maintainer="claude-docker"
LABEL description="Combined Claude Code + VS Code Server development environment with multi-language support"
LABEL version="2.0.0"

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive \
    NODE_ENV=development \
    PNPM_HOME=/usr/local/share/pnpm \
    PATH=/usr/local/share/pnpm:/usr/local/go/bin:/home/developer/.cargo/bin:/home/developer/go/bin:$PATH \
    SHELL=/bin/zsh \
    CODE_SERVER_VERSION=4.23.1 \
    GOPATH=/home/developer/go \
    GOROOT=/usr/local/go \
    CARGO_HOME=/home/developer/.cargo \
    RUSTUP_HOME=/home/developer/.rustup \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8

# Install system dependencies and common development tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Version control
    git \
    git-lfs \
    # Download tools
    curl \
    wget \
    # Text editors
    vim \
    nano \
    # System utilities
    sudo \
    zsh \
    jq \
    unzip \
    zip \
    gzip \
    tar \
    less \
    tree \
    file \
    # SSH and networking
    openssh-client \
    ca-certificates \
    gnupg \
    lsb-release \
    netcat-openbsd \
    iputils-ping \
    dnsutils \
    # Build essentials
    build-essential \
    cmake \
    pkg-config \
    # Python
    python3 \
    python3-pip \
    python3-venv \
    python3-dev \
    # Process management
    dumb-init \
    # Terminal multiplexer and monitoring
    tmux \
    htop \
    # Database clients
    postgresql-client \
    # Additional tools
    ripgrep \
    fd-find \
    fzf \
    bat \
    locales \
    && rm -rf /var/lib/apt/lists/*

# Generate locales
RUN sed -i -e 's/# en_US.UTF-8 UTF-8/en_US.UTF-8 UTF-8/' /etc/locale.gen && \
    locale-gen

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# Install code-server
RUN curl -fsSL https://code-server.dev/install.sh | sh -s -- --version=${CODE_SERVER_VERSION}

# Copy Go from builder stage
COPY --from=builder /tmp/go /usr/local/go

# Create non-root user with sudo privileges
ARG USER_UID=1000
ARG USER_GID=1000
RUN groupadd --gid $USER_GID developer \
    && useradd --uid $USER_UID --gid $USER_GID -m -s /bin/zsh developer \
    && echo "developer ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers.d/developer \
    && chmod 0440 /etc/sudoers.d/developer

# Switch to non-root user for remaining setup
USER developer
WORKDIR /home/developer

# Install Oh My Zsh for better shell experience
RUN sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended

# Configure zsh with useful aliases and environment
RUN echo 'export PATH="$PNPM_HOME:$GOROOT/bin:$GOPATH/bin:$CARGO_HOME/bin:$PATH"' >> ~/.zshrc \
    && echo 'export GOPATH="$HOME/go"' >> ~/.zshrc \
    && echo 'export GOROOT="/usr/local/go"' >> ~/.zshrc \
    && echo 'alias ll="ls -lah"' >> ~/.zshrc \
    && echo 'alias la="ls -A"' >> ~/.zshrc \
    && echo 'alias l="ls -CF"' >> ~/.zshrc \
    && echo 'alias claude="npx @anthropic-ai/claude-code"' >> ~/.zshrc \
    && echo 'alias gs="git status"' >> ~/.zshrc \
    && echo 'alias gd="git diff"' >> ~/.zshrc \
    && echo 'alias gc="git commit"' >> ~/.zshrc \
    && echo 'alias gp="git push"' >> ~/.zshrc \
    && echo 'alias gl="git log --oneline -10"' >> ~/.zshrc \
    && echo '# Use batcat if available (Debian names it batcat)' >> ~/.zshrc \
    && echo 'alias bat="batcat"' >> ~/.zshrc \
    && echo '# Use fd-find (Debian names it fdfind)' >> ~/.zshrc \
    && echo 'alias fd="fdfind"' >> ~/.zshrc

# Enable corepack for pnpm
USER root
RUN corepack enable && corepack prepare pnpm@latest --activate

# Switch back to developer user
USER developer

# Configure pnpm store
RUN pnpm config set store-dir /home/developer/.pnpm-store

# Install Claude Code globally
RUN pnpm add -g @anthropic-ai/claude-code

# Install Rust via rustup
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable --profile minimal \
    && . "$HOME/.cargo/env" \
    && rustup component add rustfmt clippy

# Create Go workspace directories
RUN mkdir -p /home/developer/go/{bin,src,pkg}

# Install common Go tools
RUN go install golang.org/x/tools/gopls@latest \
    && go install github.com/go-delve/delve/cmd/dlv@latest \
    && go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest

# Configure code-server for passwordless access
RUN mkdir -p /home/developer/.config/code-server
COPY --chown=developer:developer config.yaml /home/developer/.config/code-server/config.yaml

# Create .claude directory structure and placeholder files for bind mounts
# IMPORTANT: Create empty .credentials.json file to prevent Docker from creating a directory
# when bind mounting host credentials
RUN mkdir -p /home/developer/.claude/agents \
    && mkdir -p /home/developer/.claude/skills \
    && mkdir -p /home/developer/.claude/rules \
    && mkdir -p /home/developer/.claude/cache \
    && mkdir -p /home/developer/.claude/commands \
    && mkdir -p /home/developer/.claude/hooks \
    && mkdir -p /home/developer/.claude/plugins \
    && mkdir -p /home/developer/.claude/get-shit-done \
    && touch /home/developer/.claude/.credentials.json \
    && echo '{"theme":"dark"}' > /home/developer/.claude/settings.json

# Copy container rules for Claude (instructions about the environment)
COPY --chown=developer:developer claude-container-rules.md /home/developer/.claude/rules/container-rules.md

# Copy telegram-send script for notifications
USER root
COPY telegram-send.sh /usr/local/bin/telegram-send
RUN chmod +x /usr/local/bin/telegram-send
USER developer

# Create workspace directory
RUN mkdir -p /home/developer/workspace

# Install VS Code extensions (common development extensions)
RUN code-server --install-extension ms-python.python \
    && code-server --install-extension golang.go \
    && code-server --install-extension rust-lang.rust-analyzer \
    && code-server --install-extension esbenp.prettier-vscode \
    && code-server --install-extension dbaeumer.vscode-eslint \
    && code-server --install-extension bradlc.vscode-tailwindcss \
    && code-server --install-extension formulahendry.auto-rename-tag \
    && code-server --install-extension christian-kohler.path-intellisense \
    && code-server --install-extension eamodio.gitlens \
    && code-server --install-extension PKief.material-icon-theme \
    && code-server --install-extension dracula-theme.theme-dracula

# Copy startup script
USER root
COPY startup.sh /usr/local/bin/startup.sh
RUN chmod +x /usr/local/bin/startup.sh && chown developer:developer /usr/local/bin/startup.sh

USER developer

# Expose ports
# 3000 - Frontend dev server (Next.js, React)
# 4000 - Backend API server
# 5173 - Vite dev server
# 8000 - Python/FastAPI server
# 8080 - VS Code Server
# 8081 - Additional service port
EXPOSE 3000 4000 5173 8000 8080 8081

# Set working directory
WORKDIR /home/developer/workspace

# Health check (check code-server and container state)
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:8080/healthz && pnpm --version || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start services via startup script
CMD ["/usr/local/bin/startup.sh"]
