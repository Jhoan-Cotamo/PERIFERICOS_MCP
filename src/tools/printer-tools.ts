import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { printerManager } from '../services/printer-manager.js';
import { deviceManager } from '../services/device-manager.js';
import { logger } from '../utils/logger.js';

export function registerPrinterTools(server: McpServer): void {
  // printText
  server.tool(
    'printText',
    'Imprime texto simple en una impresora térmica con formato opcional (negrita, alineación, tamaño, corte).',
    {
      deviceId: z.string().optional().describe('ID de la impresora térmica (si se omite, usa la impresora por defecto)'),
      text: z.string().describe('Texto a imprimir'),
      bold: z.boolean().optional().describe('Imprimir en negrita'),
      underline: z.boolean().optional().describe('Imprimir con subrayado'),
      align: z.enum(['left', 'center', 'right']).optional().describe('Alineación del texto'),
      doubleHeight: z.boolean().optional().describe('Doble altura'),
      doubleWidth: z.boolean().optional().describe('Doble ancho'),
      lineFeed: z.number().optional().describe('Líneas en blanco al final'),
      cut: z.boolean().optional().describe('Realizar corte de papel al finalizar'),
    },
    async (params) => {
      try {
        const job = await printerManager.printText(params);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  jobId: job.id,
                  status: job.status,
                  deviceId: job.deviceId,
                  message: 'Texto enviado a la cola de impresión exitosamente.',
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        logger.error('PrinterTools:printText', `Error: ${String(err)}`);
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

  // printReceipt
  server.tool(
    'printReceipt',
    'Genera e imprime un ticket/recibo de venta completo con encabezado comercial, lista de productos formateada en columnas, impuestos, totales, corte de papel y activación de cajón.',
    {
      deviceId: z.string().optional().describe('ID de la impresora térmica'),
      header: z.string().describe('Título principal del negocio (ej: "Mi Negocio S.A.S.")'),
      subheader: z.string().optional().describe('Subtítulo o slogan'),
      businessInfo: z
        .object({
          taxId: z.string().optional().describe('NIT / RUT / RUC / RFC'),
          address: z.string().optional().describe('Dirección física'),
          phone: z.string().optional().describe('Teléfono de contacto'),
          email: z.string().optional().describe('Correo electrónico'),
          website: z.string().optional().describe('Sitio web'),
        })
        .optional()
        .describe('Datos comerciales de la empresa'),
      orderNumber: z.string().optional().describe('Número de orden o factura'),
      cashier: z.string().optional().describe('Nombre del cajero o vendedor'),
      date: z.string().optional().describe('Fecha y hora del comprobante (por defecto hora actual)'),
      items: z
        .array(
          z.object({
            name: z.string().describe('Nombre o descripción del producto'),
            quantity: z.number().describe('Cantidad vendida'),
            price: z.number().describe('Precio unitario'),
            discount: z.number().optional().describe('Monto de descuento unitario o de línea'),
            note: z.string().optional().describe('Nota aclaratoria del producto (ej: sin cebolla)'),
          })
        )
        .describe('Lista de productos del ticket'),
      taxes: z
        .array(
          z.object({
            name: z.string().describe('Nombre del impuesto (ej: IVA 19%, Impoconsumo)'),
            amount: z.number().describe('Monto del impuesto'),
            percentage: z.number().optional().describe('Porcentaje del impuesto'),
          })
        )
        .optional()
        .describe('Desglose de impuestos'),
      subtotal: z.number().optional().describe('Subtotal antes de impuestos'),
      discountTotal: z.number().optional().describe('Total descuentos aplicados'),
      total: z.number().describe('Total a pagar'),
      paymentMethod: z.string().optional().describe('Método de pago (Efectivo, Tarjeta, Transferencia)'),
      amountPaid: z.number().optional().describe('Monto entregado por el cliente'),
      change: z.number().optional().describe('Cambio devuelto al cliente'),
      footer: z.string().optional().describe('Mensaje de pie de página'),
      cut: z.boolean().optional().describe('Cortar papel automáticamente al terminar (por defecto true)'),
      openDrawer: z.boolean().optional().describe('Abrir cajón monedero automáticamente'),
      beep: z.boolean().optional().describe('Emitir señal sonora / alarma en impresoras compatibles (ej: XPrinter)'),
    },
    async (params) => {
      try {
        const job = await printerManager.printReceipt(params);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  jobId: job.id,
                  status: job.status,
                  deviceId: job.deviceId,
                  total: params.total,
                  itemCount: params.items.length,
                  message: 'Recibo impreso exitosamente.',
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        logger.error('PrinterTools:printReceipt', `Error: ${String(err)}`);
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

  // printBarcode
  server.tool(
    'printBarcode',
    'Imprime un código de barras 1D (CODE128, EAN13, CODE39, etc.) en la impresora térmica.',
    {
      deviceId: z.string().optional().describe('ID de la impresora térmica'),
      barcode: z.string().describe('Contenido numérico o alfanumérico del código de barras'),
      type: z
        .enum(['EAN13', 'EAN8', 'CODE39', 'CODE93', 'CODE128', 'ITF', 'UPCA', 'UPCE'])
        .optional()
        .describe('Tipo de simbología de código de barras (por defecto: CODE128)'),
      width: z.number().optional().describe('Grosor de las barras (2 a 6)'),
      height: z.number().optional().describe('Altura del código de barras en puntos (por defecto 70)'),
      position: z.enum(['OFF', 'ABOVE', 'BELOW', 'BOTH']).optional().describe('Posición del texto numérico'),
      cut: z.boolean().optional().describe('Cortar papel tras imprimir'),
    },
    async (params) => {
      try {
        const job = await printerManager.printBarcode(params);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  jobId: job.id,
                  status: job.status,
                  deviceId: job.deviceId,
                  message: 'Código de barras impreso exitosamente.',
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

  // printQRCode
  server.tool(
    'printQRCode',
    'Imprime un código QR nativo 2D en la impresora térmica (ideal para URLs, pagos PIX/PSE o facturación electrónica).',
    {
      deviceId: z.string().optional().describe('ID de la impresora térmica'),
      qrData: z.string().describe('Texto o URL a codificar en el código QR'),
      size: z.number().optional().describe('Tamaño del módulo QR (1 a 16, por defecto 6)'),
      errorCorrection: z.enum(['L', 'M', 'Q', 'H']).optional().describe('Nivel de corrección de error (por defecto M)'),
      cut: z.boolean().optional().describe('Cortar papel tras imprimir'),
    },
    async (params) => {
      try {
        const job = await printerManager.printQRCode(params);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  jobId: job.id,
                  status: job.status,
                  deviceId: job.deviceId,
                  message: 'Código QR impreso exitosamente.',
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

  // cutPaper
  server.tool(
    'cutPaper',
    'Ejecuta una orden de corte de papel (total o parcial) en la guillotina de la impresora térmica.',
    {
      deviceId: z.string().optional().describe('ID de la impresora'),
      partial: z.boolean().optional().describe('True para corte parcial (deja una pestaña), False para corte completo'),
    },
    async (params) => {
      try {
        const job = await printerManager.cutPaper(params);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  jobId: job.id,
                  deviceId: job.deviceId,
                  message: 'Comando de corte de papel ejecutado.',
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

  // openCashDrawer
  server.tool(
    'openCashDrawer',
    'Envía el pulso eléctrico ESC/POS para abrir el cajón monedero conectado al puerto RJ11 de la impresora térmica.',
    {
      deviceId: z.string().optional().describe('ID de la impresora conectada al cajón monedero'),
      pin: z.enum(['2', '5']).optional().describe('Pin del conector RJ11 (por defecto 2)'),
    },
    async ({ deviceId, pin }) => {
      try {
        const pinNumber = pin === '5' ? 5 : 2;
        const job = await printerManager.openCashDrawer({ deviceId, pin: pinNumber });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  jobId: job.id,
                  deviceId: job.deviceId,
                  message: 'Pulso de apertura de cajón monedero enviado.',
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

  // getPrinterStatus
  server.tool(
    'getPrinterStatus',
    'Retorna la disponibilidad, estado de conexión y métricas de la cola de impresión de una impresora térmica.',
    {
      deviceId: z.string().optional().describe('ID de la impresora (opcional)'),
    },
    async ({ deviceId }) => {
      try {
        const status = await printerManager.getPrinterStatus(deviceId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(status, null, 2),
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

  // getConnectedPrinters
  server.tool(
    'getConnectedPrinters',
    'Retorna la lista exclusiva de impresoras térmicas detectadas y configuradas con su estado actual.',
    async () => {
      try {
        const printers = printerManager.getConnectedPrinters();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ printers }, null, 2),
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

  // getConnectedScanners
  server.tool(
    'getConnectedScanners',
    'Retorna la lista exclusiva de lectores de códigos de barras y QR detectados y configurados con su estado actual.',
    async () => {
      try {
        const scanners = deviceManager.getDevicesListByType('barcode_scanner');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ scanners }, null, 2),
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
