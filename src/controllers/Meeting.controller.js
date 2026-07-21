import MeetingModel from "../models/Meeting.model.js";
import sendMail from "../utils/Nodemailer.js";
import bcrypt from "bcrypt";
import Event from "../models/Event.model.js";
import Profile from "../models/Profile.model.js";
import {
  markEnterpriseMeetingEnded,
  syncEnterpriseMeetingFromMeeting,
  syncEnterpriseTranscriptsForMeeting,
} from "../services/enterprise/enterpriseMeetingSync.service.js";

const shareMeetingTemplate = (
  meetingLink,
  meetingId = null,
  hostName = "Holovox Host",
  hostEmail = "host@holovox.com",
  title,
  time,
) => {
  // Generate a meeting ID if not provided
  const displayMeetingId =
    meetingId || Math.floor(1000000000 + Math.random() * 9000000000);

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Holovox Meeting Invitation</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f5f5;padding:40px 20px;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border-radius:8px;border:1px solid #e5e5e5;box-shadow:0 1px 3px rgba(0,0,0,0.06);max-width:600px;width:100%;">
            
            <!-- HEADER -->
            <tr>
              <td style="padding:30px 30px 20px 30px;border-bottom:1px solid #e5e5e5;">
                <div style="font-size:24px;font-weight:700;color:#E51A54;">Holovox</div>
                <div style="font-size:12px;color:#666666;margin-top:2px;">AI-Powered Meetings</div>
              </td>
            </tr>

            <!-- BODY -->
            <tr>
              <td style="padding:30px;">
                
                <!-- GREETING -->
                <p style="font-size:14px;color:#333333;margin:0 0 16px 0;line-height:1.5;">
                  Hi there,
                </p>

                <p style="font-size:14px;color:#333333;margin:0 0 24px 0;line-height:1.5;">
                  <strong>${hostName}</strong> (${hostEmail}) is inviting you to a scheduled Holovox meeting.
                </p>

                <!-- MEETING DETAILS - Simple text format like Zoom -->
                <div style="font-size:16px;font-weight:600;color:#E51A54;margin-bottom:12px;">Join Holovox Meeting</div>
                
                <div style="font-size:14px;color:#333333;line-height:1.8;">
                  <div><strong>Topic:</strong> ${title || "Holovox Session"}</div>
                  <div><strong>Time:</strong> ${
                    time ||
                    new Date().toLocaleString("en-US", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  }</div>
                  <div><strong>Host:</strong> ${hostName}</div>
                  <div style="margin-top:12px;">
                    <strong>Meeting URL:</strong><br>
                    <a href="${meetingLink}" style="color:#E51A54;text-decoration:none;word-break:break-all;">${meetingLink}</a>
                  </div>
                  <div style="margin-top:8px;">
                    <strong>Meeting ID:</strong> ${displayMeetingId}
                  </div>
                </div>

                <!-- JOIN BUTTON -->
                <div style="margin:24px 0;">
                  <a href="${meetingLink}" style="display:inline-block;background:#E51A54;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:4px;font-weight:600;font-size:14px;">Join Meeting</a>
                </div>

                <!-- JOIN BY TELEPHONE - Simple text like Zoom -->
                

              </td>
            </tr>

            <!-- FOOTER -->
            <tr>
              <td style="border-top:1px solid #e5e5e5;padding:16px 30px;background:#fafafa;border-radius:0 0 8px 8px;">
                <div style="font-size:11px;color:#999999;text-align:center;">
                  © ${new Date().getFullYear()} Holovox. All rights reserved.
                </div>
                <div style="font-size:11px;color:#999999;text-align:center;margin-top:4px;">
                  <a href="#" style="color:#E51A54;text-decoration:none;margin:0 8px;">Privacy</a> | 
                  <a href="#" style="color:#E51A54;text-decoration:none;margin:0 8px;">Terms</a> | 
                  <a href="#" style="color:#E51A54;text-decoration:none;margin:0 8px;">Support</a>
                </div>
                <div style="font-size:10px;color:#999999;text-align:center;margin-top:6px;">
                  Powered by Holovox — AI-Powered Meeting Assistant
                </div>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;
};

const quotationEmailTemplate = (
  name,
  orgName,
  teamSize,
  companyEmail,
  contactNum,
  referenceNumber = null,
) => {
  const refNum = referenceNumber || `Q-${Date.now().toString().slice(-8)}`;
  const currentDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const currentTime = new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🔔 New Enterprise Quotation Request</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f5f5;padding:40px 20px;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border-radius:8px;border:1px solid #e5e5e5;box-shadow:0 1px 3px rgba(0,0,0,0.06);max-width:600px;width:100%;">
            
            <!-- HEADER -->
            <tr>
              <td style="padding:24px 30px;border-bottom:1px solid #e5e5e5;">
                <div style="display:flex;align-items:center;justify-content:space-between;">
                  <div>
                    <div style="font-size:20px;font-weight:700;color:#E51A54;">Holovox</div>
                    <div style="font-size:11px;color:#666666;">AI-Powered Meetings</div>
                  </div>
                  <div style="background:#E51A54;color:#ffffff;padding:4px 14px;border-radius:20px;font-size:11px;font-weight:600;">
                    NEW LEAD
                  </div>
                </div>
              </td>
            </tr>

            <!-- BODY -->
            <tr>
              <td style="padding:30px;">
                
                <!-- NOTIFICATION HEADER -->
                <div style="background:#E51A54;color:#ffffff;padding:16px 20px;border-radius:6px;margin-bottom:24px;">
                  <div style="font-size:18px;font-weight:700;">🔔 New Enterprise Quotation Request</div>
                  <div style="font-size:13px;opacity:0.9;margin-top:4px;">
                    Received on ${currentDate} at ${currentTime}
                  </div>
                </div>

                <!-- LEAD DETAILS -->
                <div style="background:#f8f9fa;border-radius:6px;padding:20px;margin-bottom:20px;border:1px solid #e5e5e5;">
                  <div style="font-size:13px;font-weight:600;color:#333333;margin-bottom:12px;">📋 Lead Details</div>
                  
                  <div style="font-size:14px;color:#333333;line-height:2;">
                    <div><strong>Reference:</strong> <span style="color:#E51A54;font-weight:600;">${refNum}</span></div>
                    <div><strong>Organization:</strong> <span style="font-weight:600;">${orgName}</span></div>
                    <div><strong>Team Size:</strong> ${teamSize || "Not specified"}</div>
                    <div><strong>Package:</strong> <span style="color:#E51A54;font-weight:600;">Enterprise</span></div>
                  </div>
                </div>

                <!-- CONTACT INFORMATION -->
                <div style="background:#f8f9fa;border-radius:6px;padding:20px;margin-bottom:20px;border:1px solid #e5e5e5;">
                  <div style="font-size:13px;font-weight:600;color:#333333;margin-bottom:12px;">👤 Contact Information</div>
                  
                  <div style="font-size:14px;color:#333333;line-height:2;">
                    <div><strong>Name:</strong> ${name}</div>
                    <div><strong>Email:</strong> <a href="mailto:${companyEmail}" style="color:#E51A54;text-decoration:none;font-weight:500;">${companyEmail}</a></div>
                    <div><strong>Phone:</strong> ${contactNum || "Not provided"}</div>
                  </div>
                </div>

                <!-- QUICK ACTIONS -->
                <div style="margin:24px 0;padding:16px;background:#f0f7ff;border-radius:6px;border:1px solid #d0e0ff;">
                  <div style="font-size:13px;font-weight:600;color:#333333;margin-bottom:8px;"> Quick Actions</div>
                  <div style="display:flex;flex-wrap:wrap;gap:10px;">
                    <a href="mailto:${companyEmail}?subject=Enterprise Package Inquiry - ${orgName}" style="display:inline-block;background:#E51A54;color:#ffffff;text-decoration:none;padding:8px 20px;border-radius:4px;font-size:13px;font-weight:500;">Reply to Customer</a>
                    <a href="#" style="display:inline-block;background:#ffffff;color:#333333;text-decoration:none;padding:8px 20px;border-radius:4px;font-size:13px;font-weight:500;border:1px solid #d0d0d0;">View in Dashboard</a>
                  </div>
                </div>

                <!-- TIMESTAMP -->
                <div style="font-size:11px;color:#999999;text-align:center;padding:12px 0;border-top:1px solid #e5e5e5;margin-top:8px;">
                  This is an automated notification. Please follow up with the lead promptly.
                </div>

              </td>
            </tr>

            <!-- FOOTER -->
            <tr>
              <td style="border-top:1px solid #e5e5e5;padding:14px 30px;background:#fafafa;border-radius:0 0 8px 8px;">
                <div style="font-size:10px;color:#999999;text-align:center;">
                  © ${new Date().getFullYear()} Holovox — Internal Notification
                </div>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;
};

export const createMeeting = async (req, res) => {
  try {
    const {
      hostId,
      name,
      email,
      meetingId,
      meetingTitle,
      date,
      time,
      upcoming,
      password,
    } = req.body;

    console.log("Create Meeting Payload:", {
      hostId,
      name,
      email,
      meetingId,
      meetingTitle,
      date,
      time,
      upcoming,
    });

    if (!hostId || !name || !email || !meetingId) {
      return res.status(400).json({
        error: "Missing required fields",
      });
    }
    let hashedPassword = null;
    let passwordProtected = false;
    if (password && String(password).trim() !== "") {
      hashedPassword = await bcrypt.hash(String(password).trim(), 10);
      passwordProtected = true;
    }

    const meeting = await MeetingModel.create({
      meetingId,
      hostId,
      meetingTitle: meetingTitle || "Holovox Meeting",
      meetingDate: date ? new Date(date) : new Date(),
      time: time || "00:00",
      upcoming: upcoming !== undefined ? upcoming : false,
      password: hashedPassword, // <-- add this
      passwordProtected, // <-- add this
      participants: [
        {
          userId: hostId,
          name,
          email,
          role: "host",
        },
      ],
    });

    syncEnterpriseMeetingFromMeeting(meeting).catch((error) =>
      console.error("Enterprise meeting create sync failed:", error.message),
    );

    await Event.create({
      userId: hostId,
      type: "meeting.created",
      entityId: meetingId,
      title: "Meeting Created",
      description: `"${meetingTitle}" has been scheduled`,
      priority: "normal",
      icon: "Calendar",
      color: "blue",
      actionLink: `/dashboard/meetings`,
    });
    return res.status(201).json({
      success: true,
      meeting,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
export const getMeetings = async (req, res) => {
  try {
    const email = req.query.email;
    console.log("Get Meetings Query:", { email });
    // 🔍 If email provided → single meeting
    if (email) {
      const meeting = await MeetingModel.findOne({
        "participants.email": email,
      });

      if (!meeting) {
        return res.status(404).json({
          success: false,
          message: "Meeting not found",
        });
      }

      return res.status(200).json({
        success: true,
        meeting,
      });
    }

    // 📋 all meetings
    const meetings = await MeetingModel.find({isDeleted: false});

    return res.status(200).json({
      success: true,
      meetings,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

export const getDeletedMeetings = async (req,res)=> {
  try {
    const meetings = await MeetingModel.find({isDeleted: true});
    return res.status(200).json({
      success: true,
      meetings,
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    })
  }
}

// Delete meeting route
export const deleteMeeting = async (req, res) => {
  try {
    const { meetingId } = req.body;

    console.log("Delete Meeting Request:", { meetingId });

    // Validate required fields
    if (!meetingId) {
      return res.status(400).json({
        success: false,
        error: "meetingId is required",
      });
    }

// ✅ Correct - this looks for meetingId field
const deletedMeeting = await MeetingModel.findOneAndUpdate(
  { meetingId: meetingId },
  { 
    isDeleted: true, 
    deletedAt: new Date() 
  },
  { new: true }
);

    // Check if meeting exists
    if (!deletedMeeting) {
      return res.status(404).json({
        success: false,
        error: "Meeting not found",
      });
    }

    console.log(`✅ Meeting ${meetingId} deleted successfully`);

    await Event.create({
      userId: deletedMeeting.hostId,
      type: "meeting.deleted",
      entityId: meetingId,
      title: "🗑️ Meeting Deleted",
      description: `"${deletedMeeting.meetingTitle || "Untitled Meeting"}" has been deleted - can be recovered from settings`,
      priority: "high",
      icon: "Trash2",
      color: "gray",
      actionLink: `/dashboard/meetings`,
      metadata: {
        meetingTitle: deletedMeeting.meetingTitle,
        meetingDate: deletedMeeting.meetingDate,
        time: deletedMeeting.time,
        hostId: deletedMeeting.hostId,
      },
    });
if (deletedMeeting.participants && deletedMeeting.participants.length > 0) {
  const hostEmail = deletedMeeting.participants.find(
    (p) => p.role === "host",
  )?.email;

  const hostName = deletedMeeting.participants.find(
    (p) => p.role === "host",
  )?.name || "Host";

  // ✅ Check if the meeting is upcoming (meetingDate is in the future)
  const meetingDate = new Date(deletedMeeting.meetingDate);
  const now = new Date();
  const isUpcoming = meetingDate > now;

  console.log(`📅 Meeting date: ${meetingDate}, Is upcoming: ${isUpcoming}`);

  // Loop through each participant and create an event
  for (const participant of deletedMeeting.participants) {
    // Skip the host (they already got the deletion event above)
    if (participant.role === "host") continue;

    // ✅ Only create event if the meeting is upcoming
    if (isUpcoming) {
      await Event.create({
        userId: participant.userId || participant._id,
        type: "meeting.deleted",
        entityId: meetingId,
        title: "🗑️ Meeting Cancelled",
        description: `"${deletedMeeting.meetingTitle || "Untitled Meeting"}" has been cancelled by the host`,
        priority: "high",
        icon: "Trash2",
        color: "gray",
        actionLink: `/dashboard/meetings`,
        metadata: {
          meetingTitle: deletedMeeting.meetingTitle,
          hostName: hostName,
          hostEmail: hostEmail,
          meetingDate: deletedMeeting.meetingDate,
          time: deletedMeeting.time,
        },
      });
    } else {
      console.log(
        `⏭️ Skipping notification for ${participant.name || participant.email} - meeting is in the past`,
      );
    }
  }

  console.log(
    `✅ Created deletion notifications for ${isUpcoming ? deletedMeeting.participants.length - 1 : 0} participants`,
  );
}

    return res.status(200).json({
      success: true,
      message: "Meeting deleted successfully",
      data: {
        meetingId: deletedMeeting.meetingId,
        meetingTitle: deletedMeeting.meetingTitle,
      },
    });
  } catch (error) {
    console.error("Error deleting meeting:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete meeting",
    });
  }
};

export const deleteMeetingForever = async(req, res) => {
  try {
     const { meetingId } = req.params;
    if (!meetingId) {
      return res.status(400).json({
        success: false,
        error: "meetingId is required",
      });
    }
    const deletedMeeting = await MeetingModel.findOneAndDelete({meetingId});
    if(!deletedMeeting){
       return res.status(404).json({
        success: false,
        error: "Meeting not found",
      });
    }

    console.log(`✅ Meeting ${meetingId} deleted successfully`);

   await Event.create({
  userId: deletedMeeting.hostId,
  type: "meeting.recovered", // Keep the type as "meeting.deleted" or change to "meeting.recovered" if you add it to the enum
  entityId: meetingId,
  title: "♻️ Meeting Recovered",
  description: `"${deletedMeeting.meetingTitle || "Untitled Meeting"}" has been recovered from the recycle bin`,
  priority: "normal", // Changed from "high" to "normal"
  icon: "RefreshCw", // Changed from "Trash2" to "RefreshCw"
  color: "green", // Changed from "gray" to "green"
  actionLink: `/dashboard/meetings`,
  metadata: {
    meetingTitle: deletedMeeting.meetingTitle,
    meetingDate: deletedMeeting.meetingDate,
    time: deletedMeeting.time,
    hostId: deletedMeeting.hostId,
  },
});

  } catch (error) {
    console.error("Error deleting meeting permanently:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete meeting permanently",
    });
  }
}

export const recoverMeeting = async(req, res) => {
  try {
    console.log("📥 Full request body:", req.body);
    console.log("📥 Request params:", req.params);
    console.log("📥 Request query:", req.query);
    const { meetingId } = req.params;
     console.log("📥 Extracted meetingId:", meetingId);
    if (!meetingId) {
      return res.status(400).json({
        success: false,
        error: "meetingId is required",
      });
    }
  // ✅ Correct - this looks for meetingId field
const deletedMeeting = await MeetingModel.findOneAndUpdate(
  { meetingId: meetingId },
  { 
    isDeleted: false, 
    deletedAt: null,
  },
  { new: true }
);
    if(!deletedMeeting){
       return res.status(404).json({
        success: false,
        error: "Meeting not found",
      });
    }

    console.log(`✅ Meeting ${meetingId} recovered successfully`);

    await Event.create({
      userId: deletedMeeting.hostId,
      type: "meeting.deleted",
      entityId: meetingId,
      title: "🗑️ Meeting Recovered",
      description: `"${deletedMeeting.meetingTitle || "Untitled Meeting"}" has been recovered`,
      priority: "high",
      icon: "Trash2",
      color: "gray",
      actionLink: `/dashboard/meetings`,
      metadata: {
        meetingTitle: deletedMeeting.meetingTitle,
        meetingDate: deletedMeeting.meetingDate,
        time: deletedMeeting.time,
        hostId: deletedMeeting.hostId,
      },
    });

  } catch (error) {
    console.error("Error recovering meeting:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to recover meeting",
    });
  }
}

export const validateMeeting = async (req, res) => {
  try {
    const { roomId } = req.params;
    const meetingId = roomId; // for backward compatibility
    const meeting = await MeetingModel.findOne({ meetingId });

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found",
      });
    }

    // ❌ check: are ALL participants ended?
    const allEnded = meeting.participants.every((p) => p.end === true);

    if (allEnded) {
      return res.status(403).json({
        success: false,
        message: "Meeting has already ended for all participants",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Meeting is active",
      meeting,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const checkMeetingPassword = async (req, res) => {
  try {
    const { roomId } = req.params;
    const meeting = await MeetingModel.findOne({ meetingId: roomId }).select(
      "passwordProtected",
    );
    if (!meeting)
      return res
        .status(404)
        .json({ success: false, message: "Meeting not found" });
    return res.status(200).json({
      success: true,
      passwordProtected: Boolean(meeting.passwordProtected),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const setMeetingPassword = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { hostId, password } = req.body;
    if (!hostId)
      return res
        .status(400)
        .json({ success: false, message: "hostId is required" });

    const meeting = await MeetingModel.findOne({ meetingId: roomId });
    if (!meeting)
      return res
        .status(404)
        .json({ success: false, message: "Meeting not found" });
    if (String(meeting.hostId) !== String(hostId)) {
      return res.status(403).json({
        success: false,
        message: "Only the meeting host can set a meeting password",
      });
    }

    if (password && String(password).trim() !== "") {
      meeting.password = await bcrypt.hash(String(password).trim(), 10);
      meeting.passwordProtected = true;
    } else {
      meeting.password = null;
      meeting.passwordProtected = false;
    }

    await meeting.save();
    return res
      .status(200)
      .json({ success: true, passwordProtected: meeting.passwordProtected });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
export const joinMeeting = async (req, res) => {
  try {
    const { userId, meetingId, name, email, token } = req.body;

    console.log("Join Meeting Payload:", {
      userId,
      meetingId,
      name,
      email,
      token,
    });

    if (!meetingId || !name) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    const meeting = await MeetingModel.findOneAndUpdate(
      { meetingId },
      {
        $push: {
          participants: {
            userId: userId || null,
            name,
            email: email || "",
            role: userId ? "participant" : "guest",
            end: false,
            token: token || "",
          },
        },
      },
      { new: true },
    );

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found",
      });
    }

    syncEnterpriseMeetingFromMeeting(meeting, "live").catch((error) =>
      console.error("Enterprise meeting join sync failed:", error.message),
    );

    return res.status(200).json({
      success: true,
      meeting,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
export const updateMeeting = async (req, res) => {
  try {
    const { meetingId } = req.params;

    const { meetingTitle, date, time, name, email, upcoming } = req.body;

    console.log("Update Meeting Payload:", {
      meetingId,
      meetingTitle,
      date,
      time,
      name,
      email,
      upcoming,
    });

    if (!meetingId) {
      return res.status(400).json({
        success: false,
        message: "Meeting ID is required",
      });
    }

    // Find meeting first
    const meeting = await MeetingModel.findOne({ meetingId });

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found",
      });
    }

    // 🔄 Update basic fields
    if (meetingTitle !== undefined) {
      meeting.meetingTitle = meetingTitle;
    }

    if (date !== undefined) {
      meeting.meetingDate = new Date(date);
    }

    if (time !== undefined) {
      meeting.time = time;
    }

    if (upcoming !== undefined) {
      meeting.upcoming = upcoming;
    }

    // 👤 Update host info inside participants (first participant = host)
    if (name || email) {
      const hostIndex = meeting.participants.findIndex(
        (p) => p.role === "host",
      );

      if (hostIndex !== -1) {
        if (name) meeting.participants[hostIndex].name = name;
        if (email) meeting.participants[hostIndex].email = email;
      }
    }

    await meeting.save();

    return res.status(200).json({
      success: true,
      message: "Meeting updated successfully",
      meeting,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
export const endMeeting = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { userId, participantToken } = req.body;
    const meetingId = roomId; // for backward compatibility
    const meeting = await MeetingModel.findOne({ meetingId });

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found",
      });
    }

    // 🔍 Find participant (user OR guest)
    const participant = meeting.participants.find((p) => {
      // 👤 Registered user
      if (userId && p.userId?.toString() === userId) {
        return true;
      }

      // 👤 Guest user
      if (participantToken && p.token === participantToken) {
        return true;
      }

      return false;
    });

    if (!participant) {
      return res.status(404).json({
        success: false,
        message: "Participant not found",
      });
    }

    participant.end = true;

    await meeting.save();

    const allParticipantsEnded = meeting.participants.every((p) => p.end === true);
    const enterpriseEndSync = allParticipantsEnded
      ? markEnterpriseMeetingEnded(meeting).then(() =>
          syncEnterpriseTranscriptsForMeeting(meeting),
        )
      : syncEnterpriseMeetingFromMeeting(meeting, "live");
    enterpriseEndSync.catch((error) =>
      console.error("Enterprise meeting end sync failed:", error.message),
    );

    await Event.create({
      userId: userId,
      type: "transcript.created",
      entityId: meetingId,
      title: "📝 Transcript Ready",
      description: `Transcript for "${meeting.meetingTitle}" is ready`,
      priority: "normal",
      icon: "FileText",
      color: "green",
      actionLink: `/dashboard/meetings`,
    });

    return res.status(200).json({
      success: true,
      message: "Meeting ended successfully",
      meeting,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const shareMeeting = async (req, res) => {
  try {
    const { meetingLink, emails, meetingId, hostName, hostEmail, title, time } =
      req.body;

    console.log("📨 Share Meeting Request:", {
      meetingLink,
      emails,
      meetingId,
      hostName,
      hostEmail,
      title,
      time,
    });
    console.log("📧 EMAIL_FROM:", process.env.EMAIL_FROM);

    // Validate inputs
    if (!meetingLink) {
      return res.status(400).json({
        success: false,
        message: "Meeting link is required",
      });
    }

    // Handle emails
    let emailList = [];
    if (Array.isArray(emails)) {
      emailList = emails.filter((email) => email && email.trim() !== "");
    } else if (typeof emails === "string") {
      emailList = [emails];
    }

    if (emailList.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one valid email is required",
      });
    }

    // Validate emails
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const validEmails = [];
    const invalidEmails = [];

    emailList.forEach((email) => {
      const trimmedEmail = email.trim();
      if (emailRegex.test(trimmedEmail)) {
        validEmails.push(trimmedEmail);
      } else {
        invalidEmails.push(trimmedEmail);
      }
    });

    if (validEmails.length === 0) {
      return res.status(400).json({
        success: false,
        message: `No valid email addresses found. Invalid: ${invalidEmails.join(", ")}`,
      });
    }

    // Send emails
    const results = [];
    const errors = [];
    for (const email of validEmails) {
      try {
        console.log(`📧 Sending email to ${email}...`);

        // Pass all parameters to the template
        const emailHtml = shareMeetingTemplate(
          meetingLink,
          meetingId || null,
          hostName || "Holovox Host",
          hostEmail || "host@holovox.com",
          title || "Holovox Session",
          time ||
            new Date().toLocaleString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }),
        );

        await sendMail(
          email,
          "You're Invited to a Holovox Meeting",
          emailHtml,
          process.env.EMAIL_FROM,
        );

        results.push({ email, status: "sent" });
        console.log(`✅ Email sent to ${email}`);
      } catch (error) {
        console.error(`❌ Failed to send to ${email}:`, error.message);
        errors.push({ email, error: error.message });
      }
    }

    // Return response
    if (results.length === 0) {
      return res.status(500).json({
        success: false,
        message: "Failed to send any emails",
        errors,
      });
    }
    try {
      // Find users by email
      const users = await Profile.find({
        email: { $in: validEmails },
      }).lean();

      if (users && users.length > 0) {
        const eventPromises = users.map((user) => {
          // Skip if the user is the host
          if (user.email === hostEmail) return null;

          return Event.create({
            userId: user._id,
            type: "meeting.invited",
            entityId: meetingId,
            title: "📧 Meeting Invitation",
            description: `${hostName} invited you to "${title || "a meeting"}" scheduled at ${time}`,
            priority: "high",
            icon: "Mail",
            color: "purple",
            actionLink: `/dashboard/meetings`,
            metadata: {
              meetingLink,
              meetingId,
              hostName,
              hostEmail,
              time,
            },
          });
        });

        const validPromises = eventPromises.filter((p) => p !== null);
        if (validPromises.length > 0) {
          await Promise.all(validPromises);
          console.log(
            `✅ Created ${validPromises.length} notification events for invited users`,
          );
        }
      }
    } catch (eventError) {
      console.error("⚠️ Error creating notification events:", eventError);
    }

    if (errors.length > 0) {
      return res.status(207).json({
        success: true,
        message: `Sent ${results.length} email(s), failed ${errors.length} email(s)`,
        data: { sent: results, failed: errors, invalid: invalidEmails },
      });
    }

    return res.status(200).json({
      success: true,
      message: `Meeting shared successfully with ${results.length} recipient(s)`,
      data: { sent: results },
    });
  } catch (error) {
    console.error("❌ Share meeting error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to share meeting",
    });
  }
};

export const shareQuotation = async(req,res)=>{
  try {
    const {name, orgName, teamSize, companyEmail, contact} = req.body;

    const emailHtml = quotationEmailTemplate(name,orgName,teamSize,companyEmail,contact)
    await sendMail(
          process.env.OWNER_EMAIL || "rob@holovox.io",
          "New Quotation Request - Holovox",
          emailHtml,
          process.env.EMAIL_FROM,
        );
        res.status(200).json({
      success: true,
      message: "Quotation request sent successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to share quotation",
    });
  }
}

export const getUniqueParticipants = async (req, res) => {
  try {
    const { hostId } = req.params;

    if (!hostId) {
      return res.status(400).json({
        success: false,
        message: "Host ID is required",
      });
    }

    // 🔥 Find all meetings of this host
    const meetings = await MeetingModel.find({
      "participants.userId": hostId,
    });

    // 🔥 Store unique participants
    const uniqueParticipantsMap = new Map();

    meetings.forEach((meeting) => {
      meeting.participants.forEach((participant) => {
        // ❌ Skip host
        // if (participant.role === "host") return;

        // ❌ Skip guests
        if (participant.role === "guest") return;

        // ❌ Skip if no userId
        if (!participant.userId) return;
        // ❌ Skip yourself
        if (participant.userId.toString() === hostId) {
          return;
        }

        const uniqueKey = participant.userId.toString();

        // ✅ Add only once
        if (!uniqueParticipantsMap.has(uniqueKey)) {
          uniqueParticipantsMap.set(uniqueKey, {
            userId: participant.userId,
            name: participant.name,
            email: participant.email,
            role: participant.role,
            joinedAt: participant.joinedAt,
            end: participant.end,
          });
        }
      });
    });

    const participants = Array.from(uniqueParticipantsMap.values());

    return res.status(200).json({
      success: true,
      count: participants.length,
      participants,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// import MeetingModel from "../models/Meeting.model.js";
// import sendMail from "../utils/Nodemailer.js";
// const shareMeetingTemplate = (meetingLink, meetingId = null, hostName = "Holovox Host", hostEmail = "host@holovox.com", title, time) => {
//   // Generate a meeting ID if not provided
//   const displayMeetingId = meetingId || Math.floor(1000000000 + Math.random() * 9000000000);

//   return `
//   <!DOCTYPE html>
//   <html>
//   <head>
//     <meta charset="UTF-8">
//     <meta name="viewport" content="width=device-width, initial-scale=1.0">
//     <title>Holovox Meeting Invitation</title>
//   </head>
//   <body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
//     <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f5f5;padding:40px 20px;">
//       <tr>
//         <td align="center">
//           <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border-radius:8px;border:1px solid #e5e5e5;box-shadow:0 1px 3px rgba(0,0,0,0.06);max-width:600px;width:100%;">

//             <!-- HEADER -->
//             <tr>
//               <td style="padding:30px 30px 20px 30px;border-bottom:1px solid #e5e5e5;">
//                 <div style="font-size:24px;font-weight:700;color:#E51A54;">Holovox</div>
//                 <div style="font-size:12px;color:#666666;margin-top:2px;">AI-Powered Meetings</div>
//               </td>
//             </tr>

//             <!-- BODY -->
//             <tr>
//               <td style="padding:30px;">

//                 <!-- GREETING -->
//                 <p style="font-size:14px;color:#333333;margin:0 0 16px 0;line-height:1.5;">
//                   Hi there,
//                 </p>

//                 <p style="font-size:14px;color:#333333;margin:0 0 24px 0;line-height:1.5;">
//                   <strong>${hostName}</strong> (${hostEmail}) is inviting you to a scheduled Holovox meeting.
//                 </p>

//                 <!-- MEETING DETAILS - Simple text format like Zoom -->
//                 <div style="font-size:16px;font-weight:600;color:#E51A54;margin-bottom:12px;">Join Holovox Meeting</div>

//                 <div style="font-size:14px;color:#333333;line-height:1.8;">
//                   <div><strong>Topic:</strong> ${title || "Holovox Session"}</div>
//                   <div><strong>Time:</strong> ${time || new Date().toLocaleString('en-US', {
//                     weekday: 'long',
//                     month: 'long',
//                     day: 'numeric',
//                     year: 'numeric',
//                     hour: '2-digit',
//                     minute: '2-digit'
//                   })}</div>
//                   <div><strong>Host:</strong> ${hostName}</div>
//                   <div style="margin-top:12px;">
//                     <strong>Meeting URL:</strong><br>
//                     <a href="${meetingLink}" style="color:#E51A54;text-decoration:none;word-break:break-all;">${meetingLink}</a>
//                   </div>
//                   <div style="margin-top:8px;">
//                     <strong>Meeting ID:</strong> ${displayMeetingId}
//                   </div>
//                 </div>

//                 <!-- JOIN BUTTON -->
//                 <div style="margin:24px 0;">
//                   <a href="${meetingLink}" style="display:inline-block;background:#E51A54;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:4px;font-weight:600;font-size:14px;">Join Meeting</a>
//                 </div>

//                 <!-- JOIN BY TELEPHONE - Simple text like Zoom -->

//               </td>
//             </tr>

//             <!-- FOOTER -->
//             <tr>
//               <td style="border-top:1px solid #e5e5e5;padding:16px 30px;background:#fafafa;border-radius:0 0 8px 8px;">
//                 <div style="font-size:11px;color:#999999;text-align:center;">
//                   © ${new Date().getFullYear()} Holovox. All rights reserved.
//                 </div>
//                 <div style="font-size:11px;color:#999999;text-align:center;margin-top:4px;">
//                   <a href="#" style="color:#E51A54;text-decoration:none;margin:0 8px;">Privacy</a> |
//                   <a href="#" style="color:#E51A54;text-decoration:none;margin:0 8px;">Terms</a> |
//                   <a href="#" style="color:#E51A54;text-decoration:none;margin:0 8px;">Support</a>
//                 </div>
//                 <div style="font-size:10px;color:#999999;text-align:center;margin-top:6px;">
//                   Powered by Holovox — AI-Powered Meeting Assistant
//                 </div>
//               </td>
//             </tr>

//           </table>
//         </td>
//       </tr>
//     </table>
//   </body>
//   </html>
//   `;
// };
// export const createMeeting = async (req, res) => {
//   try {
//     const {
//       hostId,
//       name,
//       email,
//       meetingId,
//       meetingTitle,
//       date,
//       time,
//       upcoming,
//     } = req.body;

//     console.log("Create Meeting Payload:", {
//       hostId,
//       name,
//       email,
//       meetingId,
//       meetingTitle,
//       date,
//       time,
//       upcoming,
//     });

//     if (!hostId || !name || !email || !meetingId) {
//       return res.status(400).json({
//         error: "Missing required fields",
//       });
//     }

//     const meeting = await MeetingModel.create({
//       meetingId,
//       hostId,
//       meetingTitle: meetingTitle || "Holovox Meeting",
//       meetingDate: date ? new Date(date) : new Date(),
//       time: time || "00:00",
//       upcoming: upcoming !== undefined ? upcoming : false,
//       participants: [
//         {
//           userId:hostId,
//           name,
//           email,
//           role: "host",
//         },
//       ],
//     });

//     return res.status(201).json({
//       success: true,
//       meeting,
//     });
//   } catch (error) {
//     return res.status(500).json({
//       success: false,
//       message: error.message,
//     });
//   }
// };
// export const getMeetings = async (req, res) => {
//   try {

//     const email = req.query.email;
//     console.log("Get Meetings Query:", { email });
//     // 🔍 If email provided → single meeting
//     if (email) {
//       const meeting = await MeetingModel.findOne({
//         "participants.email": email,
//       });

//       if (!meeting) {
//         return res.status(404).json({
//           success: false,
//           message: "Meeting not found",
//         });
//       }

//       return res.status(200).json({
//         success: true,
//         meeting,
//       });
//     }

//     // 📋 all meetings
//     const meetings = await MeetingModel.find();

//     return res.status(200).json({
//       success: true,
//       meetings,
//     });
//   } catch (error) {
//     return res.status(500).json({
//       success: false,

//       message: error.message,
//     });
//   }
// };

// export const validateMeeting = async (req, res) => {
//   try {
//     const { roomId } = req.params;
//     const meetingId = roomId; // for backward compatibility
//     const meeting = await MeetingModel.findOne({ meetingId });

//     if (!meeting) {
//       return res.status(404).json({
//         success: false,
//         message: "Meeting not found",
//       });
//     }

//     // ❌ check: are ALL participants ended?
//     const allEnded = meeting.participants.every((p) => p.end === true);

//     if (allEnded) {
//       return res.status(403).json({
//         success: false,
//         message: "Meeting has already ended for all participants",
//       });
//     }

//     return res.status(200).json({
//       success: true,
//       message: "Meeting is active",
//       meeting,
//     });
//   } catch (error) {
//     return res.status(500).json({
//       success: false,
//       message: error.message,
//     });
//   }
// };
// export const joinMeeting = async (req, res) => {
//   try {

//     const { userId, meetingId, name, email,token } = req.body;

//     console.log("Join Meeting Payload:", {
//       userId,
//       meetingId,
//       name,
//       email,
//       token,
//     });

//     if (!meetingId || !name) {
//       return res.status(400).json({
//         success: false,
//         message: "Missing required fields",
//       });
//     }

//     const meeting = await MeetingModel.findOneAndUpdate(
//       { meetingId },
//       {
//         $push: {
//           participants: {
//             userId: userId || null,
//             name,
//             email: email || "",
//             role: userId ? "participant" : "guest",
//             end : false,
//             token: token || "",
//           },
//         },
//       },
//       { new: true }
//     );

//     if (!meeting) {
//       return res.status(404).json({
//         success: false,
//         message: "Meeting not found",
//       });
//     }

//     return res.status(200).json({
//       success: true,
//       meeting,
//     });
//   } catch (error) {
//     return res.status(500).json({
//       success: false,
//       message: error.message,
//     });
//   }
// };
// export const updateMeeting = async (req, res) => {
//   try {
//     const { meetingId } = req.params;

//     const {
//       meetingTitle,
//       date,
//       time,
//       name,
//       email,
//       upcoming,
//     } = req.body;

//     console.log("Update Meeting Payload:", {
//       meetingId,
//       meetingTitle,
//       date,
//       time,
//       name,
//       email,
//       upcoming,
//     });

//     if (!meetingId) {
//       return res.status(400).json({
//         success: false,
//         message: "Meeting ID is required",
//       });
//     }

//     // Find meeting first
//     const meeting = await MeetingModel.findOne({ meetingId });

//     if (!meeting) {
//       return res.status(404).json({
//         success: false,
//         message: "Meeting not found",
//       });
//     }

//     // 🔄 Update basic fields
//     if (meetingTitle !== undefined) {
//       meeting.meetingTitle = meetingTitle;
//     }

//     if (date !== undefined) {
//       meeting.meetingDate = new Date(date);
//     }

//     if (time !== undefined) {
//       meeting.time = time;
//     }

//     if (upcoming !== undefined) {
//       meeting.upcoming = upcoming;
//     }

//     // 👤 Update host info inside participants (first participant = host)
//     if (name || email) {
//       const hostIndex = meeting.participants.findIndex(
//         (p) => p.role === "host"
//       );

//       if (hostIndex !== -1) {
//         if (name) meeting.participants[hostIndex].name = name;
//         if (email) meeting.participants[hostIndex].email = email;
//       }
//     }

//     await meeting.save();

//     return res.status(200).json({
//       success: true,
//       message: "Meeting updated successfully",
//       meeting,
//     });
//   } catch (error) {
//     return res.status(500).json({
//       success: false,
//       message: error.message,
//     });
//   }
// };
// export const endMeeting = async (req, res) => {
//   try {
//     const { roomId } = req.params;
//     const { userId, participantToken } = req.body;
//     const meetingId = roomId; // for backward compatibility
//     const meeting = await MeetingModel.findOne({ meetingId });

//     if (!meeting) {
//       return res.status(404).json({
//         success: false,
//         message: "Meeting not found",
//       });
//     }

//     // 🔍 Find participant (user OR guest)
//     const participant = meeting.participants.find((p) => {
//       // 👤 Registered user
//       if (userId && p.userId?.toString() === userId) {
//         return true;
//       }

//       // 👤 Guest user
//       if (participantToken && p.token === participantToken) {
//         return true;
//       }

//       return false;
//     });

//     if (!participant) {
//       return res.status(404).json({
//         success: false,
//         message: "Participant not found",
//       });
//     }

//     participant.end = true;

//     await meeting.save();

//     return res.status(200).json({
//       success: true,
//       message: "Meeting ended successfully",
//       meeting,
//     });
//   } catch (error) {
//     return res.status(500).json({
//       success: false,
//       message: error.message,
//     });
//   }
// };

// export const shareMeeting = async (req, res) => {
//   try {
//     const { meetingLink, emails, meetingId, hostName, hostEmail, title, time  } = req.body;

//     console.log("📨 Share Meeting Request:", { meetingLink, emails, meetingId, hostName, hostEmail, title, time  });
//     console.log("📧 EMAIL_FROM:", process.env.EMAIL_FROM);

//     // Validate inputs
//     if (!meetingLink) {
//       return res.status(400).json({
//         success: false,
//         message: "Meeting link is required",
//       });
//     }

//     // Handle emails
//     let emailList = [];
//     if (Array.isArray(emails)) {
//       emailList = emails.filter(email => email && email.trim() !== '');
//     } else if (typeof emails === 'string') {
//       emailList = [emails];
//     }

//     if (emailList.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: "At least one valid email is required",
//       });
//     }

//     // Validate emails
//     const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
//     const validEmails = [];
//     const invalidEmails = [];

//     emailList.forEach(email => {
//       const trimmedEmail = email.trim();
//       if (emailRegex.test(trimmedEmail)) {
//         validEmails.push(trimmedEmail);
//       } else {
//         invalidEmails.push(trimmedEmail);
//       }
//     });

//     if (validEmails.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: `No valid email addresses found. Invalid: ${invalidEmails.join(', ')}`,
//       });
//     }

//     // Send emails
//     const results = [];
//     const errors = [];
//     for (const email of validEmails) {
//       try {
//         console.log(`📧 Sending email to ${email}...`);

//         // Pass all parameters to the template
//         const emailHtml = shareMeetingTemplate(
//           meetingLink,
//           meetingId || null,
//           hostName || "Holovox Host",
//           hostEmail || "host@holovox.com",
//           title || "Holovox Session",
//           time || new Date().toLocaleString('en-US', {
//             weekday: 'long',
//             month: 'long',
//             day: 'numeric',
//             year: 'numeric',
//             hour: '2-digit',
//             minute: '2-digit'
//           })

//         );

//         await sendMail(
//           email,
//           "You're Invited to a Holovox Meeting",
//           emailHtml,
//           process.env.EMAIL_FROM
//         );

//         results.push({ email, status: 'sent' });
//         console.log(`✅ Email sent to ${email}`);
//       } catch (error) {
//         console.error(`❌ Failed to send to ${email}:`, error.message);
//         errors.push({ email, error: error.message });
//       }
//     }

//     // Return response
//     if (results.length === 0) {
//       return res.status(500).json({
//         success: false,
//         message: "Failed to send any emails",
//         errors,
//       });
//     }

//     if (errors.length > 0) {
//       return res.status(207).json({
//         success: true,
//         message: `Sent ${results.length} email(s), failed ${errors.length} email(s)`,
//         data: { sent: results, failed: errors, invalid: invalidEmails },
//       });
//     }

//     return res.status(200).json({
//       success: true,
//       message: `Meeting shared successfully with ${results.length} recipient(s)`,
//       data: { sent: results },
//     });

//   } catch (error) {
//     console.error("❌ Share meeting error:", error);
//     return res.status(500).json({
//       success: false,
//       message: error.message || "Failed to share meeting",
//     });
//   }
// };

// export const getUniqueParticipants = async (req, res) => {
//   try {
//     const { hostId } = req.params;

//     if (!hostId) {
//       return res.status(400).json({
//         success: false,
//         message: "Host ID is required",
//       });
//     }

//     // 🔥 Find all meetings of this host
//     const meetings = await MeetingModel.find({
//        "participants.userId": hostId,
//     });

//     // 🔥 Store unique participants
//     const uniqueParticipantsMap = new Map();

//     meetings.forEach((meeting) => {
//       meeting.participants.forEach((participant) => {

//         // ❌ Skip host
//         // if (participant.role === "host") return;

//         // ❌ Skip guests
//         if (participant.role === "guest") return;

//         // ❌ Skip if no userId
//         if (!participant.userId) return;
//           // ❌ Skip yourself
//         if (
//           participant.userId.toString() === hostId
//         ) {
//           return;
//         }

//         const uniqueKey = participant.userId.toString();

//         // ✅ Add only once
//         if (!uniqueParticipantsMap.has(uniqueKey)) {
//           uniqueParticipantsMap.set(uniqueKey, {
//             userId: participant.userId,
//             name: participant.name,
//             email: participant.email,
//             role: participant.role,
//             joinedAt: participant.joinedAt,
//             end: participant.end,
//           });
//         }
//       });
//     });

//     const participants = Array.from(
//       uniqueParticipantsMap.values()
//     );

//     return res.status(200).json({
//       success: true,
//       count: participants.length,
//       participants,
//     });

//   } catch (error) {
//     return res.status(500).json({
//       success: false,
//       message: error.message,
//     });
//   }
// };
