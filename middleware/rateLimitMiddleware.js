const rateLimit = {};

/**
 * A lightweight, dependency-free in-memory rate limiter middleware.
 */
export function apiRateLimiter(limit = 100, windowMs = 15 * 60 * 1000) {
    return (req, res, next) => {
        if (process.env.NODE_ENV === "test") {
            return next();
        }

        const ip = req.ip || req.headers["x-forwarded-for"] || "anonymous";
        const now = Date.now();

        if (!rateLimit[ip]) {
            rateLimit[ip] = [];
        }

        // Clean up older timestamps
        rateLimit[ip] = rateLimit[ip].filter(timestamp => now - timestamp < windowMs);

        if (rateLimit[ip].length >= limit) {
            return res.status(429).json({
                error: "Too many requests",
                message: "You have exceeded the rate limit. Please wait and try again later."
            });
        }

        rateLimit[ip].push(now);
        next();
    };
}
