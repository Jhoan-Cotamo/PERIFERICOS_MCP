import fs from 'node:fs';
import path from 'node:path';
import { HardwareMcpConfig } from '../models/config.types.js';
import { DEFAULT_CONFIG } from './default-config.js';
import { logger } from '../utils/logger.js';

export class ConfigLoader {
  private static instance: ConfigLoader;
  private config: HardwareMcpConfig;
  private configPath: string | null = null;

  private constructor() {
    this.config = this.loadConfig();
  }

  public static getInstance(): ConfigLoader {
    if (!ConfigLoader.instance) {
      ConfigLoader.instance = new ConfigLoader();
    }
    return ConfigLoader.instance;
  }

  public getConfig(): HardwareMcpConfig {
    return this.config;
  }

  public getConfigPath(): string | null {
    return this.configPath;
  }

  private findConfigFile(): string | null {
    const candidates = [
      process.env.HARDWARE_CONFIG_PATH,
      path.resolve(process.cwd(), 'hardware.config.json'),
      path.resolve(process.cwd(), 'config', 'hardware.config.json'),
      path.resolve(process.cwd(), 'src', 'config', 'hardware.config.json'),
      path.resolve(process.cwd(), 'dist', 'config', 'hardware.config.json'),
    ];

    for (const candidate of candidates) {
      if (candidate && fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  private loadConfig(): HardwareMcpConfig {
    const filePath = this.findConfigFile();

    if (!filePath) {
      logger.info('ConfigLoader', 'No custom hardware.config.json found. Using built-in defaults.');
      // Auto-create a default hardware.config.json in cwd if not present
      try {
        const targetPath = path.resolve(process.cwd(), 'hardware.config.json');
        fs.writeFileSync(targetPath, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8');
        logger.info('ConfigLoader', `Generated default configuration at: ${targetPath}`);
        this.configPath = targetPath;
      } catch (err) {
        logger.warn('ConfigLoader', `Could not write default configuration file: ${String(err)}`);
      }
      return { ...DEFAULT_CONFIG };
    }

    try {
      this.configPath = filePath;
      const fileData = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(fileData) as Partial<HardwareMcpConfig>;

      // Deep merge with defaults
      const merged: HardwareMcpConfig = {
        server: { ...DEFAULT_CONFIG.server, ...(parsed.server || {}) },
        logging: { ...DEFAULT_CONFIG.logging, ...(parsed.logging || {}) },
        autoDiscovery: { ...DEFAULT_CONFIG.autoDiscovery, ...(parsed.autoDiscovery || {}) },
        printQueue: { ...DEFAULT_CONFIG.printQueue, ...(parsed.printQueue || {}) },
        devices: parsed.devices && parsed.devices.length > 0 ? parsed.devices : DEFAULT_CONFIG.devices,
      };

      logger.info('ConfigLoader', `Loaded configuration from: ${filePath}`);
      return merged;
    } catch (err) {
      logger.error('ConfigLoader', `Failed to parse config file at ${filePath}. Falling back to defaults.`, err);
      return { ...DEFAULT_CONFIG };
    }
  }

  public reloadConfig(): HardwareMcpConfig {
    this.config = this.loadConfig();
    return this.config;
  }
}

export const configLoader = ConfigLoader.getInstance();
