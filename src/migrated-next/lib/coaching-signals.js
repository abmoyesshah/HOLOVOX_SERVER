import Anthropic from "@anthropic-ai/sdk";
import DashboardSession from "../app/models/DashboardSession.model.js";
import SkillMetric from "../app/models/SkillMetric.model.js";
import WinJournal from "../app/models/WinJournal.model.js";

const anthropic = new Anthropic({
  apiKey: process.env.CLOUDAPI,
});

export const SKILL_TRAITS = [
  "Discovery",
  "Listening",
  "Objections",
  "Closing",
  "Demo",
  "Follow-up",
];

const COACHING_SYSTEM_PROMPT = `
You are a sales coaching analyst. You will receive a meeting transcript in the format:
Name: what they said

Output ONLY valid JSON (no markdown fences, no prose) with exactly this shape:
{
  "topic": string (2-6 word session topic, e.g. "Enterprise renewal call"),
  "duration_mins": number (estimated meeting length in minutes from the transcript's pacing; 0 if you cannot tell),
  "strongest": string (one short phrase naming the rep's strongest demonstrated skill),
  "work_on": string (one short phrase naming the one thing to improve next),
  "win_highlight": string (one encouraging sentence about something the rep did well, for a personal win journal),
  "skills": {
    "Discovery": number 0-1,
    "Listening": number 0-1,
    "Objections": number 0-1,
    "Closing": number 0-1,
    "Demo": number 0-1,
    "Follow-up": number 0-1
  }
}

Score every skill from concrete evidence in the transcript. If a skill was never exercised in this meeting, score it 0.4 (neutral/unproven) rather than guessing.
`;

function parseCoachingJson(rawText) {
  const cleaned = rawText.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "");
  const parsed = JSON.parse(cleaned);

  const skills = {};
  for (const trait of SKILL_TRAITS) {
    const value = Number(parsed?.skills?.[trait]);
    skills[trait] = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.4;
  }

  return {
    topic: typeof parsed.topic === "string" ? parsed.topic.slice(0, 120) : "Meeting",
    duration_mins: Number.isFinite(Number(parsed.duration_mins)) ? Number(parsed.duration_mins) : 0,
    strongest: typeof parsed.strongest === "string" ? parsed.strongest.slice(0, 200) : "",
    work_on: typeof parsed.work_on === "string" ? parsed.work_on.slice(0, 200) : "",
    win_highlight: typeof parsed.win_highlight === "string" ? parsed.win_highlight.slice(0, 400) : "",
    skills,
  };
}

// Scores a transcript with Claude and upserts SkillMetric/DashboardSession/WinJournal
// documents for userId. Safe to call fire-and-forget: never throws, logs on failure.
export async function recordCoachingSignals(userId, conversationLog) {
  if (!userId || !conversationLog || !conversationLog.trim()) return;

  let analysis;
  try {
    const coachingResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      system: COACHING_SYSTEM_PROMPT,
      messages: [{ role: "user", content: conversationLog }],
    });
    analysis = parseCoachingJson(coachingResponse.content?.[0]?.text || "");
  } catch (err) {
    console.error("COACHING ANALYSIS ERROR:", err);
    return;
  }

  try {
    await Promise.all([
      DashboardSession.create({
        user_id: userId,
        session_date: new Date(),
        topic: analysis.topic,
        duration_mins: analysis.duration_mins,
        strongest: analysis.strongest,
        work_on: analysis.work_on,
      }),

      ...SKILL_TRAITS.map(async (trait) => {
        const existing = await SkillMetric.findOne({ user_id: userId, trait_name: trait });
        return SkillMetric.findOneAndUpdate(
          { user_id: userId, trait_name: trait },
          {
            user_id: userId,
            trait_name: trait,
            current_score: analysis.skills[trait],
            previous_score: existing ? existing.current_score : analysis.skills[trait],
          },
          { upsert: true },
        );
      }),

      analysis.win_highlight
        ? WinJournal.create({
            user_id: userId,
            entry_date: new Date(),
            topic: analysis.topic,
            entry_text: analysis.win_highlight,
          })
        : Promise.resolve(),
    ]);
  } catch (err) {
    console.error("COACHING SIGNALS WRITE ERROR:", err);
  }
}
