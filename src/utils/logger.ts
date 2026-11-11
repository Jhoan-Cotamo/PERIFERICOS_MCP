import fs from 'node:fs';
import path from 'node:path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface LoggerOptions {
  level?: LogLevel;
  logToFile?: boolean;
  filePath?: string;
  prefix?: string;
}

class Logger {
  private level: LogLevel = 'info';
  private logToFile = false;
  private filePath: string;
  private fileStream: fs.WriteStream | null = null;
  private prefix = '';

  constructor(options?: LoggerOptions) {
    if (options?.level) {
      this.level = options.level;
    }
    this.logToFile = options?.logToFile ?? false;
    this.filePath = options?.filePath || path.resolve(process.cwd(), 'logs', 'hardware-mcp.log');
    this.prefix = options?.prefix || 'HardwareMCP';

    if (this.logToFile) {
      this.initFileStream();
    }
  }

  public configure(options: LoggerOptions): void {
    if (options.level) this.level = options.level;
    if (options.logToFile !== undefined) this.logToFile = options.logToFile;
    if (options.filePath) this.filePath = options.filePath;
    if (options.prefix) this.prefix = options.prefix;

    if (this.logToFile && !this.fileStream) {
      this.initFileStream();
    } else if (!this.logToFile && this.fileStream) {
      this.fileStream.end();
      this.fileStream = null;
    }
  }

  private initFileStream(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      this.fileStream = fs.createWriteStream(this.filePath, { flags: 'a', encoding: 'utf8' });
    } catch (err) {
      process.stderr.write(`[LOGGER ERROR] Failed to create log file stream: ${String(err)}\n`);
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
  }

  private formatMessage(level: LogLevel, context: string, message: string, meta?: unknown): string {
    const timestamp = new Date().toISOString();
    const upperLevel = level.toUpperCase().padEnd(5);
    const contextTag = context ? `[${context}]` : `[${this.prefix}]`;
    const metaStr = meta !== undefined ? ` | ${typeof meta === 'object' ? JSON.stringify(meta) : String(meta)}` : '';
    return `[${timestamp}] [${upperLevel}] ${contextTag} ${message}${metaStr}\n`;
  }

  /**
   * CRITICAL: Always writes to process.stderr to prevent corrupting MCP JSON-RPC protocol on process.stdout
   */
  private write(level: LogLevel, context: string, message: string, meta?: unknown): void {
    if (!this.shouldLog(level)) return;

    const formatted = this.formatMessage(level, context, message, meta);

    // Stderr output (never stdout!)
    process.stderr.write(formatted);

    // File output if enabled
    if (this.fileStream && !this.fileStream.destroyed) {
      this.fileStream.write(formatted);
    }
  }

  public debug(context: string, message: string, meta?: unknown): void {
    this.write('debug', context, message, meta);
  }

  public info(context: string, message: string, meta?: unknown): void {
    this.write('info', context, message, meta);
  }

  public warn(context: string, message: string, meta?: unknown): void {
    this.write('warn', context, message, meta);
  }

  public error(context: string, message: string, meta?: unknown): void {
    this.write('error', context, message, meta);
  }

  public child(subContext: string) {
    return {
      debug: (message: string, meta?: unknown) => this.debug(subContext, message, meta),
      info: (message: string, meta?: unknown) => this.info(subContext, message, meta),
      warn: (message: string, meta?: unknown) => this.warn(subContext, message, meta),
      error: (message: string, meta?: unknown) => this.error(subContext, message, meta),
    };
  }
}

export const logger = new Logger();
