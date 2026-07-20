import mongoose from "mongoose";

const DashboardSessionSchema = new mongoose.Schema(
  {
    user_id: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    session_date: {
      type: Date,
      default: Date.now,
      index: true,
    },
    topic: {
      type: String,
      default: "",
      trim: true,
    },
    duration_mins: {
      type: Number,
      default: 0,
    },
    cards_used_pct: {
      type: Number,
      default: 0,
    },
    recoveries: {
      type: Number,
      default: 0,
    },
    strongest: {
      type: String,
      default: "",
      trim: true,
    },
    work_on: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: true,
    collection: "sessions",
  },
);

DashboardSessionSchema.index({ user_id: 1, session_date: -1 });

const DashboardSession =
  mongoose.models.DashboardSession ||
  mongoose.model("DashboardSession", DashboardSessionSchema);

export default DashboardSession;