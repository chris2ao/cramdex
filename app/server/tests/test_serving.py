from fastapi.testclient import TestClient

import main


def test_405_keeps_allow_header(monkeypatch):
    # If app/web/dist happens to be built locally, the SPA StaticFiles mount
    # is registered at "/" and matches every path regardless of method,
    # which would shadow the 405 this test targets. Strip it for the
    # duration of this request so the test is hermetic either way.
    routes_without_spa = [
        r for r in main.app.router.routes if getattr(r, "name", None) != "spa"
    ]
    monkeypatch.setattr(main.app.router, "routes", routes_without_spa)

    client = TestClient(main.app)
    resp = client.get("/api/quiz/generate")  # POST-only route
    assert resp.status_code == 405
    assert "allow" in {k.lower() for k in resp.headers}
    assert resp.json() == {"detail": "Method Not Allowed"}
