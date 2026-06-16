import test from "node:test";
import assert from "node:assert";
import { checkAuth } from "../middleware/authMiddleware.js";
import { apiRateLimiter } from "../middleware/rateLimitMiddleware.js";

test("checkAuth middleware — insecure mode", () => {
    const originalKey = process.env.CLERK_SECRET_KEY;
    delete process.env.CLERK_SECRET_KEY;

    const req = { query: { userId: "test-user" } };
    const res = {};
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    checkAuth(req, res, next);
    assert.strictEqual(nextCalled, true);
    assert.strictEqual(req.authenticatedUserId, "test-user");

    process.env.CLERK_SECRET_KEY = originalKey;
});

test("checkAuth middleware — secure mode, missing token", () => {
    const originalKey = process.env.CLERK_SECRET_KEY;
    process.env.CLERK_SECRET_KEY = "sk_test_secret";

    const req = { auth: {} };
    let statusSet = 200;
    let jsonCalled = null;
    const res = {
        status(code) {
            statusSet = code;
            return this;
        },
        json(data) {
            jsonCalled = data;
        }
    };
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    checkAuth(req, res, next);
    assert.strictEqual(nextCalled, false);
    assert.strictEqual(statusSet, 401);
    assert.deepStrictEqual(jsonCalled, { error: "Unauthorized: Clerk authentication is required" });

    process.env.CLERK_SECRET_KEY = originalKey;
});

test("checkAuth middleware — secure mode, active token", () => {
    const originalKey = process.env.CLERK_SECRET_KEY;
    process.env.CLERK_SECRET_KEY = "sk_test_secret";

    const req = { auth: { userId: "user_clerk_999" } };
    const res = {};
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    checkAuth(req, res, next);
    assert.strictEqual(nextCalled, true);
    assert.strictEqual(req.authenticatedUserId, "user_clerk_999");

    process.env.CLERK_SECRET_KEY = originalKey;
});

test("apiRateLimiter — blocks requests above limit", () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production"; // Enable rate limiting for test

    const limiter = apiRateLimiter(2, 60000); // limit to 2
    const req = { ip: "10.0.0.1" };
    let statusSet = 200;
    let jsonCalled = null;
    const res = {
        status(code) {
            statusSet = code;
            return this;
        },
        json(data) {
            jsonCalled = data;
        }
    };

    let nextCount = 0;
    const next = () => { nextCount++; };

    limiter(req, res, next);
    limiter(req, res, next);
    limiter(req, res, next); // 3rd hits rate limit

    assert.strictEqual(nextCount, 2);
    assert.strictEqual(statusSet, 429);
    assert.deepStrictEqual(jsonCalled?.error, "Too many requests");

    process.env.NODE_ENV = originalEnv;
});
