FROM node:22-bookworm-slim AS frontend
WORKDIR /web
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate
COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
RUN pnpm build

FROM python:3.14-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
RUN groupadd --system commonroom && useradd --system --gid commonroom commonroom
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY server/ ./server/
COPY --from=frontend /web/dist ./web/dist
RUN mkdir /app/instance && chown commonroom:commonroom /app/instance
USER commonroom
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=3)"
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "1", "--threads", "24", "--timeout", "60", "--keep-alive", "5", "server:create_app()"]
