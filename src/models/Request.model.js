import mongoose from "mongoose";

const RequestSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Profile",
    required: true,
  },
  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Profile",
    required: true,
  },
  role : {
    type: String,
    enum: ["doctor", "lawyer", "user"],
    required: true,
  },
  status: {
    type: String,
    enum: ["pending", "accepted", "rejected"],
    default: "pending",
  },
}, { timestamps: true });

RequestSchema.index({ sender: 1, receiver: 1 }, { unique: true }); // prevent duplicate requests
const RequestModel =
  mongoose.models.Request || mongoose.model("Request", RequestSchema);

export default RequestModel;