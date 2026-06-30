// import { io } from "../index.js";
import { getIO } from "../socket.js";
// import PersonalMessageModel from "../models/RequestChat.model.js";
// IMPORTANT: Ensure you are importing your Request and Profile models here
import RequestModel from "../models/Request.model.js"; // <-- Adjust path
import Profile from "../models/Profile.model.js"; // <-- Adjust path
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/AsyncHandler.js";
import { uploadOnCloudinary } from "../utils/Cloudinary.js";
import PersonalMessageModel from "../models/Chat.model.js";

const sendMessage = asyncHandler(async (req, res) => {
  const { senderId, receiverId, text } = req.body;
  const file = req.file;  
  const io = getIO();
  if (!senderId || !receiverId) {
    throw new ApiError(400, "Sender and Receiver required");
  }

  if (!text && !file) {
    throw new ApiError(400, "Message cannot be empty");
  }

  let fileUrl = "";
  let fileType = "";

  // 📎 upload file if exists
  if (file) {
    const result = await uploadOnCloudinary(file.buffer);
    fileUrl = result.url;
    fileType = file.mimetype.startsWith("image") ? "image" : "file";
  }

  const message = await PersonalMessageModel.create({
    sender: senderId,
    receiver: receiverId,
    text: text || "",
    fileUrl,
    fileType,
  });

  // 🔥 SOCKET PART (REAL-TIME)
  // This now works because users are joining rooms named after their IDs in index.js
  io.to(receiverId).emit("receiveMessage", message);
  io.to(senderId).emit("receiveMessage", message);

  return res.status(201).json(
    new ApiResponse(201, message, "Message sent successfully")
  );
});

const getMessages = asyncHandler(async (req, res) => {
  const { senderId, receiverId } = req.query;

  if (!senderId || !receiverId) {
    throw new ApiError(400, "senderId and receiverId required");
  }

  const messages = await PersonalMessageModel.find({
    $or: [
      { sender: senderId, receiver: receiverId },
      { sender: receiverId, receiver: senderId },
    ],
  }).sort({ createdAt: 1 });

  return res.status(200).json(
    new ApiResponse(200, messages, "Messages fetched successfully")
  );
});

const deleteMessage = asyncHandler(async (req, res) => {
  const { messageId, userId } = req.body;

  if (!messageId || !userId) {
    throw new ApiError(400, "messageId and userId required");
  }

  const message = await PersonalMessageModel.findById(messageId);

  if (!message) {
    throw new ApiError(404, "Message not found");
  }

  if (message.sender.toString() !== userId) {
    throw new ApiError(403, "You can only delete your own message");
  }

  await PersonalMessageModel.findByIdAndDelete(messageId);

  return res.status(200).json(
    new ApiResponse(200, null, "Message deleted")
  );
});

// 🔥 THE FIXED GET REQUESTS FUNCTION
// const getRequests = asyncHandler(async (req, res) => {
//   const { userId, role } = req.query;

//   console.log("Fetching requests:", userId, role);

//   if (!userId) {
//     throw new ApiError(400, "UserId is required");
//   }

//   let requests;

//   // The fields you want to expose to the frontend
//   const populateFields = "name fullName displayName email ProfilePicture";

//   if (role === "doctor" || role === "lawyer") {
//     // Doctors/Lawyers are the "receivers" of the requests
//     requests = await RequestModel.find({ receiver: userId })
//       .populate("sender", populateFields)
//       .populate("receiver", populateFields)
//       .sort({ createdAt: -1 });
//   } else {
//     // Normal users are the "senders" of the requests
//     requests = await RequestModel.find({ sender: userId })
//       .populate("sender", populateFields)
//       .populate("receiver", populateFields)
//       .sort({ createdAt: -1 });
//   }

//   console.log(`Fetched ${requests.length} populated requests.`);

//   // Return ONLY the requests array so the frontend parses it correctly
//   return res.status(200).json(
//     new ApiResponse(200, requests, "Requests fetched successfully")
//   );
// });

export {
  sendMessage,
  getMessages,
  deleteMessage,
  // getRequests // Make sure this is exported so your router can see it!
};