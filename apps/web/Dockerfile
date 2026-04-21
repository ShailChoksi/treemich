FROM node:22-alpine AS build
RUN apk upgrade --no-cache
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN npm install

COPY . .
RUN npm run build -w @treemich/web

FROM nginx:1.29-alpine
RUN apk upgrade --no-cache
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
