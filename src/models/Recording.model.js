import mongoose from "mongoose";

const RecordingSchema = new mongoose.Schema(
  {
    meetingId: String,
    userId: String,
    videoUrl: String,
    publicId: String,
  },
  { timestamps: true }
);
// ⚡ FAST loading (chat history)
RecordingSchema.index({ meetingId: 1, createdAt: -1 });
const RecordingModel =
  mongoose.models.Recording ||
  mongoose.model("Recording", RecordingSchema);
export default RecordingModel;