FROM node:22-alpine AS base
# Patch Alpine packages (may include refreshed runtimes flagged by image scanners).
RUN apk upgrade --no-cache
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN npm install

COPY . .
RUN npm run prisma:generate -w @treemich/api
RUN npm run build -w @treemich/api

EXPOSE 4000
CMD ["npm", "run", "start", "-w", "@treemich/api"]
