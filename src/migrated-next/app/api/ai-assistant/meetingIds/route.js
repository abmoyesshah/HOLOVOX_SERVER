// app/api/ai-assistant/meetingIds/route.js
import MeetingModel from "../../../models/Meeting.model.js";
import connectDB from "../../../../lib/db.js";
import { NextResponse } from "../../../../utils/next-response.js";
import mongoose from "mongoose";

export async function GET(req) {
    try {
        await connectDB();
        
        const { searchParams } = new URL(req.url);
        const hostId = searchParams.get('hostId');
        
        // Validate hostId
        if (!hostId) {
            return NextResponse.json({
                success: false,
                error: "hostId is required"
            }, { status: 400 });
        }
        
        // Validate if hostId is a valid ObjectId
        if (!mongoose.Types.ObjectId.isValid(hostId)) {
            return NextResponse.json({
                success: false,
                error: "Invalid hostId format"
            }, { status: 400 });
        }
        
        // Convert to ObjectId
        const objectId = new mongoose.Types.ObjectId(hostId);
        
        // Find meetings for this host
        const meetings = await MeetingModel.find(
            { hostId: objectId },
            { meetingId: 1, _id: 0 }
        ).lean();
        
        // Extract meeting IDs
        const meetingIds = meetings.map(meeting => meeting.meetingId);
        
        return NextResponse.json({
            success: true,
            data: {
                hostId: hostId,
                meetingIds: meetingIds,
                totalMeetings: meetingIds.length,
                hasMeetings: meetingIds.length > 0
            }
        }, { status: 200 });
        
    } catch (error) {
        console.error("Error in meetingIds endpoint:", error);
        return NextResponse.json({
            success: false,
            error: error.message || "Internal server error"
        }, { status: 500 });
    }
}