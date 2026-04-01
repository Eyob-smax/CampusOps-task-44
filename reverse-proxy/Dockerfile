FROM nginx:1.27-alpine

RUN apk add --no-cache openssl

COPY nginx.conf /etc/nginx/nginx.conf
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80 443

HEALTHCHECK --interval=20s --timeout=5s --retries=5 --start-period=20s \
  CMD wget --no-check-certificate -qO- https://localhost/health >/dev/null 2>&1 || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
