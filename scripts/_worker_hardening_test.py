"""Hermetic checks for the Modal worker hardening (security audit 2026-10-25:
M-1 fail-closed auth, L-3 CORS origins, L-4 ffprobe eval removal).

Run: PYTHONUTF8=1 python scripts/_worker_hardening_test.py

No network, no AWS, no Modal calls — FastAPI TestClient drives the middleware
directly and _parse_token / _parse_fps are exercised as pure functions.
"""
import base64
import hashlib
import hmac
import os
import re
import sys
import time
import types

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "modal"))

# Heavy render deps are only used inside handlers; stub them if absent locally.
for _mod in ("fal_client", "requests"):
    try:
        __import__(_mod)
    except ImportError:
        sys.modules[_mod] = types.ModuleType(_mod)

os.environ.pop("RENDER_API_TOKEN", None)
os.environ.pop("ADMIN_API_KEY", None)

import app_propreel_minimax as worker  # noqa: E402
import flashvsr_endpoint  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

failures = 0


def check(name, cond, detail=""):
    global failures
    if cond:
        print(f"  PASS: {name}")
    else:
        failures += 1
        print(f"  FAIL: {name} {detail}")


def mint_v1(secret, exp, uid="server"):
    """Byte-identical to the lib/workerToken.ts mint."""
    msg = f"v1.{exp}.{uid}"
    sig = base64.urlsafe_b64encode(
        hmac.new(secret.encode(), msg.encode(), hashlib.sha256).digest()
    ).decode().rstrip("=")
    return f"{msg}.{sig}"


client = TestClient(worker.web_app)
PROPREL = "https://www.propreel.co.za"
EVIL = "https://evil.example"

# ── 1. fail-closed auth with NO RENDER_API_TOKEN ────────────────────────────
print("1. fail-closed without RENDER_API_TOKEN")
r = client.post("/generate_text", headers={"Origin": PROPREL}, json={})
check("tokened endpoint rejects (401)", r.status_code == 401, f"got {r.status_code}")
check("error names the missing secret",
      "RENDER_API_TOKEN" in str(r.json().get("error", "")), str(r.json()))
check("ACAO echoed for allowed origin",
      r.headers.get("access-control-allow-origin") == PROPREL, str(dict(r.headers)))
r = client.post("/render_video", headers={"Origin": PROPREL}, json={})
check("paid endpoint rejects (401)", r.status_code == 401, f"got {r.status_code}")
r = client.post("/generate_text", headers={"Origin": EVIL}, json={})
check("foreign origin gets no ACAO on errors",
      r.headers.get("access-control-allow-origin") in (None, ""), str(dict(r.headers)))

# ── 2. CORS: allowed origins only ───────────────────────────────────────────
print("2. CORS preflight")


def preflight(origin):
    return client.options("/render_video", headers={
        "Origin": origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "x-propreel-token",
    })


r = preflight(PROPREL)
check("propreel.co.za allowed",
      r.status_code == 200 and r.headers.get("access-control-allow-origin") == PROPREL,
      f"got {r.status_code} {dict(r.headers)}")
for origin in ("https://propreel.co.za", "https://propreel-xi.vercel.app",
               "https://preview-abc123.vercel.app", "http://localhost:3000"):
    r = preflight(origin)
    check(f"allowed: {origin}",
          r.headers.get("access-control-allow-origin") == origin,
          f"got {r.status_code} {dict(r.headers)}")
for origin in (EVIL, "https://evil.vercel.app.evil.com", "https://evil.com",
               "http://localhost.evil.com", "null"):
    r = preflight(origin)
    check(f"denied: {origin}",
          r.headers.get("access-control-allow-origin") in (None, ""),
          f"got {dict(r.headers)}")

# ── 3. HMAC token accept/reject with the secret set ─────────────────────────
print("3. token verification with RENDER_API_TOKEN set")
os.environ["RENDER_API_TOKEN"] = "test-secret"
now = int(time.time())
tok = mint_v1("test-secret", now + 600)
info, err = worker._parse_token(tok)
check("valid v1 token accepted", err is None and info and info["uid"] == "server",
      str((info, err)))
info, err = worker._parse_token(mint_v1("wrong-secret", now + 600))
check("wrong signature rejected", err is not None)
info, err = worker._parse_token(mint_v1("test-secret", now - 10))
check("expired token rejected", err is not None)
info, err = worker._parse_token("v1.x.y.z")
check("malformed token rejected", err is not None)
r = client.get("/definitely-not-a-route", headers={"X-PropReel-Token": tok})
check("valid token passes the middleware (router 404)", r.status_code == 404,
      f"got {r.status_code}")
r = client.get("/definitely-not-a-route")
check("missing token 401s even with secret set", r.status_code == 401,
      f"got {r.status_code}")
r = client.post("/render_video", headers={"X-PropReel-Token": tok}, json={})
check("v1 token cannot start a paid job (403)", r.status_code == 403,
      f"got {r.status_code}")

# ── 4. /admin/secret stays fail-closed ──────────────────────────────────────
print("4. /admin/secret")
os.environ.pop("ADMIN_API_KEY", None)
r = client.post("/admin/secret", json={"name": "narakeet", "env_dict": {"K": "v"}})
check("401s without ADMIN_API_KEY", r.status_code == 401, f"got {r.status_code}")

# ── 5. ffprobe fps parsing without eval ─────────────────────────────────────
print("5. _parse_fps (L-4)")
p = flashvsr_endpoint._parse_fps
check("fractional fps", abs(p("30000/1001") - 29.97002997) < 1e-3, str(p("30000/1001")))
check("integer fps", p("25") == 25.0, str(p("25")))
check("empty falls back to 24", p("") == 24.0)
check("zero denominator falls back", p("1/0") == 24.0)
check("malicious string is inert", p('__import__("os").system("echo pwned")/1') == 24.0)
src = open(os.path.join(os.path.dirname(__file__), "..", "modal", "flashvsr_endpoint.py")).read()
# The only remaining "eval(" may be the backtick-quoted mention in the fix's
# own docstring — an actual call site has no backtick before it.
check("eval() call gone from flashvsr source", re.search(r"(?<!`)eval\(", src) is None)

print(failures == 0 and "\nALL WORKER HARDENING TESTS PASSED" or f"\n{failures} TEST(S) FAILED")
sys.exit(1 if failures else 0)
