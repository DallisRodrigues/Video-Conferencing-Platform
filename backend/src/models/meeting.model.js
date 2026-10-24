import mongoose, { Schema } from "mongoose";

const meetingSchema = new Schema({
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    meetingCode: { type: String, required: true },
    date: { type: Date, default: Date.now, required: true },
    joinCount: { type: Number, default: 1 },
});

meetingSchema.index({ user: 1, meetingCode: 1 }, { unique: true });
meetingSchema.index({ user: 1, date: -1 });

const Meeting = mongoose.model("Meeting", meetingSchema);

export { Meeting };
