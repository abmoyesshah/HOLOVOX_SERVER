// // lib/events.ts
// import Event from "../app/models/Event.model.js";

// export type EventData = {
//   userId: string;
//   type: string;
//   entityId?: string;
//   title: string;
//   description?: string;
//   priority?: "high" | "normal" | "low";
//   metadata?: any;
//   triggeredBy?: string;
//   actionLink?: string;
//   icon?: string;
//   color?: string;
// };

// // ✅ Use the static method from the model
// export const createNotification = async (data: EventData) => {
//   return await Event.createEvent(data);
// };

// // Get unread count for a user
// export const getUnreadEventCount = async (userId: string) => {
//   return await Event.getUnreadCount(userId);
// };

// // Get user events
// export const getUserEvents = async (userId: string, limit = 50) => {
//   return await Event.getUserEvents(userId, limit);
// };

// // Mark events as read
// export const markEventsAsRead = async (userId: string, eventId?: string) => {
//   return await Event.markAsRead(userId, eventId);
// };

// // Predefined event creators
// export const eventCreators = {
//   // Meeting events
//   meetingCreated: (userId: string, meetingTitle: string, meetingId: string) => ({
//     userId,
//     type: "meeting.created",
//     entityId: meetingId,
//     title: "📅 Meeting Created",
//     description: `"${meetingTitle}" has been scheduled`,
//     priority: "normal" as const,
//     icon: "Calendar",
//     color: "blue",
//     actionLink: `/dashboard/meetings`,
//   }),
  
//   meetingStarted: (userId: string, meetingTitle: string, meetingId: string) => ({
//     userId,
//     type: "meeting.started",
//     entityId: meetingId,
//     title: "🔴 Meeting Started",
//     description: `"${meetingTitle}" has started`,
//     priority: "high" as const,
//     icon: "Video",
//     color: "red",
//     actionLink: `/call/${meetingId}`,
//   }),
  
//   meetingDeleted: (userId: string, meetingTitle: string) => ({
//     userId,
//     type: "meeting.deleted",
//     title: "🗑️ Meeting Deleted",
//     description: `"${meetingTitle}" has been deleted`,
//     priority: "normal" as const,
//     icon: "Trash2",
//     color: "gray",
//   }),
  
//   meetingInvited: (userId: string, meetingTitle: string, meetingId: string, hostName: string) => ({
//     userId,
//     type: "meeting.invited",
//     entityId: meetingId,
//     title: "📧 Meeting Invitation",
//     description: `${hostName} invited you to "${meetingTitle}"`,
//     priority: "high" as const,
//     icon: "Mail",
//     color: "purple",
//     actionLink: `/dashboard/meetings`,
//   }),
  
//   // Transcript events
//   transcriptCreated: (userId: string, meetingTitle: string, meetingId: string) => ({
//     userId,
//     type: "transcript.created",
//     entityId: meetingId,
//     title: "📝 Transcript Ready",
//     description: `Transcript for "${meetingTitle}" is ready`,
//     priority: "normal" as const,
//     icon: "FileText",
//     color: "green",
//     actionLink: `/dashboard/meetings`,
//   }),
  
//   // Summary events
//   summaryCreated: (userId: string, meetingTitle: string, meetingId: string) => ({
//     userId,
//     type: "summary.created",
//     entityId: meetingId,
//     title: "✨ Summary Generated",
//     description: `AI summary for "${meetingTitle}" is ready`,
//     priority: "normal" as const,
//     icon: "Sparkles",
//     color: "magenta",
//     actionLink: `/dashboard/meetings`,
//   }),
  
//   // Task events
//   taskCreated: (userId: string, task: string, taskId: string, meetingTitle: string) => ({
//     userId,
//     type: "task.created",
//     entityId: taskId,
//     title: "📋 New Task",
//     description: `"${task}" was extracted from "${meetingTitle}"`,
//     priority: "high" as const,
//     icon: "CheckSquare",
//     color: "orange",
//     actionLink: `/dashboard/tasks`,
//   }),
  
//   taskCompleted: (userId: string, task: string, taskId: string) => ({
//     userId,
//     type: "task.completed",
//     entityId: taskId,
//     title: "✅ Task Completed",
//     description: `"${task}" has been completed`,
//     priority: "normal" as const,
//     icon: "CheckSquare",
//     color: "green",
//     actionLink: `/dashboard/tasks`,
//   }),
  
//   taskOverdue: (userId: string, task: string, taskId: string) => ({
//     userId,
//     type: "task.overdue",
//     entityId: taskId,
//     title: "⚠️ Task Overdue",
//     description: `"${task}" is overdue`,
//     priority: "high" as const,
//     icon: "AlertCircle",
//     color: "red",
//     actionLink: `/dashboard/tasks`,
//   }),
  
//   // Agent events
//   agentInitialized: (userId: string) => ({
//     userId,
//     type: "agent.initialized",
//     title: "🤖 Holo Agent Ready",
//     description: "Your AI assistant is now active and ready to help",
//     priority: "high" as const,
//     icon: "Sparkles",
//     color: "magenta",
//     actionLink: `/dashboard/holo-assist`,
//   }),
  
//   // User events
//   userOnboardingComplete: (userId: string, userName: string) => ({
//     userId,
//     type: "user.onboarding_complete",
//     title: "🎉 Welcome to Holo!",
//     description: `${userName}, your AI assistant is ready to help you win every conversation.`,
//     priority: "high" as const,
//     icon: "Rocket",
//     color: "magenta",
//   }),
  
//   userEnterpriseAdded: (userId: string, userName: string) => ({
//     userId,
//     type: "user.enterprise_added",
//     title: "🏢 Enterprise User Added",
//     description: `${userName} has been added to the enterprise`,
//     priority: "normal" as const,
//     icon: "Users",
//     color: "purple",
//   }),
// };