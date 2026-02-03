#!/bin/bash
# Startup script for combined Claude Code + VS Code Server container
# Handles graceful startup and shutdown of multiple services

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Trap signals for graceful shutdown
cleanup() {
    log_info "Received shutdown signal, cleaning up..."

    # Kill code-server if running
    if [ ! -z "$CODE_SERVER_PID" ]; then
        log_info "Stopping code-server (PID: $CODE_SERVER_PID)..."
        kill -TERM "$CODE_SERVER_PID" 2>/dev/null || true
        wait "$CODE_SERVER_PID" 2>/dev/null || true
    fi

    log_info "Cleanup complete, exiting..."
    exit 0
}

trap cleanup SIGTERM SIGINT SIGQUIT

# Main startup sequence
main() {
    log_info "Starting Claude Code + VS Code Server container..."

    # Check if workspace directory exists
    if [ ! -d "/home/developer/workspace" ]; then
        log_warn "Workspace directory not found, creating..."
        mkdir -p /home/developer/workspace
    fi

    # Check if .claude directory exists, create if not
    if [ ! -d "/home/developer/.claude" ]; then
        log_warn ".claude directory not found, creating..."
        mkdir -p /home/developer/.claude/{agents,skills,rules,cache}
    fi

    # Start code-server in the background
    log_info "Starting VS Code Server on port 8080..."
    code-server \
        --bind-addr 0.0.0.0:8080 \
        --auth none \
        --disable-telemetry \
        /home/developer/workspace &
    CODE_SERVER_PID=$!

    log_info "VS Code Server started (PID: $CODE_SERVER_PID)"

    # Wait a moment for code-server to start
    sleep 2

    # Verify code-server is running
    if ! kill -0 "$CODE_SERVER_PID" 2>/dev/null; then
        log_error "VS Code Server failed to start"
        exit 1
    fi

    log_info "All services started successfully"
    log_info "VS Code Server: http://localhost:8080"
    log_info "Claude Code: Run 'npx @anthropic-ai/claude-code' in terminal"

    # Keep the container running and wait for signals
    log_info "Container ready, waiting for shutdown signal..."
    wait "$CODE_SERVER_PID"
}

# Run main function
main
