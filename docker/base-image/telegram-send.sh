#!/bin/bash
# telegram-send - Envia mensagens para o usuario dono do container via Telegram
#
# Usage: telegram-send <message>
# Envia para o usuario dono do container automaticamente
#
# O CONTAINER_ID eh definido automaticamente pelo ambiente do container.
# A mensagem eh enviada via API REST para o backend que roteia para o Telegram.

set -e

# Verificar se mensagem foi fornecida
if [ -z "$1" ]; then
    echo "Uso: telegram-send <mensagem>"
    echo "Exemplo: telegram-send 'Build concluido com sucesso!'"
    exit 1
fi

MESSAGE="$*"

# Verificar se CONTAINER_ID esta definido
if [ -z "$CONTAINER_ID" ]; then
    echo "Erro: CONTAINER_ID nao esta definido no ambiente."
    echo "Este script deve ser executado dentro de um container Claude Docker."
    exit 1
fi

# Endpoint do backend (host.docker.internal aponta para o host)
BACKEND_URL="${BACKEND_URL:-http://host.docker.internal:8000}"
ENDPOINT="${BACKEND_URL}/api/telegram/send-from-container"

# Enviar mensagem via curl
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$ENDPOINT" \
    -H "Content-Type: application/json" \
    -d "{\"containerId\": \"$CONTAINER_ID\", \"message\": \"$MESSAGE\"}" \
    2>/dev/null || echo -e "\n000")

# Separar body e status code
HTTP_BODY=$(echo "$RESPONSE" | head -n -1)
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)

# Verificar resposta
if [ "$HTTP_CODE" = "200" ]; then
    echo "Mensagem enviada com sucesso!"
    exit 0
elif [ "$HTTP_CODE" = "000" ]; then
    echo "Erro: Nao foi possivel conectar ao backend."
    echo "Verifique se o servico claude-docker-backend esta rodando."
    exit 1
else
    echo "Erro ao enviar mensagem (HTTP $HTTP_CODE)"
    echo "$HTTP_BODY"
    exit 1
fi
