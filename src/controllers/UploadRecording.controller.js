import RecordingModel from "../models/Recording.model.js";
import { v2 as cloudinary } from "cloudinary";
export const createRecording = async (req, res) => {
  try {

    const { meetingId, userId, videoUrl, publicId } = req.body;

    console.log("Create Recording:", {
      meetingId,
      userId,
      videoUrl,
    });

    // ✅ validation
    if ( !userId || !videoUrl) {
      return res.status(400).json({
        success: false,
        message: "Missing fields",
      });
    }

    const newRecording = await RecordingModel.create({
      meetingId,
      userId,
      videoUrl,
      publicId,
    });

    return res.status(201).json({
      success: true,
      data: newRecording,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
export const getRecordings = async (req, res) => {
  try {

    const { userId } = req.params;
    console.log(userId);
    console.log("Fetching recordings for userId:", userId);

    const recordings = await RecordingModel.find(
      userId ? { userId } : {}
    )
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: recordings,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
export const deleteRecording = async (req, res) => {
  try {

    const { recordingId } = req.query;

    console.log("Delete request:", recordingId);

    if (!recordingId) {
      return res.status(400).json({
        success: false,
        message: "recordingId is required",
      });
    }

    const recording = await RecordingModel.findById(recordingId);

    if (!recording) {
      return res.status(404).json({
        success: false,
        message: "Recording not found",
      });
    }

    // ☁️ delete from Cloudinary
    if (recording.publicId) {
      const result = await cloudinary.uploader.destroy(
        recording.publicId,
        { resource_type: "video" }
      );

      console.log("Cloudinary delete result:", result);
    }

    // 🗑️ delete from DB
    await RecordingModel.findByIdAndDelete(recordingId);

    return res.status(200).json({
      success: true,
      message: "Recording deleted successfully",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};