# AltSignal 100 — single-container image (demo mode by default).
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 DATABASE_URL=file:/data/altsignal.db
COPY --from=build /app ./
VOLUME ["/data"]
EXPOSE 3000
# Migrate + seed on first start if the database is empty, then serve.
CMD ["sh", "-c", "npm run db:migrate && (node -e \"const {createClient}=require('@libsql/client');createClient({url:process.env.DATABASE_URL}).execute(\\\"select value from dataset_meta where key='asOf'\\\").then(r=>process.exit(r.rows.length?0:1)).catch(()=>process.exit(1))\" || npm run seed) && npx next start -p 3000"]
