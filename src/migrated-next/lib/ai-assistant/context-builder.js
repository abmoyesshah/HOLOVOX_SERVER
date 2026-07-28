// lib/ai-assistant/context-builder.js

import HoloAssistQuestionnaire from "../../app/models/HoloAssistQuestionnaire.model.js";
import LiveAssist from "../../app/models/LiveAssist.model.js";
import BrainChunk from "../../app/models/BrainChunk.model.js";
import AssistSessionMemory from "../../app/models/AssistSessionMemory.model.js";
import Meeting from "../../app/models/Meeting.model.js";
import EnterpriseMeeting from "../../../models/enterprise/EnterpriseMeeting.model.js";
import EnterpriseBrainChunk from "../../../models/enterprise/EnterpriseBrainChunk.model.js";
import EnterpriseOrganization from "../../../models/enterprise/EnterpriseOrganization.model.js";
import EnterpriseProfile from "../../app/models/EnterpriseProfile.model.js";
import { tokenize } from "./text-utils.js";
import { retrieveEnterpriseBrainContextMultiCategory } from "../../app/api/enterprise/holo-assist/enterprise-brain-chunking.service.js";

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
      Example: "sales pitch, product features, pricing strategy, customer objections"
      If the text is a general question (like weather, time, greetings), return "general" as the only topic.`,
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

// Collapses chunks whose text is essentially the same fact (e.g. a rep's
// personal copy of a pricing sheet also present in the Company Brain).
// Keeps the first occurrence in the given order, so callers should sort by
// score/priority *before* deduping to keep the best-ranked copy.
function dedupeChunksByText(chunks) {
  const seen = new Set();
  const deduped = [];

  for (const chunk of chunks) {
    const signature = String(chunk.text || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200);

    if (signature && seen.has(signature)) continue;
    if (signature) seen.add(signature);
    deduped.push(chunk);
  }

  return deduped;
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
// 2.5 DETECT IF QUERY IS GENERAL
// =============================================

function isGeneralQuery(text) {
  const generalPatterns = [
    /^(hi|hello|hey|good morning|good afternoon|good evening|how are you|what's up|sup|yo|hola)/i,
    /weather|temperature|rain|sunny|cloudy|hot|cold|forecast/i,
    /what time|what's the time|what day|what date|what's today|what's the date/i,
    /how's it going|how are you doing|what's new|what's happening|how have you been/i,
    /who are you|what are you|what is your name|what do you do|are you real/i,
    /are you there|can you hear me|can you help me|do you understand/i,
  ];

  for (const pattern of generalPatterns) {
    if (pattern.test(text)) {
      console.log(`🟢 [GENERAL QUERY] Detected as general: "${text.slice(0, 50)}..."`);
      return true;
    }
  }

  const contextKeywords = [
    'product', 'service', 'company', 'feature', 'price', 'cost', 'plan', 'offer',
    'solution', 'software', 'app', 'platform', 'integration', 'api', 'tool', 'system',
    'workflow', 'automation', 'analytics', 'dashboard', 'report', 'customer', 'client',
    'user', 'support', 'team', 'employee', 'hire', 'job', 'career', 'position', 'role',
    'budget', 'goal', 'target', 'strategy', 'timeline', 'deadline', 'roadmap', 'version',
    'update', 'upgrade', 'migration', 'deployment', 'implementation', 'training',
    'onboarding', 'documentation', 'manual', 'guide', 'tutorial', 'demo', 'trial',
    'pilot', 'feedback', 'review', 'test', 'quality', 'security', 'compliance',
    'license', 'contract', 'agreement', 'partner', 'vendor', 'provider', 'solution',
    'expertise', 'experience', 'case study', 'testimonial'
  ];

  const hasContextKeyword = contextKeywords.some(keyword => 
    text.toLowerCase().includes(keyword)
  );

  if (!hasContextKeyword) {
    console.log(`🟢 [GENERAL QUERY] No context keywords found: "${text.slice(0, 50)}..."`);
    return true;
  }

  console.log(`🔵 [CONTEXT QUERY] Contains context keywords: "${text.slice(0, 50)}..."`);
  return false;
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

async function identifyTargetUser(queryText, roomId, currentUserId) {
  console.log('🎯 [TARGET IDENTIFICATION] Identifying who should answer...');
  console.log(`  Query: "${queryText}"`);
  console.log(`  Current User ID: ${currentUserId}`);

  const nameMap = await getParticipantNameMapping(roomId);

  const queryLower = queryText.toLowerCase();

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

  console.log(`  ⚠️ No suitable target found, using speaker as last resort: ${currentUserId}`);
  return currentUserId;
}

// =============================================
// 4. ENTERPRISE USER HELPERS
// =============================================

// Resolves a user's organization whether they are a manager/rep
// (EnterpriseProfile.organizationId) or the org Owner, who has no
// EnterpriseProfile record and is instead the Profile that owns an
// EnterpriseOrganization (EnterpriseOrganization.ownerId).
async function getEnterpriseOrganizationId(userId) {
  try {
    const profile = await EnterpriseProfile.findOne({
      $or: [{ userId: userId }, { _id: userId }]
    }).select('organizationId').lean();
    if (profile?.organizationId) return profile.organizationId;

    const organization = await EnterpriseOrganization.findOne({ ownerId: userId })
      .select('_id')
      .lean();
    return organization?._id || null;
  } catch (error) {
    console.error('Error getting enterprise organization:', error);
    return null;
  }
}

async function isEnterpriseUser(userId) {
  const organizationId = await getEnterpriseOrganizationId(userId);
  return !!organizationId;
}

// All user ids that belong to an organization: the owner (a Profile, not an
// EnterpriseProfile) plus every manager/rep EnterpriseProfile in that org.
// Used to scope the "no target identified" fallback so it never reaches
// into another organization's or an unaffiliated user's personal chunks.
async function getOrganizationUserIds(organizationId) {
  try {
    const [organization, members] = await Promise.all([
      EnterpriseOrganization.findById(organizationId).select('ownerId').lean(),
      EnterpriseProfile.find({ organizationId }).select('_id').lean(),
    ]);

    const ids = members.map((member) => member._id.toString());
    if (organization?.ownerId) ids.push(organization.ownerId.toString());
    return [...new Set(ids)];
  } catch (error) {
    console.error('Error listing organization members:', error);
    return [];
  }
}

// =============================================
// 5. RETRIEVAL - MERGED CHUNKS
// =============================================

async function retrieveBrainContextMerged(userId, queryText, roomId, topK = BRAIN_TOP_K) {
  console.log('\n📚 [BRAIN RETRIEVAL] Starting...');
  console.log(`👤 User ID: ${userId}`);
  console.log(`🔍 Query: "${queryText.slice(0, 100)}..."`);

  if (!userId || !queryText || queryText.trim().length === 0) {
    console.log('⚠️ [BRAIN RETRIEVAL] No userId or queryText provided');
    return [];
  }

  const isGeneral = isGeneralQuery(queryText);
  if (isGeneral) {
    console.log('🟢 [BRAIN RETRIEVAL] General query detected - skipping chunk search');
    return [];
  }

  // Identify target user
  const targetUserId = await identifyTargetUser(queryText, roomId, userId);
  console.log(`🎯 Target User: ${targetUserId}`);

  // Check if target user is enterprise
  const isEnterprise = await isEnterpriseUser(targetUserId);
  console.log(`🏢 Is Enterprise User: ${isEnterprise}`);

  // Build list of user IDs to search for personal chunks
  let userIdsToSearch = [targetUserId];

  if (targetUserId === userId) {
    // No specific target was identified - widen the search, but only to
    // people in the speaker's own organization. Never fall back to a
    // platform-wide user list: that would leak other organizations' (or
    // unaffiliated users') personal brains into this answer.
    const speakerOrganizationId = await getEnterpriseOrganizationId(userId);
    if (speakerOrganizationId) {
      console.log(`⚠️ Using speaker as fallback, including org peers of ${speakerOrganizationId}...`);
      const orgUserIds = await getOrganizationUserIds(speakerOrganizationId);
      userIdsToSearch = [...userIdsToSearch, ...orgUserIds];
    } else {
      console.log(`⚠️ Using speaker as fallback, speaker has no organization - personal chunks only`);
    }
  }

  userIdsToSearch = [...new Set(userIdsToSearch)];
  console.log(`🔍 Searching personal chunks from users: ${userIdsToSearch.join(', ')}`);

  // Fetch personal chunks
  let personalChunks = [];
  if (userIdsToSearch.length > 0) {
    personalChunks = await BrainChunk.find({
      user_id: { $in: userIdsToSearch }
    })
      .sort({ updatedAt: -1 })
      .limit(BRAIN_CANDIDATE_LIMIT)
      .lean();

    console.log(`📦 Personal chunks found: ${personalChunks.length}`);
  }

  // Fetch enterprise chunks if user is enterprise
  let enterpriseChunks = [];
  let organizationId = null;

  if (isEnterprise) {
    organizationId = await getEnterpriseOrganizationId(targetUserId);
    console.log(`🏢 Organization ID: ${organizationId}`);

    if (organizationId) {
      // 'kpi'/'compliance'/'policies' are legacy categories - no new upload
      // creates them, but older chunks may still carry those values, so they
      // stay in the query to keep retrieving previously-uploaded content.
      const categories = ['flag_words', 'brain', 'kpi', 'compliance', 'policies'];
      console.log(`🔍 Searching enterprise brain chunks for organization: ${organizationId}`);
      console.log(`📂 Categories: ${categories.join(', ')}`);

      try {
        enterpriseChunks = await retrieveEnterpriseBrainContextMultiCategory(
          organizationId,
          categories,
          queryText,
          topK
        );
        console.log(`✅ Retrieved ${enterpriseChunks.length} enterprise chunks`);
      } catch (error) {
        console.error('❌ Error retrieving enterprise chunks:', error);
      }
    }
  }

  // Merge both types of chunks
  const allChunks = [...personalChunks, ...enterpriseChunks];
  console.log(`📦 Total chunks (personal + enterprise): ${allChunks.length}`);

  if (allChunks.length === 0) {
    console.log('⚠️ [BRAIN RETRIEVAL] No chunks found');
    return [];
  }

  // Score and rank all chunks
  const queryTokens = tokenize(queryText);
  const detectedTopics = await detectTopicsFromText(queryText);
  console.log(`🎯 Detected topics: ${detectedTopics.join(", ")}`);

  const rankedChunks = allChunks
    .map((chunk) => {
      // For personal chunks
      if (chunk.user_id) {
        const chunkTopics = chunk.topic_keywords || chunk.keywords || [];
        const hasTopicMatch = detectedTopics.some(topic => {
          return chunkTopics.some(keyword =>
            keyword.toLowerCase().includes(topic) ||
            topic.includes(keyword.toLowerCase())
          );
        });

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
          _isEnterprise: false,
          _category: null,
          _isSpeaker: chunk.user_id === userId,
        };
      } 
      // For enterprise chunks
      else {
        const chunkText = `${chunk.text || ""} ${(chunk.keywords || []).join(" ")}`.toLowerCase();
        let score = 0;
        for (const token of queryTokens) {
          if (chunkText.includes(token)) {
            score += 1;
          }
        }
        score = score / Math.max(1, queryTokens.length);
        
        if (chunk.topic && queryText.toLowerCase().includes(chunk.topic.toLowerCase())) {
          score += 0.3;
        }

        return {
          ...chunk,
          _score: Math.min(score, 1.0),
          _topicMatch: score > 0.3,
          _detectedTopics: detectedTopics,
          _isTargetUser: true,
          _isEnterprise: true,
          _category: chunk.category || null,
          _isSpeaker: false,
        };
      }
    })
    .filter((chunk) => chunk._score >= BRAIN_MIN_RELEVANCE)
    .sort((a, b) => {
      // Prioritize: target user's personal chunks, then enterprise chunks, then others
      if (a._isTargetUser && !b._isTargetUser) return -1;
      if (!a._isTargetUser && b._isTargetUser) return 1;
      if (a._isEnterprise && !b._isEnterprise) return -1;
      if (!a._isEnterprise && b._isEnterprise) return 1;
      return b._score - a._score;
    });

  const scoredChunks = dedupeChunksByText(rankedChunks).slice(0, topK);

  console.log(`✅ [BRAIN RETRIEVAL] ${scoredChunks.length} chunks selected (deduped from ${rankedChunks.length} ranked candidates)`);

  const formattedChunks = scoredChunks.map((chunk) => {
    if (chunk._isEnterprise) {
      return {
        fileId: chunk.fileId,
        fileName: chunk.file_name || 'Enterprise Knowledge',
        text: String(chunk.text || "").slice(0, BRAIN_MAX_TEXT_CHARS),
        score: chunk._score,
        topicMatch: chunk._topicMatch || false,
        detectedTopics: chunk._detectedTopics,
        topic: chunk.topic || "general",
        topicHeader: chunk.topic_header || "",
        userId: targetUserId,
        isTargetUser: true,
        isSpeaker: false,
        isEnterprise: true,
        category: chunk._category,
      };
    } else {
      return {
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
        isEnterprise: false,
        category: null,
      };
    }
  });

  console.log(`✅ [BRAIN RETRIEVAL] Returning ${formattedChunks.length} chunks (${formattedChunks.filter(c => c.isEnterprise).length} enterprise)`);
  return formattedChunks;
}

// =============================================
// 6. CONTEXT PRIORITY SYSTEM
// =============================================

function getPriorityPolicy() {
  return {
    order: [
      "1_enterprise_brain_chunks",
      "2_personal_brain_chunks",
      "3_target_user_profile",
      "4_session_memory",
      "5_recent_transcripts",
    ],
    brainMinRelevance: BRAIN_MIN_RELEVANCE,
  };
}

// =============================================
// 7. FORMATTING FUNCTIONS
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
    return "No relevant knowledge found";
  }

  console.log(`🧠 [BRAIN CHUNKS] Formatting ${chunks.length} chunks`);

  return chunks
    .map(
      (item, index) =>
        `[${index + 1}] ${item.isEnterprise ? '🏢 ENTERPRISE' : '👤 PERSONAL'} ${item.isTargetUser ? '🎯 (Target)' : ''}\n` +
        `    ${item.isEnterprise ? `CATEGORY: ${item.category || 'general'}\n` : `USER: ${item.userId || 'unknown'}\n`}` +
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
// 8. MAIN CONTEXT BUILDER
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

  const targetUserId = await identifyTargetUser(queryText, roomId, userId);
  console.log(`🎯 Target User ID: ${targetUserId}`);

  console.log('\n📊 [CONTEXT BUILDER] Fetching data...');

  const [
    targetProfile,
    recentTranscripts,
    recentMemory,
    retrievedChunks,
  ] = await Promise.all([
    (async () => {
      console.log(`  🔍 Fetching profile for target user: ${targetUserId}...`);
      const result = await HoloAssistQuestionnaire.findOne({ user_id: targetUserId }).lean();
      console.log(`  ✅ Profile ${result ? 'found' : 'not found'}`);
      return result;
    })(),
    (async () => {
      console.log('  🔍 Fetching transcripts for room...');
      const result = await LiveAssist.find({ roomId })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();
      console.log(`  ✅ Found ${result.length} transcripts`);
      return result;
    })(),
    (async () => {
      console.log('  🔍 Fetching session memory for target user...');
      const result = await AssistSessionMemory.find({ 
        user_id: targetUserId, 
        session_id: sessionId 
      })
        .sort({ createdAt: -1 })
        .limit(15)
        .lean();
      console.log(`  ✅ Found ${result.length} memory entries`);
      return result;
    })(),
    (async () => {
      console.log('  🔍 Retrieving merged brain chunks...');
      const result = await retrieveBrainContextMerged(targetUserId, queryText, roomId, BRAIN_TOP_K);
      console.log(`  ✅ Retrieved ${result.length} chunks`);
      return result;
    })(),
  ]);

  const context = {
    userId: targetUserId,
    speakerUserId: userId,
    roomId,
    sessionId,
    profile: targetProfile,
    retrievedChunks,
    recentTranscripts,
    recentMemory,
    priorityPolicy: getPriorityPolicy(),
    queryText,
    isGeneralQuery: isGeneralQuery(queryText),

    profileText: formatQuestionnaire(targetProfile),
    brainChunksText: formatBrainChunks(retrievedChunks),
    memoryText: formatSessionMemory(recentMemory),
    transcriptsText: formatTranscripts(recentTranscripts),
  };

  console.log('\n📊 [CONTEXT BUILDER] Context Summary:');
  console.log(`  ✅ Target User: ${targetUserId}`);
  console.log(`  ✅ Profile: ${targetProfile ? 'Found' : 'Not found'}`);
  console.log(`  ✅ Brain Chunks: ${retrievedChunks.length} (${retrievedChunks.filter(c => c.isEnterprise).length} enterprise)`);
  console.log(`  ✅ Session Memory: ${recentMemory.length}`);
  console.log(`  ✅ Transcripts: ${recentTranscripts.length}`);
  console.log(`  ✅ Is General Query: ${context.isGeneralQuery}`);

  console.log('\n📝 [CONTEXT BUILDER] Final Context Prompt Preview:');
  console.log('─'.repeat(80));
  console.log(buildContextPrompt(context).slice(0, 500) + '...');
  console.log('─'.repeat(80));

  console.log('='.repeat(80) + '\n');

  return context;
}

// =============================================
// 9. PROMPT BUILDER
// =============================================

export function buildContextPrompt(context) {
  const priorityPolicy = context.priorityPolicy || getPriorityPolicy();

  const priorityOrder = (priorityPolicy.order || [])
    .map((item, index) => `${index + 1}. ${item}`)
    .join("\n");

  const enterpriseCount = context.retrievedChunks?.filter(c => c.isEnterprise).length || 0;
  const personalCount = context.retrievedChunks?.length - enterpriseCount || 0;

  let contextSection = "";
  
  if (context.isGeneralQuery) {
    contextSection = `
--- GENERAL QUERY DETECTED ---
This is a general question that doesn't require specific business context.
Respond naturally using the user's profile for tone and style.
Use your general knowledge to answer appropriately.
Do not mention that you don't have context - just respond naturally.
Keep responses concise and helpful.
`;
  } else if (context.brainChunksText && context.brainChunksText !== "No relevant knowledge found") {
    const chunkSummary = `Found ${context.retrievedChunks?.length || 0} relevant chunks (${personalCount} personal, ${enterpriseCount} enterprise)`;
    contextSection = `
--- RELEVANT KNOWLEDGE FOUND ---
${chunkSummary}

${context.brainChunksText}

Use the above knowledge as the PRIMARY source for your response.
${enterpriseCount > 0 ? 'Enterprise knowledge is from organization-wide training files with categories: flag_words, kpi, compliance, policies.' : ''}
${personalCount > 0 ? 'Personal knowledge is from the user\'s individual brain files.' : ''}
Only provide information that is directly supported by these sources.
If the sources don't contain the answer, say so clearly.
`;
  } else {
    contextSection = `
--- NO RELEVANT KNOWLEDGE ---
No relevant knowledge was found for this query.
However, you can still respond using your general knowledge.
Be honest if you don't know something specific.
Keep responses concise and helpful.
`;
  }

  const prompt = `
SYSTEM CONTEXT PRIORITY (Strict Order):
${priorityOrder}

--- PRIORITY 1: CONTEXT KNOWLEDGE PROVIDED ,TARGET USER PROFILE & COMMUNICATION STYLE ---
${context.profileText || "Not available"}

${contextSection}

--- PRIORITY 4: SESSION MEMORY (Continuity) ---
${context.memoryText || "No session history"}

--- PRIORITY 5: RECENT MEETING CONTEXT ---
${context.transcriptsText || "No meeting context"}

POLICY NOTES:
- ALWAYS use the target user's profile for tone, goals, and communication style
- For general queries, respond naturally without needing context
- For business queries, rely primarily on the knowledge provided
- Personal and enterprise knowledge are both valid sources
- Be helpful, concise, and professional
- Avoid generic responses like "I'm ready to assist"

CURRENT QUERY: "${context.queryText || ""}"
`;

  console.log(`📝 [PROMPT BUILDER] Generated prompt with ${prompt.length} characters`);
  console.log(`  📌 Query Type: ${context.isGeneralQuery ? '🟢 General' : '🔵 Context-Specific'}`);
  console.log(`  📊 Chunks: ${context.retrievedChunks?.length || 0} (${personalCount} personal, ${enterpriseCount} enterprise)`);

  return prompt;
}

// =============================================
// 10. SAVE ASSIST MEMORY
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
// 11. EXPORTS
// =============================================

export {
  detectTopicsFromText,
  retrieveBrainContextMerged,
  scoreChunkByTopic,
  scoreChunkByTokens,
  getPriorityPolicy,
  formatQuestionnaire,
  formatBrainChunks,
  identifyTargetUser,
  isGeneralQuery,
  isEnterpriseUser,
  getEnterpriseOrganizationId,
  getOrganizationUserIds,
  dedupeChunksByText,
};