// lib/ai-assistant/context-builder.js

import HoloAssistQuestionnaire from "../../app/models/HoloAssistQuestionnaire.model.js";
import LiveAssist from "../../app/models/LiveAssist.model.js";
import BrainChunk from "../../app/models/BrainChunk.model.js";
import AssistSessionMemory from "../../app/models/AssistSessionMemory.model.js";
import { tokenize } from "./text-utils.js";

const BRAIN_TOP_K = 4;
const BRAIN_CANDIDATE_LIMIT = 500;
const BRAIN_MIN_RELEVANCE = 0.3;
const BRAIN_MAX_TEXT_CHARS = 1000;

// =============================================
// 1. TOPIC DETECTION & EXTRACTION
// =============================================

async function detectTopicsFromText(text) {
  console.log('\n🔍 [TOPIC DETECTION] Starting...');
  console.log(`📝 Query text: "${text.slice(0, 100)}..."`);
  
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic({
      apiKey: process.env.CLOUDAPI,
    });

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
    
    console.log(`✅ [TOPIC DETECTION] Detected topics: ${topics.join(", ")}`);
    return topics.length > 0 ? topics : extractKeywordsFallback(text);
  } catch (error) {
    console.error("❌ [TOPIC DETECTION] Failed:", error);
    return extractKeywordsFallback(text);
  }
}

function extractKeywordsFallback(text) {
  const tokens = tokenize(text);
  const stopwords = new Set(["the", "a", "an", "this", "that", "these", "those", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did", "will", "would", "could", "should", "may", "might", "must", "for", "and", "nor", "but", "or", "yet", "so", "as", "at", "by", "for", "from", "in", "into", "of", "on", "onto", "to", "with", "without"]);
  
  const keywordCounts = {};
  tokens.forEach(token => {
    if (token.length > 3 && !stopwords.has(token)) {
      keywordCounts[token] = (keywordCounts[token] || 0) + 1;
    }
  });

  const keywords = Object.entries(keywordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);
  
  console.log(`🔄 [TOPIC DETECTION] Fallback keywords: ${keywords.join(", ")}`);
  return keywords;
}

// =============================================
// 2. CHUNK SCORING
// =============================================

function scoreChunkByTopic(chunk, topics, queryTokens) {
  if (!topics || topics.length === 0) {
    return scoreChunkByTokens(chunk, queryTokens);
  }

  const chunkText = `${chunk.text || ""} ${(chunk.keywords || []).join(" ")}`.toLowerCase();
  const chunkWords = new Set(chunkText.split(/\s+/));

  let topicScore = 0;
  for (const topic of topics) {
    if (chunkText.includes(topic) || chunkText.includes(topic.replace(/\s+/g, " "))) {
      topicScore += 1.5;
    }
    const topicWords = topic.split(/\s+/);
    for (const word of topicWords) {
      if (word.length > 3 && chunkWords.has(word)) {
        topicScore += 0.3;
      }
    }
  }

  const tokenScore = scoreChunkByTokens(chunk, queryTokens);
  const finalScore = (topicScore / Math.max(1, topics.length * 2)) + (tokenScore * 0.5);
  
  return Math.min(finalScore, 1.0);
}

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
// 3. RETRIEVAL
// =============================================

async function retrieveBrainContext(userId, queryText, topK = BRAIN_TOP_K) {
  console.log('\n📚 [BRAIN RETRIEVAL] Starting...');
  console.log(`👤 User ID: ${userId}`);
  console.log(`🔍 Query: "${queryText.slice(0, 100)}..."`);
  console.log(`📊 Top K: ${topK}`);

  if (!userId || !queryText || queryText.trim().length === 0) {
    console.log('⚠️ [BRAIN RETRIEVAL] No userId or queryText provided');
    return [];
  }

  const queryTokens = tokenize(queryText);
  console.log(`📝 Query tokens: ${queryTokens.join(", ")}`);

  const detectedTopics = await detectTopicsFromText(queryText);
  console.log(`🎯 Detected topics: ${detectedTopics.join(", ")}`);

  // Fetch all chunks for this user
  console.log(`🔎 Fetching chunks for user: ${userId}...`);
  const allChunks = await BrainChunk.find({ user_id: userId })
    .sort({ updatedAt: -1 })
    .limit(BRAIN_CANDIDATE_LIMIT)
    .lean();

  console.log(`📦 Total chunks found: ${allChunks.length}`);

  if (allChunks.length === 0) {
    console.log('⚠️ [BRAIN RETRIEVAL] No chunks found for this user');
    return [];
  }

  // Log sample chunks
  console.log('\n📋 [BRAIN RETRIEVAL] Sample chunks (first 3):');
  allChunks.slice(0, 3).forEach((chunk, i) => {
    console.log(`  ${i + 1}. Topic: ${chunk.topic || 'general'}`);
    console.log(`     Header: ${chunk.topic_header || 'N/A'}`);
    console.log(`     Keywords: ${(chunk.keywords || []).join(', ')}`);
    console.log(`     Text preview: ${(chunk.text || '').slice(0, 80)}...`);
  });

  // Score each chunk
  console.log('\n📊 [BRAIN RETRIEVAL] Scoring chunks...');
  const scoredChunks = allChunks
    .map((chunk) => {
      const chunkTopics = chunk.topic_keywords || chunk.keywords || [];
      
      const hasTopicMatch = detectedTopics.some(topic => {
        return chunkTopics.some(keyword => 
          keyword.toLowerCase().includes(topic) || 
          topic.includes(keyword.toLowerCase())
        );
      });

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

  console.log(`✅ [BRAIN RETRIEVAL] ${scoredChunks.length} chunks scored above threshold (${BRAIN_MIN_RELEVANCE})`);

  // Log scored chunks
  scoredChunks.forEach((chunk, i) => {
    console.log(`\n  🏆 Chunk ${i + 1}:`);
    console.log(`     Topic: ${chunk.topic || 'general'}`);
    console.log(`     Score: ${(chunk._score * 100).toFixed(1)}%`);
    console.log(`     Topic Match: ${chunk._topicMatch}`);
    console.log(`     File: ${chunk.file_name}`);
    console.log(`     Preview: ${(chunk.text || '').slice(0, 100)}...`);
  });

  if (scoredChunks.length === 0) {
    console.log("⚠️ [BRAIN RETRIEVAL] No highly relevant chunks found, trying fallback...");
    const fallbackChunks = allChunks
      .map((chunk) => ({
        ...chunk,
        _score: scoreChunkByTokens(chunk, queryTokens),
        _topicMatch: false,
      }))
      .filter((chunk) => chunk._score >= 0.15)
      .sort((a, b) => b._score - a._score)
      .slice(0, Math.min(topK, 2));

    console.log(`🔄 [BRAIN RETRIEVAL] Fallback found ${fallbackChunks.length} chunks`);

    if (fallbackChunks.length > 0) {
      return fallbackChunks.map((chunk) => ({
        fileId: chunk.file_id,
        fileName: chunk.file_name,
        text: String(chunk.text || "").slice(0, BRAIN_MAX_TEXT_CHARS),
        score: chunk._score,
        topicMatch: chunk._topicMatch || false,
        chunkIndex: chunk.chunk_index,
        topic: chunk.topic || "general",
        topicHeader: chunk.topic_header || "",
      }));
    }
  }

  const result = scoredChunks.map((chunk) => ({
    fileId: chunk.file_id,
    fileName: chunk.file_name,
    text: String(chunk.text || "").slice(0, BRAIN_MAX_TEXT_CHARS),
    score: chunk._score,
    topicMatch: chunk._topicMatch || false,
    chunkIndex: chunk.chunk_index,
    detectedTopics: chunk._detectedTopics,
    topic: chunk.topic || "general",
    topicHeader: chunk.topic_header || "",
  }));

  console.log(`✅ [BRAIN RETRIEVAL] Returning ${result.length} chunks\n`);
  return result;
}

// =============================================
// 4. CONTEXT PRIORITY SYSTEM
// =============================================

function getPriorityPolicy() {
  return {
    order: [
      "1_questionnaire_profile",
      "2_brain_files_relevant",
      "3_session_memory",
      "4_recent_transcripts",
    ],
    brainMinRelevance: BRAIN_MIN_RELEVANCE,
  };
}

// =============================================
// 5. FORMATTING FUNCTIONS
// =============================================

function formatQuestionnaire(profile) {
  if (!profile) {
    console.log('📋 [QUESTIONNAIRE] No profile found');
    return "";
  }

  console.log('📋 [QUESTIONNAIRE] Profile found:', {
    name: profile.name,
    role: profile.role,
    tone: profile.tone
  });

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

function formatBrainChunks(chunks) {
  if (!chunks || chunks.length === 0) {
    console.log('🧠 [BRAIN CHUNKS] No chunks to format');
    return "No relevant brain files found";
  }

  console.log(`🧠 [BRAIN CHUNKS] Formatting ${chunks.length} chunks`);
  
  return chunks
    .map(
      (item, index) => 
        `[${index + 1}] TOPIC: ${item.topic || item.detectedTopics?.join(", ") || "General"}\n` +
        `    FILE: ${item.fileName}\n` +
        `    RELEVANCE: ${(item.score * 100).toFixed(1)}%\n` +
        `    CONTENT: ${item.text}`
    )
    .join("\n\n");
}

function formatSessionMemory(memory) {
  if (!memory || memory.length === 0) {
    console.log('💾 [SESSION MEMORY] No memory found');
    return "No recent session memory";
  }

  console.log(`💾 [SESSION MEMORY] Formatting ${memory.length} memory entries`);
  
  return memory
    .map((item) => `- (${item.role}) ${item.text}`)
    .join("\n");
}

function formatTranscripts(transcripts) {
  if (!transcripts || transcripts.length === 0) {
    console.log('📝 [TRANSCRIPTS] No transcripts found');
    return "No recent transcripts";
  }

  console.log(`📝 [TRANSCRIPTS] Formatting ${transcripts.length} transcripts`);
  
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
  console.log('\n' + '='.repeat(80));
  console.log('🔨 [CONTEXT BUILDER] Building context...');
  console.log('='.repeat(80));
  console.log(`👤 User ID: ${userId}`);
  console.log(`🏠 Room ID: ${roomId}`);
  console.log(`📋 Session ID: ${sessionId}`);
  console.log(`💬 Query: "${queryText?.slice(0, 100)}..."`);

  if (!userId) {
    console.warn("⚠️ [CONTEXT BUILDER] No userId provided");
    return {
      userId: null,
      roomId,
      sessionId,
      profile: null,
      retrievedChunks: [],
      recentSummaries: [],
      recentMemory: [],
      priorityPolicy: getPriorityPolicy(),
      profileText: "",
      brainChunksText: "",
      memoryText: "",
      transcriptsText: "",
      queryText,
    };
  }

  console.log('\n📊 [CONTEXT BUILDER] Fetching data...');

  // Fetch all context data in parallel
  const [
    profile,
    recentTranscripts,
    recentMemory,
    retrievedChunks,
  ] = await Promise.all([
    (async () => {
      console.log('  🔍 Fetching profile...');
      const result = await HoloAssistQuestionnaire.findOne({ user_id: userId }).lean();
      console.log(`  ✅ Profile ${result ? 'found' : 'not found'}`);
      return result;
    })(),
    (async () => {
      console.log('  🔍 Fetching transcripts...');
      const result = userId && roomId
        ? await LiveAssist.find({ userId, roomId })
            .sort({ createdAt: -1 })
            .limit(10)
            .lean()
        : [];
      console.log(`  ✅ Found ${result.length} transcripts`);
      return result;
    })(),
    (async () => {
      console.log('  🔍 Fetching session memory...');
      const result = userId && sessionId
        ? await AssistSessionMemory.find({ user_id: userId, session_id: sessionId })
            .sort({ createdAt: -1 })
            .limit(15)
            .lean()
        : [];
      console.log(`  ✅ Found ${result.length} memory entries`);
      return result;
    })(),
    (async () => {
      console.log('  🔍 Retrieving brain chunks...');
      const result = await retrieveBrainContext(userId, queryText, BRAIN_TOP_K);
      console.log(`  ✅ Retrieved ${result.length} chunks`);
      return result;
    })(),
  ]);

  // Build the context object
  const context = {
    userId,
    roomId,
    sessionId,
    profile,
    retrievedChunks,
    recentTranscripts,
    recentMemory,
    priorityPolicy: getPriorityPolicy(),
    queryText,
    
    // Formatted texts for prompt building
    profileText: formatQuestionnaire(profile),
    brainChunksText: formatBrainChunks(retrievedChunks),
    memoryText: formatSessionMemory(recentMemory),
    transcriptsText: formatTranscripts(recentTranscripts),
  };

  console.log('\n📊 [CONTEXT BUILDER] Context Summary:');
  console.log(`  ✅ Profile: ${profile ? 'Found' : 'Not found'}`);
  console.log(`  ✅ Brain Chunks: ${retrievedChunks.length}`);
  console.log(`  ✅ Session Memory: ${recentMemory.length}`);
  console.log(`  ✅ Transcripts: ${recentTranscripts.length}`);

  // Log the actual context that will be sent to Claude
  console.log('\n📝 [CONTEXT BUILDER] Final Context Prompt Preview:');
  console.log('─'.repeat(80));
  console.log(buildContextPrompt(context).slice(0, 500) + '...');
  console.log('─'.repeat(80));

  console.log('='.repeat(80) + '\n');

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

  const prompt = `
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

POLICY NOTES:
- Always prioritize user profile for tone, goals, and communication style
- Use brain knowledge as primary source for content and expertise
- Session memory only for continuity (avoid repeating previous suggestions)
- Meeting transcripts for understanding current conversation flow
- If knowledge conflicts, user profile and brain knowledge take precedence

CURRENT QUERY: "${context.queryText || ""}"
`;

  console.log(`📝 [PROMPT BUILDER] Generated prompt with ${prompt.length} characters`);
  
  return prompt;
}

// =============================================
// 8. SAVE ASSIST MEMORY
// =============================================

export async function saveAssistMemory({
  userId,
  roomId,
  sessionId,
  role,
  text,
  sourceRefs = [],
}) {
  console.log(`💾 [SAVE MEMORY] Saving ${role} message...`);
  console.log(`  User: ${userId}`);
  console.log(`  Session: ${sessionId}`);
  console.log(`  Text: "${text?.slice(0, 50)}..."`);

  if (!userId || !sessionId || !text) {
    console.warn("⚠️ [SAVE MEMORY] Missing required fields");
    return;
  }

  try {
    const memory = await AssistSessionMemory.create({
      user_id: userId,
      room_id: roomId || "",
      session_id: sessionId,
      role,
      text,
      source_refs: sourceRefs,
    });
    console.log(`✅ [SAVE MEMORY] Saved successfully (ID: ${memory._id})`);
  } catch (error) {
    console.error("❌ [SAVE MEMORY] Error saving:", error);
  }
}

// =============================================
// 9. EXPORTS
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