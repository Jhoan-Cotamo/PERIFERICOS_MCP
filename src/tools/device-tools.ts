import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { deviceManager } from '../services/device-manager.js';
import { logger } from '../utils/logger.js';

export function registerDeviceTools(server: McpServer): void {
  // listDevices
  server.tool(
    'listDevices',
    'Retorna la lista de todos los dispositivos de hardware detectados y configurados (impresoras, lectores de código de barras, puertos seriales, dispositivos virtuales).',
    async () => {
      try {
        const devices = deviceManager.listDevices();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ devices }, null, 2),
            },
          ],
        };
      } catch (err) {
        logger.error('DeviceTools:listDevices', `Error: ${String(err)}`);
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
            },
          ],
        };
      }
    }
  );

  // getDeviceStatus
  server.tool(
    'getDeviceStatus',
    'Obtiene el estado detallado y métricas de un periférico físico o virtual mediante su deviceId.',
    {
      deviceId: z.string().describe('ID único del dispositivo (ej: "printer-001", "scanner-virtual-01")'),
    },
    async ({ deviceId }) => {
      try {
        const status = await deviceManager.getDeviceStatus(deviceId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(status, null, 2),
            },
          ],
        };
      } catch (err) {
        logger.error('DeviceTools:getDeviceStatus', `Error on device ${deviceId}: ${String(err)}`);
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
            },
          ],
        };
      }
    }
  );
}

