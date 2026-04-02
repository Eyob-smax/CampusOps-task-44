FROM node:18-alpine AS builder

WORKDIR /app

ARG VITE_BACKEND_PORT=6006
ENV VITE_BACKEND_PORT=$VITE_BACKEND_PORT

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

FROM node:18-alpine AS production

WORKDIR /app
RUN npm install -g serve

COPY --from=builder /app/dist ./dist

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost:80/ || exit 1

CMD ["serve", "-s", "dist", "-l", "80"]
