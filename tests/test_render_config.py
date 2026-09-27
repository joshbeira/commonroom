from server import create_app


def test_render_origin_host_and_secure_session(tmp_path, monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("DEMO_ENABLED", "false")
    monkeypatch.setenv("RENDER_EXTERNAL_HOSTNAME", "commonroom.example.com")
    monkeypatch.setenv("RENDER_EXTERNAL_URL", "https://commonroom.example.com")
    monkeypatch.delenv("PUBLIC_ORIGIN", raising=False)
    monkeypatch.delenv("TRUSTED_HOSTS", raising=False)
    app = create_app(
        {
            "TESTING": True,
            "SECRET_KEY": "s" * 64,
            "AUDIT_KEY": "a" * 64,
            "DATABASE": str(tmp_path / "ledger.db"),
        }
    )
    assert app.config["PUBLIC_ORIGIN"] == "https://commonroom.example.com"
    assert app.config["SESSION_COOKIE_SECURE"]
    client = app.test_client()
    assert client.get("/healthz", base_url="https://commonroom.example.com").status_code == 200
    assert client.get("/healthz", base_url="https://foreign.example.com").status_code == 400
