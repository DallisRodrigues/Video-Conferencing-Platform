import crypto from "node:crypto";
import { Session } from "../models/session.model.js";
import { User } from "../models/user.model.js";

export const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

export async function createSession(userId, ttlDays) {
    const token = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
    await Session.create({ user: userId, tokenHash: hashToken(token), expiresAt });
    return { token, expiresAt };
}

export async function findUserByToken(token) {
    if (typeof token !== "string" || token.length < 20 || token.length > 200) return null;
    const session = await Session.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } }).lean();
    if (!session) return null;
    return User.findById(session.user);
}

export async function destroySession(token) {
    if (typeof token !== "string") return;
    await Session.deleteOne({ tokenHash: hashToken(token) });
}
