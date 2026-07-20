import mongoose from "mongoose";

const MessageSchema = new mongoose.Schema(
  {
    // 🔗 kis meeting ka message hai
    meetingId: {
      type: String, // ⚡ IMPORTANT: string rakho (tumhara meetingId string hai)
      required: true,
      index: true,
    },

    // 👤 kis user ne bheja
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "HolovoxUser",
      required: true,
    },

    senderName: {
      type: String,
      required: true,
    },


    // 📦 actual content (text ya URL)
    content: {
      type: String, // 🔥 ALWAYS STRING (text ya Cloudinary URL)
      required: true,
    },
    disable : {
        type: Boolean,
        default: false
    }

    // 👀 kis kis ne message dekha
    // seenBy: [
    //   {
    //     type: mongoose.Schema.Types.ObjectId,
    //     ref: "HolovoxUser",
    //   },
    // ],
  },
  {
    timestamps: true, // createdAt = message time
  }
);

// ⚡ FAST loading (chat history)
MessageSchema.index({ meetingId: 1, createdAt: -1 });

const MessageModel =
  mongoose.models.Message || mongoose.model("Message", MessageSchema);

export default MessageModel;