// app/api/tasks/generate/route.js
import { NextResponse } from "../../../../../utils/next-response.js";
import Anthropic from "@anthropic-ai/sdk";
import mongoose from "mongoose";
import connectDB from "../../../../../lib/db.js";
import MeetingModel from "../../../../../app/models/Meeting.model.js";
import Transcript from "../../../../../app/models/Transcript.js";

// ✅ Force reload the model to clear cache
// Delete any existing Task model from mongoose
if (mongoose.models.Task) {
  delete mongoose.models.Task;
}

// Now import the model fresh
import Task from "../../../../../app/models/Task.model.js";

const anthropic = new Anthropic({
  apiKey: process.env.CLOUDAPI,
});


export async function POST(req) {
  try {
    await connectDB();

    const body = await req.json();
    const { userEmail, userId, userName } = body;

    console.log("🔍 Task Generation Request:", { userEmail, userId, userName });

    const userIdentifier = userEmail || userId || userName;

    if (!userIdentifier) {
      return NextResponse.json(
        {
          success: false,
          error: "userEmail, userId, or userName is required",
        },
        { status: 400 }
      );
    }

    // 1. Get meetings from last 7 days where user is a participant
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    console.log("📅 Looking for meetings after:", sevenDaysAgo);

    let meetingQuery = {
      createdAt: { $gte: sevenDaysAgo },
    };

    if (userEmail) {
      meetingQuery["participants.email"] = userEmail;
    } else if (userId) {
      meetingQuery["participants.userId"] = userId;
    } else if (userName) {
      meetingQuery["participants.name"] = userName;
    }

    console.log("🔍 Meeting Query:", JSON.stringify(meetingQuery, null, 2));

    const meetings = await MeetingModel.find(meetingQuery).lean();
    console.log(`📊 Found ${meetings.length} meetings`);

    if (!meetings || meetings.length === 0) {
      // Try without the 7-day filter to see if there are any meetings at all
      const allMeetings = await MeetingModel.find({
        "participants.email": userEmail,
      }).lean();
      console.log(`📊 Total meetings for user (all time): ${allMeetings.length}`);
      
      if (allMeetings.length > 0) {
        console.log("📅 Sample meeting dates:", allMeetings.map(m => m.createdAt));
      }

      return NextResponse.json({
        success: true,
        message: "No meetings found in the last 7 days",
        data: [],
        tasksFound: 0,
        debug: {
          meetingsFound: meetings.length,
          allTimeMeetings: allMeetings.length,
          sevenDaysAgo: sevenDaysAgo,
        },
      });
    }

    // 2. Get all meeting IDs
    const meetingIds = meetings.map((m) => m.meetingId);
    console.log("📋 Meeting IDs:", meetingIds);

    // 3. Get existing task meeting IDs to avoid duplicates
    const existingTasks = await Task.find({
      $or: [
        { userEmail: userEmail },
        { userId: userId },
        { userName: userName },
      ],
    }).distinct("meetingId");

    console.log(`📋 Existing tasks meeting IDs: ${existingTasks.length}`);

    // Filter out meetings that already have tasks
    const newMeetingIds = meetingIds.filter(
      (id) => !existingTasks.includes(id)
    );

    console.log(`📋 New meetings to process: ${newMeetingIds.length}`);

    if (newMeetingIds.length === 0) {
      return NextResponse.json({
        success: true,
        message: "All meetings from last 7 days already have tasks generated",
        data: [],
        tasksFound: 0,
        meetingsProcessed: 0,
      });
    }

    // 4. Fetch transcripts for new meetings only
    const transcripts = await Transcript.find({
      roomId: { $in: newMeetingIds },
      text: { $ne: "[NO SPEECH DETECTED]" },
    })
      .sort({ roomId: 1, participantName: 1, createdAt: 1 })
      .lean();

    console.log(`📝 Found ${transcripts.length} transcripts`);

    if (!transcripts || transcripts.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No transcripts found for new meetings",
        data: [],
        tasksFound: 0,
      });
    }

    // 5. Group transcripts by meeting
    const groupedByMeeting = {};
    transcripts.forEach((transcript) => {
      const roomId = transcript.roomId;
      const participantName = transcript.participantName || "Unknown";
      const text = transcript.text || "";

      if (!text || text.trim() === "") return;

      if (!groupedByMeeting[roomId]) {
        const meeting = meetings.find((m) => m.meetingId === roomId);
        groupedByMeeting[roomId] = {
          meetingId: roomId,
          meetingTitle: meeting?.meetingTitle || "Meeting",
          transcripts: [],
        };
      }

      groupedByMeeting[roomId].transcripts.push({
        participantName,
        text,
        createdAt: transcript.createdAt,
      });
    });

    console.log(`📊 Grouped into ${Object.keys(groupedByMeeting).length} meetings`);

    // 6. Format for Claude
    const formattedMeetings = Object.values(groupedByMeeting).map((meeting) => {
      const allTexts = meeting.transcripts
        .map((t) => `[${t.participantName}]: ${t.text}`)
        .join("\n");

      return {
        meetingId: meeting.meetingId,
        meetingTitle: meeting.meetingTitle,
        transcript: allTexts,
      };
    });

    const allTranscriptsCombined = formattedMeetings
      .map(
        (m) =>
          `Meeting: ${m.meetingTitle} (ID: ${m.meetingId})\n${m.transcript}\n\n`
      )
      .join("---\n\n");

    console.log("📝 Sending to Claude. Transcript length:", allTranscriptsCombined.length);

    // 7. Generate tasks using Claude
    const claudeResponse = await anthropic.messages.create({
  model: "claude-haiku-4-5-20251001",
  max_tokens: 800,

  system: `
You are a task extraction assistant. Extract ALL tasks assigned to the user from meeting transcripts.

IMPORTANT: Look for these patterns:
- "I will do X" (when the user says it)
- "Can you do X?" (addressed to the user)
- "Please complete X" (addressed to the user)
- "We need to do X" (when the user is mentioned)
- "Assigned to [user]"
- "Action item: X" (assigned to the user)
- "[User] is responsible for Y"
- "[User] needs to Z"

The user is: ${userName || userEmail || userId}

Extract tasks EVEN IF they are implied, not explicitly stated.

Output in JSON format ONLY. If no tasks are found, return [].

Format:
[
  {
    "meetingId": "meeting_id_here",
    "meetingTitle": "Meeting Title",
    "assignedBy": "Person who assigned the task",
    "task": "Clear description of the task",
    "context": "Brief context from the conversation",
    "priority": "high" | "medium" | "low"
  }
]
  `,

  messages: [
    {
      role: "user",
      content: `
Analyze the following meeting transcripts and extract ALL tasks assigned to ${userName || userEmail || userId}:

${allTranscriptsCombined}

Look for any mention of tasks, action items, or follow-ups where ${userName || userEmail || userId} is assigned or mentioned.

Return ONLY the JSON array of tasks. If no tasks are found, return [].
`,
    },
  ],
});

    const responseText = claudeResponse.content?.[0]?.text || "[]";
    console.log("📝 Claude Response:", responseText.substring(0, 500));

    let tasks = [];
    try {
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        tasks = JSON.parse(jsonMatch[0]);
      } else {
        tasks = JSON.parse(responseText);
      }
    } catch (e) {
      console.error("Failed to parse Claude response:", e);
      tasks = [];
    }

    console.log(`📊 Extracted ${tasks.length} tasks from Claude`);

    // 8. Save tasks
  const savedTasks = [];
for (const taskData of tasks) {
  try {
    // Create task without any middleware interference
    const taskDataToSave = {
      meetingId: taskData.meetingId,
      meetingTitle: taskData.meetingTitle || "Meeting",
      userId: userId || null,
      userEmail: userEmail || null,
      userName: userName || null,
      assignedBy: taskData.assignedBy || "Unknown",
      task: taskData.task,
      context: taskData.context || "",
      priority: taskData.priority || "medium",
      status: "pending",
      source: "transcript_analysis",
    };

    const task = await Task.create(taskDataToSave);
    savedTasks.push(task);
    console.log("✅ Task saved:", task.task);
  } catch (err) {
    console.error("Error saving task:", err);
    // Log the full error details
    console.error("Error details:", JSON.stringify(err, null, 2));
  }
}
await Event.create({
    userId: userId,
    type: "task.created",
    title: "📋 New Task",
    description: `"Generated ${savedTasks.length} new tasks from last 7 days"`,
    priority: "high",
    icon: "CheckSquare",
    color: "orange",
    actionLink: `/dashboard/tasks`,
  });

    return NextResponse.json({
      success: true,
      message: `Generated ${savedTasks.length} new tasks from last 7 days`,
      data: savedTasks,
      tasksFound: savedTasks.length,
      meetingsProcessed: newMeetingIds.length,
      totalMeetings: meetings.length,
    });
  } catch (error) {
    console.error("Error in task generator:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to generate tasks",
      },
      { status: 500 }
    );
  }
}