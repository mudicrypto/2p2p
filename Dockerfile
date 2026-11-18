# Multi-stage build for api / worker / web / admin. Select with --build-arg APP=api
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /repo

FROM base AS build
# Public URL the browser uses for live updates (Socket.IO); baked into the web build.
ARG NEXT_PUBLIC_WS_URL=
ENV NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL}
COPY . .
RUN pnpm install --frozen-lockfile && pnpm turbo run build

FROM base AS runtime
ARG APP=api
ENV NODE_ENV=production APP=${APP}
COPY --from=build /repo /repo
USER node
WORKDIR /repo/apps/${APP}
CMD ["sh", "-c", "if [ \"$APP\" = web ] || [ \"$APP\" = admin ] || [ \"$APP\" = tg ]; then npx next start; else node dist/main.js; fi"]
