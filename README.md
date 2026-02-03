<p align="center">
  <img src="https://img.shields.io/badge/Version-1.0.0-blue?style=for-the-badge" alt="Version">
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License">
  <img src="https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js&logoColor=white" alt="Next.js">
  <img src="https://img.shields.io/badge/Docker-Required-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker">
</p>

<h1 align="center">>_ Claude Docker Manager</h1>

<p align="center">
  <strong>Dashboard web para gerenciar containers Docker com Claude Code e VS Code</strong>
</p>

<p align="center">
  <a href="#-funcionalidades">Funcionalidades</a> •
  <a href="#-instalacao">Instalação</a> •
  <a href="#-uso">Uso</a> •
  <a href="#-configuracao">Configuração</a> •
  <a href="#-tecnologias">Tecnologias</a>
</p>

---

## 🌟 Funcionalidades

Interface web moderna com tema terminal para criar e gerenciar **containers Docker isolados** com Claude Code e VS Code integrados.

| Recurso | Descrição |
|---------|-----------|
| 🐳 **Containers Isolados** | Cada projeto em seu próprio container Docker |
| 🤖 **Claude Code** | Assistente de IA para desenvolvimento |
| 💻 **VS Code Server** | IDE no navegador via code-server |
| 📊 **Métricas em Tempo Real** | CPU, memória e disco por container |
| 🌐 **Interface Web** | Dashboard moderno com tema terminal |
| 🌍 **Multilíngue** | Português (BR) e English |

### ✨ Destaques

- 🔒 **Isolamento total** entre projetos
- 📋 **Dashboard** com status de todos os containers
- 🔐 **Autenticação** do Claude via navegador
- 🔑 **SSH/GitHub** configurável pela web
- 🎨 **Tema terminal** com cores verdes
- 📱 **Responsivo** - funciona em qualquer dispositivo

---

## 🚀 Instalação

### Pré-requisitos

- Docker instalado e rodando
- Node.js 18+ e pnpm
- Usuário no grupo docker

### Instalação Rápida

```bash
# Clone o repositório
git clone https://github.com/pir0c0pter0/claude-docker.git
cd claude-docker

# Instale
./install-local.sh

# Inicie o dashboard
claude-docker-web
```

### Instalação Manual

```bash
# Clone
git clone https://github.com/pir0c0pter0/claude-docker.git
cd claude-docker

# Instale dependências
pnpm install

# Build
pnpm build

# Copie para local
mkdir -p ~/.local/share/claude-docker-web
cp -r packages ~/.local/share/claude-docker-web/
cp -r docker ~/.local/share/claude-docker-web/

# Copie o script de inicialização
cp install-local.sh ~/.local/bin/claude-docker-web
chmod +x ~/.local/bin/claude-docker-web
```

---

## 🎯 Uso

### Iniciar o Dashboard

```bash
claude-docker-web
```

Acesse: **http://localhost:3000**

### Criar Container

1. Clique em **"+ Novo Container"**
2. Preencha:
   - **Nome**: identificador único
   - **Template**: Claude, VS Code ou ambos
   - **Modo**: interativo ou autônomo
   - **Repositório**: pasta vazia ou clone do GitHub
   - **Recursos**: CPU, memória e disco
3. Clique em **"Criar Container"**

### Acessar Container

- **Terminal**: clique em "Terminal" para abrir shell
- **VS Code**: clique em "VS Code" para abrir IDE no navegador
- **Iniciar/Parar**: controle o estado do container

### Configurações

Acesse **Configurações** para:

- 🌍 **Idioma**: alternar entre PT-BR e English
- 🔐 **Claude Auth**: autenticar no Claude Code
- 🔑 **GitHub/SSH**: gerar e configurar chaves SSH
- 📊 **Status**: verificar Docker, Redis e sistema

---

## ⚙️ Configuração

### Estrutura de Diretórios

```
~/.local/share/claude-docker-web/     # Instalação
├── packages/
│   ├── backend/                      # API Express
│   ├── frontend/                     # Next.js
│   └── shared/                       # Tipos compartilhados
├── docker/
│   └── base-image/                   # Dockerfiles

~/.config/claude-docker-web/          # Configuração do usuário
├── config.env                        # Variáveis de ambiente
├── containers.json                   # Dados dos containers
└── *.log                             # Logs
```

### Variáveis de Ambiente

Edite `~/.config/claude-docker-web/config.env`:

```env
PORT=8000
FRONTEND_PORT=3000
NODE_ENV=production
REDIS_URL=redis://localhost:6379

# Limites padrão
DEFAULT_CPU_LIMIT=2
DEFAULT_MEMORY_LIMIT=2048
DEFAULT_DISK_LIMIT=10240
```

### Portas

| Serviço | Porta |
|---------|-------|
| Frontend | 3000 |
| Backend API | 8000 |
| WebSocket | 8000 |

---

## 🛠️ Tecnologias

### Backend
- **Express.js** - API REST
- **TypeScript** - Tipagem estática
- **Dockerode** - API do Docker
- **Socket.io** - WebSocket para métricas
- **Zod** - Validação de dados

### Frontend
- **Next.js 15** - Framework React
- **React 19** - Interface de usuário
- **TailwindCSS** - Estilização
- **Zustand** - Gerenciamento de estado

### Infraestrutura
- **Docker** - Containers isolados
- **code-server** - VS Code no navegador
- **pnpm** - Gerenciador de pacotes

---

## 🔧 Troubleshooting

### Docker não inicia

```bash
sudo systemctl start docker
sudo systemctl enable docker
```

### Permissão negada no Docker

```bash
sudo usermod -aG docker $USER
newgrp docker
```

### Porta em uso

```bash
# Verificar processos nas portas
lsof -i :3000 -i :8000

# Matar processos
fuser -k 3000/tcp 8000/tcp
```

### Erro de build

```bash
cd ~/.local/share/claude-docker-web
pnpm install
pnpm build
```

---

## 📄 Licença

MIT License - veja [LICENSE](LICENSE)

---

<p align="center">
  <code>>_ claude-docker-web v1.0.0</code>
</p>

<p align="center">
  Feito com 🐳 e Claude Code no CachyOS 🐧
</p>

<p align="center">
  <strong>Autor:</strong> <a href="https://github.com/pir0c0pter0">@pir0c0pter0</a>
</p>
