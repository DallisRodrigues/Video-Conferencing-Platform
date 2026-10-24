import mongoose, { Schema } from "mongoose";

const userSchema = new Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 50 },
        username: { type: String, required: true, unique: true, lowercase: true, trim: true },
        password: { type: String, required: true, select: false },
    },
    { timestamps: true }
);

userSchema.methods.toPublic = function toPublic() {
    return { id: this._id.toString(), name: this.name, username: this.username };
};

const User = mongoose.model("User", userSchema);

export { User };
