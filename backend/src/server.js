import { createServer } from "node:http";
import { config, missingRequiredConfig } from "./config/env.js";
import { connectDb, disconnectDb } from "./config/db.js";
import { createApp } from "./app.js";
import { connectToSocket } from "./realtime/socketManager.js";
import { logger } from "./utils/logger.js";

const missing = missingRequiredConfig();
if (missing.length) {
    logger.error(`Missing required environment variables: ${missing.join(", ")}. See backend/.env.example.`);
    process.exit(1);
}

const app = createApp();
const server = createServer(app);
const io = connectToSocket(server);

const DB_ATTEMPTS = 5;

// Driver messages can embed the connection string, so strip URIs and credentials.
const scrub = (text) =>
    String(text)
        .replace(/mongodb(\+srv)?:\/\/\S+/g, "<uri>")
        .replace(/[\w.%+-]+:[^@\s]+@/g, "<credentials>@");

function describeDbError(err) {
    const reasons = [...(err.reason?.servers?.values() ?? [])].map((d) => d.error?.message).filter(Boolean);
    const detail = scrub(reasons[0] || err.message || err.name).slice(0, 160);
    let hint = "Check MONGODB_URI.";
    if (/auth|credential/i.test(detail)) hint = "The username or password in MONGODB_URI was rejected.";
    else if (/ENOTFOUND|ENOTIMP|querySrv/i.test(detail)) hint = "The cluster hostname could not be resolved (DNS / network).";
    else if (/closed|reset|TLS|SSL|ETIMEDOUT|timed out/i.test(detail))
        hint = "Atlas refused the connection: add this machine's IP under Atlas → Network Access, or check your network/VPN.";
    return `${err.name}: ${detail}. ${hint}`;
}

async function start() {
    for (let attempt = 1; ; attempt++) {
        try {
            await connectDb(config.mongoUri, config.mongoDbName);
            break;
        } catch (err) {
            logger.error(`MongoDB connection attempt ${attempt}/${DB_ATTEMPTS} failed. ${describeDbError(err)}`);
            if (attempt === DB_ATTEMPTS) process.exit(1);
            await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
        }
    }
    server.listen(config.port, config.host, () => {
        logger.info(`Video Conferencing Platform API listening on http://${config.host}:${config.port} (${config.nodeEnv})`);
    });
}

let shuttingDown = false;
async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received, shutting down`);
    io.close();
    server.close();
    await disconnectDb().catch(() => {});
    process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled promise rejection:", reason instanceof Error ? reason.message : reason);
});
process.on("uncaughtException", (err) => {
    logger.error("Uncaught exception, exiting:", err.message);
    process.exit(1);
});

start();
