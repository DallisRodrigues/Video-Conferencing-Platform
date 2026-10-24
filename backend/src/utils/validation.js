// Control, zero-width and bidi-override characters (built from code points to keep the source ASCII).
const range = (a, b) => `${String.fromCharCode(a)}-${String.fromCharCode(b)}`;
const CONTROL_CHARS = new RegExp(
    `[${range(0x00, 0x1f)}${range(0x7f, 0x9f)}${range(0x200b, 0x200f)}${range(0x2028, 0x202e)}${range(0x2060, 0x206f)}]`,
    "g"
);

export const USERNAME_RE = /^[a-z0-9_.-]{3,30}$/;
export const MEETING_CODE_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

export const isString = (v) => typeof v === "string";

export function cleanText(value, maxLength) {
    if (!isString(value)) return "";
    return value.replace(CONTROL_CHARS, "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function cleanMultiline(value, maxLength) {
    if (!isString(value)) return "";
    return value
        .replace(/\r\n?/g, "\n")
        .replace(/[^\S\n]+/g, " ")
        .split("\n")
        .map((line) => line.replace(CONTROL_CHARS, "").trim())
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
        .slice(0, maxLength);
}

export function normalizeMeetingCode(value) {
    if (!isString(value)) return null;
    const code = value.trim().toLowerCase();
    return MEETING_CODE_RE.test(code) ? code : null;
}

export function normalizeUsername(value) {
    if (!isString(value)) return null;
    const username = value.trim().toLowerCase();
    return USERNAME_RE.test(username) ? username : null;
}

export const DISPLAY_NAME_MAX = 40;

export function normalizeDisplayName(value) {
    const name = cleanText(value, DISPLAY_NAME_MAX);
    return name.length >= 1 ? name : null;
}
