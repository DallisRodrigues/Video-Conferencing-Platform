process.env.NODE_ENV = "test";

import { createServer } from "node:http";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { io as ioClient } from "socket.io-client";

// Tests run against an in-memory MongoDB and never touch Atlas.
export async function startTestStack({ maxParticipants = 6, ice } = {}) {
    const mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri(), { dbName: "vcp_test" });

    const { config } = await import("../src/config/env.js");
    const { createApp } = await import("../src/app.js");
    const { connectToSocket } = await import("../src/realtime/socketManager.js");

    const app = createApp({ ...config, ice: ice ?? config.ice, serveFrontend: false, clientOrigins: [] });
    const server = createServer(app);
    const io = connectToSocket(server, { maxParticipants, clientOrigins: [], ice: ice ?? config.ice });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${server.address().port}`;

    const sockets = [];
    const connect = (auth = {}) =>
        new Promise((resolve, reject) => {
            const s = ioClient(url, { transports: ["websocket"], auth, forceNew: true, reconnection: false });
            sockets.push(s);
            s.once("connect", () => resolve(s));
            s.once("connect_error", reject);
        });

    const stop = async () => {
        sockets.forEach((s) => s.disconnect());
        io.close();
        await new Promise((resolve) => server.close(resolve));
        await mongoose.disconnect();
        await mongo.stop();
    };

    return { app, server, io, url, connect, stop };
}

export const emitAck = (socket, event, payload) =>
    new Promise((resolve) => socket.emit(event, payload, resolve));

/** Resolves with the next payload of `event`, or rejects after `ms`. */
export const nextEvent = (socket, event, ms = 2000) =>
    new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            socket.off(event, handler);
            reject(new Error(`Timed out waiting for "${event}"`));
        }, ms);
        const handler = (payload) => {
            clearTimeout(timer);
            resolve(payload);
        };
        socket.once(event, handler);
    });

/** Resolves true if `event` does NOT arrive within `ms`. */
export const noEvent = (socket, event, ms = 300) =>
    new Promise((resolve) => {
        const handler = () => resolve(false);
        socket.once(event, handler);
        setTimeout(() => {
            socket.off(event, handler);
            resolve(true);
        }, ms);
    });
