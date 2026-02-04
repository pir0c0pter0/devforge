import { v4 as uuidv4 } from 'uuid';
import { BaseRepository, BaseFilters, PaginatedResult } from './base.repository';
import type {
  ContainerStatus,
  ContainerTemplate,
  ContainerMode,
  RepoType,
} from '../models/container.model';

/**
 * Container database row type
 */
interface ContainerRow {
  id: string;
  docker_id: string;
  name: string;
  template: string;
  mode: string;
  status: string;
  repo_url: string | null;
  repo_type: string;
  ssh_key_path: string | null;
  cpu_limit: number;
  memory_limit: number;
  disk_limit: number;
  config: string;
  network_id: string | null;
  volume_name: string | null;
  vscode_port: number | null;
  vscode_token: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  stopped_at: string | null;
}

/**
 * Container entity type with database fields
 */
export interface ContainerEntity {
  readonly id: string;
  readonly dockerId: string;
  readonly name: string;
  readonly template: ContainerTemplate;
  readonly mode: ContainerMode;
  readonly status: ContainerStatus;
  readonly repoUrl?: string;
  readonly repoType: RepoType;
  readonly sshKeyPath?: string;
  readonly cpuLimit: number;
  readonly memoryLimit: number;
  readonly diskLimit: number;
  readonly config: Record<string, unknown>;
  readonly networkId?: string;
  readonly volumeName?: string;
  readonly vscodePort?: number;
  readonly vscodeToken?: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly startedAt?: Date;
  readonly stoppedAt?: Date;
}

/**
 * Container creation DTO
 */
export interface CreateContainerDto {
  readonly dockerId: string;
  readonly name: string;
  readonly template: ContainerTemplate;
  readonly mode: ContainerMode;
  readonly repoUrl?: string;
  readonly repoType: RepoType;
  readonly sshKeyPath?: string;
  readonly cpuLimit: number;
  readonly memoryLimit: number;
  readonly diskLimit: number;
  readonly config?: Record<string, unknown>;
  readonly networkId?: string;
  readonly volumeName?: string;
  readonly vscodePort?: number;
  readonly vscodeToken?: string;
}

/**
 * Container update DTO
 */
export interface UpdateContainerDto {
  readonly dockerId?: string;
  readonly name?: string;
  readonly status?: ContainerStatus;
  readonly config?: Record<string, unknown>;
  readonly networkId?: string;
  readonly volumeName?: string;
  readonly vscodePort?: number;
  readonly vscodeToken?: string;
  readonly startedAt?: Date;
  readonly stoppedAt?: Date;
  readonly diskLimit?: number;
}

/**
 * Container query filters
 */
export interface ContainerFilters extends BaseFilters {
  readonly status?: ContainerStatus | readonly ContainerStatus[];
  readonly template?: ContainerTemplate;
  readonly mode?: ContainerMode;
  readonly name?: string;
}

/**
 * Container repository for database operations
 */
export class ContainerRepository extends BaseRepository<
  ContainerEntity,
  CreateContainerDto,
  UpdateContainerDto,
  ContainerFilters
> {
  constructor() {
    super('containers');
  }

  /**
   * Convert database row to entity
   */
  private rowToContainer(row: ContainerRow): ContainerEntity {
    return {
      id: row.id,
      dockerId: row.docker_id,
      name: row.name,
      template: row.template as ContainerTemplate,
      mode: row.mode as ContainerMode,
      status: row.status as ContainerStatus,
      repoUrl: row.repo_url || undefined,
      repoType: row.repo_type as RepoType,
      sshKeyPath: row.ssh_key_path || undefined,
      cpuLimit: row.cpu_limit,
      memoryLimit: row.memory_limit,
      diskLimit: row.disk_limit,
      config: JSON.parse(row.config || '{}'),
      networkId: row.network_id || undefined,
      volumeName: row.volume_name || undefined,
      vscodePort: row.vscode_port || undefined,
      vscodeToken: row.vscode_token || undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      startedAt: row.started_at ? new Date(row.started_at) : undefined,
      stoppedAt: row.stopped_at ? new Date(row.stopped_at) : undefined,
    };
  }

  /**
   * Find all containers with optional filters
   */
  findAll(filters?: ContainerFilters): readonly ContainerEntity[] {
    const filterObj = filters ? { ...filters } : {};
    const { clause: whereClause, params: whereParams } = this.buildWhereClause(filterObj);
    const orderClause = this.buildOrderClause(filters) || 'ORDER BY created_at DESC';
    const { clause: limitClause, params: limitParams } = this.buildLimitClause(filters);

    const sql = `
      SELECT * FROM ${this.tableName}
      ${whereClause}
      ${orderClause}
      ${limitClause}
    `;

    const rows = this.db.prepare(sql).all(...whereParams, ...limitParams) as ContainerRow[];
    return rows.map((row) => this.rowToContainer(row));
  }

  /**
   * Find all containers with pagination
   */
  findAllPaginated(filters?: ContainerFilters): PaginatedResult<ContainerEntity> {
    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;

    const data = this.findAll({ ...filters, limit, offset });
    const total = this.count(filters as Partial<ContainerFilters>);

    return {
      data,
      total,
      limit,
      offset,
      hasMore: offset + data.length < total,
    };
  }

  /**
   * Find container by ID
   */
  findById(id: string): ContainerEntity | null {
    const row = this.db
      .prepare(`SELECT * FROM ${this.tableName} WHERE id = ?`)
      .get(id) as ContainerRow | undefined;

    return row ? this.rowToContainer(row) : null;
  }

  /**
   * Find container by Docker ID
   */
  findByDockerId(dockerId: string): ContainerEntity | null {
    const row = this.db
      .prepare(`SELECT * FROM ${this.tableName} WHERE docker_id = ?`)
      .get(dockerId) as ContainerRow | undefined;

    return row ? this.rowToContainer(row) : null;
  }

  /**
   * Find container by name
   */
  findByName(name: string): ContainerEntity | null {
    const row = this.db
      .prepare(`SELECT * FROM ${this.tableName} WHERE name = ?`)
      .get(name) as ContainerRow | undefined;

    return row ? this.rowToContainer(row) : null;
  }

  /**
   * Find containers by status
   */
  findByStatus(status: ContainerStatus | readonly ContainerStatus[]): readonly ContainerEntity[] {
    return this.findAll({ status });
  }

  /**
   * Create a new container
   */
  create(data: CreateContainerDto): ContainerEntity {
    const id = uuidv4();
    const now = new Date().toISOString();

    const sql = `
      INSERT INTO ${this.tableName} (
        id, docker_id, name, template, mode, status, repo_url, repo_type,
        ssh_key_path, cpu_limit, memory_limit, disk_limit, config,
        network_id, volume_name, vscode_port, vscode_token, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, 'creating', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `;

    this.db.prepare(sql).run(
      id,
      data.dockerId,
      data.name,
      data.template,
      data.mode,
      data.repoUrl || null,
      data.repoType,
      data.sshKeyPath || null,
      data.cpuLimit,
      data.memoryLimit,
      data.diskLimit,
      JSON.stringify(data.config || {}),
      data.networkId || null,
      data.volumeName || null,
      data.vscodePort || null,
      data.vscodeToken || null,
      now,
      now
    );

    return this.findById(id)!;
  }

  /**
   * Update a container
   */
  update(id: string, data: UpdateContainerDto): ContainerEntity | null {
    const existing = this.findById(id);
    if (!existing) {
      return null;
    }

    const updates: string[] = [];
    const params: unknown[] = [];

    if (data.dockerId !== undefined) {
      updates.push('docker_id = ?');
      params.push(data.dockerId);
    }
    if (data.name !== undefined) {
      updates.push('name = ?');
      params.push(data.name);
    }
    if (data.status !== undefined) {
      updates.push('status = ?');
      params.push(data.status);
    }
    if (data.config !== undefined) {
      updates.push('config = ?');
      params.push(JSON.stringify(data.config));
    }
    if (data.networkId !== undefined) {
      updates.push('network_id = ?');
      params.push(data.networkId);
    }
    if (data.volumeName !== undefined) {
      updates.push('volume_name = ?');
      params.push(data.volumeName);
    }
    if (data.vscodePort !== undefined) {
      updates.push('vscode_port = ?');
      params.push(data.vscodePort);
    }
    if (data.vscodeToken !== undefined) {
      updates.push('vscode_token = ?');
      params.push(data.vscodeToken);
    }
    if (data.startedAt !== undefined) {
      updates.push('started_at = ?');
      params.push(data.startedAt.toISOString());
    }
    if (data.stoppedAt !== undefined) {
      updates.push('stopped_at = ?');
      params.push(data.stoppedAt.toISOString());
    }
    if (data.diskLimit !== undefined) {
      updates.push('disk_limit = ?');
      params.push(data.diskLimit);
    }

    if (updates.length === 0) {
      return existing;
    }

    params.push(id);

    const sql = `
      UPDATE ${this.tableName}
      SET ${updates.join(', ')}
      WHERE id = ?
    `;

    this.db.prepare(sql).run(...params);
    return this.findById(id);
  }

  /**
   * Update container status
   */
  updateStatus(id: string, status: ContainerStatus): ContainerEntity | null {
    const updates: UpdateContainerDto = { status };

    // Set timestamps based on status
    if (status === 'running') {
      return this.update(id, { ...updates, startedAt: new Date() });
    } else if (status === 'stopped' || status === 'exited') {
      return this.update(id, { ...updates, stoppedAt: new Date() });
    }

    return this.update(id, updates);
  }

  /**
   * Delete a container
   */
  delete(id: string): boolean {
    const result = this.db.prepare(`DELETE FROM ${this.tableName} WHERE id = ?`).run(id);
    return result.changes > 0;
  }

  /**
   * Delete container by Docker ID
   */
  deleteByDockerId(dockerId: string): boolean {
    const result = this.db
      .prepare(`DELETE FROM ${this.tableName} WHERE docker_id = ?`)
      .run(dockerId);
    return result.changes > 0;
  }

  /**
   * Count containers with optional filters
   */
  count(filters?: Partial<ContainerFilters>): number {
    const { clause: whereClause, params } = this.buildWhereClause(filters || {});

    const sql = `SELECT COUNT(*) as count FROM ${this.tableName} ${whereClause}`;
    const result = this.db.prepare(sql).get(...params) as { count: number };

    return result.count;
  }

  /**
   * Check if container exists
   */
  exists(id: string): boolean {
    const result = this.db
      .prepare(`SELECT 1 FROM ${this.tableName} WHERE id = ? LIMIT 1`)
      .get(id);
    return result !== undefined;
  }

  /**
   * Check if Docker ID is already used
   */
  dockerIdExists(dockerId: string): boolean {
    const result = this.db
      .prepare(`SELECT 1 FROM ${this.tableName} WHERE docker_id = ? LIMIT 1`)
      .get(dockerId);
    return result !== undefined;
  }

  /**
   * Get container statistics
   */
  getStats(): {
    total: number;
    byStatus: Record<string, number>;
    byTemplate: Record<string, number>;
    byMode: Record<string, number>;
  } {
    const total = this.count();

    const statusRows = this.db
      .prepare(`SELECT status, COUNT(*) as count FROM ${this.tableName} GROUP BY status`)
      .all() as Array<{ status: string; count: number }>;
    const byStatus = Object.fromEntries(statusRows.map((r) => [r.status, r.count]));

    const templateRows = this.db
      .prepare(`SELECT template, COUNT(*) as count FROM ${this.tableName} GROUP BY template`)
      .all() as Array<{ template: string; count: number }>;
    const byTemplate = Object.fromEntries(templateRows.map((r) => [r.template, r.count]));

    const modeRows = this.db
      .prepare(`SELECT mode, COUNT(*) as count FROM ${this.tableName} GROUP BY mode`)
      .all() as Array<{ mode: string; count: number }>;
    const byMode = Object.fromEntries(modeRows.map((r) => [r.mode, r.count]));

    return { total, byStatus, byTemplate, byMode };
  }
}

// Export singleton instance
export const containerRepository = new ContainerRepository();
