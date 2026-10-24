import httpStatus from "http-status";
import { logger } from "../utils/logger.js";

export class HttpError extends Error {
    constructor(status, message, details) {
        super(message);
        this.status = status;
        this.details = details;
    }
}

export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function notFound(req, _res, next) {
    next(new HttpError(httpStatus.NOT_FOUND, `Route not found: ${req.method} ${req.originalUrl.split("?")[0]}`));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
    if (err.type === "entity.parse.failed") err = new HttpError(400, "Malformed JSON body.");
    if (err.type === "entity.too.large") err = new HttpError(413, "Request body is too large.");
    if (err.name === "CastError") err = new HttpError(400, "Invalid identifier.");

    const status = err instanceof HttpError ? err.status : 500;
    if (status >= 500) logger.error(`${req.method} ${req.path} failed:`, err.message);

    res.status(status).json({
        message: status >= 500 ? "Something went wrong on our side. Please try again." : err.message,
        ...(err.details ? { details: err.details } : {}),
    });
}
