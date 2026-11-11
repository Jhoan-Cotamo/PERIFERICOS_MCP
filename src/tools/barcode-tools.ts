import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { barcodeManager } from '../services/barcode-manager.js';
import { logger } from '../utils/logger.js';

export function registerBarcodeTools(server: McpServer): void {
  // waitForBarcode
  server.tool(
    'waitForBarcode',
    'Espera activamente a que el usuario escanee un código de barras o código QR con un lector físico o virtual. Se suspende hasta recibir la lectura o agotar el tiempo de espera (timeout).',
    {
      timeout: z
        .number()
        .optional()
        .describe('Tiempo máximo en milisegundos para esperar la lectura (por defecto: 30000ms = 30s)'),
      deviceId: z
        .string()
        .optional()
        .describe('ID del escáner específico a escuchar. Si se omite, escucha cualquier escáner disponible.'),
    },
    async ({ timeout, deviceId }) => {
      try {
        const result = await barcodeManager.waitForBarcode({
          timeoutMs: timeout,
          deviceId,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  barcode: result.barcode,
                  deviceId: result.deviceId,
                  timestamp: result.timestamp,
                  symbology: result.symbology,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        logger.error('BarcodeTools:waitForBarcode', `Error: ${String(err)}`);
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: err instanceof Error ? err.message : String(err),
              }),
            },
          ],
        };
      }
    }
  );

  // getLastBarcode
  server.tool(
    'getLastBarcode',
    'Devuelve el último código de barras o QR leído previamente y su marca de tiempo, sin esperar una nueva lectura.',
    {
      deviceId: z.string().optional().describe('ID opcional del escáner para filtrar el historial'),
    },
    async ({ deviceId }) => {
      try {
        const last = barcodeManager.getLastBarcode(deviceId);
        if (!last) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  found: false,
                  message: 'No se han registrado lecturas de código de barras aún.',
                }),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  found: true,
                  barcode: last.barcode,
                  deviceId: last.deviceId,
                  timestamp: last.timestamp,
                  symbology: last.symbology,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
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

  // startBarcodeListener
  server.tool(
    'startBarcodeListener',
    'Inicia el modo de escucha continua de lectores de códigos de barras en segundo plano.',
    {
      deviceId: z.string().optional().describe('ID del escáner a escuchar o omitir para escuchar todos'),
    },
    async ({ deviceId }) => {
      try {
        const state = barcodeManager.startListener(deviceId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  message: 'Escucha continua de códigos de barras iniciada exitosamente.',
                  state,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
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

  // stopBarcodeListener
  server.tool(
    'stopBarcodeListener',
    'Detiene el modo de escucha continua de lectores de códigos de barras.',
    {
      deviceId: z.string().optional().describe('ID opcional del dispositivo'),
    },
    async ({ deviceId }) => {
      try {
        const state = barcodeManager.stopListener(deviceId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  message: 'Escucha continua de códigos de barras detenida.',
                  state,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
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

  // simulateBarcodeScan (Testing / Demo Tool)
  server.tool(
    'simulateBarcodeScan',
    'Simula la lectura de un código de barras. Útil para desarrollo, pruebas automatizadas o cuando no hay hardware físico conectado.',
    {
      barcode: z.string().describe('Código de barras a simular (ej: "7701234567890")'),
      deviceId: z.string().optional().describe('ID del escáner de destino (por defecto el lector virtual)'),
    },
    async ({ barcode, deviceId }) => {
      try {
        const result = barcodeManager.simulateBarcode(barcode, deviceId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  message: 'Lectura simulada inyectada correctamente.',
                  event: result,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
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
