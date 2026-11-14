# syntax=docker/dockerfile:1
# JavaScript is platform independent; build on the builder's native CPU.
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json .npmrc ./
# Reuse the committed registry placeholder. The token exists only for this RUN.
RUN --mount=type=secret,id=gitlab_npm_token,env=GITLAB_NPM_TOKEN,required=true \
    npm ci --no-audit --no-fund

COPY src ./src
COPY scripts ./scripts
COPY nginx.conf ./nginx.conf
RUN npm run build && node scripts/prepare-image.mjs /out

FROM nginxinc/nginx-unprivileged:1.28-alpine AS runtime
COPY --from=build /out/html/ /usr/share/nginx/html/
COPY --from=build /out/default.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
