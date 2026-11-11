import ThermalPrinterPkg from 'node-thermal-printer';
const { CharacterSet } = ThermalPrinterPkg;

import { EscPosDriverConfig, EscPosPrinterDriver } from './escpos-printer-driver.js';
import { logger } from '../../utils/logger.js';

export interface XPrinterDriverConfig extends EscPosDriverConfig {
  model?: 'XP-N160I' | 'XP-58' | 'XP-80' | 'XP-Q800' | 'XP-365B' | string;
  enableBuzzer?: boolean;
}

export class XPrinterDriver extends EscPosPrinterDriver {
  private model: string;
  private enableBuzzer: boolean;

  constructor(config: XPrinterDriverConfig) {
    super({
      ...config,
      // XPrinter defaults: 48 columns for 80mm, PC850 Latin/Multilingual
      width: config.width || (config.model?.includes('58') ? 32 : 48),
      characterSet: config.characterSet || 'PC850_MULTILINGUAL',
    });

    this.model = config.model || 'XP-N160I';
    this.enableBuzzer = config.enableBuzzer ?? false;
  }

  protected override async doConnect(): Promise<void> {
    logger.info(`XPrinter:${this.id}`, `Initializing XPrinter [${this.model}] driver`);
    await super.doConnect();

    // Send XPrinter hardware initialization sequence (ESC @)
    if (this.printer) {
      try {
        this.printer.raw(Buffer.from([0x1b, 0x40])); // ESC @ Initialize printer
        logger.debug(`XPrinter:${this.id}`, `Sent ESC @ hardware initialization`);
      } catch (err) {
        logger.warn(`XPrinter:${this.id}`, `Failed to send hardware init: ${String(err)}`);
      }
    }
  }

  /**
   * Triggers XPrinter internal alarm / buzzer
   * ESC B n t (0x1B 0x42 n t): n = number of beeps (1-9), t = beep duration (t * 50ms)
   */
  public async soundBuzzer(beeps = 2, duration = 2): Promise<void> {
    const p = this.ensurePrinter();
    logger.info(`XPrinter:${this.id}`, `Triggering buzzer (${beeps} beeps)`);

    const buzzerCmd = Buffer.from([0x1b, 0x42, Math.min(Math.max(beeps, 1), 9), Math.min(Math.max(duration, 1), 9)]);
    p.raw(buzzerCmd);
    await this.executePrintBuffer(p);
  }

  /**
   * Overrides printReceipt to add optional buzzer alarm on order printing
   */
  public override async printReceipt(options: Parameters<EscPosPrinterDriver['printReceipt']>[0]): Promise<void> {
    await super.printReceipt(options);

    if (this.enableBuzzer || options.beep) {
      try {
        await this.soundBuzzer(2, 2);
      } catch (err) {
        logger.warn(`XPrinter:${this.id}`, `Buzzer execution error: ${String(err)}`);
      }
    }
  }
}

