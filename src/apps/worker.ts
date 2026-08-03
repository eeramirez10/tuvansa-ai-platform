import { composeWorker } from "../composition/worker.composition";
import { loadWorkerConfig } from "../config/envs";

const config = loadWorkerConfig();
const runtime = composeWorker(config);
runtime.start();
console.log(JSON.stringify({
  level: "info",
  event: "worker.started",
  service: "tuvansa-ai-platform",
  concurrency: config.workerConcurrency,
}));

async function shutdown(signal: string): Promise<void> {
  console.log(JSON.stringify({ level: "info", event: "worker.stopping", signal }));
  await runtime.close();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
