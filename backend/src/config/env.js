import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Real environment variables (e.g. on Render) take precedence over backend/.env.
dotenv.config({ path: path.join(backendRoot, ".env"), quiet: true });

const list = (value) =>
    (value || "")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);

const int = (value, fallback) => {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
};

// MONGODB_USERNAME/PASSWORD are injected only when MONGODB_URI has no credentials or uses Atlas placeholders.
export function buildMongoUri({ uri, username, password }) {
    if (!uri) return "";
    const user = username ? encodeURIComponent(username) : "";
    const pass = password ? encodeURIComponent(password) : "";

    if (uri.includes("<username>") || uri.includes("<password>") || uri.includes("<db_password>")) {
        return uri
            .replace("<username>", user)
            .replace("<db_password>", pass)
            .replace("<password>", pass);
    }

    const hasCredentials = /^mongodb(\+srv)?:\/\/[^/@]+@/.test(uri);
    if (!hasCredentials && user && pass) {
        return uri.replace(/^(mongodb(\+srv)?:\/\/)/, `$1${user}:${pass}@`);
    }
    return uri;
}

const nodeEnv = process.env.NODE_ENV || "development";

export const config = {
    nodeEnv,
    isProduction: nodeEnv === "production",
    isTest: nodeEnv === "test",
    port: int(process.env.PORT, 8000),
    host: process.env.HOST || "0.0.0.0",
    mongoUri: buildMongoUri({
        uri: process.env.MONGODB_URI,
        username: process.env.MONGODB_USERNAME,
        password: process.env.MONGODB_PASSWORD,
    }),
    mongoDbName: process.env.MONGODB_DB_NAME || "video_conferencing_platform",
    // Only needed when the frontend is served from a different origin.
    clientOrigins: list(process.env.CLIENT_ORIGINS).length
        ? list(process.env.CLIENT_ORIGINS)
        : nodeEnv === "production"
          ? []
          : ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173"],
    sessionTtlDays: int(process.env.SESSION_TTL_DAYS, 7),
    maxParticipants: int(process.env.MAX_PARTICIPANTS, 6),
    trustProxy: process.env.TRUST_PROXY ?? (nodeEnv === "production" ? "1" : ""),
    serveFrontend: process.env.SERVE_FRONTEND !== "false",
    frontendDist: path.resolve(backendRoot, process.env.FRONTEND_DIST || "../frontend/dist"),
    ice: {
        stunUrls: list(process.env.STUN_URLS).length
            ? list(process.env.STUN_URLS)
            : ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"],
        turnUrls: list(process.env.TURN_URLS),
        turnUsername: process.env.TURN_USERNAME || "",
        turnCredential: process.env.TURN_CREDENTIAL || "",
        turnSecret: process.env.TURN_SECRET || "",
        turnTtlSeconds: int(process.env.TURN_TTL_SECONDS, 3600),
    },
};

export function missingRequiredConfig(cfg = config) {
    const missing = [];
    if (!cfg.mongoUri) missing.push("MONGODB_URI");
    return missing;
}
