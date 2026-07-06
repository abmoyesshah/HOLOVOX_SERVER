import MeetingModel from "../models/Meeting.model.js";
import sendMail from "../utils/Nodemailer.js";
const shareMeetingTemplate = (meetingLink, meetingId = null, hostName = "Holovox Host", hostEmail = "host@holovox.com", title, time) => {
  // Generate a meeting ID if not provided
  const displayMeetingId = meetingId || Math.floor(1000000000 + Math.random() * 9000000000);
  
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
                  <div><strong>Time:</strong> ${time || new Date().toLocaleString('en-US', { 
                    weekday: 'long', 
                    month: 'long', 
                    day: 'numeric', 
                    year: 'numeric',
                    hour: '2-digit', 
                    minute: '2-digit'
                  })}</div>
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

    const meeting = await MeetingModel.create({
      meetingId,
      hostId,
      meetingTitle: meetingTitle || "Holovox Meeting",
      meetingDate: date ? new Date(date) : new Date(),
      time: time || "00:00",
      upcoming: upcoming !== undefined ? upcoming : false,
      participants: [
        {
          userId:hostId,
          name,
          email,
          role: "host",
        },
      ],
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
    const meetings = await MeetingModel.find();

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

    // Find and delete the meeting
    const deletedMeeting = await MeetingModel.findOneAndDelete({ meetingId });

    // Check if meeting exists
    if (!deletedMeeting) {
      return res.status(404).json({
        success: false,
        error: "Meeting not found",
      });
    }

    console.log(`✅ Meeting ${meetingId} deleted successfully`);

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
export const joinMeeting = async (req, res) => {
  try {

    const { userId, meetingId, name, email,token } = req.body;

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
            end : false,
            token: token || "",
          },
        },
      },
      { new: true }
    );

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

    const {
      meetingTitle,
      date,
      time,
      name,
      email,
      upcoming,
    } = req.body;

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
        (p) => p.role === "host"
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
    const { meetingLink, emails, meetingId, hostName, hostEmail, title, time  } = req.body;

    console.log("📨 Share Meeting Request:", { meetingLink, emails, meetingId, hostName, hostEmail, title, time  });
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
      emailList = emails.filter(email => email && email.trim() !== '');
    } else if (typeof emails === 'string') {
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
    
    emailList.forEach(email => {
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
        message: `No valid email addresses found. Invalid: ${invalidEmails.join(', ')}`,
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
          time || new Date().toLocaleString('en-US', { 
            weekday: 'long', 
            month: 'long', 
            day: 'numeric', 
            year: 'numeric',
            hour: '2-digit', 
            minute: '2-digit'
          })
          
        );
        
        await sendMail(
          email,
          "You're Invited to a Holovox Meeting",
          emailHtml,
          process.env.EMAIL_FROM
        );
        
        results.push({ email, status: 'sent' });
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
        if (
          participant.userId.toString() === hostId
        ) {
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

    const participants = Array.from(
      uniqueParticipantsMap.values()
    );

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
