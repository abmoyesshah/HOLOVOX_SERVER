import HoloAssistQuestionnaire from "../../app/models/HoloAssistQuestionnaire.model.js";
import AssistantInfo from "../../app/models/AssistantInfo.model.js";
import LiveAssist from "../../app/models/LiveAssist.model.js";
import BrainChunk from "../../app/models/BrainChunk.model.js";
import AssistSessionMemory from "../../app/models/AssistSessionMemory.model.js";
import { tokenize } from "./text-utils.js";

const BRAIN_TOP_K = 4;
const BRAIN_CANDIDATE_LIMIT = 250;
const BRAIN_MIN_RELEVANCE = 0.2;
const BRAIN_MAX_TEXT_CHARS = 500;

function scoreChunk(queryTokens, chunk) {
  if (queryTokens.length === 0) return 0;

  const haystack = `${chunk.text || ""} ${(chunk.keywords || []).join(" ")}`.toLowerCase();
  let overlap = 0;
  for (const token of queryTokens) {
    if (haystack.includes(token)) overlap += 1;
  }

  return overlap / queryTokens.length;
}

async function retrieveBrainContext(userId, queryText, topK = 4) {
  const queryTokens = tokenize(queryText);
  if (!userId || queryTokens.length === 0) return [];

  const candidates = await BrainChunk.find({ user_id: userId })
    .sort({ updatedAt: -1 })
    .limit(BRAIN_CANDIDATE_LIMIT)
    .lean();

  return candidates
    .map((chunk) => ({ ...chunk, _score: scoreChunk(queryTokens, chunk) }))
    .filter((chunk) => chunk._score >= BRAIN_MIN_RELEVANCE)
    .sort((a, b) => b._score - a._score)
    .slice(0, topK)
    .map((chunk) => ({
      fileId: chunk.file_id,
      fileName: chunk.file_name,
      text: String(chunk.text || "").slice(0, BRAIN_MAX_TEXT_CHARS),
      score: chunk._score,
    }));
}

function getPriorityPolicy() {
  return {
    order: [
      "questionnaire_profile_first",
      "assistant_persona_second",
      "session_memory_for_continuity_only",
      "recent_summaries_for_context_only",
      "brain_files_as_relevant_evidence_only",
      "current_input_drives_immediate_response",
    ],
    brainMinRelevance: BRAIN_MIN_RELEVANCE,
  };
}

function formatQuestionnaire(profile) {
  if (!profile) return "";

  return [
    `Name: ${profile.name || ""}`,
    `Role: ${profile.role || ""}`,
    `Industry: ${profile.industry || ""}`,
    `Winning Goal: ${profile.winning || ""}`,
    `Biggest Challenge: ${profile.challenge || ""}`,
    `Preferred Tone: ${profile.tone || ""}`,
    `Never Do: ${profile.never_do || ""}`,
    `Motivation: ${profile.motivation || ""}`,
    `Fear: ${profile.fear || ""}`,
    `Top Goals: ${(profile.goals || []).join(" | ")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function formatAssistantInfo(info) {
  if (!info) return "";

  return [
    `Natural Style: ${info.naturalStyle || ""}`,
    `Current Goal: ${info.currentGoal || ""}`,
    `Biggest Barrier: ${info.biggestBarrier || ""}`,
    `Preferred Tone: ${info.preferredTone || ""}`,
    `Current Need: ${info.currentNeed || ""}`,
    `Domain Answers: ${(info.domainAnswers || []).join(" | ")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function buildAssistContext({
  userId,
  roomId,
  sessionId,
  queryText,
}) {
  const [profile, assistantInfo, recentSummaries, recentMemory, retrievedChunks] =
    await Promise.all([
      userId ? HoloAssistQuestionnaire.findOne({ user_id: userId }).lean() : null,
      userId ? AssistantInfo.findOne({ userId }).lean() : null,
      userId
        ? LiveAssist.find({ userId, ...(roomId ? { roomId } : {}) })
            .sort({ createdAt: -1 })
            .limit(6)
            .lean()
        : [],
      userId && sessionId
        ? AssistSessionMemory.find({ user_id: userId, session_id: sessionId })
            .sort({ createdAt: -1 })
            .limit(6)
            .lean()
        : [],
      retrieveBrainContext(userId, queryText, BRAIN_TOP_K),
    ]);

  return {
    userId,
    roomId,
    sessionId,
    profile,
    assistantInfo,
    retrievedChunks,
    recentSummaries,
    recentMemory,
    priorityPolicy: getPriorityPolicy(),
    profileText: formatQuestionnaire(profile),
    assistantInfoText: formatAssistantInfo(assistantInfo),
  };
}

export async function saveAssistMemory({
  userId,
  roomId,
  sessionId,
  role,
  text,
  sourceRefs = [],
}) {
  if (!userId || !sessionId || !text) return;

  await AssistSessionMemory.create({
    user_id: userId,
    room_id: roomId || "",
    session_id: sessionId,
    role,
    text,
    source_refs: sourceRefs,
  });
}

export function buildContextPrompt(context) {
  const priorityPolicy = context.priorityPolicy || getPriorityPolicy();

  const summaryHistory = (context.recentSummaries || [])
    .map((item) => `- (${item.type || "general"}) ${item.summary}`)
    .join("\n");

  const memoryHistory = (context.recentMemory || [])
    .map((item) => `- (${item.role}) ${item.text}`)
    .join("\n");

  const brainEvidence = (context.retrievedChunks || [])
    .map(
      (item, index) =>
        `(${index + 1}) [${item.fileName}] score=${item.score.toFixed(2)} ${item.text}`,
    )
    .join("\n");

  const priorityOrder = (priorityPolicy.order || [])
    .map((item, index) => `${index + 1}. ${item}`)
    .join("\n");

  return `
Priority Order (strict):
${priorityOrder}

Policy Notes:
- Questionnaire/profile must control tone, goals, and coaching style.
- Session memory and summaries are continuity hints only.
- Brain evidence can be used only if relevance is at least ${priorityPolicy.brainMinRelevance}.
- Current user input is mandatory for immediate response content.

User Profile:
${context.profileText || "Not available"}

Assistant Persona:
${context.assistantInfoText || "Not available"}

Recent Session Memory:
${memoryHistory || "None"}

Recent Summaries:
${summaryHistory || "None"}

Retrieved Brain Context:
${brainEvidence || "None"}
`;
}
