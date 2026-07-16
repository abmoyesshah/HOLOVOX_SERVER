// import  Profile  from "@/app/models/Profile.model";
import { NextResponse } from "../../../../utils/next-response.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import  connectDB  from "../../../../lib/db.js";
import Profile from "../../../models/Profile.model.js";

export async function POST(req) {
  try {
    // get data from body
    const {
      fullName,
      email,
      password,
      role,
    } = await req.json();

    console.log(
      "Payload:",
      fullName,
      email,
      password,
      role,
    );

    // validation
    if (!fullName || !email || !password || !role) {
      return NextResponse.json(
        {
          success: false,
          error: "All fields are required",
        },
        { status: 400 }
      );
    }
    await connectDB()
    // find user
    const user = await Profile.findOne({ email });

    // check if user exists
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: "Please verify OTP first",
        },
        { status: 400 }
      );
    }

    // check OTP verified
    if (!user.isOtpVerified) {
      return NextResponse.json(
        {
          success: false,
          error: "OTP not verified",
        },
        { status: 400 }
      );
    }

    // hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // update verified user
    const updatedUser = await Profile.findByIdAndUpdate(
      user._id,
      {
        fullName,
        email,
        password: hashedPassword,
        role,
      },
      {
        new: true,
        runValidators: true,
      }
    ).select("-password");

    // check update
    if (!updatedUser) {
      return NextResponse.json(
        {
          success: false,
          error: "Something went wrong while creating user",
        },
        { status: 400 }
      );
    }

    console.log("Updated User:", updatedUser);

    // create JWT token
    const token = jwt.sign(
      {
        id: updatedUser._id,
        email: updatedUser.email,
        role: updatedUser.role,
        name: updatedUser.fullName,
        verified: updatedUser.verified,
        image: updatedUser.ProfilePicture || "",
        subscription: updatedUser.Subscription,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "1d",
      }
    );

    // response
    return NextResponse.json(
      {
        success: true,
        message: "User created successfully",
        token,
        user: updatedUser,
      },
      { status: 201 }
    );

  } catch (error) {
    console.log("REGISTER ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Internal Server Error",
      },
      { status: 500 }
    );
  }
}

export async function GET(req) {
  try {
    await connectDB();

// get userId from query
    const { searchParams } = new URL(req.url);

    const userId = searchParams.get("userId");

    // check userId
    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          error: "User ID is required",
        },
        { status: 400 }
      );
    }

    // find user by id
    const user = await Profile.findById(userId).select("-password").lean();

    // check user exists
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: "User not found",
        },
        { status: 404 }
      );
    }

    // response
    return NextResponse.json(
      {
        success: true,
        user,
      },
      { status: 200 }
    );

  } catch (error) {
    console.log("GET USER ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Internal Server Error",
      },
      { status: 500 }
    );
  }
}