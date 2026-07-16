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
  end:{
    type : Boolean,
    default : false,
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
    meetingDate : {
      type: Date,
      default: Date.now,
    },  
    time:{
      type: String,
      default: "00:00",
    },
    upcoming:{
      type: Boolean,
      default: false,
      index: true,
    },

    participants: [ParticipantSchema], // host + clients
  },
  {
    timestamps: true,
  }
);
MeetingSchema.index({ hostId : 1 ,upcoming: -1 });
const MeetingModel =
  mongoose.models.Meeting || mongoose.model("Meeting", MeetingSchema);

export default MeetingModel;