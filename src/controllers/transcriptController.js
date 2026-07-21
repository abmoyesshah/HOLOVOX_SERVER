const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";
import Transcript from "../models/Transcript.model.js"; // 👈 correct model

/**
 * Send transcript email to user
 */
async function sendTranscriptEmail(req, res) {
  try {
    const { email, transcript, meetingTitle, meetingId } = req.body;

    // Validate
    if (!email || !transcript) {
      return res.status(400).json({
        success: false,
        message: "Email and transcript are required",
      });
    }

    // Build email HTML
    const htmlContent = buildTranscriptEmailHtml({
      email,
      transcript,
      meetingTitle,
      meetingId,
    });

    // Send via Brevo
    const payload = {
      sender: {
        email: process.env.EMAIL_FROM || "no-reply@holovox.io",
        name: "Holovox AI",
      },
      to: [{ email }],
      replyTo: {
        email: "support@holovox.io",
        name: "Holovox Support",
      },
      subject: `📄 Your Transcript: ${meetingTitle || "Meeting"}`,
      htmlContent,
    };

    const response = await fetch(BREVO_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": process.env.BREVO_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(`Brevo error (${response.status}): ${responseText}`);
    }

    const data = JSON.parse(responseText);
    console.log(`✅ Transcript email sent to ${email}`);

    return res.status(200).json({
      success: true,
      message: "Transcript sent successfully",
      data,
    });
  } catch (error) {
    console.error("Send transcript error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to send transcript",
    });
  }
}
async function getMeetingTranscript(req, res) {
  try {
    const { roomId } = req.params;

    if (!roomId) {
      return res.status(400).json({
        success: false,
        message: "roomId is required",
      });
    }

    const segments = await Transcript.find({ roomId })
      .sort({ createdAt: 1 })
      .lean();

    if (!segments.length) {
      return res.status(200).json({
        success: true,
        transcript: "",
      });
    }

    const transcript = segments
      .map((s) => `${s.participantName}: ${s.text}`)
      .join("\n");

    return res.status(200).json({
      success: true,
      transcript,
    });
  } catch (error) {
    console.error("Get transcript error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch transcript",
    });
  }
}

// ---------- HTML Builder ----------
function buildTranscriptEmailHtml({ email, transcript, meetingTitle, meetingId }) {
  const date = new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Transcript</title>
  <style>
    @media only screen and (max-width: 480px) {
      .responsive-table { width: 100% !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f8f9fc;font-family:'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8f9fc;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:680px;background-color:#ffffff;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,0.05);margin:0 auto;border:1px solid #eaedf2;">
          <tr>
            <td style="padding:32px 40px 20px 40px;border-bottom:1px solid #eaedf2;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-size:22px;font-weight:700;color:#1a1a2e;letter-spacing:-0.5px;">
                    holovox
                    <span style="font-weight:400;color:#6b7280;font-size:14px;margin-left:8px;">|</span>
                    <span style="font-weight:400;color:#6b7280;font-size:14px;margin-left:8px;">transcript</span>
                  </td>
                  <td align="right" style="font-size:12px;color:#6b7280;font-weight:500;letter-spacing:0.3px;text-transform:uppercase;">
                    ${date}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:32px 40px 40px 40px;">

              <h1 style="font-size:24px;font-weight:700;color:#1a1a2e;margin:0 0 8px 0;letter-spacing:-0.3px;">
                📄 Your Transcript is Ready
              </h1>
              <p style="font-size:15px;color:#4b5563;margin:0 0 8px 0;line-height:1.6;">
                Here is the full transcript from your meeting.
              </p>
              
              ${meetingTitle ? `
                <p style="font-size:14px;color:#6b7280;margin:0 0 24px 0;">
                  <strong>Meeting:</strong> ${meetingTitle}
                  ${meetingId ? ` · <strong>ID:</strong> ${meetingId}` : ''}
                </p>
              ` : ''}

              <div style="background:#f9fafb;border-radius:12px;padding:20px 24px;border:1px solid #eaedf2;margin-bottom:24px;">
                <div style="font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.3px;margin-bottom:12px;">Full Transcript</div>
                <div style="font-size:15px;color:#1a1a2e;line-height:1.8;white-space:pre-wrap;word-wrap:break-word;max-height:500px;overflow-y:auto;">
                  ${transcript}
                </div>
              </div>

              <div style="background:#f0fdf4;border-radius:12px;padding:16px 20px;border:1px solid #bbf7d0;margin-bottom:24px;">
                <div style="font-size:14px;color:#166534;font-weight:500;">
                  ✨ This transcript was generated by Holovox AI
                </div>
                <div style="font-size:13px;color:#166534;opacity:0.8;margin-top:4px;">
                  Powered by Holovox — AI coaching for every call.
                </div>
              </div>

            

            </td>
          </tr>

          <tr>
            <td style="border-top:1px solid #eaedf2;padding:24px 40px;background:#f9fafb;border-radius:0 0 16px 16px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-size:12px;color:#6b7280;text-align:center;line-height:1.8;">
                    &copy; ${new Date().getFullYear()} Holovox. All rights reserved.<br>
                    <span style="color:#9ca3af;font-size:11px;">
                      <a href="https://holovox.io/privacy" style="color:#6b7280;text-decoration:none;margin:0 6px;">Privacy</a> ·
                      <a href="https://holovox.io/terms" style="color:#6b7280;text-decoration:none;margin:0 6px;">Terms</a> ·
                      <a href="mailto:support@holovox.io" style="color:#6b7280;text-decoration:none;margin:0 6px;">Support</a>
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>

</body>
</html>
  `;
}

export { sendTranscriptEmail, getMeetingTranscript };