import fs from 'node:fs';
import path from 'node:path';
import { BaseDriver, BaseDriverConfig } from '../common/base-driver.js';
import {
  CutPaperOptions,
  OpenCashDrawerOptions,
  PrintBarcodeOptions,
  PrintQRCodeOptions,
  PrintTextOptions,
  ReceiptOptions,
} from '../../models/printer.types.js';
import { logger } from '../../utils/logger.js';

export interface VirtualPrinterDriverConfig extends BaseDriverConfig {
  spoolFile?: string;
  width?: number;
}

export class VirtualPrinterDriver extends BaseDriver {
  private spoolFile: string;
  private width: number;
  private jobHistory: string[] = [];

  constructor(config: VirtualPrinterDriverConfig) {
    super({
      ...config,
      type: 'thermal_printer',
      connectionType: 'virtual',
    });

    this.spoolFile =
      (config.options?.spoolFile as string) ||
      config.spoolFile ||
      path.resolve(process.cwd(), 'logs', 'virtual-printer-spool.txt');
    this.width = (config.options?.width as number) || config.width || 48;
  }

  protected async doConnect(): Promise<void> {
    const dir = path.dirname(this.spoolFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    logger.info(`VirtualPrinter:${this.id}`, `Virtual printer connected. Spool output: ${this.spoolFile}`);
  }

  private appendToSpool(content: string): void {
    const timestamp = new Date().toISOString();
    const divider = '='.repeat(this.width);
    const formatted = `\n${divider}\n[SPOOL ENTRY - ${timestamp} - Device: ${this.id}]\n${content}\n${divider}\n`;

    this.jobHistory.push(formatted);
    try {
      fs.appendFileSync(this.spoolFile, formatted, 'utf8');
      logger.info(`VirtualPrinter:${this.id}`, `Spool entry written to ${this.spoolFile}`);
    } catch (err) {
      logger.warn(`VirtualPrinter:${this.id}`, `Failed to write spool: ${String(err)}`);
    }
  }

  public async printText(options: PrintTextOptions): Promise<void> {
    let output = '';
    const align = options.align || 'left';

    const lines = options.text.split('\n');
    for (const line of lines) {
      if (align === 'center') {
        const pad = Math.max(0, Math.floor((this.width - line.length) / 2));
        output += ' '.repeat(pad) + line + '\n';
      } else if (align === 'right') {
        const pad = Math.max(0, this.width - line.length);
        output += ' '.repeat(pad) + line + '\n';
      } else {
        output += line + '\n';
      }
    }

    if (options.cut) {
      output += '\n--- [PAPER CUT] ---\n';
    }

    this.appendToSpool(output);
  }

  public async printReceipt(options: ReceiptOptions): Promise<void> {
    const divider = '-'.repeat(this.width);
    let output = '';

    // Header
    const padHeader = Math.max(0, Math.floor((this.width - options.header.length) / 2));
    output += ' '.repeat(padHeader) + options.header.toUpperCase() + '\n';

    if (options.subheader) {
      const padSub = Math.max(0, Math.floor((this.width - options.subheader.length) / 2));
      output += ' '.repeat(padSub) + options.subheader + '\n';
    }

    if (options.businessInfo) {
      const b = options.businessInfo;
      if (b.taxId) output += `NIT/ID: ${b.taxId}\n`;
      if (b.address) output += `${b.address}\n`;
      if (b.phone) output += `Tel: ${b.phone}\n`;
    }

    output += divider + '\n';
    if (options.orderNumber) output += `Orden: ${options.orderNumber}\n`;
    output += `Fecha: ${options.date || new Date().toLocaleString()}\n`;
    if (options.cashier) output += `Cajero: ${options.cashier}\n`;
    output += divider + '\n';

    // Columns
    const w1 = 5;
    const w3 = 10;
    const w2 = Math.max(10, this.width - w1 - w3 - 2);

    output += `${'CANT'.padEnd(w1)} ${'DESCRIPCIÓN'.padEnd(w2)} ${'TOTAL'.padStart(w3)}\n`;
    output += divider + '\n';

    for (const item of options.items) {
      const lineTotal = item.quantity * item.price - (item.discount || 0);
      const c1 = `${item.quantity}x`.padEnd(w1).substring(0, w1);
      const c2 = item.name.padEnd(w2).substring(0, w2);
      const c3 = `$${lineTotal.toFixed(2)}`.padStart(w3).substring(0, w3);
      output += `${c1} ${c2} ${c3}\n`;
      if (item.discount) {
        output += `      Descuento: -$${item.discount.toFixed(2)}\n`;
      }
      if (item.note) {
        output += `      * ${item.note}\n`;
      }
    }

    output += divider + '\n';
    if (options.subtotal !== undefined) {
      output += `${'Subtotal:'.padEnd(this.width - 12)}${`$${options.subtotal.toFixed(2)}`.padStart(12)}\n`;
    }
    if (options.taxes) {
      for (const tax of options.taxes) {
        output += `${tax.name.padEnd(this.width - 12)}${`$${tax.amount.toFixed(2)}`.padStart(12)}\n`;
      }
    }

    output += '\n' + `${'TOTAL:'.padEnd(this.width - 14)}${`$${options.total.toFixed(2)}`.padStart(14)}\n`;

    if (options.paymentMethod) {
      output += divider + '\n';
      output += `Pago: ${options.paymentMethod}\n`;
      if (options.amountPaid !== undefined) {
        output += `Entregado: $${options.amountPaid.toFixed(2)}\n`;
      }
      if (options.change !== undefined) {
        output += `Cambio: $${options.change.toFixed(2)}\n`;
      }
    }

    output += divider + '\n';
    const footerText = options.footer || '¡Gracias por su compra!';
    const padFooter = Math.max(0, Math.floor((this.width - footerText.length) / 2));
    output += ' '.repeat(padFooter) + footerText + '\n';

    if (options.openDrawer) {
      output += '\n>>> [CASH DRAWER OPEN PULSE TRIGGERED] <<<\n';
    }

    if (options.cut !== false) {
      output += '\n--- [PAPER CUT] ---\n';
    }

    this.appendToSpool(output);
  }

  public async printBarcode(options: PrintBarcodeOptions): Promise<void> {
    const art = `
    || | | ||| || ||| | |||| |
    || | | ||| || ||| | |||| |
       ${options.barcode} (${options.type || 'CODE128'})
    `;
    this.appendToSpool(art + (options.cut ? '\n--- [PAPER CUT] ---\n' : ''));
  }

  public async printQRCode(options: PrintQRCodeOptions): Promise<void> {
    const art = `
    [QR CODE SIMULATION]
    Data: ${options.qrData}
    Size: ${options.size || 6}
    `;
    this.appendToSpool(art + (options.cut ? '\n--- [PAPER CUT] ---\n' : ''));
  }

  public async cutPaper(options?: CutPaperOptions): Promise<void> {
    this.appendToSpool(`--- [PAPER CUT (${options?.partial ? 'PARTIAL' : 'FULL'})] ---`);
  }

  public async openCashDrawer(options?: OpenCashDrawerOptions): Promise<void> {
    this.appendToSpool(`>>> [CASH DRAWER TRIGGERED (PIN ${options?.pin || 2})] <<<`);
  }

  public getSpoolFilePath(): string {
    return this.spoolFile;
  }

  public getLastSpoolEntry(): string | null {
    return this.jobHistory.length > 0 ? this.jobHistory[this.jobHistory.length - 1] : null;
  }

  protected async doDisconnect(): Promise<void> {
    logger.info(`VirtualPrinter:${this.id}`, 'Virtual printer disconnected');
  }
}

