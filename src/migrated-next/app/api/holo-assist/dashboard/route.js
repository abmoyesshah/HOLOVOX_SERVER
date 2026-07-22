// app/api/holo-assist/dashboard/route.js
import { NextResponse } from "../../../utils/next-response.js";
import connectDB from "../../../lib/db.js";
import DashboardSession from "../../../app/models/DashboardSession.model.js";
import SkillMetric from "../../../app/models/SkillMetric.model.js";
import WinJournal from "../../../app/models/WinJournal.model.js";
import UserGoal from "../../../app/models/UserGoal.model.js";
import Playbook from "../../../app/models/Playbook.model.js";

export async function GET(req) {
  try {
    await connectDB();
    
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "userId is required" },
        { status: 400 }
      );
    }
    
    console.log("📡 Fetching dashboard data for user:", userId);
    
    // Fetch all data in parallel
    const [sessions, skills, journal, goal, playbooks] = await Promise.all([
      DashboardSession.find({ user_id: userId })
        .sort({ session_date: -1 })
        .limit(5)
        .lean(),
      SkillMetric.find({ user_id: userId }).lean(),
      WinJournal.find({ user_id: userId })
        .sort({ entry_date: -1 })
        .limit(5)
        .lean(),
      UserGoal.findOne({ user_id: userId }).lean(),
      Playbook.find({ user_id: userId }).lean(),
    ]);
    
    console.log("✅ Found sessions:", sessions.length);
    console.log("✅ Found skills:", skills.length);
    console.log("✅ Found journal entries:", journal.length);
    console.log("✅ Found goal:", goal ? "Yes" : "No");
    
    // Calculate stats
    const totalSessions = sessions.length;
    const avgCards = totalSessions > 0
      ? Math.round(sessions.reduce((acc, s) => acc + (s.cards_used_pct || 0), 0) / totalSessions)
      : 0;
    const totalRecoveries = sessions.reduce((acc, s) => acc + (s.recoveries || 0), 0);
    
    // Format debriefs from sessions
    const debriefs = sessions.map((session) => ({
      id: session._id.toString(),
      topic: session.topic || "Session",
      session_date: session.session_date || session.createdAt,
      duration_mins: session.duration_mins || 30,
      strongest: session.strongest || "Communication",
      work_on: session.work_on || "Objection handling",
      seeded: session.seeded || false,
    }));
    
    return NextResponse.json({
      success: true,
      stats: {
        sessions: totalSessions,
        cards: avgCards,
        recoveries: totalRecoveries,
      },
      debriefs: debriefs,
      skills: skills.map(s => ({
        trait_name: s.trait_name,
        current_score: s.current_score,
        previous_score: s.previous_score,
        seeded: s.seeded || false,
      })),
      journal: journal.map(j => ({
        id: j._id.toString(),
        topic: j.topic,
        entry_date: j.entry_date,
        entry_text: j.entry_text,
        seeded: j.seeded || false,
      })),
      goal: goal?.goal_text || "Set your first goal.",
      playbooks: playbooks.map(p => ({
        id: p._id.toString(),
        title: p.title,
        description: p.description,
        usage_count: p.usage_count || 0,
        seeded: p.seeded || false,
      })),
    });
    
  } catch (error) {
    console.error("❌ Dashboard error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}