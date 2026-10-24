import httpStatus from "http-status";
import bcrypt from "bcrypt";
import { User } from "../models/user.model.js";
import { Meeting } from "../models/meeting.model.js";
import { HttpError } from "../middleware/errors.js";
import { config } from "../config/env.js";
import { createSession, destroySession } from "../utils/sessions.js";
import { cleanText, normalizeMeetingCode, normalizeUsername } from "../utils/validation.js";

const BCRYPT_ROUNDS = 10;
// Compared against when the user does not exist, so login timing does not
// reveal which usernames are registered.
const DUMMY_HASH = bcrypt.hashSync("timing-equaliser", BCRYPT_ROUNDS);

const HISTORY_LIMIT = 50;

function readPassword(value) {
    return typeof value === "string" && value.length >= 8 && value.length <= 128 ? value : null;
}

export const register = async (req, res) => {
    const name = cleanText(req.body?.name, 50);
    const username = normalizeUsername(req.body?.username);
    const password = readPassword(req.body?.password);

    const errors = {};
    if (!name) errors.name = "Enter your name.";
    if (!username) errors.username = "Use 3–30 letters, numbers, dots, dashes or underscores.";
    if (!password) errors.password = "Use at least 8 characters.";
    if (Object.keys(errors).length) throw new HttpError(httpStatus.BAD_REQUEST, "Please fix the highlighted fields.", errors);

    const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);
    try {
        await User.create({ name, username, password: hashed });
    } catch (err) {
        if (err?.code === 11000) {
            throw new HttpError(httpStatus.CONFLICT, "That username is taken.", { username: "That username is taken." });
        }
        throw err;
    }
    res.status(httpStatus.CREATED).json({ message: "Account created. You can sign in now." });
};

export const login = async (req, res) => {
    const username = normalizeUsername(req.body?.username);
    const password = typeof req.body?.password === "string" ? req.body.password.slice(0, 128) : "";
    if (!username || !password) throw new HttpError(httpStatus.BAD_REQUEST, "Enter your username and password.");

    const user = await User.findOne({ username }).select("+password");
    const ok = await bcrypt.compare(password, user ? user.password : DUMMY_HASH);
    if (!user || !ok) throw new HttpError(httpStatus.UNAUTHORIZED, "Incorrect username or password.");

    const { token, expiresAt } = await createSession(user._id, config.sessionTtlDays);
    res.status(httpStatus.OK).json({ token, expiresAt, user: user.toPublic() });
};

export const logout = async (req, res) => {
    await destroySession(req.token);
    res.status(httpStatus.NO_CONTENT).end();
};

export const me = async (req, res) => {
    res.json({ user: req.user.toPublic() });
};

export const getUserHistory = async (req, res) => {
    const meetings = await Meeting.find({ user: req.user._id })
        .sort({ date: -1 })
        .limit(HISTORY_LIMIT)
        .lean();
    res.json(
        meetings.map((m) => ({ id: m._id.toString(), meetingCode: m.meetingCode, date: m.date, joinCount: m.joinCount }))
    );
};

export const addToHistory = async (req, res) => {
    const meetingCode = normalizeMeetingCode(req.body?.meeting_code);
    if (!meetingCode) throw new HttpError(httpStatus.BAD_REQUEST, "Invalid meeting code.");

    await Meeting.updateOne(
        { user: req.user._id, meetingCode },
        { $set: { date: new Date() }, $inc: { joinCount: 1 } },
        { upsert: true }
    );
    res.status(httpStatus.CREATED).json({ message: "Added code to history" });
};

export const deleteHistoryEntry = async (req, res) => {
    const result = await Meeting.deleteOne({ _id: req.params.id, user: req.user._id });
    if (result.deletedCount === 0) throw new HttpError(httpStatus.NOT_FOUND, "History entry not found.");
    res.status(httpStatus.NO_CONTENT).end();
};
