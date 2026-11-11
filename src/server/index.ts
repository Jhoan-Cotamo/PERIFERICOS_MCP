#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { configLoader } from '../config/config-loader.js';
import { logger } from '../utils/logger.js';
import { deviceManager } from '../services/device-manager.js';
import { barcodeManager } from '../services/barcode-manager.js';
import { printerManager } from '../services/printer-manager.js';
import { registerDeviceTools } from '../tools/device-tools.js';
import { registerBarcodeTools } from '../tools/barcode-tools.js';
import { registerPrinterTools } from '../tools/printer-tools.js';

async function main(): Promise<void> {
  const config = configLoader.getConfig();

  // Configure logger based on config
  logger.configure({
    level: config.logging.level,
    logToFile: config.logging.logToFile,
    filePath: config.logging.filePath,
    prefix: 'HardwareMCP',
  });

  logger.info('Server', `Starting Hardware MCP Server v${config.server.version}...`);

  // 1. Initialize Device Manager and load initial hardware
  await deviceManager.initialize(config);

  // 2. Initialize Barcode & Printer domain services
  barcodeManager.initialize();
  printerManager.initialize(config.printQueue);

  // 3. Initialize MCP Server instance
  const server = new McpServer({
    name: config.server.name || 'hardware-mcp',
    version: config.server.version || '1.0.0',
  });

  // 4. Register all standardized hardware tools
  registerDeviceTools(server);
  registerBarcodeTools(server);
  registerPrinterTools(server);

  // 5. Connect via Standard I/O Transport
  const transport = new StdioServerTransport();

  // 6. Setup graceful shutdown handlers
  let isShuttingDown = false;
  const handleShutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info('Server', `Received ${signal}. Shutting down hardware connections gracefully...`);
    try {
      await deviceManager.shutdown();
      await server.close();
      logger.info('Server', 'Hardware MCP Server stopped successfully.');
      process.exit(0);
    } catch (err) {
      logger.error('Server', `Error during shutdown: ${String(err)}`);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));

  process.on('uncaughtException', (err) => {
    logger.error('Server', `Uncaught exception: ${err.message}`, err.stack);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Server', `Unhandled promise rejection: ${String(reason)}`);
  });

  await server.connect(transport);
  logger.info('Server', 'Hardware MCP Server is running over Stdio and ready for requests.');
}

main().catch((err) => {
  logger.error('Server', `Fatal startup error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
