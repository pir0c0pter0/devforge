import { promises as fs } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger';

const execFileAsync = promisify(execFile);

/**
 * Allowlist regex for valid USB/serial device paths
 * Only permits /dev/ttyUSB*, /dev/ttyACM*, and /dev/serial/by-id/*
 */
const DEVICE_PATH_REGEX = /^\/dev\/(ttyUSB\d+|ttyACM\d+|serial\/by-id\/[a-zA-Z0-9_\-.:]+)$/;

export interface UsbDeviceInfo {
  path: string;
  byIdPath?: string;
  description: string;
  vendorId?: string;
  productId?: string;
  manufacturer?: string;
  product?: string;
  serial?: string;
}

/**
 * Service for detecting USB/serial devices on the host
 */
class UsbDeviceService {
  /**
   * Validate a device path against the allowlist
   */
  validateDevicePath(devicePath: string): boolean {
    return DEVICE_PATH_REGEX.test(devicePath);
  }

  /**
   * List all available USB/serial devices on the host
   * Scans /dev/ttyUSB*, /dev/ttyACM*, and /dev/serial/by-id/*
   */
  async listDevices(): Promise<UsbDeviceInfo[]> {
    const devices: UsbDeviceInfo[] = [];

    try {
      // Scan /dev/ttyUSB* and /dev/ttyACM*
      const ttyDevices = await this.scanTtyDevices();

      // Scan /dev/serial/by-id/* for stable paths
      const byIdMap = await this.scanSerialByIdDevices();

      // Enrich each tty device with info
      for (const ttyPath of ttyDevices) {
        const info = await this.enrichDeviceInfo(ttyPath);
        // Find matching by-id path
        const byIdPath = byIdMap.get(ttyPath);
        devices.push({
          ...info,
          byIdPath,
        });
      }

      // Add any by-id devices that don't have a matching ttyUSB/ttyACM entry
      for (const [realPath, byIdPath] of byIdMap) {
        if (!ttyDevices.includes(realPath)) {
          const info = await this.enrichDeviceInfo(realPath);
          devices.push({
            ...info,
            path: byIdPath,
            byIdPath,
          });
        }
      }
    } catch (error) {
      logger.warn({ error }, 'Failed to scan USB devices (this is normal if no devices are connected)');
    }

    return devices;
  }

  /**
   * Scan /dev/ttyUSB* and /dev/ttyACM* for serial devices
   */
  private async scanTtyDevices(): Promise<string[]> {
    try {
      const entries = await fs.readdir('/dev');
      return entries
        .filter(e => e.startsWith('ttyUSB') || e.startsWith('ttyACM'))
        .map(e => `/dev/${e}`)
        .filter(p => this.validateDevicePath(p));
    } catch {
      return [];
    }
  }

  /**
   * Scan /dev/serial/by-id/* for stable device paths
   * Returns a map of real device path -> by-id path
   */
  private async scanSerialByIdDevices(): Promise<Map<string, string>> {
    const map = new Map<string, string>();

    try {
      const entries = await fs.readdir('/dev/serial/by-id');
      for (const entry of entries) {
        const byIdPath = `/dev/serial/by-id/${entry}`;
        if (!this.validateDevicePath(byIdPath)) {
          continue;
        }
        try {
          const realPath = await fs.realpath(byIdPath);
          map.set(realPath, byIdPath);
        } catch {
          // Broken symlink, skip
        }
      }
    } catch {
      // /dev/serial/by-id doesn't exist - no serial devices
    }

    return map;
  }

  /**
   * Use udevadm to get detailed device information
   */
  private async enrichDeviceInfo(devicePath: string): Promise<UsbDeviceInfo> {
    const base: UsbDeviceInfo = {
      path: devicePath,
      description: devicePath.split('/').pop() || devicePath,
    };

    try {
      const { stdout } = await execFileAsync(
        'udevadm',
        ['info', '--query=property', `--name=${devicePath}`],
        { timeout: 5000 }
      );

      const props = new Map<string, string>();
      for (const line of stdout.split('\n')) {
        const idx = line.indexOf('=');
        if (idx > 0) {
          props.set(line.substring(0, idx), line.substring(idx + 1));
        }
      }

      const vendorId = props.get('ID_VENDOR_ID');
      const productId = props.get('ID_MODEL_ID');
      const manufacturer = props.get('ID_VENDOR') || props.get('ID_VENDOR_FROM_DATABASE');
      const product = props.get('ID_MODEL') || props.get('ID_MODEL_FROM_DATABASE');
      const serial = props.get('ID_SERIAL_SHORT');

      const descParts = [product || base.description];
      if (manufacturer) descParts.unshift(manufacturer);

      return {
        ...base,
        description: descParts.join(' - '),
        vendorId,
        productId,
        manufacturer,
        product,
        serial,
      };
    } catch {
      // udevadm not available or failed - return basic info
      return base;
    }
  }
}

export const usbDeviceService = new UsbDeviceService();
