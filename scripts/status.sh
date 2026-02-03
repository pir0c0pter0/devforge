#!/bin/bash
# Script para verificar status dos serviços

echo "📊 Status dos serviços claude-docker-web"
echo ""

# Backend
echo -n "Backend (8000):  "
if curl -s http://localhost:8000/health > /dev/null 2>&1; then
    health=$(curl -s http://localhost:8000/health)
    echo "✅ Rodando - $health"
else
    echo "❌ Parado"
fi

# Frontend
echo -n "Frontend (3000): "
status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null)
if [ "$status" = "200" ]; then
    echo "✅ Rodando"
else
    echo "❌ Parado (HTTP $status)"
fi

# Docker
echo -n "Docker:          "
if docker ps > /dev/null 2>&1; then
    echo "✅ Acessível"
elif sg docker -c "docker ps" > /dev/null 2>&1; then
    echo "⚠️  Acessível via 'sg docker'"
else
    echo "❌ Sem acesso"
fi

echo ""
