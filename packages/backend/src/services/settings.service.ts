import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { dockerService } from './docker.service';

const execAsync = promisify(exec);

export interface ClaudeStatus {
  authenticated: boolean;
  credentialsPath: string;
  credentialsExists: boolean;
  settingsExists: boolean;
  skillsCount: number;
  agentsCount: number;
  rulesCount: number;
  lastAuthDate?: string;
}

export interface SystemStatus {
  dockerRunning: boolean;
  dockerGroup: boolean;
  redisRunning: boolean;
  sshKeysExist: boolean;
  sshKeyType?: string;
  sshPublicKey?: string;
  githubAuthenticated?: boolean;
  githubUsername?: string;
}

export interface Config {
  port: number;
  frontendPort: number;
  nodeEnv: string;
  redisUrl: string;
  defaultCpuLimit: number;
  defaultMemoryLimit: number;
  defaultDiskLimit: number;
}

class SettingsService {
  /**
   * Get Claude Code authentication status
   */
  async getClaudeStatus(): Promise<ClaudeStatus> {
    const homeDir = os.homedir();
    const credentialsPath = path.join(homeDir, '.claude');
    // Claude Code usa .credentials.json (com ponto)
    const credentialsFile = path.join(credentialsPath, '.credentials.json');
    const credentialsFileAlt = path.join(credentialsPath, 'credentials.json');
    const settingsFile = path.join(credentialsPath, 'settings.json');
    // Claude Code usa 'commands' para skills
    const skillsDir = path.join(credentialsPath, 'commands');
    const agentsDir = path.join(credentialsPath, 'agents');
    const rulesDir = path.join(credentialsPath, 'rules');

    // Verifica ambos os formatos de credenciais
    const credentialsExists = fs.existsSync(credentialsFile) || fs.existsSync(credentialsFileAlt);
    const actualCredentialsFile = fs.existsSync(credentialsFile) ? credentialsFile : credentialsFileAlt;
    const settingsExists = fs.existsSync(settingsFile);

    let skillsCount = 0;
    let agentsCount = 0;
    let rulesCount = 0;
    let lastAuthDate: string | undefined;

    // Count skills (recursively)
    if (fs.existsSync(skillsDir)) {
      try {
        skillsCount = this.countMdFilesRecursive(skillsDir);
      } catch {
        // Ignore errors
      }
    }

    // Count agents (recursively)
    if (fs.existsSync(agentsDir)) {
      try {
        agentsCount = this.countMdFilesRecursive(agentsDir);
      } catch {
        // Ignore errors
      }
    }

    // Count rules (recursively)
    if (fs.existsSync(rulesDir)) {
      try {
        rulesCount = this.countMdFilesRecursive(rulesDir);
      } catch {
        // Ignore errors
      }
    }

    // Get last auth date from credentials file
    if (credentialsExists) {
      try {
        const stats = fs.statSync(actualCredentialsFile);
        lastAuthDate = stats.mtime.toISOString();
      } catch {
        // Ignore errors
      }
    }

    return {
      authenticated: credentialsExists,
      credentialsPath,
      credentialsExists,
      settingsExists,
      skillsCount,
      agentsCount,
      rulesCount,
      lastAuthDate,
    };
  }

  /**
   * Get system status
   */
  async getSystemStatus(): Promise<SystemStatus> {
    const dockerRunning = await this.checkDockerRunning();
    const dockerGroup = await this.checkDockerGroup();
    const redisRunning = await this.checkRedisRunning();
    const sshInfo = await this.checkSshKeys();

    return {
      dockerRunning,
      dockerGroup,
      redisRunning,
      sshKeysExist: sshInfo.exists,
      sshKeyType: sshInfo.keyType,
      sshPublicKey: sshInfo.publicKey,
      githubAuthenticated: sshInfo.githubAuthenticated,
      githubUsername: sshInfo.githubUsername,
    };
  }

  /**
   * Get configuration
   */
  getConfig(): Config {
    return {
      port: parseInt(process.env['PORT'] || '8000', 10),
      frontendPort: parseInt(process.env['FRONTEND_PORT'] || '3000', 10),
      nodeEnv: process.env['NODE_ENV'] || 'development',
      redisUrl: process.env['REDIS_URL'] || 'redis://localhost:6379',
      defaultCpuLimit: parseInt(process.env['DEFAULT_CPU_LIMIT'] || '2', 10),
      defaultMemoryLimit: parseInt(process.env['DEFAULT_MEMORY_LIMIT'] || '2048', 10),
      defaultDiskLimit: parseInt(process.env['DEFAULT_DISK_LIMIT'] || '10240', 10),
    };
  }

  /**
   * Count .md files recursively in a directory
   */
  private countMdFilesRecursive(dir: string): number {
    let count = 0;
    const items = fs.readdirSync(dir, { withFileTypes: true });

    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        count += this.countMdFilesRecursive(fullPath);
      } else if (item.name.endsWith('.md')) {
        count++;
      }
    }

    return count;
  }

  /**
   * Check if Docker is running
   */
  private async checkDockerRunning(): Promise<boolean> {
    try {
      return await dockerService.ping();
    } catch {
      return false;
    }
  }

  /**
   * Check if user is in docker group
   */
  private async checkDockerGroup(): Promise<boolean> {
    try {
      const currentUser = os.userInfo().username;
      const { stdout } = await execAsync(`groups ${currentUser}`);
      return stdout.includes('docker');
    } catch {
      return false;
    }
  }

  /**
   * Check if Redis is running
   */
  private async checkRedisRunning(): Promise<boolean> {
    try {
      const { stdout } = await execAsync('redis-cli ping 2>/dev/null');
      return stdout.trim() === 'PONG';
    } catch {
      return false;
    }
  }

  /**
   * Check SSH keys
   */
  private async checkSshKeys(): Promise<{
    exists: boolean;
    keyType?: string;
    publicKey?: string;
    githubAuthenticated?: boolean;
    githubUsername?: string;
  }> {
    const homeDir = os.homedir();
    const sshDir = path.join(homeDir, '.ssh');
    const keyTypes = ['id_ed25519', 'id_rsa', 'id_ecdsa'];

    let foundKey: string | undefined;
    let publicKey: string | undefined;

    for (const keyType of keyTypes) {
      const keyPath = path.join(sshDir, keyType);
      const pubKeyPath = path.join(sshDir, `${keyType}.pub`);

      if (fs.existsSync(keyPath) && fs.existsSync(pubKeyPath)) {
        foundKey = keyType.replace('id_', '').toUpperCase();
        try {
          publicKey = fs.readFileSync(pubKeyPath, 'utf-8').trim();
        } catch {
          // Ignore errors
        }
        break;
      }
    }

    if (!foundKey) {
      return { exists: false };
    }

    // Check GitHub authentication
    let githubAuthenticated = false;
    let githubUsername: string | undefined;

    try {
      const { stderr } = await execAsync('ssh -T git@github.com 2>&1 || true');
      if (stderr.includes('successfully authenticated')) {
        githubAuthenticated = true;
        const match = stderr.match(/Hi ([^!]+)!/);
        if (match && match[1]) {
          githubUsername = match[1];
        }
      }
    } catch {
      // Ignore errors
    }

    return {
      exists: true,
      keyType: foundKey,
      publicKey,
      githubAuthenticated,
      githubUsername,
    };
  }

  /**
   * Get auth instructions
   */
  getAuthInstructions(): string[] {
    return [
      '1. Abra um terminal',
      '2. Execute o comando: claude',
      '3. Siga as instruções para autenticar via navegador',
      '4. Após autenticar, volte aqui e clique em "Verificar autenticação"',
    ];
  }

  /**
   * Generate SSH key
   */
  async generateSshKey(email: string): Promise<{ success: boolean; error?: string }> {
    const homeDir = os.homedir();
    const sshDir = path.join(homeDir, '.ssh');
    const keyPath = path.join(sshDir, 'id_ed25519');

    // Check if key already exists
    if (fs.existsSync(keyPath)) {
      return { success: false, error: 'SSH key already exists' };
    }

    // Create .ssh directory if it doesn't exist
    if (!fs.existsSync(sshDir)) {
      fs.mkdirSync(sshDir, { mode: 0o700 });
    }

    try {
      await execAsync(`ssh-keygen -t ed25519 -C "${email}" -f "${keyPath}" -N ""`);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate SSH key',
      };
    }
  }

  /**
   * Logout from Claude
   */
  async logoutClaude(): Promise<{ success: boolean; error?: string }> {
    const homeDir = os.homedir();
    const credentialsFile = path.join(homeDir, '.claude', 'credentials.json');

    try {
      if (fs.existsSync(credentialsFile)) {
        fs.unlinkSync(credentialsFile);
      }
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to logout',
      };
    }
  }
}

export const settingsService = new SettingsService();
