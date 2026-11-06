import assert from "node:assert/strict";
import test from "node:test";
import { assertStagingAiConfig, assertStagingVectorWrite } from "../src/config/staging-safety";

const env = { STAGING_MODE: "true", DATABASE_URL: "postgresql://postgres:secret@postgres:5432/tuvansa_ai",
  REDIS_URL: "redis://redis:6379", CORE_BACKEND_BASE_URL: "http://core:4600",
  PINECONE_LOCAL_PRODUCTS_NAMESPACE: "local-products-staging", PINECONE_CATALOG_VARIANTS_NAMESPACE: "catalog-variants" };
test("staging AI cannot connect to production databases or tools", () => {
  assert.doesNotThrow(() => assertStagingAiConfig(env));
  for (const change of [{ DATABASE_URL: env.DATABASE_URL.replace("@postgres:", "@production:") },
    { CORE_BACKEND_BASE_URL: "http://cotizador-core-backend:4600" }, { REDIS_URL: "redis://production:6379" },
    { PINECONE_LOCAL_PRODUCTS_NAMESPACE: "local-products" }]) {
    assert.throws(() => assertStagingAiConfig({ ...env, ...change }));
  }
});
test("shared ERP embeddings remain query-only while staging local products can be written", () => {
  assert.doesNotThrow(() => assertStagingVectorWrite("local-products-staging", env));
  assert.throws(() => assertStagingVectorWrite("catalog-variants", env));
  assert.throws(() => assertStagingVectorWrite("local-products", env));
  assert.doesNotThrow(() => assertStagingVectorWrite("catalog-variants", { STAGING_MODE: "false" }));
});
