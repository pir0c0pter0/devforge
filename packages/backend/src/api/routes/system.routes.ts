import { Router, Request, Response } from 'express';
import { usbDeviceService } from '../../services/usb-device.service';
import { logger } from '../../utils/logger';

const router: Router = Router();

/**
 * GET /api/system/usb-devices
 * List available USB/serial devices on the host
 */
router.get('/usb-devices', async (_req: Request, res: Response) => {
  try {
    const devices = await usbDeviceService.listDevices();
    res.json({
      success: true,
      data: devices,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to list USB devices');
    res.status(500).json({
      success: false,
      error: 'Failed to list USB devices',
    });
  }
});

export default router;
