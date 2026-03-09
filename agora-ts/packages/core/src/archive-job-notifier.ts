import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ArchiveJobDto } from '@agora-ts/contracts';

export interface ArchiveJobNotificationReceipt {
  notification_id: string;
  outbox_path: string;
}

export interface ArchiveJobNotifier {
  notify(job: ArchiveJobDto): ArchiveJobNotificationReceipt;
}

export interface FileArchiveJobNotifierOptions {
  outboxDir: string;
  now?: () => Date;
}

export interface ArchiveJobWriterReceipt {
  job_id: number;
  status: 'synced' | 'failed';
  commit_hash?: string;
  error_message?: string;
  processed_path: string;
}

export interface ArchiveJobReceiptIngestor {
  scan(): ArchiveJobWriterReceipt[];
}

export interface FileArchiveJobReceiptIngestorOptions {
  receiptDir: string;
}

export class FileArchiveJobNotifier implements ArchiveJobNotifier {
  private readonly now: () => Date;

  constructor(private readonly options: FileArchiveJobNotifierOptions) {
    this.now = options.now ?? (() => new Date());
  }

  notify(job: ArchiveJobDto): ArchiveJobNotificationReceipt {
    const notificationId = `archive-job-${job.id}`;
    const outboxPath = join(this.options.outboxDir, `${notificationId}.json`);
    const tempPath = `${outboxPath}.tmp`;
    const payload = {
      notification_id: notificationId,
      job_id: job.id,
      task_id: job.task_id,
      task_title: job.task_title,
      task_type: job.task_type,
      target_path: job.target_path,
      writer_agent: job.writer_agent,
      requested_at: job.requested_at,
      notified_at: this.now().toISOString(),
      payload: job.payload,
    };

    mkdirSync(dirname(outboxPath), { recursive: true });
    writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    renameSync(tempPath, outboxPath);

    return {
      notification_id: notificationId,
      outbox_path: outboxPath,
    };
  }
}

export class FileArchiveJobReceiptIngestor implements ArchiveJobReceiptIngestor {
  constructor(private readonly options: FileArchiveJobReceiptIngestorOptions) {}

  scan(): ArchiveJobWriterReceipt[] {
    mkdirSync(this.options.receiptDir, { recursive: true });
    const receipts: ArchiveJobWriterReceipt[] = [];
    for (const name of readdirSync(this.options.receiptDir).filter((entry) => entry.endsWith('.receipt.json'))) {
      const receiptPath = join(this.options.receiptDir, name);
      const processedPath = join(
        this.options.receiptDir,
        name.replace(/\.receipt\.json$/, '.processed.json'),
      );
      const raw = JSON.parse(readFileSync(receiptPath, 'utf8')) as Record<string, unknown>;
      const jobId = Number(raw.job_id);
      const status = raw.status;
      if (!Number.isInteger(jobId) || (status !== 'synced' && status !== 'failed')) {
        throw new Error(`Invalid archive writer receipt: ${receiptPath}`);
      }
      if (status === 'synced' && typeof raw.commit_hash !== 'string') {
        throw new Error(`Archive writer receipt missing commit_hash: ${receiptPath}`);
      }
      if (status === 'failed' && typeof raw.error_message !== 'string') {
        throw new Error(`Archive writer receipt missing error_message: ${receiptPath}`);
      }

      renameSync(receiptPath, processedPath);
      receipts.push({
        job_id: jobId,
        status,
        ...(typeof raw.commit_hash === 'string' ? { commit_hash: raw.commit_hash } : {}),
        ...(typeof raw.error_message === 'string' ? { error_message: raw.error_message } : {}),
        processed_path: processedPath,
      });
    }
    return receipts;
  }
}
