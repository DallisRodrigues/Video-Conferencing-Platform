import fs from "node:fs";
import path from "node:path";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";

import { config } from "./config/env.js";
import { isDbReady } from "./config/db.js";
import userRoutes from "./routes/users.routes.js";
import { errorHandler, notFound } from "./middleware/errors.js";
import { buildIceServers } from "./utils/ice.js";

export function corsOrigin(allowed) {
    return (origin, callback) => {
        // Same-origin and non-browser requests have no Origin header.
        if (!origin || allowed.includes(origin)) return callback(null, true);
        callback(null, false);
    };
}

export function createApp(cfg = config) {
    const app = express();

    if (cfg.trustProxy) app.set("trust proxy", Number(cfg.trustProxy) || cfg.trustProxy);
    app.disable("x-powered-by");

    app.use(
        helmet({
            contentSecurityPolicy: {
                directives: {
                    "default-src": ["'self'"],
                    "connect-src": ["'self'", "wss:", "ws:", ...cfg.clientOrigins],
                    "img-src": ["'self'", "data:", "blob:"],
                    "media-src": ["'self'", "blob:", "mediastream:"],
                    "style-src": ["'self'", "'unsafe-inline'"],
                    "font-src": ["'self'", "data:"],
                },
            },
            permissionsPolicy: false,
        })
    );
    app.use((_req, res, next) => {
        res.setHeader("Permissions-Policy", "camera=(self), microphone=(self), display-capture=(self)");
        next();
    });
    app.use(cors({ origin: corsOrigin(cfg.clientOrigins) }));
    app.use(express.json({ limit: "20kb" }));

    app.get("/health/live", (_req, res) => res.json({ status: "ok" }));
    app.get("/health", (_req, res) => {
        const ready = isDbReady();
        res.status(ready ? 200 : 503).json({ status: ready ? "ok" : "unavailable", database: ready ? "connected" : "disconnected" });
    });

    const iceLimiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: "draft-8", legacyHeaders: false });
    app.get("/api/v1/ice-servers", iceLimiter, (_req, res) => {
        res.set("Cache-Control", "no-store");
        // Public STUN only; TURN credentials are issued to room members in the join-call ack.
        res.json({ iceServers: buildIceServers({ ...cfg.ice, turnUrls: [] }) });
    });

    app.use("/api/v1/users", userRoutes);
    app.use("/api", notFound);

    // Serve the built React app so one Render service hosts both UI and API.
    const indexHtml = path.join(cfg.frontendDist, "index.html");
    if (cfg.serveFrontend && fs.existsSync(indexHtml)) {
        app.use(express.static(cfg.frontendDist, { index: false, maxAge: "1h" }));
        app.use("/assets", express.static(path.join(cfg.frontendDist, "assets"), { immutable: true, maxAge: "1y" }));
        app.get("/{*splat}", (req, res, next) => {
            if (req.path.startsWith("/socket.io")) return next();
            res.sendFile(indexHtml);
        });
    }

    app.use(notFound);
    app.use(errorHandler);
    return app;
}
