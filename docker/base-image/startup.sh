#!/bin/bash
# Startup script for combined Claude Code + VS Code Server container
# Handles graceful startup and shutdown of multiple services
# NOTE: No 'set -e' - container must stay alive even if code-server fails

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

CODE_SERVER_PID=""

# Trap signals for graceful shutdown
cleanup() {
    log_info "Received shutdown signal, cleaning up..."

    # Kill code-server if running
    if [ -n "$CODE_SERVER_PID" ]; then
        log_info "Stopping code-server (PID: $CODE_SERVER_PID)..."
        kill -TERM "$CODE_SERVER_PID" 2>/dev/null || true
        wait "$CODE_SERVER_PID" 2>/dev/null || true
    fi

    log_info "Cleanup complete, exiting..."
    exit 0
}

trap cleanup SIGTERM SIGINT SIGQUIT

start_code_server() {
    log_info "Starting VS Code Server on port 8080..."
    code-server \
        --bind-addr 0.0.0.0:8080 \
        --auth none \
        --disable-telemetry \
        /workspace &
    CODE_SERVER_PID=$!
    log_info "VS Code Server started (PID: $CODE_SERVER_PID)"
}

# Main startup sequence
main() {
    log_info "Starting Claude Code + VS Code Server container..."

    # Ensure workspace directory exists (use sudo if needed)
    if [ ! -d "/workspace" ]; then
        log_warn "Workspace directory not found, creating..."
        sudo mkdir -p /workspace 2>/dev/null || mkdir -p /workspace 2>/dev/null || true
        sudo chown developer:developer /workspace 2>/dev/null || true
    fi

    # Check if .claude directory exists, create if not
    if [ ! -d "/home/developer/.claude" ]; then
        log_warn ".claude directory not found, creating..."
        mkdir -p /home/developer/.claude/{agents,skills,rules,cache} 2>/dev/null || true
    fi

    # Start code-server
    start_code_server

    log_info "All services started successfully"
    log_info "VS Code Server: http://localhost:8080"
    log_info "Claude Code: Run 'claude' in terminal"

    # Keep the container alive - restart code-server if it crashes
    log_info "Container ready, monitoring services..."
    while true; do
        if [ -n "$CODE_SERVER_PID" ] && ! kill -0 "$CODE_SERVER_PID" 2>/dev/null; then
            log_warn "code-server exited, restarting in 5s..."
            sleep 5
            start_code_server
        fi
        sleep 5
    done
}

# Run main function
main
