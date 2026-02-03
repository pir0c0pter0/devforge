#!/bin/bash
# Script para ver logs dos serviços

LOG_DIR="/tmp"

case "${1:-all}" in
    backend|b)
        echo "📋 Logs do Backend:"
        tail -f "$LOG_DIR/backend.log"
        ;;
    frontend|f)
        echo "📋 Logs do Frontend:"
        tail -f "$LOG_DIR/frontend.log"
        ;;
    all|*)
        echo "📋 Logs (Backend + Frontend):"
        tail -f "$LOG_DIR/backend.log" "$LOG_DIR/frontend.log"
        ;;
esac
