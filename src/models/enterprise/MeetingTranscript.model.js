import mongoose from "mongoose";

const MeetingTranscriptSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EnterpriseOrganization",
      required: true,
      index: true,
    },
    meetingId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    hostMemberId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    participantMemberId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    participantName: {
      type: String,
      default: "",
      trim: true,
    },
    text: {
      type: String,
      required: true,
    },
    scannedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

MeetingTranscriptSchema.index({ organizationId: 1, meetingId: 1 });

const MeetingTranscript =
  mongoose.models.MeetingTranscript ||
  mongoose.model("MeetingTranscript", MeetingTranscriptSchema);

export default MeetingTranscript;
