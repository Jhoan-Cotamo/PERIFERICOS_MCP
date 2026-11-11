import { EventEmitter } from 'node:events';
import {
  ConnectionParams,
  ConnectionType,
  DeviceStatus,
  DeviceType,
  IDeviceDriver,
  IDeviceInfo,
} from '../../models/device.types.js';
import { logger } from '../../utils/logger.js';

export interface BaseDriverConfig {
  id: string;
  type: DeviceType;
  name: string;
  connectionType: ConnectionType;
  connectionParams?: ConnectionParams;
  autoReconnect?: boolean;
  reconnectIntervalMs?: number;
  maxReconnectAttempts?: number;
  metadata?: Record<string, unknown>;
  options?: Record<string, unknown>;
}

export abstract class BaseDriver extends EventEmitter implements IDeviceDriver {
  public readonly id: string;
  public readonly type: DeviceType;
  public readonly name: string;
  public readonly connectionType: ConnectionType;
  public readonly connectionParams?: ConnectionParams;
  public readonly metadata: Record<string, unknown>;
  public readonly options: Record<string, unknown>;

  private _status: DeviceStatus = 'disconnected';
  private _autoReconnect = true;
  private _reconnectIntervalMs = 5000;
  private _maxReconnectAttempts = 10;
  private _reconnectAttempts = 0;
  private _reconnectTimer: NodeJS.Timeout | null = null;
  private _isManualDisconnect = false;
  private _lastSeen: string = new Date().toISOString();

  constructor(config: BaseDriverConfig) {
    super();
    this.id = config.id;
    this.type = config.type;
    this.name = config.name;
    this.connectionType = config.connectionType;
    this.connectionParams = config.connectionParams;
    this.metadata = config.metadata || {};
    this.options = config.options || {};
    this._autoReconnect = config.autoReconnect ?? true;
    this._reconnectIntervalMs = config.reconnectIntervalMs ?? 5000;
    this._maxReconnectAttempts = config.maxReconnectAttempts ?? 10;
  }

  public get status(): DeviceStatus {
    return this._status;
  }

  public get info(): IDeviceInfo {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      status: this._status,
      connectionType: this.connectionType,
      connectionParams: this.connectionParams,
      metadata: this.metadata,
      lastSeen: this._lastSeen,
    };
  }

  public isAvailable(): boolean {
    return this._status === 'connected';
  }

  protected setStatus(newStatus: DeviceStatus, error?: Error): void {
    if (this._status === newStatus) return;

    const oldStatus = this._status;
    this._status = newStatus;
    this._lastSeen = new Date().toISOString();

    logger.debug(`BaseDriver:${this.id}`, `Status changed from ${oldStatus} to ${newStatus}`);
    this.emit('statusChange', { deviceId: this.id, oldStatus, newStatus, error });

    if (newStatus === 'connected') {
      this._reconnectAttempts = 0;
      this.clearReconnectTimer();
      this.emit('connected', this.info);
    } else if (newStatus === 'disconnected' || newStatus === 'error') {
      this.emit('disconnected', { deviceId: this.id, error });
      if (!this._isManualDisconnect && this._autoReconnect) {
        this.scheduleReconnect();
      }
    }
  }

  public async connect(): Promise<void> {
    this._isManualDisconnect = false;
    this.clearReconnectTimer();

    if (this._status === 'connected') {
      return;
    }

    this.setStatus('connecting');
    try {
      await this.doConnect();
      this.setStatus('connected');
      logger.info(`BaseDriver:${this.id}`, `Device connected successfully: ${this.name}`);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error(`BaseDriver:${this.id}`, `Connection failed: ${error.message}`);
      this.setStatus('error', error);
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    this._isManualDisconnect = true;
    this.clearReconnectTimer();

    if (this._status === 'disconnected') {
      return;
    }

    try {
      await this.doDisconnect();
    } catch (err) {
      logger.warn(`BaseDriver:${this.id}`, `Error during disconnect: ${String(err)}`);
    } finally {
      this.setStatus('disconnected');
      logger.info(`BaseDriver:${this.id}`, `Device disconnected: ${this.name}`);
    }
  }

  public async getStatus(): Promise<IDeviceInfo> {
    return this.info;
  }

  private scheduleReconnect(): void {
    if (this._isManualDisconnect || this._reconnectTimer) return;

    if (this._reconnectAttempts >= this._maxReconnectAttempts) {
      logger.warn(
        `BaseDriver:${this.id}`,
        `Max reconnect attempts (${this._maxReconnectAttempts}) reached. Stopping auto-reconnect.`
      );
      return;
    }

    this._reconnectAttempts++;
    this.setStatus('reconnecting');

    const backoff = Math.min(this._reconnectIntervalMs * Math.pow(1.5, this._reconnectAttempts - 1), 60000);
    logger.info(
      `BaseDriver:${this.id}`,
      `Scheduling reconnect attempt ${this._reconnectAttempts}/${this._maxReconnectAttempts} in ${backoff}ms`
    );

    this._reconnectTimer = setTimeout(async () => {
      this._reconnectTimer = null;
      try {
        await this.connect();
      } catch {
        // Will re-trigger scheduleReconnect on disconnect/error
      }
    }, backoff);
  }

  private clearReconnectTimer(): void {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  // Template methods for concrete drivers
  protected abstract doConnect(): Promise<void>;
  protected abstract doDisconnect(): Promise<void>;
}

