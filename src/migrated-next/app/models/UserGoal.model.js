import mongoose from "mongoose";

const UserGoalSchema = new mongoose.Schema(
  {
    user_id: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    goal_text: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: true,
    collection: "user_goals",
  },
);

UserGoalSchema.index({ user_id: 1, createdAt: -1 });

const UserGoal =
  mongoose.models.UserGoal || mongoose.model("UserGoal", UserGoalSchema);

export default UserGoal;