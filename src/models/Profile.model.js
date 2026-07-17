
import mongoose from "mongoose";
const ProfileSchema = new mongoose.Schema(
  {
    //SignUp Data
    fullName: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      minlength: 6,
    },
    role: {
      type: String,
      enum: ["user", "admin", "doctor", "lawyer"],
      default: "user",
    },
    verified: {
      type: Boolean,
      default: false,
    },
    //otpVerification
    otp: {
      type: String,
    },
    otpExpiry: {
      type: Date,
    },
    isOtpVerified: {
      type: Boolean,
      default: false
    },
    // Profile/Personal info
    ProfilePicture: {
      type: String, // ⚡ IMPORTANT: string rakho (tumhara meetingId string hai)
      default: null
    },
    // Profile/Identity
    DisplayName: {
      type: String,
      trim: true,
    },
    meetingUsed: {
      type: Boolean,
      default: false
    },
    Subscription: {
      type: String,
      enum: ["free", "spark", "assist", "enterprise"],
      default: "free",
    },

  },
  { timestamps: true }
);

// export const Profile = mongoose.model("Profile", ProfileSchema);
const Profile =
  mongoose.models.Profile || mongoose.model("Profile", ProfileSchema);

export default Profile;