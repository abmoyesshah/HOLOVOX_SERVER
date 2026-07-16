import mongoose from "mongoose";

const SkillMetricSchema = new mongoose.Schema(
  {
    user_id: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    trait_name: {
      type: String,
      required: true,
      trim: true,
    },
    current_score: {
      type: Number,
      default: 0,
    },
    previous_score: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    collection: "skill_metrics",
  },
);

SkillMetricSchema.index({ user_id: 1, trait_name: 1 }, { unique: true });

const SkillMetric =
  mongoose.models.SkillMetric ||
  mongoose.model("SkillMetric", SkillMetricSchema);

export default SkillMetric;