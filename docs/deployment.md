# Production deployment

The production compose runs API and worker from the same image. Both mount the same `storage` directory so the API can persist an upload and the worker can read and remove it.

## Prerequisites

- Docker Engine with Compose v2.
- A reverse proxy with HTTPS in front of `127.0.0.1:4700` when the core runs on another host.
- Network access from the worker to Proscai MySQL, OpenAI, Voyage and Pinecone.
- A backup policy for the PostgreSQL and Redis Docker volumes.

## Environment

Create `.env.production` from `.env.example` and fill the secrets without committing it. For the compose database, configure:

```dotenv
AI_POSTGRES_PASSWORD=generate-a-strong-password
AI_DATABASE_URL=postgresql://postgres:url-encoded-password@postgres:5432/tuvansa_ai
```

`AI_DATABASE_URL` must contain the URL-encoded form of the same password. Also set `INTERNAL_API_KEY`, `LOCAL_PRODUCTS_INTERNAL_API_KEY`, provider keys and Proscai MySQL credentials.

## First deployment

```bash
mkdir -p storage/uploads
sudo chown -R 1000:1000 storage
docker compose --env-file .env.production -f compose.production.yml build
docker compose --env-file .env.production -f compose.production.yml up -d
docker compose --env-file .env.production -f compose.production.yml ps
curl http://127.0.0.1:4700/health/ready
```

The runtime container uses the Node user (`uid 1000`). Apply the ownership command once on the VPS so both API and worker can use the shared upload directory.

The `migrate` service must finish successfully before API and worker start. Migrations use `prisma migrate deploy`; production never uses `migrate dev` or `db push`.

## Subsequent deployments

```bash
git pull --ff-only
docker compose --env-file .env.production -f compose.production.yml build
docker compose --env-file .env.production -f compose.production.yml up -d
docker compose --env-file .env.production -f compose.production.yml logs --tail=100 api worker migrate
```

## Operations

```bash
docker compose --env-file .env.production -f compose.production.yml logs -f api worker
docker compose --env-file .env.production -f compose.production.yml restart worker
docker compose --env-file .env.production -f compose.production.yml run --rm migrate
```

Do not run a full vector synchronization during the cutover. First run a limited `dryRun`; only enable writes after reviewing `changed`, `stale` and `deleted` counts.
