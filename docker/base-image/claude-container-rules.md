# Container Environment Instructions

## Sistema Operacional

- **Distribuicao:** Debian 12 (Bookworm)
- **Gerenciador de pacotes:** apt-get
- **Shell:** zsh com Oh My Zsh

## Comandos de Instalacao

### Instalar pacotes
```bash
sudo apt-get update && sudo apt-get install -y <pacote>
```

### Atualizar sistema
```bash
sudo apt-get update && sudo apt-get upgrade -y
```

### Remover pacotes
```bash
sudo apt-get remove -y <pacote>
sudo apt-get autoremove -y
```

## Permissoes

- **Sudo:** Configurado com NOPASSWD - nao precisa de senha
- **Modo Autonomo:** Pode fazer instalacoes e remocoes livremente
- **Modo Interativo:** Sempre perguntar antes de instalar/remover

## Ambiente

- Este eh um ambiente isolado (container Docker)
- Pode modificar arquivos de sistema livremente
- Workspace em `/workspace`
- Diretorio home: `/home/developer`
- Usuario: `developer` (UID 1000)

## Ferramentas Pre-Instaladas

- **Node.js:** v22 LTS
- **pnpm:** Gerenciador de pacotes (preferir sobre npm/yarn)
- **Git:** Controle de versao
- **GitHub CLI:** `gh` para operacoes GitHub
- **Python 3:** Para scripts e ferramentas

## Comportamento por Modo

### Modo Autonomo (autonomous)
- Instale dependencias automaticamente quando necessario
- Faca modificacoes de sistema quando necessario
- Nao peca confirmacao para operacoes de rotina
- Execute comandos de build e test sem perguntar
- Crie arquivos e diretorios conforme necessario

### Modo Interativo (interactive)
- Sempre pergunte antes de instalar pacotes
- Peca confirmacao para modificacoes significativas
- Explique o que sera feito antes de executar
- Mostre comandos antes de executa-los

## Comunicacao Externa

### Enviar Mensagens pelo Telegram
Para notificar o usuario via Telegram, use:
```bash
telegram-send "Sua mensagem aqui"
```

A mensagem sera enviada automaticamente para o usuario dono deste container.

## Acesso Externo (Portas)

Quando o usuario precisar acessar um servico de fora do container (ex: testar no navegador):

### Regra: Sempre bind em 0.0.0.0

```bash
# CORRETO - acessivel de fora
pnpm dev --host 0.0.0.0
python -m http.server 8000 --bind 0.0.0.0
uvicorn main:app --host 0.0.0.0

# ERRADO - so funciona dentro do container
pnpm dev
python -m http.server 8000
```

### Descobrir IP do container

```bash
hostname -I | awk '{print $1}'
```

### Informar URL ao usuario

Apos iniciar o servico, informe:
```
Acesse: http://<IP>:<PORTA>
```

Exemplo: `http://172.17.0.2:3000`

## Dicas

- Use `pnpm` ao inves de npm ou yarn
- O repositorio (se clonado) esta em `/workspace`
- Logs do Claude Code vao para stdout/stderr
- Commits devem seguir Conventional Commits
