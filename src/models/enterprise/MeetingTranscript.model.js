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
    enterpriseMeetingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EnterpriseMeeting",
      default: null,
      index: true,
    },
    normalTranscriptId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transcript",
      default: null,
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
    speakerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Profile",
      default: null,
      index: true,
    },
    speakerMemberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EnterpriseProfile",
      default: null,
      index: true,
    },
    speakerRole: {
      type: String,
      enum: ["owner", "manager", "rep"],
      default: null,
      index: true,
    },
    text: {
      type: String,
      required: true,
    },
    segment: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
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
  mongoose.model("MeetingTranscript", MeetingTranscriptSchema, "enterprisetranscripts");

export default MeetingTranscript;
