import json
import logging
import os
import secrets
import sqlite3
import time
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix

from .db import close_db, migrate
from .security import authenticate


def create_app(test_config=None):
    load_dotenv()
    root = Path(__file__).resolve().parent.parent
    app = Flask(__name__, static_folder=None)
    production = os.getenv("APP_ENV") == "production"
    if production and os.getenv("RENDER") == "true" and not os.getenv("TURSO_DATABASE_URL"):
        raise RuntimeError("Render hosting requires a persistent TURSO_DATABASE_URL.")
    app.config.update(
        SECRET_KEY=os.getenv("SECRET_KEY"),
        AUDIT_KEY=os.getenv("AUDIT_KEY"),
        DATABASE=os.getenv("TURSO_DATABASE_URL")
        or str(root / os.getenv("DATABASE_PATH", "instance/commonroom.db")),
        DEMO_ENABLED=os.getenv("DEMO_ENABLED", "false").lower() == "true",
        SESSION_COOKIE_NAME="commonroom_session",
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_SECURE=production,
        MAX_CONTENT_LENGTH=5 * 1024 * 1024,
        TRUSTED_HOSTS=os.getenv(
            "TRUSTED_HOSTS",
            ",".join(
                filter(None, ("localhost", "127.0.0.1", os.getenv("RENDER_EXTERNAL_HOSTNAME")))
            ),
        ).split(","),
        PUBLIC_ORIGIN=os.getenv(
            "PUBLIC_ORIGIN", os.getenv("RENDER_EXTERNAL_URL", "http://localhost:8000")
        ),
        PRODUCTION=production,
        TRUST_PROXY=os.getenv("TRUST_PROXY", "false").lower() == "true",
    )
    if test_config:
        app.config.update(test_config)
    if os.getenv("TURSO_DATABASE_URL") and not app.config["DATABASE"].startswith("libsql://"):
        raise RuntimeError("TURSO_DATABASE_URL must use libsql:// for a libSQL database.")
    if app.config["TRUST_PROXY"]:
        # Enable only when the application port is reachable exclusively through one proxy.
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1)
    if not app.config.get("TESTING") and not production:
        key_path = root / "instance/development-keys.json"
        key_path.parent.mkdir(exist_ok=True)
        if not key_path.exists():
            key_path.write_text(
                json.dumps(
                    {"SECRET_KEY": secrets.token_hex(32), "AUDIT_KEY": secrets.token_hex(32)}
                )
            )
        for key, value in json.loads(key_path.read_text()).items():
            app.config[key] = app.config.get(key) or value
    if any(not app.config[k] or len(app.config[k]) < 32 for k in ("SECRET_KEY", "AUDIT_KEY")):
        raise RuntimeError(
            "Set independent SECRET_KEY and AUDIT_KEY values of at least 32 characters."
        )
    if app.config["SECRET_KEY"] == app.config["AUDIT_KEY"]:
        raise RuntimeError("Use different session and audit keys.")
    if production and (
        app.config["DEMO_ENABLED"] or not app.config["PUBLIC_ORIGIN"].startswith("https://")
    ):
        raise RuntimeError("Production requires HTTPS PUBLIC_ORIGIN and DEMO_ENABLED=false.")
    migrate(app.config["DATABASE"])
    app.teardown_appcontext(close_db)

    if os.getenv("SMTP_HOST") and not os.getenv("SMTP_FROM"):
        raise RuntimeError("SMTP_FROM is required when SMTP_HOST is configured.")

    @app.before_request
    def before_request():
        g.started = time.perf_counter()
        g.request_id = secrets.token_hex(8)
        authenticate()

    @app.after_request
    def after_request(response):
        duration = (time.perf_counter() - getattr(g, "started", time.perf_counter())) * 1000
        response.headers.update(
            {
                "X-Request-ID": getattr(g, "request_id", secrets.token_hex(8)),
                "Server-Timing": f"app;dur={duration:.2f}",
                "X-Content-Type-Options": "nosniff",
                "X-Frame-Options": "DENY",
                "Referrer-Policy": "no-referrer",
                "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
                "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
            }
        )
        if production:
            response.headers["Strict-Transport-Security"] = "max-age=31536000"
        if request.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        if response.status_code == 429:
            response.headers["Retry-After"] = str(getattr(g, "retry_after", 60))
        app.logger.info(
            json.dumps(
                {
                    "request_id": response.headers["X-Request-ID"],
                    "method": request.method,
                    "route": str(request.url_rule),
                    "status": response.status_code,
                    "duration_ms": round(duration, 2),
                }
            )
        )
        return response

    @app.errorhandler(HTTPException)
    def http_error(error):
        return jsonify(
            error=error.description, request_id=getattr(g, "request_id", None)
        ), error.code

    @app.errorhandler(sqlite3.OperationalError)
    def database_error(error):
        app.logger.error("Database operation failed: %s", type(error).__name__)
        return jsonify(error="The ledger is temporarily busy. Please retry shortly."), 503

    from .api import api

    app.register_blueprint(api, url_prefix="/api")

    @app.get("/healthz")
    def health():
        from .db import get_db

        get_db().execute("SELECT 1").fetchone()
        return {"status": "ok", "service": "commonroom", "version": "1.0.0"}

    @app.get("/")
    @app.get("/<path:path>")
    def frontend(path=""):
        dist = root / "web/dist"
        if path.startswith("api/"):
            from flask import abort

            abort(404)
        if path:
            return send_from_directory(dist, path)
        return send_from_directory(dist, "index.html")

    logging.basicConfig(level=logging.INFO)
    return app
