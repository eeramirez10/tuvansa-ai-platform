import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("development config does not inherit production-only core connection settings", async () => {
  const originalCwd = process.cwd();
  const directory = mkdtempSync(path.join(tmpdir(), "tuvansa-ai-env-"));
  const keys = ["NODE_ENV", "DATABASE_URL", "INTERNAL_API_KEY", "OPENAI_API_KEY", "CORE_BACKEND_BASE_URL", "CORE_BACKEND_ASSISTANT_API_KEY"];
  const previous = new Map(keys.map((key) => [key, process.env[key]]));

  try {
    writeFileSync(path.join(directory, ".env"), "CORE_BACKEND_BASE_URL=http://cotizador-core-backend:4600\nCORE_BACKEND_ASSISTANT_API_KEY=production-key\n");
    writeFileSync(path.join(directory, ".env.development"), "DATABASE_URL=postgresql://dev:dev@localhost:5432/dev\nINTERNAL_API_KEY=development-key\nOPENAI_API_KEY=development-openai-key\n");
    for (const key of keys) delete process.env[key];
    process.env.NODE_ENV = "development";
    process.chdir(directory);

    const { loadApiConfig } = await import("../src/config/envs");
    const config = loadApiConfig();
    assert.equal(config.coreBackendBaseUrl, "http://localhost:4600");
    assert.equal(config.coreBackendAssistantApiKey, "development-key");
  } finally {
    process.chdir(originalCwd);
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(directory, { recursive: true, force: true });
  }
});
