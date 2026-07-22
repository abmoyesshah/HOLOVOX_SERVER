// lib/ai-assistant/context-builder.js

import HoloAssistQuestionnaire from "../../app/models/HoloAssistQuestionnaire.model.js";
import LiveAssist from "../../app/models/LiveAssist.model.js";
import BrainChunk from "../../app/models/BrainChunk.model.js";
import AssistSessionMemory from "../../app/models/AssistSessionMemory.model.js";
import Meeting from "../../app/models/Meeting.model.js";
import EnterpriseMeeting from "../../../models/enterprise/EnterpriseMeeting.model.js";
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
          content: text.slice(0, 500),
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
// 3. PARTICIPANT NAME RESOLUTION
// =============================================

async function getParticipantNameMapping(roomId) {
  console.log('📋 [PARTICIPANT MAPPING] Building participant name map...');
  console.log(`  Room ID: ${roomId}`);

  const nameMap = {};
  const userIdsToLookup = new Set();
  let meetingFound = false;

  // Step 1: Check General Meeting schema FIRST
  try {
    console.log('  🔍 Checking General Meeting schema...');
    const meeting = await Meeting.findOne({ meetingId: roomId })
      .select('participants')
      .lean();
    
    if (meeting && meeting.participants) {
      meetingFound = true;
      console.log(`  ✅ Found ${meeting.participants.length} participants in General Meeting`);
      
      meeting.participants.forEach(p => {
        if (p.userId) {
          const userId = p.userId.toString();
          const name = p.name || p.email || userId;
          nameMap[userId] = name;
          userIdsToLookup.add(userId);
          console.log(`    📌 ${userId} → ${name} (from General Meeting)`);
        }
        if (p.email) {
          nameMap[p.email] = p.name || p.email;
        }
      });
    } else {
      console.log('  ⚠️ No General Meeting found for this room');
    }
  } catch (error) {
    console.log('  ⚠️ Error fetching General Meeting:', error.message);
  }

  // Step 2: ONLY check Enterprise Meeting if NOT found in General
  if (!meetingFound) {
    console.log('  🔍 General Meeting not found, checking Enterprise Meeting schema...');
    
    try {
      const enterpriseMeeting = await EnterpriseMeeting.findOne({ meetingId: roomId })
        .lean();
      
      if (enterpriseMeeting) {
        console.log(`  ✅ Found Enterprise Meeting`);
        
        const allParticipantIds = new Set();
        
        if (enterpriseMeeting.hostUserId) {
          const hostId = enterpriseMeeting.hostUserId.toString();
          allParticipantIds.add(hostId);
          userIdsToLookup.add(hostId);
        }
        
        if (enterpriseMeeting.participantMemberIds && enterpriseMeeting.participantMemberIds.length > 0) {
          enterpriseMeeting.participantMemberIds.forEach(memberId => {
            const memberIdStr = memberId.toString();
            allParticipantIds.add(memberIdStr);
          });
        }
        
        console.log(`  📊 Found ${allParticipantIds.size} participant IDs in Enterprise Meeting`);
        
        if (allParticipantIds.size > 0) {
          const participantIds = Array.from(allParticipantIds);
          
          // Try EnterpriseProfile
          try {
            const EnterpriseProfile = (await import('../../app/models/EnterpriseProfile.model.js')).default;
            const enterpriseMembers = await EnterpriseProfile.find({
              $or: [
                { _id: { $in: participantIds } },
                { userId: { $in: participantIds } }
              ]
            }).select('userId name email _id').lean();
            
            enterpriseMembers.forEach(member => {
              if (member._id) {
                const memberId = member._id.toString();
                const name = member.name || member.email || memberId;
                nameMap[memberId] = name;
                console.log(`    📌 ${memberId} → ${name} (from EnterpriseProfile)`);
              }
              if (member.userId) {
                const userId = member.userId.toString();
                const name = member.name || member.email || userId;
                nameMap[userId] = name;
                userIdsToLookup.add(userId);
                console.log(`    📌 ${userId} → ${name} (from EnterpriseProfile)`);
              }
              if (member.email) {
                nameMap[member.email] = member.name || member.email;
              }
            });
          } catch (error) {
            console.log('  ⚠️ Could not fetch EnterpriseProfile names:', error.message);
          }
          
          // Try Profile
          try {
            const Profile = (await import('../../app/models/Profile.model.js')).default;
            const normalUsers = await Profile.find({
              _id: { $in: participantIds }
            }).select('name email _id').lean();
            
            normalUsers.forEach(user => {
              const userId = user._id.toString();
              const name = user.name || user.email || userId;
              nameMap[userId] = name;
              userIdsToLookup.add(userId);
              console.log(`    📌 ${userId} → ${name} (from Profile)`);
              if (user.email) {
                nameMap[user.email] = user.name || user.email;
              }
            });
          } catch (error) {
            console.log('  ⚠️ Could not fetch Profile names:', error.message);
          }
        }
      } else {
        console.log('  ⚠️ No Enterprise Meeting found for this room');
      }
    } catch (error) {
      console.log('  ⚠️ Error fetching Enterprise Meeting:', error.message);
    }
  } else {
    console.log('  ✅ Using General Meeting data (skipping Enterprise Meeting check)');
  }

  // Step 3: Fallback - Use LiveAssist transcripts
  if (Object.keys(nameMap).length === 0) {
    console.log('  🔍 No names from meetings, falling back to transcripts...');
    try {
      const participants = await LiveAssist.aggregate([
        { $match: { roomId } },
        { $group: { 
          _id: "$participantId", 
          name: { $first: "$participantName" },
          count: { $sum: 1 }
        }}
      ]);
      
      participants.forEach(p => {
        const userId = p._id;
        const name = p.name || userId;
        nameMap[userId] = name;
        console.log(`    📌 ${userId} → ${name} (from transcripts)`);
      });
    } catch (error) {
      console.log('  ⚠️ Error fetching from transcripts:', error.message);
    }
  }

  console.log(`  📊 Final name map:`, Object.keys(nameMap).length, 'entries');
  
  if (Object.keys(nameMap).length > 0) {
    console.log(`  👥 Participant list:`);
    Object.entries(nameMap).forEach(([id, name]) => {
      console.log(`    ${id} → ${name}`);
    });
  }
  
  return nameMap;
}

/**
 * Identify who the question is directed to - IMPROVED
 */
async function identifyTargetUser(queryText, roomId, currentUserId) {
  console.log('🎯 [TARGET IDENTIFICATION] Identifying who should answer...');
  console.log(`  Query: "${queryText}"`);
  console.log(`  Current User ID: ${currentUserId}`);

  // Get participant name mapping
  const nameMap = await getParticipantNameMapping(roomId);
  console.log(`  📊 Participants found:`, Object.keys(nameMap).length);

  if (Object.keys(nameMap).length > 0) {
    console.log(`  👥 Participant list:`);
    Object.entries(nameMap).forEach(([id, name]) => {
      console.log(`    ${id} → ${name}`);
    });
  }

  const queryLower = queryText.toLowerCase();

  // PRIORITY 1: Check for name mentions
  for (const [userId, userName] of Object.entries(nameMap)) {
    if (!userName || userName === userId) continue;
    if (userId === currentUserId) continue;
    
    const nameLower = userName.toLowerCase();
    const firstName = nameLower.split(' ')[0];
    
    const patterns = [
      `mr. ${nameLower}`, `mr ${nameLower}`,
      `mrs. ${nameLower}`, `mrs ${nameLower}`,
      `ms. ${nameLower}`, `ms ${nameLower}`,
      `dr. ${nameLower}`, `dr ${nameLower}`,
      `prof. ${nameLower}`, `prof ${nameLower}`,
      `sir ${nameLower}`, `madam ${nameLower}`,
      ` ${firstName} `, ` ${firstName},`, ` ${firstName}.`,
      ` ${firstName}?`, ` ${firstName}!`,
      `${firstName}?`, `${firstName}!`,
      ` ${nameLower} `, ` ${nameLower},`, ` ${nameLower}.`,
      ` ${nameLower}?`, ` ${nameLower}!`,
      `${nameLower}?`, `${nameLower}!`,
      `^${firstName}`, `^${nameLower}`,
    ];
    
    for (const pattern of patterns) {
      if (queryLower.includes(pattern) || queryLower.match(new RegExp(pattern, 'i'))) {
        console.log(`  ✅ Target identified: "${userName}" (ID: ${userId}) via name mention`);
        return userId;
      }
    }
    
    if (queryLower.includes(nameLower) || queryLower.includes(firstName)) {
      console.log(`  ✅ Target identified: "${userName}" (ID: ${userId}) via name mention`);
      return userId;
    }
  }

  // PRIORITY 2: Check if it's a question directed to anyone
  const questionPatterns = [
    /can you/i, /do you/i, /could you/i, /would you/i,
    /are you/i, /tell me/i, /explain/i, /what do you/i,
    /how do you/i, /where do you/i, /when do you/i,
    /why do you/i, /who are you/i, /can anyone/i,
    /does anyone/i, /is there anyone/i,
  ];

  const isDirectQuestion = questionPatterns.some(pattern => pattern.test(queryText));

  if (isDirectQuestion) {
    console.log('  🔍 Direct question detected, finding the most relevant speaker...');

    // Get the most recent speaker (excluding current user)
    const recentTranscripts = await LiveAssist.find({
      roomId,
      participantId: { $ne: currentUserId }
    })
      .sort({ createdAt: -1 })
      .limit(3)
      .lean();

    if (recentTranscripts.length > 0) {
      const targetId = recentTranscripts[0].participantId;
      const targetName = nameMap[targetId] || targetId;
      console.log(`  ✅ Target identified as most recent other speaker: ${targetName} (${targetId})`);
      return targetId;
    }
    
    // If no recent speaker, find any participant with chunks
    const usersWithChunks = await BrainChunk.distinct('user_id');
    const availableTargets = Object.keys(nameMap).filter(id => 
      usersWithChunks.includes(id) && id !== currentUserId
    );
    
    if (availableTargets.length > 0) {
      const targetId = availableTargets[0];
      const targetName = nameMap[targetId] || targetId;
      console.log(`  ✅ Target identified as participant with chunks: ${targetName} (${targetId})`);
      return targetId;
    }
  }

  // PRIORITY 3: Check if any participant has chunks (anyone who can answer)
  const usersWithChunks = await BrainChunk.distinct('user_id');
  const availableTargets = Object.keys(nameMap).filter(id => 
    usersWithChunks.includes(id) && id !== currentUserId
  );
  
  if (availableTargets.length > 0) {
    const targetId = availableTargets[0];
    const targetName = nameMap[targetId] || targetId;
    console.log(`  ✅ Target identified as participant with knowledge: ${targetName} (${targetId})`);
    return targetId;
  }

  // PRIORITY 4: LAST RESORT - Use speaker (but only if no other option)
  console.log(`  ⚠️ No suitable target found, using speaker as last resort: ${currentUserId}`);
  return currentUserId;
}

// =============================================
// 4. RETRIEVAL - MULTI-USER
// =============================================

async function retrieveBrainContextMultiUser(userId, queryText, roomId, topK = BRAIN_TOP_K) {
  console.log('\n📚 [BRAIN RETRIEVAL] Multi-User Starting...');
  console.log(`👤 Current User (speaker): ${userId}`);
  console.log(`🔍 Query: "${queryText.slice(0, 100)}..."`);
  console.log(`📊 Top K: ${topK}`);

  if (!userId || !queryText || queryText.trim().length === 0) {
    console.log('⚠️ [BRAIN RETRIEVAL] No userId or queryText provided');
    return [];
  }

  // Step 1: Identify target user
  const targetUserId = await identifyTargetUser(queryText, roomId, userId);
  console.log(`🎯 Target User (who has knowledge): ${targetUserId}`);

  // Step 2: Get all users who have chunks
  const usersWithChunks = await BrainChunk.distinct('user_id');
  console.log(`📊 Users with chunks: ${usersWithChunks.join(', ') || 'none'}`);

  // Step 3: Build list of users to search
  let userIdsToSearch = [];

  // ALWAYS include the target user
  userIdsToSearch.push(targetUserId);

  // If target user is the speaker (last resort), include ALL users with chunks
  if (targetUserId === userId) {
    console.log(`⚠️ Using speaker as fallback, including all users with chunks...`);
    userIdsToSearch = [...userIdsToSearch, ...usersWithChunks];
  }

  // Remove duplicates
  userIdsToSearch = [...new Set(userIdsToSearch)];
  console.log(`🔍 Searching chunks from users: ${userIdsToSearch.join(', ')}`);

  // Step 4: Fetch chunks
  const allChunks = await BrainChunk.find({
    user_id: { $in: userIdsToSearch }
  })
    .sort({ updatedAt: -1 })
    .limit(BRAIN_CANDIDATE_LIMIT)
    .lean();

  console.log(`📦 Total chunks found: ${allChunks.length}`);

  if (allChunks.length === 0) {
    console.log('⚠️ [BRAIN RETRIEVAL] No chunks found for any user');
    return [];
  }

  const chunksByUser = allChunks.reduce((acc, chunk) => {
    acc[chunk.user_id] = (acc[chunk.user_id] || 0) + 1;
    return acc;
  }, {});
  console.log('📊 Chunks by user:', chunksByUser);

  // Step 5: Score and rank chunks
  const queryTokens = tokenize(queryText);
  const detectedTopics = await detectTopicsFromText(queryText);
  console.log(`🎯 Detected topics: ${detectedTopics.join(", ")}`);

  const scoredChunks = allChunks
    .map((chunk) => {
      const chunkTopics = chunk.topic_keywords || chunk.keywords || [];

      const hasTopicMatch = detectedTopics.some(topic => {
        return chunkTopics.some(keyword =>
          keyword.toLowerCase().includes(topic) ||
          topic.includes(keyword.toLowerCase())
        );
      });

      // Boost score if chunk belongs to the target user
      const userBoost = (chunk.user_id === targetUserId) ? 0.4 : 0;

      const score = hasTopicMatch
        ? 0.8 + scoreChunkByTopic(chunk, detectedTopics, queryTokens) * 0.2 + userBoost
        : scoreChunkByTopic(chunk, detectedTopics, queryTokens) + userBoost;

      return {
        ...chunk,
        _score: Math.min(score, 1.0),
        _topicMatch: hasTopicMatch,
        _detectedTopics: detectedTopics,
        _isTargetUser: chunk.user_id === targetUserId,
        _isSpeaker: chunk.user_id === userId,
      };
    })
    .filter((chunk) => chunk._score >= BRAIN_MIN_RELEVANCE)
    .sort((a, b) => {
      // Prioritize: target user's chunks, then topic match, then score
      if (a._isTargetUser && !b._isTargetUser) return -1;
      if (!a._isTargetUser && b._isTargetUser) return 1;
      return b._score - a._score;
    })
    .slice(0, topK);

  console.log(`✅ [BRAIN RETRIEVAL] ${scoredChunks.length} chunks selected`);

  scoredChunks.forEach((chunk, i) => {
    console.log(`\n  🏆 Chunk ${i + 1}:`);
    console.log(`     User: ${chunk.user_id} ${chunk._isTargetUser ? '🎯 (Target)' : ''} ${chunk._isSpeaker ? '🗣️ (Speaker)' : ''}`);
    console.log(`     Topic: ${chunk.topic || 'general'}`);
    console.log(`     Score: ${(chunk._score * 100).toFixed(1)}%`);
    console.log(`     File: ${chunk.file_name}`);
    console.log(`     Preview: ${(chunk.text || '').slice(0, 80)}...`);
  });

  if (scoredChunks.length === 0) {
    console.log("⚠️ [BRAIN RETRIEVAL] No relevant chunks found");
    return [];
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
    userId: chunk.user_id,
    isTargetUser: chunk._isTargetUser,
    isSpeaker: chunk._isSpeaker,
  }));

  console.log(`✅ [BRAIN RETRIEVAL] Returning ${result.length} chunks\n`);
  return result;
}

// =============================================
// 5. CONTEXT PRIORITY SYSTEM
// =============================================

function getPriorityPolicy() {
  return {
    order: [
      "1_target_user_questionnaire",  // Changed: Target user's profile
      "2_brain_files_relevant",       // Target user's chunks
      "3_session_memory",
      "4_recent_transcripts",
    ],
    brainMinRelevance: BRAIN_MIN_RELEVANCE,
  };
}

// =============================================
// 6. FORMATTING FUNCTIONS
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
    `=== TARGET USER PROFILE (PRIMARY CONTEXT) ===`,
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
        `[${index + 1}] USER: ${item.userId || 'unknown'} ${item.isTargetUser ? '🎯 (Target)' : ''} ${item.isSpeaker ? '🗣️ (Speaker)' : ''}\n` +
        `    TOPIC: ${item.topic || item.detectedTopics?.join(", ") || "General"}\n` +
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
// 7. MAIN CONTEXT BUILDER - UPDATED
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
  console.log(`👤 Current User (Speaker): ${userId}`);
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

  // Step 1: Identify target user FIRST
  const targetUserId = await identifyTargetUser(queryText, roomId, userId);
  console.log(`🎯 Target User ID: ${targetUserId}`);

  console.log('\n📊 [CONTEXT BUILDER] Fetching data for target user...');

  // Fetch all context data for TARGET USER
  const [
    targetProfile,
    recentTranscripts,
    recentMemory,
    retrievedChunks,
  ] = await Promise.all([
    // Fetch TARGET USER's profile (not speaker)
    (async () => {
      console.log(`  🔍 Fetching profile for target user: ${targetUserId}...`);
      const result = await HoloAssistQuestionnaire.findOne({ user_id: targetUserId }).lean();
      console.log(`  ✅ Profile ${result ? 'found' : 'not found'}`);
      return result;
    })(),
    (async () => {
      console.log('  🔍 Fetching transcripts for room...');
      const result = userId && roomId
        ? await LiveAssist.find({ roomId })
            .sort({ createdAt: -1 })
            .limit(10)
            .lean()
        : [];
      console.log(`  ✅ Found ${result.length} transcripts`);
      return result;
    })(),
    (async () => {
      console.log('  🔍 Fetching session memory for target user...');
      const result = targetUserId && sessionId
        ? await AssistSessionMemory.find({ user_id: targetUserId, session_id: sessionId })
            .sort({ createdAt: -1 })
            .limit(15)
            .lean()
        : [];
      console.log(`  ✅ Found ${result.length} memory entries`);
      return result;
    })(),
    (async () => {
      console.log('  🔍 Retrieving brain chunks for target user...');
      const result = await retrieveBrainContextMultiUser(userId, queryText, roomId, BRAIN_TOP_K);
      console.log(`  ✅ Retrieved ${result.length} chunks`);
      return result;
    })(),
  ]);

  // Build the context object
  const context = {
    userId: targetUserId, // Use TARGET user as the primary user
    speakerUserId: userId, // Keep track of who spoke
    roomId,
    sessionId,
    profile: targetProfile, // TARGET user's profile
    retrievedChunks,
    recentTranscripts,
    recentMemory,
    priorityPolicy: getPriorityPolicy(),
    queryText,

    // Formatted texts for prompt building
    profileText: formatQuestionnaire(targetProfile),
    brainChunksText: formatBrainChunks(retrievedChunks),
    memoryText: formatSessionMemory(recentMemory),
    transcriptsText: formatTranscripts(recentTranscripts),
  };

  console.log('\n📊 [CONTEXT BUILDER] Context Summary:');
  console.log(`  ✅ Target User: ${targetUserId}`);
  console.log(`  ✅ Profile: ${targetProfile ? 'Found' : 'Not found'}`);
  console.log(`  ✅ Brain Chunks: ${retrievedChunks.length}`);
  console.log(`  ✅ Session Memory: ${recentMemory.length}`);
  console.log(`  ✅ Transcripts: ${recentTranscripts.length}`);

  console.log('\n📝 [CONTEXT BUILDER] Final Context Prompt Preview:');
  console.log('─'.repeat(80));
  console.log(buildContextPrompt(context).slice(0, 500) + '...');
  console.log('─'.repeat(80));

  console.log('='.repeat(80) + '\n');

  return context;
}

// =============================================
// 8. PROMPT BUILDER - UPDATED WITH FILTERS
// =============================================

export function buildContextPrompt(context) {
  const priorityPolicy = context.priorityPolicy || getPriorityPolicy();

  const priorityOrder = (priorityPolicy.order || [])
    .map((item, index) => `${index + 1}. ${item}`)
    .join("\n");

  const prompt = `
SYSTEM CONTEXT PRIORITY (Strict Order):
${priorityOrder}

--- PRIORITY 1: TARGET USER PROFILE & COMMUNICATION STYLE ---
${context.profileText || "Not available"}

--- PRIORITY 2: RELEVANT BRAIN KNOWLEDGE ---
${context.brainChunksText || "No relevant knowledge found"}

--- PRIORITY 3: SESSION MEMORY (Continuity) ---
${context.memoryText || "No session history"}

--- PRIORITY 4: RECENT MEETING CONTEXT ---
${context.transcriptsText || "No meeting context"}

POLICY NOTES:
- ALWAYS use the target user's profile for tone, goals, and communication style
- Use brain knowledge as primary source for content and expertise
- ONLY provide answers that are directly relevant to the question
- If you don't have relevant information, say "I don't have that information" - DO NOT make up answers
- DO NOT generate generic responses like "I'm ready to assist" or "What is your goal"
- Focus on providing specific, actionable information from the brain files

CRITICAL RULES:
- Never include "I don't have" or "I cannot" type responses unless truly necessary
- Never include "I'm here to help" or similar generic statements
- If no relevant context is found, return an empty response (will be filtered out)
- ONLY respond when you have specific information from the brain files

CURRENT QUERY: "${context.queryText || ""}"
`;

  console.log(`📝 [PROMPT BUILDER] Generated prompt with ${prompt.length} characters`);

  return prompt;
}

// =============================================
// 9. SAVE ASSIST MEMORY
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
// 10. EXPORTS
// =============================================

export {
  detectTopicsFromText,
  retrieveBrainContextMultiUser,
  scoreChunkByTopic,
  scoreChunkByTokens,
  getPriorityPolicy,
  formatQuestionnaire,
  formatBrainChunks,
  identifyTargetUser,
};