# Servidor do Zomba em contêiner, para uma VPS. Monta a partir da raiz do projeto:
#   docker compose -f servidor/docker-compose.yml up -d --build
# (o instalador servidor/vps/instalar.sh faz isso sozinho)

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# o jogo (pasta dist) e o servidor num arquivo só, já em JavaScript
RUN node node_modules/vite/bin/vite.js build --logLevel warn \
 && ./node_modules/.bin/esbuild src/server/main.ts --bundle --platform=node --format=esm --target=node22 --packages=external --outfile=server.mjs

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3001 ZOMBA_DATA=/data
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.mjs ./server.mjs
# o placar fica em /data (volume); o servidor roda sem ser root
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD wget -qO- http://127.0.0.1:3001/api/info || exit 1
CMD ["node", "server.mjs"]
