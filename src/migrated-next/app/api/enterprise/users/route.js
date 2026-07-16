// app/api/enterprise/users/route.js
import { NextResponse } from "../../../../utils/next-response.js";
import bcrypt from "bcrypt";
import axios from "axios";
import connectDB from "../../../../lib/db.js";
import EnterpriseProfile from "../../../../app/models/EnterpriseProfile.model.js";

const generateOTP = () => {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

export async function POST(req) {
  try {
    await connectDB();

    const body = await req.json();
    const { fullName, email, role, enterpriseId, password } = body;

    // Validate required fields
    if (!fullName || !email || !enterpriseId ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await EnterpriseProfile.findOne({ email });
    if (existingUser) {
      return NextResponse.json(
        { error: "User with this email already exists" },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    const userSubscription = role === "manager" ? "enterprise-manager" : "enterprise-user";

    // Create new user
    const newUser = await EnterpriseProfile.create({
      fullName,
      email,
      password: hashedPassword,
      role: role || "user",
      enterpriseId,
      otp: null,
      otpExpiry,
      isOtpVerified: true,
      isVerified: false,
      Subscription: userSubscription,
      profilePicture: null,
      meetingUsed: false,
    });

    // Send email with credentials using Brevo (consistent with your existing email logic)
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
        <title>Welcome to Holovox</title>
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
                Welcome to Holovox Enterprise! 🎉
              </h2>

              <p style="color:#b4b4b8;font-size:15px;line-height:1.7;">
                Hello <strong style="color:#ffffff;">${fullName}</strong>,
              </p>

              <p style="color:#b4b4b8;font-size:15px;line-height:1.7;">
                You have been added to the Enterprise team by an administrator.
                Your account has been created with the following credentials:
              </p>

              <!-- CREDENTIALS BOX -->
              <div style="margin:25px 0;background:#0f0f11;padding:20px;border-radius:14px;border:1px solid rgba(255,255,255,0.06);">
                <p style="color:#b4b4b8;font-size:14px;margin:0 0 8px 0;">
                  <strong style="color:#ffffff;">Email:</strong> ${email}
                </p>
                <p style="color:#b4b4b8;font-size:14px;margin:0 0 8px 0;">
                  <strong style="color:#ffffff;">Password:</strong> 
                  <code style="background:rgba(229,26,84,0.15);padding:2px 8px;border-radius:4px;color:#E51A54;font-size:14px;font-weight:bold;">${password}</code>
                </p>
                <p style="color:#b4b4b8;font-size:14px;margin:0;">
                  <strong style="color:#ffffff;">Role:</strong> ${role || 'User'}
                </p>
              </div>

             
              <!-- BUTTON -->
              <div style="margin:30px 0;text-align:center;">
                <a
                  href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/auth"
                  style="display:inline-block;background:#E51A54;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:999px;font-weight:bold;font-size:15px;box-shadow:0 10px 30px -10px rgba(229,26,84,0.4);"
                >
                  Login to Holovox
                </a>
              </div>

              <p style="color:#71717a;font-size:13px;text-align:center;line-height:1.6;">
                If you didn't expect this email, please ignore it.
              </p>
            </div>

            <!-- FOOTER -->
            <div style="border-top:1px solid rgba(255,255,255,0.06);padding:20px;text-align:center;font-size:12px;color:#71717a;">
              © ${new Date().getFullYear()} Holovox. All rights reserved.
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
        subject: 'Welcome to Holovox Enterprise - Your Login Credentials',
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

    console.log(`✅ Welcome email sent to ${email}:`, response.data.messageId);

    return NextResponse.json({
      success: true,
      data: {
        id: newUser._id,
        fullName: newUser.fullName,
        email: newUser.email,
        role: newUser.role,
        isVerified: newUser.isVerified,
      },
      message: "User added successfully! Credentials sent via email.",
    }, { status: 201 });

  } catch (error) {
    console.error("Error adding enterprise user:", error);
    
    let errorMessage = error.message;
    if (error.response?.data?.message) {
      errorMessage = error.response.data.message;
    } else if (error.response?.data?.code) {
      errorMessage = `${error.response.data.code}: ${error.response.data.message || 'Unknown error'}`;
    }

    return NextResponse.json(
      { error: errorMessage || "Failed to add user" },
      { status: 500 }
    );
  }
}

// GET route to fetch enterprise users
export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const enterpriseId = searchParams.get('enterpriseId');

    if (!enterpriseId) {
      return NextResponse.json(
        { error: "enterpriseId is required" },
        { status: 400 }
      );
    }

    const users = await EnterpriseProfile.find({ enterpriseId })
      .select('fullName email role isOtpVerified isVerified createdAt Subscription')
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({
      success: true,
      data: users.map(u => ({
        id: u._id,
        fullName: u.fullName,
        email: u.email,
        role: u.role,
        isVerified: u.isVerified,
        isOtpVerified: u.isOtpVerified,
        createdAt: u.createdAt,
        subscription: u.Subscription,
      })),
    }, { status: 200 });

  } catch (error) {
    console.error("Error fetching enterprise users:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch users" },
      { status: 500 }
    );
  }
}