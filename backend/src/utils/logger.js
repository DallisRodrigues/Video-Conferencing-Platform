// Never pass secrets, tokens, SDP or chat text to the logger.
const silent = process.env.NODE_ENV === "test" && !process.env.DEBUG_LOGS;

const write = (level, args) => {
    if (silent) return;
    const line = `[${new Date().toISOString()}] ${level.toUpperCase()}`;
    (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line, ...args);
};

export const logger = {
    info: (...args) => write("info", args),
    warn: (...args) => write("warn", args),
    error: (...args) => write("error", args),
};
