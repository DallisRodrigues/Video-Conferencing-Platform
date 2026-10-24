import httpStatus from "http-status";
import { findUserByToken } from "../utils/sessions.js";
import { HttpError } from "./errors.js";

export function bearerToken(req) {
    const header = req.get("authorization") || "";
    const [scheme, token] = header.split(" ");
    return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

export async function requireAuth(req, _res, next) {
    try {
        const token = bearerToken(req);
        const user = token ? await findUserByToken(token) : null;
        if (!user) throw new HttpError(httpStatus.UNAUTHORIZED, "Please sign in to continue.");
        req.user = user;
        req.token = token;
        next();
    } catch (err) {
        next(err);
    }
}
