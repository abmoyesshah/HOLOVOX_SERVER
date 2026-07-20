// app/api/ai-assistant/tasks/route.js
import { NextResponse } from "../../../../utils/next-response.js";
import connectDB from "../../../../lib/db.js";
import Task from "../../../../app/models/Task.model.js";

// CORS headers helper
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Handle OPTIONS request (preflight)
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const userEmail = searchParams.get("userEmail");
    const userName = searchParams.get("userName");
    const status = searchParams.get("status") || "all";

    // Build query based on user identifier
    let query = {};
    if (userId) query.userId = userId;
    else if (userEmail) query.userEmail = userEmail;
    else if (userName) query.userName = userName;
    else {
      return NextResponse.json(
        {
          success: false,
          error: "userId, userEmail, or userName is required",
        },
        { status: 400 }
      );
    }

    // Only get tasks from last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    query.createdAt = { $gte: sevenDaysAgo };

    if (status && status !== "all") query.status = status;

    const tasks = await Task.find(query)
      .sort({ priority: -1, createdAt: -1 })
      .lean();

    return NextResponse.json({
      success: true,
      data: tasks,
      total: tasks.length,
      user: { userId, userEmail, userName },
    });
  } catch (error) {
    console.error("Error fetching tasks:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}

// ✅ PATCH - Update task status
export async function PUT(req) {
  try {
    await connectDB();

    const body = await req.json();
    const { taskId, status, userId, userEmail, userName } = body;

    // Validate required fields
    if (!taskId) {
      return NextResponse.json(
        { 
          success: false, 
          error: "taskId is required" 
        },
        { status: 400 }
      );
    }

    if (!status) {
      return NextResponse.json(
        { 
          success: false, 
          error: "status is required" 
        },
        { status: 400 }
      );
    }

    // Validate status value
    const validStatuses = ["pending", "in_progress", "completed", "cancelled"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` 
        },
        { status: 400 }
      );
    }

    // Find the task first
    const existingTask = await Task.findById(taskId);
    if (!existingTask) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Task not found" 
        },
        { status: 404 }
      );
    }

    // Verify ownership - check if the user owns this task
    const isAuthorized = 
      (userId && existingTask.userId === userId) ||
      (userEmail && existingTask.userEmail === userEmail) ||
      (userName && existingTask.userName === userName);

    if (!isAuthorized) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Unauthorized: You don't own this task" 
        },
        { status: 403 }
      );
    }

    // Prepare update data
    const updateData = {
      status: status,
      updatedAt: new Date(),
    };

    // If status is completed, set completedAt
    if (status === "completed") {
      updateData.completedAt = new Date();
    } else {
      // If status is changed from completed to something else, clear completedAt
      if (existingTask.status === "completed" && status !== "completed") {
        updateData.completedAt = null;
      }
    }

    // Update the task
    const updatedTask = await Task.findByIdAndUpdate(
      taskId,
      updateData,
      { 
        new: true, // Return the updated document
        runValidators: true,
      }
    ).lean();

    return NextResponse.json({
      success: true,
      message: `Task status updated to ${status}`,
      data: updatedTask,
    });
  } catch (error) {
    console.error("Error updating task:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to update task",
      },
      { status: 500 }
    );
  }
}