import { JobsOptions, Queue } from "bullmq";
import IORedis from "ioredis";
import { JobQueuePort, EnqueueJobInput } from "../../application/ports/job-queue.port";
import { AI_JOBS_QUEUE } from "./queue.constants";

export class BullMqJobQueueAdapter implements JobQueuePort {
  private readonly queue: Queue<EnqueueJobInput>;

  constructor(connection: IORedis, private readonly defaultOptions: JobsOptions) {
    this.queue = new Queue<EnqueueJobInput>(AI_JOBS_QUEUE, { connection });
  }

  public async enqueue(input: EnqueueJobInput): Promise<void> {
    const existing = await this.queue.getJob(input.jobId);
    if (existing) return;

    await this.queue.add(input.type, input, {
      ...this.defaultOptions,
      jobId: input.jobId,
    });
  }

  public async close(): Promise<void> {
    await this.queue.close();
  }
}
