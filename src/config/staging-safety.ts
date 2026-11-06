export function assertStagingAiConfig(env: NodeJS.ProcessEnv): void {
  if (env.STAGING_MODE !== "true") return;
  const db = new URL(env.DATABASE_URL || "");
  if (db.hostname !== "postgres" || db.pathname !== "/tuvansa_ai") {
    throw new Error("Staging AI must use its private Docker PostgreSQL database.");
  }
  if (env.CORE_BACKEND_BASE_URL !== "http://core:4600" || env.REDIS_URL !== "redis://redis:6379") {
    throw new Error("Staging AI must use its private core and Redis services.");
  }
  const local = env.PINECONE_LOCAL_PRODUCTS_NAMESPACE || "";
  if (!local.startsWith("local-products-staging") || local === env.PINECONE_CATALOG_VARIANTS_NAMESPACE) {
    throw new Error("Staging local products require an isolated vector namespace.");
  }
}

export function assertStagingVectorWrite(namespace: string, env: NodeJS.ProcessEnv = process.env): void {
  if (env.STAGING_MODE !== "true") return;
  if (!namespace.startsWith("local-products-staging") || namespace !== env.PINECONE_LOCAL_PRODUCTS_NAMESPACE
      || namespace === env.PINECONE_CATALOG_VARIANTS_NAMESPACE) {
    throw new Error("The shared ERP vector catalog is read-only in staging.");
  }
}
