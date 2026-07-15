import os
import re
import time
import unittest
from unittest.mock import patch

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("RESEND_API_KEY", "test-key")

from fastapi import FastAPI, HTTPException, Request
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
import jwt
from starlette.requests import Request as StarletteRequest

from config import Settings, settings
from routers import admin as admin_router
from routers.admin import verify_admin_token
from security import (
    RATE_LIMIT_RULES,
    RateLimitMiddleware,
    RateLimitRule,
    RequestSecurityMiddleware,
    get_client_ip,
)


class SettingsSecurityTests(unittest.TestCase):
    def test_derives_supabase_issuer_from_session_pooler_username(self):
        configured = Settings(
            database_url="postgresql://postgres.project-ref:password@pooler.supabase.com:5432/postgres",
            resend_api_key="test-key",
        )
        self.assertEqual(
            configured.get_supabase_issuer(),
            "https://project-ref.supabase.co/auth/v1",
        )

    def test_rejects_non_https_explicit_supabase_url(self):
        configured = Settings(
            database_url="postgresql://postgres:password@localhost:5432/postgres",
            resend_api_key="test-key",
            supabase_url="http://project-ref.supabase.co",
        )
        with self.assertRaises(ValueError):
            configured.get_supabase_issuer()

    def test_rejects_supabase_url_with_an_injected_path(self):
        configured = Settings(
            database_url="postgresql://postgres:password@localhost:5432/postgres",
            resend_api_key="test-key",
            supabase_url="https://project-ref.supabase.co/attacker-path",
        )
        with self.assertRaises(ValueError):
            configured.get_supabase_issuer()


class AdminTokenSecurityTests(unittest.TestCase):
    JWT_SECRET = "test-secret-that-is-at-least-32-bytes-long"

    def setUp(self):
        admin_router._jwks_last_success.clear()
        admin_router._jwks_failure_until.clear()
        admin_router._jwks_last_good.clear()
        admin_router._jwks_refreshing.clear()

    def _token(self, **overrides):
        issuer = "https://trusted-project.supabase.co/auth/v1"
        claims = {
            "sub": "admin-user",
            "email": "admin@example.com",
            "role": "authenticated",
            "iss": issuer,
            "aud": "authenticated",
            "iat": int(time.time()),
            "exp": int(time.time()) + 300,
        }
        claims.update(overrides)
        return jwt.encode(claims, self.JWT_SECRET, algorithm="HS256")

    def test_accepts_valid_token_from_pinned_issuer(self):
        with (
            patch.object(settings, "dev_mode", False),
            patch.object(
                settings, "supabase_url", "https://trusted-project.supabase.co"
            ),
            patch.object(settings, "supabase_jwt_secret", self.JWT_SECRET),
            patch.object(settings, "admin_emails", "admin@example.com"),
        ):
            claims = verify_admin_token(f"Bearer {self._token()}")
        self.assertEqual(claims["sub"], "admin-user")

    def test_rejects_token_from_another_issuer(self):
        with (
            patch.object(settings, "dev_mode", False),
            patch.object(
                settings, "supabase_url", "https://trusted-project.supabase.co"
            ),
            patch.object(settings, "supabase_jwt_secret", self.JWT_SECRET),
            patch.object(settings, "admin_emails", "admin@example.com"),
        ):
            with self.assertRaises(HTTPException) as exc:
                verify_admin_token(
                    f"Bearer {self._token(iss='https://attacker-project.supabase.co/auth/v1')}"
                )
        self.assertEqual(exc.exception.status_code, 401)

    def test_rejects_authenticated_user_outside_admin_allowlist(self):
        with (
            patch.object(settings, "dev_mode", False),
            patch.object(
                settings, "supabase_url", "https://trusted-project.supabase.co"
            ),
            patch.object(settings, "supabase_jwt_secret", self.JWT_SECRET),
            patch.object(settings, "admin_emails", "owner@example.com"),
        ):
            with self.assertRaises(HTTPException) as exc:
                verify_admin_token(f"Bearer {self._token()}")
        self.assertEqual(exc.exception.status_code, 403)

    def test_asymmetric_jwks_lookup_uses_configured_issuer(self):
        expected_issuer = "https://trusted-project.supabase.co/auth/v1"
        with (
            patch.object(settings, "dev_mode", False),
            patch.object(
                settings, "supabase_url", "https://trusted-project.supabase.co"
            ),
            patch.object(settings, "admin_emails", "admin@example.com"),
            patch(
                "routers.admin.jwt.get_unverified_header",
                return_value={"alg": "RS256", "kid": "key-1"},
            ),
            patch(
                "routers.admin._fetch_jwks", return_value={"keys": [{"kid": "key-1"}]}
            ) as fetch_jwks,
            patch("routers.admin.jwt.PyJWK.from_dict") as from_jwk,
            patch(
                "routers.admin.jwt.decode",
                return_value={
                    "sub": "admin",
                    "email": "admin@example.com",
                    "role": "authenticated",
                },
            ) as decode,
        ):
            verify_admin_token("Bearer header.payload.signature")

        fetch_jwks.assert_called_once_with(expected_issuer)
        from_jwk.assert_called_once_with({"kid": "key-1"})
        self.assertEqual(decode.call_args.kwargs["issuer"], expected_issuer)
        self.assertEqual(decode.call_args.kwargs["audience"], "authenticated")

    def test_jwks_outage_returns_controlled_service_unavailable(self):
        with (
            patch.object(settings, "dev_mode", False),
            patch.object(
                settings, "supabase_url", "https://trusted-project.supabase.co"
            ),
            patch(
                "routers.admin.jwt.get_unverified_header",
                return_value={"alg": "RS256", "kid": "key-1"},
            ),
            patch(
                "routers.admin._fetch_jwks",
                side_effect=admin_router.URLError("network unavailable"),
            ) as fetch,
        ):
            with self.assertRaises(HTTPException) as exc:
                verify_admin_token("Bearer header.payload.signature")
            with self.assertRaises(HTTPException):
                verify_admin_token("Bearer header.payload.signature")

        self.assertEqual(exc.exception.status_code, 503)
        self.assertEqual(
            exc.exception.detail, "Admin authentication is temporarily unavailable"
        )
        fetch.assert_called_once_with("https://trusted-project.supabase.co/auth/v1")

    def test_unknown_jwt_kid_refresh_is_rate_bounded(self):
        issuer = "https://trusted-project.supabase.co/auth/v1"
        with (
            patch("routers.admin._load_jwks", return_value={"keys": []}) as load_jwks,
            patch("routers.admin.time.monotonic", return_value=100.0),
        ):
            self.assertIsNone(admin_router._find_jwk(issuer, "unknown-1"))
            self.assertIsNone(admin_router._find_jwk(issuer, "unknown-2"))

        load_jwks.assert_called_once_with(issuer)

    def test_cached_signing_key_is_evicted_after_refresh_interval(self):
        issuer = "https://trusted-project.supabase.co/auth/v1"
        with (
            patch(
                "routers.admin._load_jwks",
                side_effect=[
                    {"keys": [{"kid": "retired-key"}]},
                    {"keys": [{"kid": "replacement-key"}]},
                ],
            ) as load_jwks,
            patch("routers.admin.time.monotonic", side_effect=[100.0, 161.0]),
        ):
            self.assertEqual(
                admin_router._find_jwk(issuer, "retired-key"),
                {"kid": "retired-key"},
            )
            self.assertIsNone(admin_router._find_jwk(issuer, "retired-key"))

        self.assertEqual(load_jwks.call_count, 2)

    def test_cached_key_remains_available_during_single_flight_refresh(self):
        issuer = "https://trusted-project.supabase.co/auth/v1"
        admin_router._jwks_last_good[issuer] = {"keys": [{"kid": "cached-key"}]}
        admin_router._jwks_last_success[issuer] = 100.0
        admin_router._jwks_refreshing.add(issuer)

        with (
            patch("routers.admin._load_jwks") as load_jwks,
            patch("routers.admin.time.monotonic", return_value=161.0),
        ):
            self.assertEqual(
                admin_router._find_jwk(issuer, "cached-key"),
                {"kid": "cached-key"},
            )

        load_jwks.assert_not_called()

    def test_empty_admin_allowlist_fails_closed(self):
        with (
            patch.object(settings, "admin_emails", ""),
            patch.object(settings, "allow_all_authenticated_admins", False),
        ):
            with self.assertRaises(HTTPException) as exc:
                admin_router._validate_admin_claims(
                    {"role": "authenticated", "email": "admin@example.com"}
                )

        self.assertEqual(exc.exception.status_code, 503)

    def test_empty_admin_allowlist_requires_explicit_opt_in(self):
        claims = {"role": "authenticated", "email": "admin@example.com"}
        with (
            patch.object(settings, "admin_emails", ""),
            patch.object(settings, "allow_all_authenticated_admins", True),
        ):
            self.assertEqual(admin_router._validate_admin_claims(claims), claims)


class RequestSecurityTests(unittest.TestCase):
    @staticmethod
    def _request(method: str, path: str) -> StarletteRequest:
        return StarletteRequest(
            {
                "type": "http",
                "method": method,
                "path": path,
                "headers": [],
                "client": ("127.0.0.1", 1234),
                "scheme": "https",
                "server": ("testserver", 443),
                "query_string": b"",
            }
        )

    def test_production_rate_rules_cover_sensitive_routes(self):
        expected_rules = {
            ("POST", "/api/orders"): "public-order-write",
            ("POST", "/api/orders/quote"): "public-order-quote",
            ("POST", "/api/feedback"): "public-feedback-write",
            ("POST", "/api/catering-requests"): "public-catering-write",
            ("POST", "/api/admin/dev-login"): "admin-dev-login",
            ("POST", "/api/admin/orders/order-1/remind"): "admin-email-actions",
            (
                "POST",
                "/api/admin/customers/customer-1/event-reminder",
            ): "admin-email-actions",
            ("DELETE", "/api/admin/orders/order-1"): "admin-api",
        }
        for (method, path), expected_name in expected_rules.items():
            request = self._request(method, path)
            matching_rule = next(
                (rule for rule in RATE_LIMIT_RULES if rule.matches(request)), None
            )
            with self.subTest(method=method, path=path):
                self.assertIsNotNone(matching_rule)
                self.assertEqual(matching_rule.name, expected_name)

        email_rule = next(
            rule for rule in RATE_LIMIT_RULES if rule.name == "admin-email-actions"
        )
        self.assertGreaterEqual(email_rule.requests, 500)

    def test_production_app_uses_security_middleware_in_safe_order(self):
        from main import app as production_app

        middleware_names = [
            middleware.cls.__name__ for middleware in production_app.user_middleware
        ]
        self.assertEqual(
            middleware_names[:3],
            ["CORSMiddleware", "RateLimitMiddleware", "RequestSecurityMiddleware"],
        )

        request_security = next(
            middleware
            for middleware in production_app.user_middleware
            if middleware.cls is RequestSecurityMiddleware
        )
        rate_limit = next(
            middleware
            for middleware in production_app.user_middleware
            if middleware.cls is RateLimitMiddleware
        )
        self.assertEqual(
            request_security.kwargs["max_request_body_bytes"],
            settings.max_request_body_bytes,
        )
        self.assertEqual(rate_limit.kwargs["enabled"], settings.rate_limit_enabled)
        self.assertEqual(
            rate_limit.kwargs["trusted_proxy_hops"],
            settings.rate_limit_trusted_proxy_hops,
        )

    def test_every_production_admin_route_requires_admin_authentication(self):
        from main import app as production_app

        def dependency_calls(route: APIRoute) -> set[object]:
            pending = list(route.dependant.dependencies)
            calls: set[object] = set()
            while pending:
                dependency = pending.pop()
                if dependency.call is not None:
                    calls.add(dependency.call)
                pending.extend(dependency.dependencies)
            return calls

        unprotected_routes = []
        for route in production_app.routes:
            if not isinstance(route, APIRoute):
                continue
            if not route.path.startswith("/api/admin"):
                continue
            if route.path == "/api/admin/dev-login":
                continue
            if admin_router.verify_admin_token not in dependency_calls(route):
                unprotected_routes.append(f"{sorted(route.methods)} {route.path}")

        self.assertEqual(unprotected_routes, [])

    def test_declared_body_size_validation_rejects_bad_headers(self):
        app = FastAPI()

        @app.post("/echo")
        async def echo(request: Request):
            return {"size": len(await request.body())}

        app.add_middleware(RequestSecurityMiddleware, max_request_body_bytes=8)
        client = TestClient(app)

        invalid = client.post(
            "/echo", content=b"a", headers={"content-length": "invalid"}
        )
        negative = client.post("/echo", content=b"a", headers={"content-length": "-1"})
        oversized = client.post("/echo", content=b"a", headers={"content-length": "9"})

        self.assertEqual(invalid.status_code, 400)
        self.assertEqual(negative.status_code, 400)
        self.assertEqual(oversized.status_code, 413)

    def test_trusted_proxy_hops_ignore_spoofed_leftmost_address(self):
        request = StarletteRequest(
            {
                "type": "http",
                "method": "GET",
                "path": "/",
                "headers": [(b"x-forwarded-for", b"203.0.113.99, 198.51.100.10")],
                "client": ("10.0.0.5", 1234),
                "scheme": "https",
                "server": ("testserver", 443),
                "query_string": b"",
            }
        )
        self.assertEqual(get_client_ip(request, trusted_proxy_hops=1), "198.51.100.10")

    def test_rate_limit_returns_retry_after(self):
        app = FastAPI()

        @app.get("/api/admin/limited")
        def limited():
            return {"ok": True}

        app.add_middleware(
            RateLimitMiddleware,
            enabled=True,
            trusted_proxy_hops=0,
            rules=(
                RateLimitRule(
                    "test", re.compile(r"/api/admin/limited"), frozenset({"GET"}), 2, 60
                ),
            ),
        )
        client = TestClient(app)
        self.assertEqual(client.get("/api/admin/limited").status_code, 200)
        self.assertEqual(client.get("/api/admin/limited").status_code, 200)
        blocked = client.get("/api/admin/limited")
        self.assertEqual(blocked.status_code, 429)
        self.assertIn("Retry-After", blocked.headers)
        self.assertEqual(blocked.headers["x-content-type-options"], "nosniff")
        self.assertEqual(blocked.headers["cache-control"], "no-store")

    def test_streamed_body_limit_cannot_be_bypassed_without_content_length(self):
        app = FastAPI()

        @app.post("/echo")
        async def echo(request: Request):
            return {"size": len(await request.body())}

        app.add_middleware(RequestSecurityMiddleware, max_request_body_bytes=8)
        client = TestClient(app)
        response = client.post(
            "/echo",
            content=iter([b"12345", b"67890"]),
            headers={"transfer-encoding": "chunked"},
        )
        self.assertEqual(response.status_code, 413)
        self.assertEqual(response.headers["x-content-type-options"], "nosniff")

    def test_rate_limit_rejects_before_body_security_middleware(self):
        class CountingRequestSecurityMiddleware(RequestSecurityMiddleware):
            calls = 0

            async def dispatch(self, request, call_next):
                type(self).calls += 1
                return await super().dispatch(request, call_next)

        app = FastAPI()

        @app.post("/limited")
        async def limited(request: Request):
            return {"size": len(await request.body())}

        app.add_middleware(
            CountingRequestSecurityMiddleware, max_request_body_bytes=1024
        )
        app.add_middleware(
            RateLimitMiddleware,
            enabled=True,
            trusted_proxy_hops=0,
            rules=(
                RateLimitRule(
                    "test", re.compile(r"/limited"), frozenset({"POST"}), 1, 60
                ),
            ),
        )
        client = TestClient(app)
        self.assertEqual(client.post("/limited", content=b"accepted").status_code, 200)
        self.assertEqual(client.post("/limited", content=b"blocked").status_code, 429)
        self.assertEqual(CountingRequestSecurityMiddleware.calls, 1)

    def test_accepted_streamed_body_is_replayed_to_endpoint(self):
        app = FastAPI()

        @app.post("/echo")
        async def echo(request: Request):
            return {"body": (await request.body()).decode("utf-8")}

        app.add_middleware(RequestSecurityMiddleware, max_request_body_bytes=16)
        response = TestClient(app).post(
            "/echo",
            content=iter([b"safe", b"-body"]),
            headers={"transfer-encoding": "chunked"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"body": "safe-body"})

    def test_security_headers_are_added(self):
        app = FastAPI()

        @app.get("/api/admin/example")
        def endpoint():
            return {"ok": True}

        app.add_middleware(RequestSecurityMiddleware, max_request_body_bytes=1024)
        response = TestClient(app).get("/api/admin/example")
        self.assertEqual(response.headers["x-content-type-options"], "nosniff")
        self.assertEqual(response.headers["cache-control"], "no-store")


if __name__ == "__main__":
    unittest.main()
