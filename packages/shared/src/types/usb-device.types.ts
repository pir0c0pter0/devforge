/**
 * USB/Serial device types for embedded development passthrough
 */

export interface UsbDevice {
  /** Device path (e.g., /dev/ttyUSB0) */
  path: string
  /** Stable path via /dev/serial/by-id/ (preferred for container mapping) */
  byIdPath?: string
  /** Human-readable description */
  description: string
  /** USB vendor ID (hex) */
  vendorId?: string
  /** USB product ID (hex) */
  productId?: string
  /** Device manufacturer name */
  manufacturer?: string
  /** Product name */
  product?: string
  /** Serial number */
  serial?: string
}

export interface UsbDeviceConfig {
  /** Device paths selected for passthrough */
  devices: string[]
}
