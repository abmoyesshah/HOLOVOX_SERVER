import mongoose from "mongoose";

const UserFlagSchema = new mongoose.Schema(
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
    transcriptId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MeetingTranscript",
      required: true,
      index: true,
    },
    enterpriseTranscriptId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MeetingTranscript",
      default: null,
      index: true,
    },
    flagWordId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FlagWord",
      required: true,
      index: true,
    },
    flaggedMemberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EnterpriseProfile",
      default: null,
      index: true,
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
      enum: ["manager", "rep"],
      required: true,
      index: true,
    },
    managerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EnterpriseProfile",
      default: null,
      index: true,
    },
    quote: {
      type: String,
      default: "",
    },
    matchedWord: {
      type: String,
      required: true,
      trim: true,
    },
    severity: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
      index: true,
    },
    category: {
      type: String,
      default: "custom",
      trim: true,
    },
    segment: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    status: {
      type: String,
      enum: ["flagged", "manager_review", "rep_coached", "repaired", "resolved"],
      default: "flagged",
      index: true,
    },
    occurredAt: {
      type: Date,
      default: Date.now,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

UserFlagSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
UserFlagSchema.index({ organizationId: 1, flaggedMemberId: 1, status: 1 });
UserFlagSchema.index(
  { transcriptId: 1, flagWordId: 1, flaggedMemberId: 1 },
  { unique: true }
);

const UserFlag =
  mongoose.models.UserFlag || mongoose.model("UserFlag", UserFlagSchema, "enterprisefags");

export default UserFlag;
