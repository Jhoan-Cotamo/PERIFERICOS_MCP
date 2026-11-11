import net from 'node:net';
import { EscPosDriverConfig, EscPosPrinterDriver } from './escpos-printer-driver.js';
import { logger } from '../../utils/logger.js';
import { DeviceConnectionError } from '../../utils/errors.js';

export interface NetworkPrinterDriverConfig extends EscPosDriverConfig {
  host: string;
  tcpPort?: number;
  timeoutMs?: number;
}

export class NetworkPrinterDriver extends EscPosPrinterDriver {
  private host: string;
  private tcpPort: number;
  private timeoutMs: number;

  constructor(config: NetworkPrinterDriverConfig) {
    super({
      ...config,
      connectionType: 'tcp',
    });

    this.host = config.host || (this.connectionParams?.host as string) || '127.0.0.1';
    this.tcpPort = config.tcpPort || (this.connectionParams?.tcpPort as number) || 9100;
    this.timeoutMs = config.timeoutMs || 4000;
  }

  protected override resolveInterface(): string {
    return `tcp://${this.host}:${this.tcpPort}`;
  }

  protected override async doConnect(): Promise<void> {
    logger.debug(`NetworkPrinter:${this.id}`, `Verifying TCP connectivity to ${this.host}:${this.tcpPort}...`);

    // Verify TCP socket connects before initializing node-thermal-printer
    await this.testTcpConnection(this.host, this.tcpPort, this.timeoutMs);
    await super.doConnect();
  }

  private async testTcpConnection(host: string, port: number, timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const socket = new net.Socket();

      socket.setTimeout(timeoutMs);

      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });

      socket.once('timeout', () => {
        socket.destroy();
        reject(new DeviceConnectionError(this.id, `TCP connection timed out after ${timeoutMs}ms to ${host}:${port}`));
      });

      socket.once('error', (err) => {
        socket.destroy();
        reject(new DeviceConnectionError(this.id, `TCP socket error to ${host}:${port}: ${err.message}`, err));
      });

      socket.connect(port, host);
    });
  }
}

