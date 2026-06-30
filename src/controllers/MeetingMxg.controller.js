import MessageModel from "../models/MeetingMessages.model.js";
import { uploadOnCloudinary } from "../utils/Cloudinary.js";

export const createMessage = async (req, res) => {
  try {

    const { meetingId, senderId, senderName } = req.body;
    let { content } = req.body;

    console.log("Incoming message:", {
      meetingId,
      senderId,
      senderName,
      content,
    });

    if (!meetingId || !senderId || !senderName) {
      return res.status(400).json({
        error: "Missing fields",
      });
    }

    if (!content && !req.file) {
      return res.status(400).json({
        error: "Message cannot be empty",
      });
    }

    let fileUrl = "";

    // 📎 FILE UPLOAD (multer required)
    if (req.file) {
      const result = await uploadOnCloudinary(req.file.buffer);
      fileUrl = result.url;

      content = fileUrl; // override text with file URL
    }

    const message = await MessageModel.create({
      meetingId,
      senderId,
      senderName,
      content,
    });

    return res.status(201).json({ message });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: "Server error",
    });
  }
};
export const getMessages = async (req, res) => {
  try {

    const { meetingId, page = 1 } = req.query;
    const limit = 20;

    if (!meetingId) {
      return res.status(400).json({
        error: "meetingId required",
      });
    }

    const messages = await MessageModel.find({ meetingId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return res.status(200).json({ messages });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: "Server error",
    });
  }
};
export const updateMessage = async (req, res) => {
  try {

    const { messageId, content } = req.body;

    if (!messageId || !content) {
      return res.status(400).json({
        error: "Missing fields",
      });
    }

    const message = await MessageModel.findById(messageId);

    if (!message) {
      return res.status(404).json({
        error: "Message not found",
      });
    }

    // optional: only text messages editable
    if (message.type && message.type !== "text") {
      return res.status(400).json({
        error: "Only text messages can be edited",
      });
    }

    message.content = content;
    await message.save();

    return res.status(200).json({ message });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: "Server error",
    });
  }
};
export const deleteMessage = async (req, res) => {
  try {

    const { messageId } = req.query;

    if (!messageId) {
      return res.status(400).json({
        error: "messageId required",
      });
    }

    const message = await MessageModel.findById(messageId);

    if (!message) {
      return res.status(404).json({
        error: "Message not found",
      });
    }

    // soft delete
    message.disable = true;
    await message.save();

    return res.status(200).json({
      message: "Deleted successfully",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: "Server error",
    });
  }
};