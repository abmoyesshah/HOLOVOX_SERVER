// app/api/events/route.ts
import { NextResponse } from "../../../utils/next-response.js";
import connectDB from "../../../lib/db.js";
import Event from "../../../app/models/Event.model.js";
import mongoose from "mongoose";

export async function GET(req) {
  try {
    await connectDB();
    
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const limit = parseInt(searchParams.get("limit") || "50");
    
    console.log("🔍 [EVENTS API] Raw userId from query:", userId);
    
    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }
    
    const trimmedUserId = userId.trim();
    const objectId = new mongoose.Types.ObjectId(trimmedUserId);
    
    // ✅ WORKING APPROACH: Use aggregation with $toString
    console.log("🔍 [EVENTS API] Using aggregation with $toString");
    const events = await Event.aggregate([
      {
        $addFields: {
          userIdString: { $toString: "$userId" }
        }
      },
      {
        $match: {
          userIdString: trimmedUserId
        }
      },
      {
        $sort: { createdAt: -1 }
      },
      {
        $limit: limit
      }
    ]);
    
    console.log(`📊 [EVENTS API] Found ${events.length} events`);
    
    // Get unread count using aggregation
    const unreadCountResult = await Event.aggregate([
      {
        $addFields: {
          userIdString: { $toString: "$userId" }
        }
      },
      {
        $match: {
          userIdString: trimmedUserId,
          isRead: false
        }
      },
      {
        $count: "count"
      }
    ]);
    
    const unreadCount = unreadCountResult.length > 0 ? unreadCountResult[0].count : 0;
    
    return NextResponse.json({
      success: true,
      data: events,
      unreadCount,
      total: events.length,
    });
  } catch (error) {
    console.error("❌ [EVENTS API] Error fetching events:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

export async function PUT(req) {
  try {
    await connectDB();
    
    const { userId, eventId } = await req.json();
    
    console.log("🔍 [EVENTS API] PATCH userId:", userId);
    console.log("🔍 [EVENTS API] PATCH eventId:", eventId);
    
    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }
    
    const trimmedUserId = userId.trim();
    const objectId = new mongoose.Types.ObjectId(trimmedUserId);
    
    if (eventId) {
      // ✅ Use aggregation to find and update
      const event = await Event.findOne({ _id: eventId });
      if (event) {
        event.isRead = true;
        await event.save();
      }
    } else {
      // ✅ Use aggregation to find all and update
      const events = await Event.aggregate([
        {
          $addFields: {
            userIdString: { $toString: "$userId" }
          }
        },
        {
          $match: {
            userIdString: trimmedUserId,
            isRead: false
          }
        }
      ]);
      
      // Update each event
      for (const event of events) {
        await Event.updateOne(
          { _id: event._id },
          { isRead: true }
        );
      }
    }
    
    // Get updated unread count
    const unreadCountResult = await Event.aggregate([
      {
        $addFields: {
          userIdString: { $toString: "$userId" }
        }
      },
      {
        $match: {
          userIdString: trimmedUserId,
          isRead: false
        }
      },
      {
        $count: "count"
      }
    ]);
    
    const unreadCount = unreadCountResult.length > 0 ? unreadCountResult[0].count : 0;
    
    return NextResponse.json({
      success: true,
      message: eventId ? "Event marked as read" : "All events marked as read",
      unreadCount,
    });
  } catch (error) {
    console.error("❌ [EVENTS API] Error marking events as read:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}