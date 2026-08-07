# Production deployment

The production stack runs the API and worker from the same image. PostgreSQL stores jobs and
execution history, Redis persists the BullMQ queue, and API/worker share a document volume so a
worker can read and remove uploads created by the API.

## Prerequisites

- Docker Engine with Compose v2.
- External Docker network `infra-network` shared with `cotizador-core-backend`.
- Outbound access to Heroku ERP, OpenAI, Voyage and Pinecone.
- Connectivity to Proscai MySQL when catalog synchronization is enabled.
- Backup policies for the PostgreSQL, Redis and document volumes.

## Environment

Create `.env` from `.env.example` and keep it outside Git:

```bash
cp .env.example .env
chmod 600 .env
```

At minimum, configure:

```dotenv
NODE_ENV=production
API_PORT=4700
AI_POSTGRES_PASSWORD=generate-a-strong-password
AI_DATABASE_URL=postgresql://postgres:url-encoded-password@postgres:5432/tuvansa_ai
INTERNAL_API_KEY=generate-a-long-random-secret
LOCAL_PRODUCTS_INTERNAL_API_KEY=use-the-same-or-a-separate-secret
OPENAI_API_KEY=
ERP_PRODUCTS_BASE_URL=https://your-erp-backend.example.com/api/erp/products
ERP_PRODUCTS_API_KEY=
```

`AI_DATABASE_URL` must contain the URL-encoded version of `AI_POSTGRES_PASSWORD`.

## Host resources

Create the shared network once if it does not already exist:

```bash
docker network inspect infra-network >/dev/null 2>&1 || docker network create infra-network
```

Create persistent volumes once:

```bash
docker volume create tuvansa-ai-platform-documents
docker volume create tuvansa-ai-platform-postgres
docker volume create tuvansa-ai-platform-redis
```

## First deployment

```bash
docker compose -f compose.production.yaml config
docker compose -f compose.production.yaml build
docker compose -f compose.production.yaml up -d postgres redis
docker compose -f compose.production.yaml --profile maintenance run --rm migrate
docker compose -f compose.production.yaml up -d
docker compose -f compose.production.yaml ps
curl http://127.0.0.1:4700/health/ready
```

Migrations use `prisma migrate deploy`. Production must not use `migrate dev`, `db push` or
`migrate reset` after it contains real data.

## Subsequent deployments

```bash
git pull --ff-only origin main
docker compose -f compose.production.yaml build
docker compose -f compose.production.yaml up -d postgres redis
docker compose -f compose.production.yaml --profile maintenance run --rm migrate
docker compose -f compose.production.yaml up -d
docker compose -f compose.production.yaml logs --tail=100 api worker
```

## Operations

```bash
docker compose -f compose.production.yaml ps
docker compose -f compose.production.yaml logs -f api worker
docker compose -f compose.production.yaml restart worker
docker compose -f compose.production.yaml --profile maintenance run --rm migrate
docker network inspect infra-network
```

The core backend reaches the API through the external network using:

```dotenv
AI_PLATFORM_BASE_URL=http://tuvansa-ai-platform:4700
GPT_LOCAL_PRODUCTS_URL=http://tuvansa-ai-platform:4700/api/local-products-semantic
```

Do not run a full vector synchronization during the first cutover. Start with a limited dry run and
only enable writes after reviewing changed, stale and deleted vector counts.
