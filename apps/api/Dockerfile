FROM node:20-alpine AS base
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
