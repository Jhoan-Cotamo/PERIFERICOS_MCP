export class HardwareMcpError extends Error {
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, code = 'HARDWARE_MCP_ERROR', details?: unknown) {
    super(message);
    this.name = 'HardwareMcpError';
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class DeviceNotFoundError extends HardwareMcpError {
  constructor(deviceId: string) {
    super(`Device with ID '${deviceId}' was not found.`, 'DEVICE_NOT_FOUND', { deviceId });
    this.name = 'DeviceNotFoundError';
  }
}

export class DeviceConnectionError extends HardwareMcpError {
  constructor(deviceId: string, reason: string, details?: unknown) {
    super(`Failed to connect to device '${deviceId}': ${reason}`, 'DEVICE_CONNECTION_ERROR', {
      deviceId,
      reason,
      details,
    });
    this.name = 'DeviceConnectionError';
  }
}

export class DeviceTimeoutError extends HardwareMcpError {
  constructor(deviceId: string, timeoutMs: number, operation: string) {
    super(
      `Operation '${operation}' on device '${deviceId}' timed out after ${timeoutMs}ms.`,
      'DEVICE_TIMEOUT',
      { deviceId, timeoutMs, operation }
    );
    this.name = 'DeviceTimeoutError';
  }
}

export class PrintJobError extends HardwareMcpError {
  constructor(jobId: string, deviceId: string, message: string, details?: unknown) {
    super(`Print job '${jobId}' failed on printer '${deviceId}': ${message}`, 'PRINT_JOB_ERROR', {
      jobId,
      deviceId,
      details,
    });
    this.name = 'PrintJobError';
  }
}

export class DuplicatePrintJobError extends HardwareMcpError {
  constructor(jobId: string, hash: string) {
    super(`Duplicate print job rejected (ID: ${jobId}, Hash: ${hash}).`, 'DUPLICATE_PRINT_JOB', {
      jobId,
      hash,
    });
    this.name = 'DuplicatePrintJobError';
  }
}

export class InvalidConfigurationError extends HardwareMcpError {
  constructor(message: string, details?: unknown) {
    super(`Invalid configuration: ${message}`, 'INVALID_CONFIGURATION', details);
    this.name = 'InvalidConfigurationError';
  }
}

export class UnsupportedDeviceError extends HardwareMcpError {
  constructor(deviceType: string, driverType: string) {
    super(
      `Unsupported device type '${deviceType}' or driver '${driverType}'.`,
      'UNSUPPORTED_DEVICE',
      { deviceType, driverType }
    );
    this.name = 'UnsupportedDeviceError';
  }
}

