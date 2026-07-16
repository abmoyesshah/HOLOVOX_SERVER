// import Profile  from "@/app/models/Profile.model";
import Profile from "../../../models/Profile.model.js";
import  connectDB  from "../../../../lib/db.js";
import { NextResponse } from "../../../../utils/next-response.js";

export async function POST(req) {
  try {
    // get data from body
    const { email, otp } = await req.json();

    console.log("email & otp:", email, otp);

    // validation
    if (!email || !otp) {
      return NextResponse.json(
        {
          success: false,
          error: "Email and OTP are required",
        },
        { status: 400 }
      );
    }

    await connectDB()
    // find user
    const user = await Profile.findOne({ email });

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: "User not found",
        },
        { status: 404 }
      );
    }

    // check OTP
    if (user.otp !== otp) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid OTP",
        },
        { status: 400 }
      );
    }

    // check expiry
    if (new Date(user.otpExpiry) < new Date()) {
      return NextResponse.json(
        {
          success: false,
          error: "OTP expired",
        },
        { status: 400 }
      );
    }

    // mark verified
    user.isOtpVerified = true;

    // clear OTP
    user.otp = null;
    user.otpExpiry = null;

    await user.save();

    return NextResponse.json(
      {
        success: true,
        message: "OTP verified successfully",
      },
      { status: 200 }
    );

  } catch (error) {
    console.log("VERIFY OTP ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Internal Server Error",
      },
      { status: 500 }
    );
  }
}