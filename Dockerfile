FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/obd-core/package.json ./packages/obd-core/package.json
RUN npm ci --omit=dev
COPY server ./server
COPY packages ./packages
COPY apps/taller ./apps/taller
USER node
EXPOSE 3020
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3020/api/salud || exit 1
CMD ["node", "server/index.js"]
