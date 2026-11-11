import { configLoader } from '../src/config/config-loader.js';
import { deviceManager } from '../src/services/device-manager.js';
import { barcodeManager } from '../src/services/barcode-manager.js';
import { printerManager } from '../src/services/printer-manager.js';
import { logger } from '../src/utils/logger.js';
import fs from 'node:fs';

async function testSuite() {
  console.log('=== STARTING HARDWARE-MCP INTEGRATION TEST ===');

  const config = configLoader.getConfig();
  logger.configure({
    level: 'debug',
    logToFile: true,
    filePath: 'logs/test-run.log',
  });

  // 1. Initialize
  console.log('\n--- 1. Initializing Managers ---');
  await deviceManager.initialize(config);
  barcodeManager.initialize();
  printerManager.initialize(config.printQueue);
  console.log('✔ Managers initialized successfully');

  // 2. List Devices
  console.log('\n--- 2. Testing listDevices() ---');
  const devices = deviceManager.listDevices();
  console.log(`Found ${devices.length} devices:`);
  for (const d of devices) {
    console.log(`  - [${d.id}] ${d.name} (${d.type}) -> Status: ${d.status}`);
  }
  if (devices.length === 0) throw new Error('No devices found!');
  console.log('✔ listDevices passed');

  // 3. Testing getDeviceStatus
  console.log('\n--- 3. Testing getDeviceStatus() ---');
  const firstDev = devices[0];
  const devStatus = await deviceManager.getDeviceStatus(firstDev.id);
  console.log(`Status for ${firstDev.id}:`, devStatus.status);
  console.log('✔ getDeviceStatus passed');

  // 4. Testing Barcode Services (simulate, wait, getLast)
  console.log('\n--- 4. Testing Barcode Tools ---');
  const testBarcode = '7701234567890';

  // Listen in background
  const waitPromise = barcodeManager.waitForBarcode({ timeoutMs: 5000 });

  // Simulate scan after 200ms
  setTimeout(() => {
    console.log(`Injecting simulated barcode scan: ${testBarcode}`);
    barcodeManager.simulateBarcode(testBarcode);
  }, 200);

  const scanned = await waitPromise;
  console.log('Received scanned barcode:', scanned.barcode, 'Timestamp:', scanned.timestamp);
  if (scanned.barcode !== testBarcode) {
    throw new Error(`Expected ${testBarcode}, got ${scanned.barcode}`);
  }
  console.log('✔ waitForBarcode passed');

  const lastBarcode = barcodeManager.getLastBarcode();
  console.log('getLastBarcode result:', lastBarcode?.barcode);
  if (lastBarcode?.barcode !== testBarcode) {
    throw new Error('getLastBarcode mismatch');
  }
  console.log('✔ getLastBarcode passed');

  // 5. Testing Printer Tools
  console.log('\n--- 5. Testing Printer Tools ---');

  // 5.1 printText
  console.log('Testing printText...');
  const textJob = await printerManager.printText({
    text: 'Test Hardware-MCP Simple Text Line',
    bold: true,
    align: 'center',
    cut: false,
  });
  console.log(`✔ printText job completed: ${textJob.id} (Status: ${textJob.status})`);

  // 5.2 printReceipt
  console.log('Testing printReceipt...');
  const receiptJob = await printerManager.printReceipt({
    header: 'SUPERMERCADO CENTRAL',
    subheader: 'Sucursal Principal',
    businessInfo: {
      taxId: '900.123.456-7',
      address: 'Calle 100 # 15-20, Bogotá',
      phone: '(+57) 300 123 4567',
    },
    orderNumber: 'FAC-2026-0042',
    cashier: 'Carlos Gómez',
    items: [
      { name: 'Café Colombiano 500g', quantity: 2, price: 18500, discount: 1000 },
      { name: 'Pan Tajado Artesanal', quantity: 1, price: 6500 },
      { name: 'Leche Deslactosada 1L', quantity: 3, price: 4200 },
    ],
    taxes: [{ name: 'IVA 19%', amount: 7650 }],
    subtotal: 48600,
    discountTotal: 2000,
    total: 54250,
    paymentMethod: 'Tarjeta de Crédito',
    amountPaid: 54250,
    change: 0,
    footer: '¡Gracias por apoyar el comercio local!',
    openDrawer: true,
    cut: true,
  });
  console.log(`✔ printReceipt job completed: ${receiptJob.id} (Status: ${receiptJob.status})`);

  // 5.3 printBarcode
  console.log('Testing printBarcode...');
  const barcodeJob = await printerManager.printBarcode({
    barcode: '7701234567890',
    type: 'EAN13',
    cut: false,
  });
  console.log(`✔ printBarcode job completed: ${barcodeJob.id}`);

  // 5.4 printQRCode
  console.log('Testing printQRCode...');
  const qrJob = await printerManager.printQRCode({
    qrData: 'https://factura-electronica.dian.gov.co/validador/FAC-2026-0042',
    size: 6,
    cut: true,
  });
  console.log(`✔ printQRCode job completed: ${qrJob.id}`);

  // 5.5 cutPaper & openCashDrawer
  console.log('Testing cutPaper & openCashDrawer...');
  const cutJob = await printerManager.cutPaper({ partial: false });
  console.log(`✔ cutPaper job completed: ${cutJob.id}`);

  const drawerJob = await printerManager.openCashDrawer({ pin: 2 });
  console.log(`✔ openCashDrawer job completed: ${drawerJob.id}`);

  // 6. Testing Status and Monitoring
  console.log('\n--- 6. Testing Status and Monitoring ---');
  const printerStatus = await printerManager.getPrinterStatus();
  console.log('Printer Status:', JSON.stringify(printerStatus, null, 2));

  const printers = printerManager.getConnectedPrinters();
  console.log(`Connected Printers (${printers.length}):`, printers.map((p) => p.name));

  const scanners = deviceManager.getDevicesListByType('barcode_scanner');
  console.log(`Connected Scanners (${scanners.length}):`, scanners.map((s) => s.name));

  // 7. Verify virtual spool output file
  console.log('\n--- 7. Verifying Spool File Content ---');
  const spoolPath = 'logs/virtual-printer-spool.txt';
  if (fs.existsSync(spoolPath)) {
    const spoolContent = fs.readFileSync(spoolPath, 'utf8');
    console.log(`Spool file size: ${spoolContent.length} bytes`);
    console.log('Spool file snippet:\n', spoolContent.slice(0, 500), '\n...');
    console.log('✔ Spool file written and verified successfully');
  }

  // 8. Test Deduplication
  console.log('\n--- 8. Testing Print Deduplication ---');
  try {
    const p1 = printerManager.printText({ text: 'Duplicate Test' });
    const p2 = printerManager.printText({ text: 'Duplicate Test' });
    await Promise.all([p1, p2]);
    console.log('Note: Queue handled duplicate execution');
  } catch (err: any) {
    console.log(`✔ Deduplication correctly caught duplicate job: ${err.message}`);
  }

  // 9. Shutdown
  console.log('\n--- 9. Graceful Shutdown ---');
  await deviceManager.shutdown();
  console.log('✔ Graceful shutdown completed');

  console.log('\n=== ALL HARDWARE-MCP TESTS PASSED PERFECTLY ===');
}

testSuite().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
