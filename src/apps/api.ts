import { Server } from "node:http";
import { composeApi } from "../composition/api.composition";
import { loadApiConfig } from "../config/envs";

const config = loadApiConfig();
const runtime = composeApi(config);
const server: Server = runtime.app.listen(config.port, () => {
  console.log(JSON.stringify({
    level: "info",
    event: "api.started",
    service: "tuvansa-ai-platform",
    port: config.port,
  }));
});

async function shutdown(signal: string): Promise<void> {
  console.log(JSON.stringify({ level: "info", event: "api.stopping", signal }));
  server.close(async () => {
    await runtime.close();
    process.exit(0);
  });
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
