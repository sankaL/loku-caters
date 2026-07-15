from __future__ import annotations

from collections import OrderedDict, deque
from dataclasses import dataclass
import ipaddress
import re
from threading import Lock
import time
from typing import Pattern

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response


@dataclass(frozen=True)
class RateLimitRule:
    name: str
    path: Pattern[str]
    methods: frozenset[str]
    requests: int
    window_seconds: int

    def matches(self, request: Request) -> bool:
        return request.method in self.methods and bool(
            self.path.fullmatch(request.url.path)
        )


RATE_LIMIT_RULES = (
    RateLimitRule(
        "public-order-write",
        re.compile(r"/api/orders(?:/checkout)?"),
        frozenset({"POST"}),
        8,
        60,
    ),
    RateLimitRule(
        "public-order-quote",
        re.compile(r"/api/orders/quote"),
        frozenset({"POST"}),
        60,
        60,
    ),
    RateLimitRule(
        "public-feedback-write",
        re.compile(r"/api/feedback"),
        frozenset({"POST"}),
        5,
        600,
    ),
    RateLimitRule(
        "public-catering-write",
        re.compile(r"/api/catering-requests"),
        frozenset({"POST"}),
        5,
        600,
    ),
    RateLimitRule(
        "admin-dev-login",
        re.compile(r"/api/admin/dev-login"),
        frozenset({"POST"}),
        5,
        300,
    ),
    RateLimitRule(
        "admin-email-actions",
        re.compile(
            r"/api/admin/(?:orders/(?:remind|[^/]+/(?:remind|payment-remind|confirm))"
            r"|customers/[^/]+/event-reminder)"
        ),
        frozenset({"POST"}),
        600,
        600,
    ),
    RateLimitRule(
        "admin-api",
        re.compile(r"/api/admin(?:/.*)?"),
        frozenset({"GET", "POST", "PUT", "PATCH", "DELETE"}),
        300,
        60,
    ),
    RateLimitRule(
        "public-api-read",
        re.compile(r"/api/(?:config|feedback/reviews|health)"),
        frozenset({"GET"}),
        180,
        60,
    ),
)


def apply_security_headers(response: Response, path: str) -> Response:
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault(
        "Permissions-Policy", "camera=(), microphone=(), geolocation=()"
    )
    if path.startswith("/api/admin"):
        response.headers.setdefault("Cache-Control", "no-store")
    return response


def get_client_ip(request: Request, trusted_proxy_hops: int) -> str:
    direct_peer = request.client.host if request.client else "unknown"
    if trusted_proxy_hops <= 0:
        return direct_peer

    forwarded = [
        part.strip()
        for part in request.headers.get("x-forwarded-for", "").split(",")
        if part.strip()
    ]
    chain = forwarded + [direct_peer]
    if len(chain) <= trusted_proxy_hops:
        return direct_peer

    candidate = chain[-(trusted_proxy_hops + 1)]
    try:
        return str(ipaddress.ip_address(candidate))
    except ValueError:
        return direct_peer


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(
        self,
        app,
        *,
        enabled: bool,
        trusted_proxy_hops: int,
        rules: tuple[RateLimitRule, ...] = RATE_LIMIT_RULES,
        max_buckets: int = 20_000,
    ) -> None:
        super().__init__(app)
        self.enabled = enabled
        self.trusted_proxy_hops = max(0, trusted_proxy_hops)
        self.rules = rules
        self.max_buckets = max_buckets
        self._buckets: OrderedDict[tuple[str, str], deque[float]] = OrderedDict()
        self._lock = Lock()

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        if not self.enabled or request.method == "OPTIONS":
            return await call_next(request)

        rule = next(
            (candidate for candidate in self.rules if candidate.matches(request)), None
        )
        if rule is None:
            return await call_next(request)

        now = time.monotonic()
        key = (rule.name, get_client_ip(request, self.trusted_proxy_hops))
        with self._lock:
            bucket = self._buckets.setdefault(key, deque())
            cutoff = now - rule.window_seconds
            while bucket and bucket[0] <= cutoff:
                bucket.popleft()

            if len(bucket) >= rule.requests:
                retry_after = max(1, int(rule.window_seconds - (now - bucket[0])) + 1)
                allowed = False
            else:
                bucket.append(now)
                self._buckets.move_to_end(key)
                while len(self._buckets) > self.max_buckets:
                    self._buckets.popitem(last=False)
                retry_after = 0
                allowed = True

        if not allowed:
            return apply_security_headers(
                JSONResponse(
                    status_code=429,
                    content={"detail": "Too many requests"},
                    headers={
                        "Retry-After": str(retry_after),
                        "RateLimit-Limit": str(rule.requests),
                        "RateLimit-Policy": f"{rule.requests};w={rule.window_seconds}",
                    },
                ),
                request.url.path,
            )

        response = await call_next(request)
        response.headers.setdefault("RateLimit-Limit", str(rule.requests))
        response.headers.setdefault(
            "RateLimit-Policy", f"{rule.requests};w={rule.window_seconds}"
        )
        return response


class RequestSecurityMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, *, max_request_body_bytes: int) -> None:
        super().__init__(app)
        self.max_request_body_bytes = max(1, max_request_body_bytes)

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                declared_size = int(content_length)
            except ValueError:
                return apply_security_headers(
                    JSONResponse(
                        status_code=400, content={"detail": "Invalid Content-Length"}
                    ),
                    request.url.path,
                )
            if declared_size < 0:
                return apply_security_headers(
                    JSONResponse(
                        status_code=400, content={"detail": "Invalid Content-Length"}
                    ),
                    request.url.path,
                )
            if declared_size > self.max_request_body_bytes:
                return apply_security_headers(
                    JSONResponse(
                        status_code=413, content={"detail": "Request body too large"}
                    ),
                    request.url.path,
                )

        if request.method in {"POST", "PUT", "PATCH"}:
            body = bytearray()
            async for chunk in request.stream():
                body.extend(chunk)
                if len(body) > self.max_request_body_bytes:
                    return apply_security_headers(
                        JSONResponse(
                            status_code=413,
                            content={"detail": "Request body too large"},
                        ),
                        request.url.path,
                    )
            request._body = bytes(body)

        response = await call_next(request)
        return apply_security_headers(response, request.url.path)
