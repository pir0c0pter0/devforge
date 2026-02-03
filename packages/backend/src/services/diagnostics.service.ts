import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { dockerService } from './docker.service';

const execAsync = promisify(exec);

export interface DiagnosticCheck {
  name: string;
  status: 'ok' | 'warning' | 'error';
  message: string;
  details?: string[];
  fixInstructions?: string[];
}

export interface DiagnosticsResult {
  timestamp: string;
  system: {
    user: string;
    platform: string;
    release: string;
  };
  checks: DiagnosticCheck[];
  summary: {
    total: number;
    ok: number;
    warnings: number;
    errors: number;
  };
}

class DiagnosticsService {
  /**
   * Run all diagnostics
   */
  async runAll(): Promise<DiagnosticsResult> {
    const checks: DiagnosticCheck[] = [];

    // Run all checks in parallel where possible
    const [
      dockerDaemon,
      dockerGroup,
      dockerImages,
      orphanContainers,
      redis,
      sshKeys,
      ports,
      diskSpace,
    ] = await Promise.all([
      this.checkDockerDaemon(),
      this.checkDockerGroup(),
      this.checkDockerImages(),
      this.checkOrphanContainers(),
      this.checkRedis(),
      this.checkSshKeys(),
      this.checkPorts(),
      this.checkDiskSpace(),
    ]);

    checks.push(
      dockerDaemon,
      dockerGroup,
      dockerImages,
      orphanContainers,
      redis,
      sshKeys,
      ports,
      diskSpace
    );

    const summary = {
      total: checks.length,
      ok: checks.filter((c) => c.status === 'ok').length,
      warnings: checks.filter((c) => c.status === 'warning').length,
      errors: checks.filter((c) => c.status === 'error').length,
    };

    return {
      timestamp: new Date().toISOString(),
      system: {
        user: os.userInfo().username,
        platform: os.platform(),
        release: os.release(),
      },
      checks,
      summary,
    };
  }

  /**
   * Check Docker daemon status
   */
  async checkDockerDaemon(): Promise<DiagnosticCheck> {
    try {
      const isRunning = await dockerService.ping();

      if (isRunning) {
        const version = await this.getDockerVersion();
        return {
          name: 'Docker Daemon',
          status: 'ok',
          message: `Docker está rodando${version ? ` (${version})` : ''}`,
        };
      }

      return {
        name: 'Docker Daemon',
        status: 'error',
        message: 'Docker daemon não está rodando',
        fixInstructions: [
          'sudo systemctl start docker',
          'sudo systemctl enable docker',
        ],
      };
    } catch (error) {
      return {
        name: 'Docker Daemon',
        status: 'error',
        message: 'Não foi possível conectar ao Docker',
        details: [error instanceof Error ? error.message : 'Erro desconhecido'],
        fixInstructions: [
          'sudo systemctl start docker',
          'sudo systemctl enable docker',
        ],
      };
    }
  }

  /**
   * Get Docker version
   */
  private async getDockerVersion(): Promise<string | null> {
    try {
      const { stdout } = await execAsync('docker --version');
      const match = stdout.match(/Docker version ([^,]+)/);
      return match && match[1] ? match[1] : null;
    } catch {
      return null;
    }
  }

  /**
   * Check Docker group membership
   */
  async checkDockerGroup(): Promise<DiagnosticCheck> {
    try {
      const currentUser = os.userInfo().username;

      // Check if docker group exists
      try {
        await execAsync('getent group docker');
      } catch {
        return {
          name: 'Docker Group',
          status: 'error',
          message: "Grupo 'docker' não existe",
          fixInstructions: ['sudo groupadd docker'],
        };
      }

      // Check if user is in docker group
      const { stdout: groups } = await execAsync(`groups ${currentUser}`);

      if (groups.includes('docker')) {
        // Check if group is active in current session
        const { stdout: activeGroups } = await execAsync('id -nG');

        if (activeGroups.includes('docker')) {
          return {
            name: 'Docker Group',
            status: 'ok',
            message: `Usuário '${currentUser}' está no grupo docker`,
          };
        }

        return {
          name: 'Docker Group',
          status: 'warning',
          message: 'Grupo docker não está ativo na sessão atual',
          fixInstructions: [
            'newgrp docker',
            'Ou faça logout e login novamente',
          ],
        };
      }

      return {
        name: 'Docker Group',
        status: 'error',
        message: `Usuário '${currentUser}' não está no grupo docker`,
        fixInstructions: [
          `sudo usermod -aG docker ${currentUser}`,
          'Após adicionar, faça logout e login, ou execute: newgrp docker',
        ],
      };
    } catch (error) {
      return {
        name: 'Docker Group',
        status: 'warning',
        message: 'Não foi possível verificar grupo docker',
        details: [error instanceof Error ? error.message : 'Erro desconhecido'],
      };
    }
  }

  /**
   * Check required Docker images
   */
  async checkDockerImages(): Promise<DiagnosticCheck> {
    const requiredImages = [
      'claude-docker/claude:latest',
      'claude-docker/both:latest',
    ];
    const missingImages: string[] = [];
    const foundImages: string[] = [];

    try {
      for (const image of requiredImages) {
        const exists = await dockerService.imageExists(image);
        if (exists) {
          foundImages.push(image);
        } else {
          missingImages.push(image);
        }
      }

      if (missingImages.length === 0) {
        return {
          name: 'Docker Images',
          status: 'ok',
          message: `Todas as ${requiredImages.length} imagens estão disponíveis`,
          details: foundImages.map((img) => `✓ ${img}`),
        };
      }

      return {
        name: 'Docker Images',
        status: 'error',
        message: `${missingImages.length} imagem(ns) faltando`,
        details: [
          ...foundImages.map((img) => `✓ ${img}`),
          ...missingImages.map((img) => `✗ ${img}`),
        ],
        fixInstructions: [
          'cd docker/',
          ...missingImages.map((img) => {
            const dockerfile = img.includes('claude')
              ? 'Dockerfile.claude'
              : 'Dockerfile.both';
            return `docker build -f ${dockerfile} -t ${img} .`;
          }),
        ],
      };
    } catch (error) {
      return {
        name: 'Docker Images',
        status: 'warning',
        message: 'Não foi possível verificar imagens',
        details: [error instanceof Error ? error.message : 'Erro desconhecido'],
      };
    }
  }

  /**
   * Check for orphan containers
   */
  async checkOrphanContainers(): Promise<DiagnosticCheck> {
    try {
      const containers = await dockerService.listContainers(true);
      const claudeContainers = containers.filter((c) =>
        c.Names?.some((n) => n.includes('claude-docker-'))
      );

      if (claudeContainers.length === 0) {
        return {
          name: 'Containers Órfãos',
          status: 'ok',
          message: 'Nenhum container claude-docker encontrado',
        };
      }

      const running = claudeContainers.filter((c) => c.State === 'running');
      const stopped = claudeContainers.filter((c) => c.State !== 'running');

      if (stopped.length === 0) {
        return {
          name: 'Containers Órfãos',
          status: 'ok',
          message: `${running.length} container(s) em execução`,
        };
      }

      return {
        name: 'Containers Órfãos',
        status: 'warning',
        message: `${stopped.length} container(s) parado(s)`,
        details: [
          `Em execução: ${running.length}`,
          `Parados: ${stopped.length}`,
          ...stopped.map(
            (c) => `✗ ${c.Names?.[0]?.replace('/', '') || c.Id.slice(0, 12)}`
          ),
        ],
        fixInstructions: [
          "docker container prune -f --filter 'label=app=claude-docker'",
        ],
      };
    } catch (error) {
      return {
        name: 'Containers Órfãos',
        status: 'warning',
        message: 'Não foi possível verificar containers',
        details: [error instanceof Error ? error.message : 'Erro desconhecido'],
      };
    }
  }

  /**
   * Check Redis status
   */
  async checkRedis(): Promise<DiagnosticCheck> {
    try {
      const { stdout } = await execAsync('redis-cli ping');

      if (stdout.trim() === 'PONG') {
        // Get Redis version
        const { stdout: info } = await execAsync(
          "redis-cli INFO server | grep redis_version | cut -d: -f2"
        );
        const version = info.trim();

        return {
          name: 'Redis',
          status: 'ok',
          message: `Redis está rodando${version ? ` (v${version})` : ''}`,
        };
      }

      return {
        name: 'Redis',
        status: 'warning',
        message: 'Redis não está respondendo',
        fixInstructions: [
          'sudo systemctl start redis',
          'sudo systemctl enable redis',
        ],
      };
    } catch (error) {
      // Check if redis-cli exists
      try {
        await execAsync('which redis-cli');
        return {
          name: 'Redis',
          status: 'warning',
          message: 'Redis não está rodando',
          fixInstructions: [
            'sudo systemctl start redis',
            'sudo systemctl enable redis',
          ],
        };
      } catch {
        return {
          name: 'Redis',
          status: 'warning',
          message: 'Redis não está instalado (opcional)',
          details: ['Redis é opcional mas recomendado para caching'],
          fixInstructions: [
            'sudo apt install redis-server  # Debian/Ubuntu',
            'sudo pacman -S redis           # Arch Linux',
          ],
        };
      }
    }
  }

  /**
   * Check SSH keys
   */
  async checkSshKeys(): Promise<DiagnosticCheck> {
    const homeDir = os.homedir();
    const sshDir = path.join(homeDir, '.ssh');
    const issues: string[] = [];
    const details: string[] = [];

    // Check if .ssh directory exists
    if (!fs.existsSync(sshDir)) {
      return {
        name: 'SSH Keys',
        status: 'error',
        message: 'Diretório ~/.ssh não existe',
        fixInstructions: ['mkdir -p ~/.ssh && chmod 700 ~/.ssh'],
      };
    }

    // Check .ssh permissions
    try {
      const stats = fs.statSync(sshDir);
      const perms = (stats.mode & 0o777).toString(8);

      if (perms !== '700') {
        issues.push(`Permissões do ~/.ssh incorretas: ${perms} (deveria ser 700)`);
      } else {
        details.push('✓ Permissões do ~/.ssh corretas (700)');
      }
    } catch {
      issues.push('Não foi possível verificar permissões do ~/.ssh');
    }

    // Check for key files
    const keyTypes = ['id_rsa', 'id_ed25519', 'id_ecdsa'];
    let foundKeys = 0;

    for (const key of keyTypes) {
      const keyPath = path.join(sshDir, key);

      if (fs.existsSync(keyPath)) {
        foundKeys++;
        const stats = fs.statSync(keyPath);
        const perms = (stats.mode & 0o777).toString(8);

        if (perms !== '600') {
          issues.push(`Permissões de ${key} incorretas: ${perms} (deveria ser 600)`);
        } else {
          details.push(`✓ Chave ${key} encontrada com permissões corretas`);
        }
      }
    }

    if (foundKeys === 0) {
      issues.push('Nenhuma chave SSH encontrada');
    }

    // Check GitHub connectivity
    try {
      const { stderr } = await execAsync('ssh -T git@github.com 2>&1 || true');

      if (stderr.includes('successfully authenticated')) {
        const userMatch = stderr.match(/Hi ([^!]+)!/);
        details.push(
          `✓ Autenticado no GitHub${userMatch ? ` como ${userMatch[1]}` : ''}`
        );
      } else if (stderr.includes('Permission denied')) {
        issues.push('Chave SSH não está configurada no GitHub');
      }
    } catch {
      // SSH test might fail, that's okay
    }

    if (issues.length === 0) {
      return {
        name: 'SSH Keys',
        status: 'ok',
        message: `${foundKeys} chave(s) SSH configurada(s)`,
        details,
      };
    }

    const status = foundKeys === 0 ? 'error' : 'warning';

    return {
      name: 'SSH Keys',
      status,
      message:
        issues.length === 1 ? (issues[0] ?? 'Problema encontrado') : `${issues.length} problema(s) encontrado(s)`,
      details: [...details, ...issues.map((i) => `✗ ${i}`)],
      fixInstructions:
        foundKeys === 0
          ? [
              'ssh-keygen -t ed25519 -C "seu-email@exemplo.com"',
              'Adicione a chave pública em: https://github.com/settings/keys',
            ]
          : undefined,
    };
  }

  /**
   * Check network ports
   */
  async checkPorts(): Promise<DiagnosticCheck> {
    const ports = [
      { port: 3000, service: 'Frontend' },
      { port: 8000, service: 'Backend' },
    ];
    const details: string[] = [];
    let inUseCount = 0;

    for (const { port, service } of ports) {
      try {
        const { stdout } = await execAsync(`lsof -t -i:${port} 2>/dev/null || true`);
        const pid = stdout.trim();

        if (pid) {
          const { stdout: processName } = await execAsync(
            `ps -p ${pid} -o comm= 2>/dev/null || true`
          );
          details.push(
            `Porta ${port} (${service}): em uso por ${processName.trim() || 'processo desconhecido'} (PID: ${pid})`
          );
          inUseCount++;
        } else {
          details.push(`Porta ${port} (${service}): disponível`);
        }
      } catch {
        details.push(`Porta ${port} (${service}): não foi possível verificar`);
      }
    }

    return {
      name: 'Portas de Rede',
      status: 'ok',
      message:
        inUseCount > 0
          ? `${inUseCount} porta(s) em uso`
          : 'Todas as portas disponíveis',
      details,
    };
  }

  /**
   * Check disk space
   */
  async checkDiskSpace(): Promise<DiagnosticCheck> {
    try {
      const { stdout } = await execAsync("df -h / | awk 'NR==2 {print $5, $4}'");
      const [usageStr, available] = stdout.trim().split(' ');
      const usage = parseInt(usageStr?.replace('%', '') || '0', 10);

      let status: 'ok' | 'warning' | 'error' = 'ok';
      let message = `${usage}% usado (${available} disponível)`;

      if (usage > 90) {
        status = 'error';
        message = `Disco quase cheio: ${usage}% usado`;
      } else if (usage > 80) {
        status = 'warning';
        message = `Pouco espaço: ${usage}% usado`;
      }

      const details: string[] = [`Espaço disponível: ${available}`];

      // Get Docker disk usage if possible
      try {
        const { stdout: dockerDf } = await execAsync(
          'docker system df --format "{{.Type}}: {{.Size}}" 2>/dev/null'
        );
        if (dockerDf.trim()) {
          details.push('', 'Uso Docker:');
          dockerDf
            .trim()
            .split('\n')
            .forEach((line) => details.push(`  ${line}`));
        }
      } catch {
        // Docker df might fail, that's okay
      }

      return {
        name: 'Espaço em Disco',
        status,
        message,
        details,
        fixInstructions:
          status !== 'ok' ? ['docker image prune -a', 'docker system prune'] : undefined,
      };
    } catch (error) {
      return {
        name: 'Espaço em Disco',
        status: 'warning',
        message: 'Não foi possível verificar espaço em disco',
        details: [error instanceof Error ? error.message : 'Erro desconhecido'],
      };
    }
  }
}

export const diagnosticsService = new DiagnosticsService();
