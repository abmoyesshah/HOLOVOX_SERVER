// import Profile from "../../../models/Profile.model.js";
// import connectDB from "../../../../lib/db.js";
// import { NextResponse } from "../../../../utils/next-response.js";
// import * as SibApiV3Sdk from "@getbrevo/brevo";

// const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
// let apiKey = apiInstance.authentications["apiKey"];
// apiKey.apiKey = process.env.BREVO_API_KEY;

// export async function POST(req) {
//   try {
//     const { email } = await req.json();
//     console.log("email", email);

//     await connectDB();

//     if (!email) {
//       return NextResponse.json(
//         { error: "Email is required" },
//         { status: 400 }
//       );
//     }

//     const existingUser = await Profile.findOne({ email });
//     if (existingUser && existingUser.verified) {
//       return NextResponse.json(
//         { error: "User already exists" },
//         { status: 409 }
//       );
//     }

//     const otp = Math.floor(1000 + Math.random() * 9000).toString();
//     const otpExpiry = new Date(Date.now() + 5 * 60 * 1000);

//     let user;
//     if (existingUser) {
//       existingUser.otp = otp;
//       existingUser.otpExpiry = otpExpiry;
//       await existingUser.save();
//       user = existingUser;
//     } else {
//       user = await Profile.create({
//         email,
//         otp,
//         otpExpiry,
//         isOtpVerified: false,
//       });
//     }

//     console.log("Created User:", user);

//     let sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
//     sendSmtpEmail.sender = {
//       name: "HOLOVOX",
//       email: process.env.EMAIL_FROM,
//     };
//     sendSmtpEmail.to = [{ email }];
//     sendSmtpEmail.subject = "Your OTP Verification Code";
//     sendSmtpEmail.htmlContent = `
//       <div style="font-family: Arial, sans-serif; background:#f4f4f4; padding:30px;">
//         <div style="max-width:500px; margin:auto; background:white; padding:30px; border-radius:10px;">
//           <h2 style="color:#333;">🔐 Email Verification</h2>
//           <p style="font-size:16px; color:#555;">
//             Use the OTP below to verify your email address:
//           </p>
//           <div style="text-align:center; margin:30px 0;">
//             <span style="
//               display:inline-block;
//               background:#eef5ff;
//               color:#2563eb;
//               font-size:32px;
//               font-weight:bold;
//               padding:12px 24px;
//               border-radius:8px;
//               letter-spacing:4px;
//             ">
//               ${otp}
//             </span>
//           </div>
//           <p style="font-size:14px; color:#666;">This OTP will expire in 5 minutes.</p>
//           <hr style="margin:25px 0;" />
//           <p style="font-size:12px; color:#999;">
//             If you did not request this OTP, please ignore this email.
//           </p>
//         </div>
//       </div>
//     `;

//     await apiInstance.sendTransacEmail(sendSmtpEmail);

//     return NextResponse.json(
//       { success: true, message: "OTP sent successfully" },
//       { status: 200 }
//     );
//   } catch (error) {
//     console.log("OTP API Error:", error);
//     return NextResponse.json(
//       { success: false, error: "Internal Server Error" },
//       { status: 500 }
//     );
//   }
// }


// import Profile from "../../../models/Profile.model.js";
// import connectDB from "../../../../lib/db.js";
// import { NextResponse } from "../../../../utils/next-response.js";
// import { resend } from "../../../../lib/resend.js";

// export async function POST(req) {
//   try {
//     const { email } = await req.json();

//     await connectDB();

//     if (!email) {
//       return NextResponse.json(
//         { error: "Email is required" },
//         { status: 400 }
//       );
//     }

//     const existingUser = await Profile.findOne({ email });

//     const otp = Math.floor(
//       1000 + Math.random() * 9000
//     ).toString();

//     const otpExpiry = new Date(
//       Date.now() + 5 * 60 * 1000
//     );

//     if (!existingUser) {
//       await Profile.create({
//         email,
//         otp,
//         otpExpiry,
//         isOtpVerified: false,
//       });
//     } else {
//       existingUser.otp = otp;
//       existingUser.otpExpiry = otpExpiry;
//       await existingUser.save();
//     }

//     await resend.emails.send({
//       from: "HOLOVOX <onboarding@resend.dev>",
//       to: email,
//       subject: "Your OTP Verification Code",
//       html: `
//         <h2>OTP Verification</h2>
//         <p>Your OTP is:</p>
//         <h1>${otp}</h1>
//         <p>This OTP expires in 5 minutes.</p>
//       `,
//     });

//     return NextResponse.json({
//       success: true,
//       message: "OTP sent",
//     });

//   } catch (error) {
//     console.error(error);

//     return NextResponse.json(
//       {
//         success: false,
//         error: error.message,
//       },
//       { status: 500 }
//     );
//   }
// }


// app/api/auth/send-otp/route.js (or wherever your OTP route is)
import Profile from "../../../models/Profile.model.js";
import connectDB from "../../../../lib/db.js";
import { NextResponse } from "../../../../utils/next-response.js";
import axios from "axios";

export async function POST(req) {
  try {
    const { email } = await req.json();

    await connectDB();

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    const existingUser = await Profile.findOne({ email });

    // Generate 4-digit OTP
    const otp = Math.floor(1000 + Math.random() * 9000).toString();

    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    if (!existingUser) {
      await Profile.create({
        email,
        otp,
        otpExpiry,
        isOtpVerified: false,
      });
    } else {
      existingUser.otp = otp;
      existingUser.otpExpiry = otpExpiry;
      existingUser.isOtpVerified = false;
      await existingUser.save();
    }

    // ✅ Send OTP via Brevo
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) {
      throw new Error('BREVO_API_KEY is not configured');
    }

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>OTP Verification</title>
      </head>
      <body style="margin:0;padding:0;background:#0f0f11;font-family:Arial,sans-serif;">
        <div style="background:#0f0f11;padding:40px 20px;">
          <div style="max-width:600px;margin:auto;background:#18181b;border-radius:24px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
            
            <!-- HEADER -->
            <div style="padding:40px 30px;text-align:center;background:linear-gradient(135deg,#E51A54,#ff4d88);">
              <h1 style="margin:0;font-size:32px;letter-spacing:1px;color:#ffffff;">
                Holovox
              </h1>
              <p style="margin-top:10px;font-size:14px;opacity:0.9;color:#ffffff;">
                AI Powered Meetings
              </p>
            </div>

            <!-- BODY -->
            <div style="padding:40px 30px;">
              <h2 style="margin-top:0;font-size:24px;color:#ffffff;">
                OTP Verification Code
              </h2>

              <p style="color:#b4b4b8;font-size:15px;line-height:1.7;">
                You requested a verification code for your Holovox account.
                Please use the code below to complete your verification.
              </p>

              <!-- OTP CODE -->
              <div style="margin:35px 0;text-align:center;background:#0f0f11;padding:20px;border-radius:14px;border:1px solid rgba(255,255,255,0.06);">
                <p style="font-size:48px;font-weight:bold;letter-spacing:12px;color:#E51A54;margin:0;">
                  ${otp}
                </p>
              </div>

              <p style="color:#71717a;font-size:13px;text-align:center;">
                This code will expire in 5 minutes.
              </p>

              <p style="color:#71717a;font-size:13px;text-align:center;margin-top:20px;">
                If you didn't request this code, please ignore this email.
              </p>
            </div>

            <!-- FOOTER -->
            <div style="border-top:1px solid rgba(255,255,255,0.06);padding:20px;text-align:center;font-size:12px;color:#71717a;">
              © 2026 Holovox. All rights reserved.
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const response = await axios.post(
      'https://api.brevo.com/v3/smtp/email',
      {
        sender: {
          name: 'Holovox',
          email: process.env.EMAIL_FROM || 'no-reply@holovox.io',
        },
        to: [{ email: email }],
        subject: 'Your OTP Verification Code',
        htmlContent: emailHtml,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'api-key': apiKey,
          'Accept': 'application/json',
        },
        timeout: 30000,
      }
    );

    console.log(`✅ OTP email sent to ${email}:`, response.data.messageId);

    return NextResponse.json({
      success: true,
      message: "OTP sent successfully",
      messageId: response.data.messageId,
    });

  } catch (error) {
    console.error("❌ OTP Error:", error);
    
    // Extract detailed error message
    let errorMessage = error.message;
    if (error.response?.data?.message) {
      errorMessage = error.response.data.message;
    } else if (error.response?.data?.code) {
      errorMessage = `${error.response.data.code}: ${error.response.data.message || 'Unknown error'}`;
    }

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}



// // import Profile from "@/app/models/Profile.model";
// import Profile from "../../../models/Profile.model.js";
// import connectDB from "../../../../lib/db.js";
// import { NextResponse } from "../../../../utils/next-response.js";
// import nodemailer from "nodemailer";

// // transporter
// const transporter = nodemailer.createTransport({
//   host: "mail.holovox.io",
//   port: 587,
//   secure: false,
//   auth: {
//     user: process.env.EMAIL_USER,
//     pass: process.env.EMAIL_PASS,
//   },
//   tls: {
//     rejectUnauthorized: false  // ← add this if you get TLS/cert errors
//   },
// });


// export async function POST(req) {
//   try {
//     // get email from body
//     const { email } = await req.json();
//     console.log("email", email)
//     // validate email
//     await connectDB()
//     if (!email) {
//       return NextResponse.json(
//         { error: "Email is required" },
//         { status: 400 }
//       );
//     }

//     // check if user already exists
//     const existingUser = await Profile.findOne({ email });

//     if (existingUser && existingUser.verified) {
//       return NextResponse.json(
//         { error: "User already exists" },
//         { status: 409 }
//       );
//     }

//     // generate 6 digit OTP
//     const otp = Math.floor(
//       1000 + Math.random() * 9000
//     ).toString();

//     // OTP expiry (5 mins)
//     const otpExpiry = new Date(Date.now() + 5 * 60 * 1000);

//     // create user
//     // const user = await Profile.create({
//     //   email,
//     //   otp,
//     //   otpExpiry,
//     //   isOtpVerified: false,
//     // });

//     let user;

//     if (existingUser) {
//       // Resend OTP case
//       existingUser.otp = otp;
//       existingUser.otpExpiry = otpExpiry;

//       await existingUser.save();

//       user = existingUser;
//     } else {
//       // New user case
//       user = await Profile.create({
//         email,
//         otp,
//         otpExpiry,
//         isOtpVerified: false,
//       });
//     }


//     console.log("Created User:", user);

//     // send email
//     await transporter.sendMail({
//       from: process.env.EMAIL_USER,
//       to: email,
//       subject: "Your OTP Verification Code",
//       html: `
//       <div style="font-family: Arial, sans-serif; background:#f4f4f4; padding:30px;">
//         <div style="max-width:500px; margin:auto; background:white; padding:30px; border-radius:10px;">
          
//           <h2 style="color:#333;">🔐 Email Verification</h2>

//           <p style="font-size:16px; color:#555;">
//             Use the OTP below to verify your email address:
//           </p>

//           <div style="text-align:center; margin:30px 0;">
//             <span style="
//               display:inline-block;
//               background:#eef5ff;
//               color:#2563eb;
//               font-size:32px;
//               font-weight:bold;
//               padding:12px 24px;
//               border-radius:8px;
//               letter-spacing:4px;
//             ">
//               ${otp}
//             </span>
//           </div>

//           <p style="font-size:14px; color:#666;">
//             This OTP will expire in 5 minutes.
//           </p>

//           <hr style="margin:25px 0;" />

//           <p style="font-size:12px; color:#999;">
//             If you did not request this OTP, please ignore this email.
//           </p>

//         </div>
//       </div>
//       `,
//     });

//     return NextResponse.json(
//       {
//         success: true,
//         message: "OTP sent successfully",
//       },
//       { status: 200 }
//     );
//   } catch (error) {
//     console.log("OTP API Error:", error);

//     return NextResponse.json(
//       {
//         success: false,
//         error: "Internal Server Error",
//       },
//       { status: 500 }
//     );
//   }
// }