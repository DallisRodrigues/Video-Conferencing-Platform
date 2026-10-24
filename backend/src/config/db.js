import mongoose from "mongoose";
import { logger } from "../utils/logger.js";

mongoose.set("strictQuery", true);

export async function connectDb(uri, dbName) {
    await mongoose.connect(uri, {
        dbName,
        serverSelectionTimeoutMS: 10_000,
        maxPoolSize: 10,
    });
    // Never log the URI: it contains credentials.
    const host = mongoose.connection.host || "";
    logger.info(`MongoDB connected (db: ${dbName}, atlas: ${host.endsWith("mongodb.net")})`);

    mongoose.connection.on("disconnected", () => logger.warn("MongoDB disconnected"));
    mongoose.connection.on("reconnected", () => logger.info("MongoDB reconnected"));
    return mongoose.connection;
}

export const isDbReady = () => mongoose.connection.readyState === 1;

export async function disconnectDb() {
    await mongoose.disconnect();
}
