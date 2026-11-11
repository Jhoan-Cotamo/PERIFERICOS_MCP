import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { PrintJob, PrintJobStatus, PrintJobType } from '../../models/printer.types.js';
import { PrintQueueConfig } from '../../models/config.types.js';
import { DuplicatePrintJobError, PrintJobError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

export type JobExecutor<T = unknown> = (job: PrintJob<T>) => Promise<void>;

interface JobRecord<T = unknown> {
  job: PrintJob<T>;
  executor: JobExecutor<T>;
  resolve: (value: PrintJob<T>) => void;
  reject: (reason: unknown) => void;
}

export class PrintQueue extends EventEmitter {
  private config: PrintQueueConfig;
  private queues = new Map<string, Array<JobRecord<unknown>>>();
  private activeJobs = new Map<string, JobRecord<unknown>>();
  private recentJobHashes = new Map<string, number>(); // Hash -> timestamp
  private totalProcessed = 0;
  private totalFailed = 0;

  constructor(config: PrintQueueConfig) {
    super();
    this.config = config;
  }

  public updateConfig(config: Partial<PrintQueueConfig>): void {
    this.config = { ...this.config, ...config };
  }

  private generateJobHash(deviceId: string, type: PrintJobType, payload: unknown): string {
    const serialized = JSON.stringify({ deviceId, type, payload });
    return crypto.createHash('sha256').update(serialized).digest('hex');
  }

  private checkDeduplication(hash: string): boolean {
    if (!this.config.enableDeduplication) return false;

    const now = Date.now();
    const lastSeen = this.recentJobHashes.get(hash);

    if (lastSeen && now - lastSeen < this.config.deduplicationWindowMs) {
      return true; // Duplicate detected
    }

    this.recentJobHashes.set(hash, now);

    // Housekeeping: remove old hashes
    if (this.recentJobHashes.size > 200) {
      for (const [h, ts] of this.recentJobHashes.entries()) {
        if (now - ts > this.config.deduplicationWindowMs * 2) {
          this.recentJobHashes.delete(h);
        }
      }
    }

    return false;
  }

  public async enqueue<T>(
    deviceId: string,
    type: PrintJobType,
    payload: T,
    executor: JobExecutor<T>,
    customJobId?: string
  ): Promise<PrintJob<T>> {
    const jobId = customJobId || `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const hash = this.generateJobHash(deviceId, type, payload);

    if (this.checkDeduplication(hash)) {
      logger.warn('PrintQueue', `Rejected duplicate print job (Device: ${deviceId}, Type: ${type})`);
      throw new DuplicatePrintJobError(jobId, hash);
    }

    const job: PrintJob<T> = {
      id: jobId,
      deviceId,
      type,
      payload,
      hash,
      status: 'pending',
      createdAt: new Date().toISOString(),
      retryCount: 0,
      maxRetries: this.config.maxRetries,
    };

    return new Promise<PrintJob<T>>((resolve, reject) => {
      const record: JobRecord<T> = {
        job,
        executor,
        resolve: resolve as (value: PrintJob<unknown>) => void,
        reject,
      };

      if (!this.queues.has(deviceId)) {
        this.queues.set(deviceId, []);
      }

      this.queues.get(deviceId)!.push(record as JobRecord<unknown>);
      logger.debug('PrintQueue', `Job ${job.id} enqueued for device ${deviceId}. Queue size: ${this.queues.get(deviceId)!.length}`);

      this.processNext(deviceId);
    });
  }

  private async processNext(deviceId: string): Promise<void> {
    if (this.activeJobs.has(deviceId)) {
      // Device is already executing a job (max 1 concurrent job per physical printer)
      return;
    }

    const queue = this.queues.get(deviceId);
    if (!queue || queue.length === 0) {
      return;
    }

    const record = queue.shift()!;
    this.activeJobs.set(deviceId, record);

    const { job, executor, resolve, reject } = record;
    job.status = 'processing';
    job.startedAt = new Date().toISOString();

    logger.info('PrintQueue', `Starting print job ${job.id} on ${deviceId} (Type: ${job.type})`);

    let completed = false;
    while (!completed && job.retryCount <= job.maxRetries) {
      try {
        await Promise.race([
          executor(job),
          new Promise((_, timeoutReject) =>
            setTimeout(
              () => timeoutReject(new Error(`Print execution timed out after ${this.config.jobTimeoutMs}ms`)),
              this.config.jobTimeoutMs
            )
          ),
        ]);

        completed = true;
        job.status = 'completed';
        job.completedAt = new Date().toISOString();
        this.totalProcessed++;
        logger.info('PrintQueue', `Job ${job.id} completed successfully on ${deviceId}`);
        this.emit('jobCompleted', job);
        resolve(job);
      } catch (err) {
        job.retryCount++;
        const errMsg = err instanceof Error ? err.message : String(err);
        job.error = errMsg;

        if (job.retryCount <= job.maxRetries) {
          logger.warn(
            'PrintQueue',
            `Job ${job.id} attempt ${job.retryCount} failed on ${deviceId}: ${errMsg}. Retrying in ${this.config.retryDelayMs}ms...`
          );
          await new Promise((r) => setTimeout(r, this.config.retryDelayMs));
        } else {
          completed = true;
          job.status = 'failed';
          job.completedAt = new Date().toISOString();
          this.totalFailed++;
          logger.error('PrintQueue', `Job ${job.id} permanently failed after ${job.retryCount} retries on ${deviceId}: ${errMsg}`);
          this.emit('jobFailed', job);
          reject(new PrintJobError(job.id, deviceId, errMsg, err));
        }
      }
    }

    this.activeJobs.delete(deviceId);
    this.processNext(deviceId);
  }

  public getQueueLength(deviceId: string): number {
    return (this.queues.get(deviceId) || []).length;
  }

  public getActiveJob(deviceId: string): PrintJob<unknown> | null {
    return this.activeJobs.get(deviceId)?.job || null;
  }

  public getStats(): { totalProcessed: number; totalFailed: number } {
    return {
      totalProcessed: this.totalProcessed,
      totalFailed: this.totalFailed,
    };
  }

  public clearQueue(deviceId: string): void {
    const queue = this.queues.get(deviceId);
    if (queue && queue.length > 0) {
      for (const record of queue) {
        record.job.status = 'failed';
        record.job.error = 'Queue was cleared';
        record.reject(new Error('Queue was cleared'));
      }
      this.queues.set(deviceId, []);
    }
  }
}

