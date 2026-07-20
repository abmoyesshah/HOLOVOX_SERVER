import { NextResponse } from "../../../utils/next-response.js";
import connectDB from "../../../lib/db.js";
import BrainFile from "../../models/BrainFile.model.js";
import DashboardSession from "../../models/DashboardSession.model.js";
import Playbook from "../../models/Playbook.model.js";
import SkillMetric from "../../models/SkillMetric.model.js";
import UserGoal from "../../models/UserGoal.model.js";
import WinJournal from "../../models/WinJournal.model.js";
import {
  getSeedGoal,
  getSeedJournal,
  getSeedPlaybooks,
  getSeedSessions,
  getSeedSkills,
} from "../../../lib/holo-assist-seeds.js";

function createDashboardPayload({
  sources,
  sessions,
  playbooks,
  skills,
  journal,
  goal,
}) {
  const totalSessions = sessions.length;
  const avgCards = totalSessions
    ? Math.round(
        sessions.reduce((acc, session) => acc + (session.cards_used_pct || 0), 0) /
          totalSessions,
      )
    : 0;
  const totalRecoveries = sessions.reduce(
    (acc, session) => acc + (session.recoveries || 0),
    0,
  );
  const pwr = Math.min(100, sources.length * 15);

  return {
    sources,
    stats: {
      sessions: totalSessions,
      cards: avgCards,
      recoveries: totalRecoveries,
    },
    debriefs: sessions.slice(0, 2),
    playbooks,
    skills,
    journal,
    goal: goal?.goal_text || "Set your first goal.",
    pwr,
    deskQuote:
      pwr >= 100
        ? "Brain loaded. I've got you."
        : "Feed it files. Watch the Brain charge.",
  };
}

function createSeedDashboardPayload(userId) {
  const sources = [];
  const sessions = getSeedSessions(userId);
  const playbooks = getSeedPlaybooks(userId);
  const skills = getSeedSkills(userId);
  const journal = getSeedJournal(userId);

  return createDashboardPayload({
    sources,
    sessions,
    playbooks,
    skills,
    journal,
    goal: { goal_text: getSeedGoal() },
  });
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "userId is required" },
        { status: 400 },
      );
    }

    try {
      await connectDB();
    } catch (connectError) {
      return NextResponse.json({
        success: true,
        ...createSeedDashboardPayload(userId),
      });
    }

    const [sources, sessions, playbooks, skills, journal, goal] = await Promise.all([
      BrainFile.find({ user_id: userId })
        .select("_id file_name file_path file_size file_type createdAt")
        .sort({ createdAt: -1 })
        .lean(),
      DashboardSession.find({ user_id: userId })
        .sort({ session_date: -1, createdAt: -1 })
        .lean(),
      Playbook.find({ user_id: userId }).sort({ createdAt: -1 }).lean(),
      SkillMetric.find({ user_id: userId }).lean(),
      WinJournal.find({ user_id: userId })
        .sort({ entry_date: -1, createdAt: -1 })
        .limit(3)
        .lean(),
      UserGoal.findOne({ user_id: userId }).sort({ createdAt: -1 }).lean(),
    ]);

    const normalizedSources = sources.map((file) => ({
      id: file._id.toString(),
      file_name: file.file_name,
      file_path: file.file_path,
      file_size: file.file_size,
      file_type: file.file_type,
      created_at: file.createdAt,
    }));

    const normalizedSessions = sessions.map((session) => ({
      ...session,
      id: session._id.toString(),
    }));

    const normalizedPlaybooks = playbooks.map((playbook) => ({
      ...playbook,
      id: playbook._id.toString(),
    }));

    const normalizedSkills = skills.map((skill) => ({
      ...skill,
      id: skill._id.toString(),
    }));

    const normalizedJournal = journal.map((entry) => ({
      ...entry,
      id: entry._id.toString(),
    }));

    const resolvedSessions =
      normalizedSessions.length > 0 ? normalizedSessions : getSeedSessions(userId);
    const resolvedPlaybooks =
      normalizedPlaybooks.length > 0 ? normalizedPlaybooks : getSeedPlaybooks(userId);
    const resolvedSkills =
      normalizedSkills.length > 0 ? normalizedSkills : getSeedSkills(userId);
    const resolvedJournal =
      normalizedJournal.length > 0 ? normalizedJournal : getSeedJournal(userId);
    const resolvedGoal = goal?.goal_text || getSeedGoal();

    return NextResponse.json({
      success: true,
      ...createDashboardPayload({
        sources: normalizedSources,
        sessions: resolvedSessions,
        playbooks: resolvedPlaybooks,
        skills: resolvedSkills,
        journal: resolvedJournal,
        goal: { goal_text: resolvedGoal },
      }),
    });
  } catch (error) {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId") || "test";

    return NextResponse.json({
      success: true,
      ...createSeedDashboardPayload(userId),
    });
  }
}