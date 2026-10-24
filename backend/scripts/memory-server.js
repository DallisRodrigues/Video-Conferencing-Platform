// Runs the API against a throwaway in-memory MongoDB (used by the E2E suite and for demos).
import { MongoMemoryServer } from "mongodb-memory-server";

const mongo = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongo.getUri();
process.env.MONGODB_DB_NAME = "vcp_memory";
// Keep backend/.env Atlas credentials from being injected into this URI.
process.env.MONGODB_USERNAME = "";
process.env.MONGODB_PASSWORD = "";
console.log("[memory-server] using an in-memory MongoDB (data is discarded on exit)");

const stop = () => mongo.stop().finally(() => process.exit(0));
process.once("SIGTERM", stop);
process.once("SIGINT", stop);

await import("../src/server.js");
