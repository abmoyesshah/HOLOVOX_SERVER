import mongoose from "mongoose";

const ParticipantSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "HolovoxUser",
    index: true,
    default: null,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    lowercase: true,
    trim: true,
    index: true,
  },
  role: {
    type: String,
    enum: ["host", "participant", "guest"],
    default: "participant",
  },
  joinedAt: {
    type: Date,
    default: Date.now,
  },
  end: {
    type: Boolean,
    default: false,
  },
  token: {
    type: String,
  },
});

const MeetingSchema = new mongoose.Schema(
  {
    meetingId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    hostId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "HolovoxUser",
      required: true,
      index: true,
    },
    meetingTitle: {
      type: String,
      default: "Untitled Meeting",
    },
    meetingDate: {
      type: Date,
      default: Date.now,
    },
    time: {
      type: String,
      default: "00:00",
    },
    upcoming: {
      type: Boolean,
      default: false,
      index: true,
    },

    participants: [ParticipantSchema], // host + clients
    blockedParticipants: {
      type: [String], // stores the LiveKit identity (userId or guestId) that was removed
      default: [],
    },
    // inside MeetingSchema, alongside blockedParticipants
    waitingParticipants: {
      type: [
        {
          identity: { type: String, required: true },
          name: String,
          image: String,
          requestedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    admittedParticipants: {
      type: [String], // LiveKit identities the host has let in
      default: [],
    },
    isLocked: {
      type: Boolean,
      default: false,
    },
    deniedParticipants: {
      type: [String],
      default: [],
    },
    password: {
      type: String, // bcrypt hash, null if no password set
      default: null,
      select: false, // never returned by default queries
    },
    passwordProtected: {
      type: Boolean, // lets clients know a password is required, without exposing the hash
      default: false,
    },
  },

  {
    timestamps: true,
  },
);
MeetingSchema.index({ hostId: 1, upcoming: -1 });
const MeetingModel =
  mongoose.models.Meeting || mongoose.model("Meeting", MeetingSchema);

export default MeetingModel;
