// lib/ai-assistant/context-builder.js

import HoloAssistQuestionnaire from "../../app/models/HoloAssistQuestionnaire.model.js";
import AssistantInfo from "../../app/models/AssistantInfo.model.js";
import LiveAssist from "../../app/models/LiveAssist.model.js";
import BrainChunk from "../../app/models/BrainChunk.model.js";
import BrainFile from "../../app/models/BrainFile.model.js";
import AssistSessionMemory from "../../app/models/AssistSessionMemory.model.js";
import { tokenize } from "./text-utils.js";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.CLOUDAPI,
});

const BRAIN_TOP_K = 4;
const BRAIN_CANDIDATE_LIMIT = 500; // Increased for better coverage
const BRAIN_MIN_RELEVANCE = 0.3; // Increased threshold
const BRAIN_MAX_TEXT_CHARS = 1000; // Increased for more context

// =============================================
// 1. TOPIC DETECTION & EXTRACTION
// =============================================

/**
 * Detect topics from the transcript text using AI
 * Returns array of topic names/keywords
 */
async function detectTopicsFromText(text) {
  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 100,
      system: `You are a topic detection system. Extract the main topic(s) and keywords from the following text.
      Return ONLY a comma-separated list of topics/keywords (max 5).
      Be specific and concise.
      Example: "sales pitch, product features, pricing strategy, customer objections"`,
      messages: [
        {
          role: "user",
          content: text,
        },
      ],
    });

    const topicText = response.content?.[0]?.text || "";
    const topics = topicText
      .split(",")
      .map(t => t.trim().toLowerCase())
      .filter(t => t.length > 0);
    
    return topics.length > 0 ? topics : extractKeywordsFallback(text);
  } catch (error) {
    console.error("Topic detection failed:", error);
    return extractKeywordsFallback(text);
  }
}

/**
 * Fallback: Extract keywords using tokenization
 */
function extractKeywordsFallback(text) {
  const tokens = tokenize(text);
  // Remove common stopwords and keep only meaningful terms
  const stopwords = new Set(["the", "a", "an", "this", "that", "these", "those", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did", "will", "would", "could", "should", "may", "might", "must", "for", "and", "nor", "but", "or", "yet", "so", "as", "at", "by", "for", "from", "in", "into", "of", "on", "onto", "to", "with", "without"]);
  
  const keywordCounts = {};
  tokens.forEach(token => {
    if (token.length > 3 && !stopwords.has(token)) {
      keywordCounts[token] = (keywordCounts[token] || 0) + 1;
    }
  });

  // Return top 5 keywords
  return Object.entries(keywordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);
}

// =============================================
// 2. IMPROVED CHUNK SCORING
// =============================================

/**
 * Enhanced scoring: Check if chunk matches detected topics
 */
function scoreChunkByTopic(chunk, topics, queryTokens) {
  if (!topics || topics.length === 0) {
    return scoreChunkByTokens(chunk, queryTokens);
  }

  const chunkText = `${chunk.text || ""} ${(chunk.keywords || []).join(" ")}`.toLowerCase();
  const chunkWords = new Set(chunkText.split(/\s+/));

  // Score based on topic overlap
  let topicScore = 0;
  for (const topic of topics) {
    if (chunkText.includes(topic) || chunkText.includes(topic.replace(/\s+/g, " "))) {
      topicScore += 1.5; // Higher weight for exact topic match
    }
    // Check if any word in topic exists in chunk
    const topicWords = topic.split(/\s+/);
    for (const word of topicWords) {
      if (word.length > 3 && chunkWords.has(word)) {
        topicScore += 0.3;
      }
    }
  }

  // Combine with token overlap
  const tokenScore = scoreChunkByTokens(chunk, queryTokens);
  
  return (topicScore / Math.max(1, topics.length * 2)) + (tokenScore * 0.5);
}

/**
 * Original token-based scoring (keeping as fallback)
 */
function scoreChunkByTokens(chunk, queryTokens) {
  if (queryTokens.length === 0) return 0;

  const haystack = `${chunk.text || ""} ${(chunk.keywords || []).join(" ")}`.toLowerCase();
  let overlap = 0;
  for (const token of queryTokens) {
    if (haystack.includes(token)) overlap += 1;
  }

  return overlap / queryTokens.length;
}

// =============================================
// 3. ENHANCED RETRIEVAL
// =============================================

/**
 * Retrieve brain chunks with topic-based relevance
 */
async function retrieveBrainContext(userId, queryText, topK = BRAIN_TOP_K) {
  if (!userId || !queryText || queryText.trim().length === 0) {
    return [];
  }

  const queryTokens = tokenize(queryText);
  
  // Step 1: Detect topics from the text
  const detectedTopics = await detectTopicsFromText(queryText);
  console.log(`Detected topics: ${detectedTopics.join(", ")}`);

  // Step 2: Fetch all chunks for this user
  const allChunks = await BrainChunk.find({ user_id: userId })
    .sort({ updatedAt: -1 })
    .limit(BRAIN_CANDIDATE_LIMIT)
    .lean();

  if (allChunks.length === 0) return [];

  // Step 3: Score each chunk based on topic relevance
  const scoredChunks = allChunks
    .map((chunk) => {
      // Get chunk's topic from keywords or extract from text
      const chunkTopics = chunk.keywords || [];
      
      // If chunk has explicit topic keywords, use them for matching
      const hasTopicMatch = detectedTopics.some(topic => {
        return chunkTopics.some(keyword => 
          keyword.toLowerCase().includes(topic) || 
          topic.includes(keyword.toLowerCase())
        );
      });

      // Score the chunk
      const score = hasTopicMatch 
        ? 0.8 + scoreChunkByTopic(chunk, detectedTopics, queryTokens) * 0.2
        : scoreChunkByTopic(chunk, detectedTopics, queryTokens);

      return {
        ...chunk,
        _score: Math.min(score, 1.0),
        _topicMatch: hasTopicMatch,
        _detectedTopics: detectedTopics,
      };
    })
    .filter((chunk) => chunk._score >= BRAIN_MIN_RELEVANCE)
    .sort((a, b) => b._score - a._score)
    .slice(0, topK);

  // If no chunks found with good score, try fallback with lower threshold
  if (scoredChunks.length === 0) {
    console.log("No highly relevant chunks found, trying fallback...");
    const fallbackChunks = allChunks
      .map((chunk) => ({
        ...chunk,
        _score: scoreChunkByTokens(chunk, queryTokens),
        _topicMatch: false,
      }))
      .filter((chunk) => chunk._score >= 0.15) // Lower threshold for fallback
      .sort((a, b) => b._score - a._score)
      .slice(0, Math.min(topK, 2)); // Fewer chunks for fallback

    if (fallbackChunks.length > 0) {
      return fallbackChunks.map((chunk) => ({
        fileId: chunk.file_id,
        fileName: chunk.file_name,
        text: String(chunk.text || "").slice(0, BRAIN_MAX_TEXT_CHARS),
        score: chunk._score,
        topicMatch: chunk._topicMatch || false,
        chunkIndex: chunk.chunk_index,
      }));
    }
  }

  return scoredChunks.map((chunk) => ({
    fileId: chunk.file_id,
    fileName: chunk.file_name,
    text: String(chunk.text || "").slice(0, BRAIN_MAX_TEXT_CHARS),
    score: chunk._score,
    topicMatch: chunk._topicMatch || false,
    chunkIndex: chunk.chunk_index,
    detectedTopics: chunk._detectedTopics,
  }));
}

// =============================================
// 4. CONTEXT PRIORITY SYSTEM
// =============================================

function getPriorityPolicy() {
  return {
    order: [
      "1_questionnaire_profile",      // Highest: Tone, goals, style
      "2_brain_files_relevant",       // High: Topic-specific knowledge
      "3_session_memory",             // Medium: Conversation continuity
      "4_recent_transcripts",         // Low: Meeting context
      "5_assistant_persona",          // Lowest: Delivery style
    ],
    brainMinRelevance: BRAIN_MIN_RELEVANCE,
  };
}

// =============================================
// 5. FORMATTING FUNCTIONS
// =============================================

function formatQuestionnaire(profile) {
  if (!profile) return "";

  return [
    `=== USER PROFILE (PRIMARY CONTEXT) ===`,
    `Name: ${profile.name || ""}`,
    `Role: ${profile.role || ""}`,
    `Industry: ${profile.industry || ""}`,
    `Winning Goal: ${profile.winning || ""}`,
    `Biggest Challenge: ${profile.challenge || ""}`,
    `Preferred Tone: ${profile.tone || ""}`,
    `Communication Style: ${profile.communication_style || profile.tone || "professional"}`,
    `Never Do: ${profile.never_do || ""}`,
    `Motivation: ${profile.motivation || ""}`,
    `Fear: ${profile.fear || ""}`,
    `Top Goals: ${(profile.goals || []).join(" | ")}`,
    `Values: ${(profile.values || []).join(" | ")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function formatAssistantInfo(info) {
  if (!info) return "";

  return [
    `=== ASSISTANT PERSONA (DELIVERY STYLE) ===`,
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

function formatBrainChunks(chunks) {
  if (!chunks || chunks.length === 0) return "No relevant brain files found";

  return chunks
    .map(
      (item, index) => 
        `[${index + 1}] TOPIC: ${item.detectedTopics ? item.detectedTopics.join(", ") : "General"}\n` +
        `    FILE: ${item.fileName}\n` +
        `    RELEVANCE: ${(item.score * 100).toFixed(1)}%\n` +
        `    CONTENT: ${item.text}`
    )
    .join("\n\n");
}

function formatSessionMemory(memory) {
  if (!memory || memory.length === 0) return "No recent session memory";

  return memory
    .map((item) => `- (${item.role}) ${item.text}`)
    .join("\n");
}

function formatTranscripts(transcripts) {
  if (!transcripts || transcripts.length === 0) return "No recent transcripts";

  return transcripts
    .map((item) => `- (${item.participantName || "Unknown"}) ${item.summary || item.transcriptText || item.text}`)
    .join("\n");
}

// =============================================
// 6. MAIN CONTEXT BUILDER
// =============================================

export async function buildAssistContext({
  userId,
  roomId,
  sessionId,
  queryText,
}) {
  if (!userId) {
    console.warn("No userId provided for context building");
    return {
      userId: null,
      roomId,
      sessionId,
      profile: null,
      assistantInfo: null,
      retrievedChunks: [],
      recentSummaries: [],
      recentMemory: [],
      priorityPolicy: getPriorityPolicy(),
      profileText: "",
      assistantInfoText: "",
      brainChunksText: "",
      memoryText: "",
      transcriptsText: "",
      queryText,
    };
  }

  // Fetch all context data in parallel
  const [
    profile,
    assistantInfo,
    recentTranscripts,
    recentMemory,
    retrievedChunks,
  ] = await Promise.all([
    HoloAssistQuestionnaire.findOne({ user_id: userId }).lean(),
    AssistantInfo.findOne({ userId }).lean(),
    userId && roomId
      ? LiveAssist.find({ userId, roomId })
          .sort({ createdAt: -1 })
          .limit(10)
          .lean()
      : [],
    userId && sessionId
      ? AssistSessionMemory.find({ user_id: userId, session_id: sessionId })
          .sort({ createdAt: -1 })
          .limit(15)
          .lean()
      : [],
    retrieveBrainContext(userId, queryText, BRAIN_TOP_K),
  ]);

  // Build the context object
  const context = {
    userId,
    roomId,
    sessionId,
    profile,
    assistantInfo,
    retrievedChunks,
    recentTranscripts,
    recentMemory,
    priorityPolicy: getPriorityPolicy(),
    queryText,
    
    // Formatted texts for prompt building
    profileText: formatQuestionnaire(profile),
    assistantInfoText: formatAssistantInfo(assistantInfo),
    brainChunksText: formatBrainChunks(retrievedChunks),
    memoryText: formatSessionMemory(recentMemory),
    transcriptsText: formatTranscripts(recentTranscripts),
  };

  // Log for debugging
  console.log(`Context built with ${retrievedChunks.length} brain chunks, ${recentMemory.length} memory entries`);

  return context;
}

// =============================================
// 7. PROMPT BUILDER
// =============================================

export function buildContextPrompt(context) {
  const priorityPolicy = context.priorityPolicy || getPriorityPolicy();

  const priorityOrder = (priorityPolicy.order || [])
    .map((item, index) => `${index + 1}. ${item}`)
    .join("\n");

  return `
SYSTEM CONTEXT PRIORITY (Strict Order):
${priorityOrder}

--- PRIORITY 1: USER PROFILE & COMMUNICATION STYLE ---
${context.profileText || "Not available"}

--- PRIORITY 2: RELEVANT BRAIN KNOWLEDGE ---
${context.brainChunksText || "No relevant knowledge found"}

--- PRIORITY 3: SESSION MEMORY (Continuity) ---
${context.memoryText || "No session history"}

--- PRIORITY 4: RECENT MEETING CONTEXT ---
${context.transcriptsText || "No meeting context"}

--- PRIORITY 5: ASSISTANT PERSONA (Style Only) ---
${context.assistantInfoText || "Use professional tone"}

POLICY NOTES:
- Always prioritize user profile for tone, goals, and communication style
- Use brain knowledge as primary source for content and expertise
- Session memory only for continuity (avoid repeating previous suggestions)
- Meeting transcripts for understanding current conversation flow
- Assistant persona for delivery style ONLY (not content)
- If knowledge conflicts, user profile and brain knowledge take precedence

CURRENT QUERY: "${context.queryText || ""}"
`;
}

// =============================================
// 8. SAVE ASSIST MEMORY (unchanged but enhanced)
// =============================================

export async function saveAssistMemory({
  userId,
  roomId,
  sessionId,
  role,
  text,
  sourceRefs = [],
}) {
  if (!userId || !sessionId || !text) {
    console.warn("Missing required fields for saveAssistMemory");
    return;
  }

  try {
    await AssistSessionMemory.create({
      user_id: userId,
      room_id: roomId || "",
      session_id: sessionId,
      role,
      text,
      source_refs: sourceRefs,
    });
  } catch (error) {
    console.error("Error saving assist memory:", error);
  }
}

// =============================================
// 9. EXPORT HELPER FUNCTIONS
// =============================================

export {
  detectTopicsFromText,
  retrieveBrainContext,
  scoreChunkByTopic,
  scoreChunkByTokens,
  getPriorityPolicy,
  formatQuestionnaire,
  formatBrainChunks,
};