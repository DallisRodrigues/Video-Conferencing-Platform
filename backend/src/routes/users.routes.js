import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import {
    addToHistory,
    deleteHistoryEntry,
    getUserHistory,
    login,
    logout,
    me,
    register,
} from "../controllers/user.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/errors.js";

const router = Router();

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { message: "Too many attempts. Please wait a few minutes and try again." },
    skip: () => process.env.NODE_ENV === "test",
});

router.post("/login", authLimiter, asyncHandler(login));
router.post("/register", authLimiter, asyncHandler(register));
router.post("/logout", requireAuth, asyncHandler(logout));
router.get("/me", requireAuth, asyncHandler(me));
router.post("/add_to_activity", requireAuth, asyncHandler(addToHistory));
router.get("/get_all_activity", requireAuth, asyncHandler(getUserHistory));
router.delete("/activity/:id", requireAuth, asyncHandler(deleteHistoryEntry));

export default router;
