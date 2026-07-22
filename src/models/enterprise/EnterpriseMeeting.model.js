import mongoose from "mongoose";

const EnterpriseMeetingSchema = new mongoose.Schema(
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
      unique: true,
      index: true,
    },
    normalMeetingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Meeting",
      default: null,
      index: true,
    },
    hostUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Profile",
      default: null,
      index: true,
    },
    hostMemberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EnterpriseProfile",
      default: null,
      index: true,
    },
    hostRole: {
      type: String,
      enum: ["owner", "manager", "rep"],
      default: null,
      index: true,
    },
    enterpriseActorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Profile",
      default: null,
      index: true,
    },
    enterpriseActorMemberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EnterpriseProfile",
      default: null,
      index: true,
    },
    enterpriseActorRole: {
      type: String,
      enum: ["owner", "manager", "rep"],
      required: true,
      index: true,
    },
    meetingTitle: {
      type: String,
      default: "Holovox Meeting",
      trim: true,
    },
    meetingPurpose: {
      type: String,
      enum: ["general", "coaching"],
      default: "general",
      index: true,
    },
    coachingFlagId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserFlag",
      default: null,
      index: true,
    },
    meetingDate: {
      type: Date,
      default: Date.now,
      index: true,
    },
    status: {
      type: String,
      enum: ["created", "live", "ended", "processed"],
      default: "created",
      index: true,
    },
    participantMemberIds: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "EnterpriseProfile",
      default: [],
    },
    startedAt: {
      type: Date,
      default: null,
    },
    endedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

EnterpriseMeetingSchema.index({ organizationId: 1, meetingDate: -1 });
EnterpriseMeetingSchema.index({ organizationId: 1, status: 1 });

const EnterpriseMeeting =
  mongoose.models.EnterpriseMeeting ||
  mongoose.model("EnterpriseMeeting", EnterpriseMeetingSchema, "enterprisemeeting");

export default EnterpriseMeeting;
