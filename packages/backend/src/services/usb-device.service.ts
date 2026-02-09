import { promises as fs } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger';

const execFileAsync = promisify(execFile);

/**
 * Allowlist regex for valid USB/serial device paths
 * Permits:
 *   /dev/ttyUSB*         - USB-to-serial converters (CH340, FTDI, CP2102)
 *   /dev/ttyACM*         - USB CDC ACM devices (STM32 Virtual COM Port)
 *   /dev/serial/by-id/*  - Stable symlinks for serial devices
 *   /dev/bus/usb/NNN/NNN - Raw USB devices (ST-LINK, J-Link, DAPLink)
 */
const DEVICE_PATH_REGEX = /^\/dev\/(ttyUSB\d+|ttyACM\d+|serial\/by-id\/[a-zA-Z0-9_\-.:]+|bus\/usb\/\d{3}\/\d{3})$/;

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
   * Scans /dev/ttyUSB*, /dev/ttyACM*, /dev/serial/by-id/*, and /dev/bus/usb/* (programmers)
   */
  async listDevices(): Promise<UsbDeviceInfo[]> {
    const devices: UsbDeviceInfo[] = [];
    const seenPaths = new Set<string>();

    try {
      // Scan /dev/ttyUSB* and /dev/ttyACM*
      const ttyDevices = await this.scanTtyDevices();

      // Scan /dev/serial/by-id/* for stable paths
      const byIdMap = await this.scanSerialByIdDevices();

      // Enrich each tty device with info
      for (const ttyPath of ttyDevices) {
        const info = await this.enrichDeviceInfo(ttyPath);
        const byIdPath = byIdMap.get(ttyPath);
        devices.push({
          ...info,
          byIdPath,
        });
        seenPaths.add(ttyPath);
      }

      // Add any by-id devices that don't have a matching ttyUSB/ttyACM entry
      for (const [realPath, byIdPath] of byIdMap) {
        if (!seenPaths.has(realPath)) {
          const info = await this.enrichDeviceInfo(realPath);
          devices.push({
            ...info,
            path: byIdPath,
            byIdPath,
          });
          seenPaths.add(realPath);
        }
      }

      // Scan USB bus for programmer devices (ST-LINK, J-Link, DAPLink, etc.)
      const usbProgrammers = await this.scanUsbProgrammers();
      for (const programmer of usbProgrammers) {
        if (!seenPaths.has(programmer.path)) {
          devices.push(programmer);
          seenPaths.add(programmer.path);
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
   * Known USB vendor:product IDs for embedded programmers/debuggers
   */
  private static readonly PROGRAMMER_IDS: ReadonlySet<string> = new Set([
    '0483:3748', // ST-LINK/V2
    '0483:374b', // ST-LINK/V2-1
    '0483:374d', // ST-LINK/V3-MINI
    '0483:374e', // ST-LINK/V3
    '0483:374f', // ST-LINK/V3 (bridge)
    '0483:3752', // ST-LINK/V2-1 (no MSD)
    '1366:0101', // J-Link
    '1366:0105', // J-Link OB
    '1366:1015', // J-Link OB (ATSAM)
    '1366:1051', // J-Link (Firmware Update)
    '0d28:0204', // DAPLink / CMSIS-DAP
    '2e8a:000c', // Raspberry Pi Picoprobe (debug probe)
    '303a:1001', // Espressif USB JTAG/serial (ESP32-S3, ESP32-C3)
  ]);

  /**
   * Scan /dev/bus/usb/* for known programmer/debugger devices
   * These are raw USB devices that don't appear as serial ports
   */
  private async scanUsbProgrammers(): Promise<UsbDeviceInfo[]> {
    const programmers: UsbDeviceInfo[] = [];

    try {
      const busEntries = await fs.readdir('/dev/bus/usb');
      for (const bus of busEntries) {
        if (!/^\d{3}$/.test(bus)) continue;
        try {
          const devEntries = await fs.readdir(`/dev/bus/usb/${bus}`);
          for (const dev of devEntries) {
            if (!/^\d{3}$/.test(dev)) continue;
            const devPath = `/dev/bus/usb/${bus}/${dev}`;
            const info = await this.enrichDeviceInfo(devPath);
            // Only include if it's a known programmer
            if (info.vendorId && info.productId) {
              const id = `${info.vendorId}:${info.productId}`.toLowerCase();
              if (UsbDeviceService.PROGRAMMER_IDS.has(id)) {
                programmers.push(info);
              }
            }
          }
        } catch {
          // Bus directory not readable
        }
      }
    } catch {
      // /dev/bus/usb doesn't exist
    }

    return programmers;
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
