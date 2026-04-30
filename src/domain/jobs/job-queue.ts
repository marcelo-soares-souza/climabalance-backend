export interface EnqueueOptions {
  delayMs?: number;
}

export interface JobQueue {
  enqueue(jobType: string, payload: object, opts?: EnqueueOptions): Promise<void>;
}
