// lib/ai-assistant/enterprise-brain-chunking.service.js

import Anthropic from "@anthropic-ai/sdk";
import BrainTrainingFile from "../../../../../models/enterprise/BrainTrainingFile.model.js";
import EnterpriseBrainChunk from "../../../../../models/enterprise/EnterpriseBrainChunk.model.js";

const anthropic = new Anthropic({
  apiKey: process.env.CLOUDAPI,
});

// =============================================
// 1. CONFIGURATION
// =============================================

const CHUNK_CONFIG = {
  minChunkSize: 200,
  maxChunkSize: 1500,
  overlapSize: 150,
  maxTopicsPerFile: 20,
};

// =============================================
// 2. TOPIC EXTRACTION
// =============================================

/**
 * Extract topics using AI with better error handling
 */
async function extractTopicsFromDocument(text, fileName) {
  try {
    const cleanText = text
      .replace(/[^\x20-\x7E\n\r\t]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    if (cleanText.length < 100) {
      console.log('Text too short, using fallback');
      return extractTopicsFallback(text);
    }
    
    const sampleText = cleanText.length > 8000 ? cleanText.slice(0, 8000) : cleanText;

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      temperature: 0.3,
      system: `You are a document analysis system. Extract the main topics from this document.

For each topic, provide:
1. Topic name (concise, clear)
2. Topic header/title (if exists in the document)
3. Keywords related to this topic (5-10 keywords)
4. A brief summary of what this topic covers

Format your response as a JSON array with objects containing:
{
  "topic": "string",
  "header": "string", 
  "keywords": ["string"],
  "summary": "string"
}

Only include significant topics (not minor points or trivial sections).
Focus on the main subjects discussed in the document.

IMPORTANT: Return ONLY valid JSON, no other text.`,
      messages: [
        {
          role: "user",
          content: `Document: ${fileName}\n\nContent:\n${sampleText}`,
        },
      ],
    });

    const responseText = response.content?.[0]?.text || "[]";
    let jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        const topics = JSON.parse(jsonMatch[0]);
        if (Array.isArray(topics) && topics.length > 0 && topics[0].topic) {
          return topics;
        }
      } catch (parseError) {
        console.log('JSON parse error:', parseError.message);
      }
    }
    return extractTopicsFallback(text);
  } catch (error) {
    console.error("Topic extraction failed:", error);
    return extractTopicsFallback(text);
  }
}

/**
 * Fallback: Extract topics using simple heuristics
 */
function extractTopicsFallback(text) {
  const lines = text.split("\n");
  const topics = [];
  let currentTopic = null;
  let currentContent = [];

  const cleanText = text.replace(/[^\x20-\x7E\n\r\t]/g, ' ');

  for (const line of cleanText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.match(/^--- PAGE \d+ ---$/i)) continue;
    if (trimmed.match(/^Page \d+$/i)) continue;
    if (trimmed.length < 3) continue;

    if (trimmed.match(/^=+$/) || trimmed.match(/^-{3,}$/) || trimmed.match(/^\*{3,}$/)) {
      if (currentTopic && currentContent.length > 0) {
        topics.push({
          topic: currentTopic,
          header: currentTopic,
          keywords: extractKeywordsFromText(currentContent.join(" ")),
          summary: currentContent.slice(0, 3).join(" ").slice(0, 200),
        });
        currentTopic = null;
        currentContent = [];
      }
      continue;
    }

    let isHeader = false;
    let headerText = null;

    if (trimmed.length > 3 && trimmed.length < 80 && 
        trimmed === trimmed.toUpperCase() && 
        trimmed.match(/^[A-Z][A-Z\s]+$/)) {
      const commonWords = ['THE', 'AND', 'FOR', 'WITH', 'THIS', 'THAT'];
      const words = trimmed.split(/\s+/);
      const hasRealContent = words.some(w => w.length > 3 && !commonWords.includes(w));
      if (hasRealContent) {
        isHeader = true;
        headerText = trimmed;
      }
    } else if (trimmed.length > 3 && trimmed.length < 80 && 
               trimmed.match(/^[A-Z][a-z]+(\s+[A-Z][a-z]+)*$/) &&
               !trimmed.match(/[.!?]$/)) {
      isHeader = true;
      headerText = trimmed;
    } else if (trimmed.endsWith(':') && trimmed.length > 3 && trimmed.length < 80) {
      isHeader = true;
      headerText = trimmed.slice(0, -1).trim();
    }

    if (isHeader && headerText) {
      if (currentTopic && currentContent.length > 0) {
        topics.push({
          topic: currentTopic,
          header: currentTopic,
          keywords: extractKeywordsFromText(currentContent.join(" ")),
          summary: currentContent.slice(0, 3).join(" ").slice(0, 200),
        });
      }
      currentTopic = headerText;
      currentContent = [];
      continue;
    }

    if (currentTopic) {
      let cleanLine = trimmed
        .replace(/^[-*+]\s+/, "")
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/\*(.+?)\*/g, "$1")
        .replace(/`(.+?)`/g, "$1")
        .replace(/\s{2,}/g, " ");
      
      if (!cleanLine.match(/^Page\s+\d+$/i) && cleanLine.length > 2) {
        currentContent.push(cleanLine);
      }
    }
  }

  if (currentTopic && currentContent.length > 0) {
    topics.push({
      topic: currentTopic,
      header: currentTopic,
      keywords: extractKeywordsFromText(currentContent.join(" ")),
      summary: currentContent.slice(0, 3).join(" ").slice(0, 200),
    });
  }

  if (topics.length <= 1) {
    console.log("Few topics detected, trying alternative splitting...");
    const sections = cleanText.split(/\n{2,}/);
    const newTopics = [];
    
    for (const section of sections) {
      const trimmedSection = section.trim();
      if (trimmedSection.length < 50) continue;
      if (trimmedSection.match(/^--- PAGE \d+ ---$/i)) continue;
      
      const firstLines = trimmedSection.split("\n").slice(0, 5);
      let sectionHeader = null;
      
      for (const line of firstLines) {
        const clean = line.trim()
          .replace(/^#+\s+/, "")
          .replace(/^[-*+]\s+/, "")
          .replace(/:$/, "");
        
        if (clean.length > 3 && clean.length < 100 && !clean.match(/^\d+$/)) {
          sectionHeader = clean;
          break;
        }
      }
      
      if (!sectionHeader) {
        const words = trimmedSection.slice(0, 50).split(/\s+/);
        sectionHeader = words.slice(0, 4).join(" ");
        if (sectionHeader.length > 50) sectionHeader = sectionHeader.slice(0, 50);
      }
      
      const keywords = extractKeywordsFromText(trimmedSection);
      if (keywords.length > 0) {
        newTopics.push({
          topic: sectionHeader,
          header: sectionHeader,
          keywords: keywords,
          summary: trimmedSection.slice(0, 200),
        });
      }
    }
    
    if (newTopics.length > topics.length) {
      return newTopics;
    }
  }

  if (topics.length === 0) {
    topics.push({
      topic: "Document Content",
      header: "Full Document",
      keywords: extractKeywordsFromText(cleanText),
      summary: cleanText.slice(0, 200),
    });
  }

  return topics;
}

// =============================================
// 3. CHUNKING FUNCTIONS
// =============================================

function chunkByTopics(text, topics, fileName) {
  const chunks = [];
  
  if (!topics || topics.length === 0) {
    return simpleChunking(text, fileName);
  }

  const cleanText = text.replace(/[^\x20-\x7E\n\r\t]/g, ' ');

  for (const topic of topics) {
    const topicContent = extractContentForTopic(cleanText, topic);
    
    if (topicContent && topicContent.length > CHUNK_CONFIG.minChunkSize) {
      const subChunks = splitContent(topicContent, topic);
      chunks.push(...subChunks);
    }
  }

  if (chunks.length === 0) {
    console.log("No topic-specific chunks created, using simple chunking");
    return simpleChunking(cleanText, fileName);
  }

  return chunks;
}

function extractContentForTopic(text, topic) {
  const lines = text.split("\n");
  const relevantLines = [];
  let foundTopic = false;
  let collectedLines = 0;
  const maxLines = 100;

  const searchTerms = [
    topic.topic,
    topic.header,
    ...(topic.keywords || []),
  ].filter(term => term && term.length > 2);

  for (const line of lines) {
    const trimmed = line.trim().toLowerCase();
    if (!trimmed) continue;
    
    const isRelevant = searchTerms.some(term => 
      trimmed.includes(term.toLowerCase())
    );

    if (isRelevant && !foundTopic) {
      foundTopic = true;
      relevantLines.push(line);
      continue;
    }

    if (foundTopic) {
      const isNewTopic = /^[A-Z][A-Z\s]+$|^[#\d]+\.\s*[A-Z]/.test(line.trim());
      if (isNewTopic && collectedLines > 5) {
        break;
      }
      relevantLines.push(line);
      collectedLines++;
      if (collectedLines > maxLines) break;
    }
  }

  if (relevantLines.length < 3) {
    for (const line of lines) {
      const trimmed = line.trim().toLowerCase();
      if (searchTerms.some(term => trimmed.includes(term))) {
        relevantLines.push(line);
        if (relevantLines.length > 20) break;
      }
    }
  }

  return relevantLines.join("\n");
}

function splitContent(content, topic) {
  const chunks = [];
  const paragraphs = content.split("\n\n");
  let currentChunk = "";
  let chunkIndex = 0;

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;

    if (currentChunk.length + trimmed.length > CHUNK_CONFIG.maxChunkSize && currentChunk.length > 0) {
      chunks.push({
        topic: topic.topic || "general",
        topic_header: topic.header || topic.topic,
        topic_keywords: topic.keywords || [],
        text: currentChunk.trim(),
        chunk_index: chunkIndex++,
      });
      currentChunk = "";
    }

    if (trimmed.length > CHUNK_CONFIG.maxChunkSize) {
      const sentences = trimmed.match(/[^.!?]+[.!?]+/g) || [trimmed];
      for (const sentence of sentences) {
        if (currentChunk.length + sentence.length > CHUNK_CONFIG.maxChunkSize) {
          if (currentChunk.length > 0) {
            chunks.push({
              topic: topic.topic || "general",
              topic_header: topic.header || topic.topic,
              topic_keywords: topic.keywords || [],
              text: currentChunk.trim(),
              chunk_index: chunkIndex++,
            });
            currentChunk = "";
          }
          chunks.push({
            topic: topic.topic || "general",
            topic_header: topic.header || topic.topic,
            topic_keywords: topic.keywords || [],
            text: sentence.trim(),
            chunk_index: chunkIndex++,
          });
        } else {
          currentChunk += " " + sentence;
        }
      }
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + trimmed;
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push({
      topic: topic.topic || "general",
      topic_header: topic.header || topic.topic,
      topic_keywords: topic.keywords || [],
      text: currentChunk.trim(),
      chunk_index: chunkIndex,
    });
  }

  return chunks;
}

function simpleChunking(text, fileName) {
  const chunks = [];
  const cleanText = text.replace(/[^\x20-\x7E\n\r\t]/g, ' ');
  const paragraphs = cleanText.split("\n\n");
  let currentChunk = "";
  let index = 0;

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;

    if (currentChunk.length + trimmed.length > CHUNK_CONFIG.maxChunkSize && currentChunk.length > 0) {
      chunks.push({
        topic: "general",
        topic_header: "General Content",
        topic_keywords: [],
        text: currentChunk.trim(),
        chunk_index: index++,
      });
      currentChunk = "";
    }
    currentChunk += (currentChunk ? "\n\n" : "") + trimmed;
  }

  if (currentChunk.trim().length > 0) {
    chunks.push({
      topic: "general",
      topic_header: "General Content",
      topic_keywords: [],
      text: currentChunk.trim(),
      chunk_index: index,
    });
  }

  return chunks;
}

// =============================================
// 4. HELPER FUNCTIONS
// =============================================

function extractKeywordsFromText(text) {
  const cleanText = text.replace(/[^\w\s]/g, ' ').toLowerCase();
  const words = cleanText
    .split(/\s+/)
    .filter(word => word.length > 3);

  const frequency = {};
  for (const word of words) {
    frequency[word] = (frequency[word] || 0) + 1;
  }

  const stopwords = new Set([
    "the", "and", "for", "are", "but", "not", "you", "all",
    "can", "have", "this", "that", "with", "from", "they",
    "your", "what", "when", "will", "more", "some", "then",
    "these", "those", "which", "about", "into", "than",
  ]);

  return Object.entries(frequency)
    .filter(([word]) => word.length > 3 && !stopwords.has(word))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);
}

function estimateTokenCount(text) {
  return text.split(/\s+/).length;
}

function detectSectionType(text) {
  if (text.match(/^[•●○\-*]\s/)) return "list";
  if (text.match(/^\d+\.\s/)) return "list";
  if (text.match(/\|\s*---/)) return "table";
  if (text.length < 80) return "header";
  return "paragraph";
}

// =============================================
// 5. MAIN PROCESSING FUNCTION
// =============================================

/**
 * Process an enterprise brain training file using existing extractedText
 */
export async function processEnterpriseBrainFile(fileDoc) {
  const { 
    _id: fileId, 
    organizationId, 
    originalName: fileName, 
    category, 
    extractedText 
  } = fileDoc;
  
  try {
    console.log(`🏢 Processing enterprise brain file: ${fileName} for organization: ${organizationId}`);
    console.log(`📂 Category: ${category}`);
    console.log(`📄 Extracted text length: ${extractedText?.length || 0} characters`);

    if (!extractedText || extractedText.trim().length < 10) {
      throw new Error("Extracted text is empty or too short");
    }

    const cleanText = extractedText.replace(/[^\x20-\x7E\n\r\t]/g, ' ').trim();

    // Step 1: Extract topics
    let topics = [];
    try {
      topics = await extractTopicsFromDocument(cleanText, fileName);
      console.log(`Extracted ${topics.length} topics using AI`);
    } catch (error) {
      console.warn("AI topic extraction failed, using fallback:", error);
      topics = extractTopicsFallback(cleanText);
      console.log(`Extracted ${topics.length} topics using fallback`);
    }

    // Filter out page number topics
    topics = topics.filter(t => 
      !t.topic.match(/^PAGE \d+$/i) && 
      !t.topic.match(/^--- PAGE \d+ ---$/i)
    );

    if (topics.length > 0) {
      console.log('Topics found:');
      topics.forEach((t, i) => {
        console.log(`  ${i+1}. ${t.topic} (${t.keywords?.length || 0} keywords)`);
      });
    } else {
      console.log('⚠️ No topics found, using fallback');
      topics = extractTopicsFallback(cleanText);
    }

    // Step 2: Create chunks based on topics
    const chunks = chunkByTopics(cleanText, topics, fileName);
    console.log(`Created ${chunks.length} chunks`);

    // Step 3: Delete existing chunks for this file
    await EnterpriseBrainChunk.deleteMany({ 
      fileId: fileId, 
      organizationId: organizationId 
    });

    // Step 4: Save chunks to database with category
    const savedChunks = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const cleanChunkText = chunk.text.replace(/[^\x20-\x7E]/g, ' ').trim();
      
      if (cleanChunkText.length < 10) continue;
      
      const chunkData = {
        organizationId: organizationId,
        fileId: fileId,
        file_name: fileName,
        chunk_index: i,
        category: category,
        topic: chunk.topic || "general",
        topic_header: chunk.topic_header || "General",
        topic_keywords: chunk.topic_keywords || [],
        text: cleanChunkText,
        keywords: extractKeywordsFromText(cleanChunkText),
        token_count: estimateTokenCount(cleanChunkText),
        section_type: detectSectionType(cleanChunkText),
      };

      const savedChunk = await EnterpriseBrainChunk.create(chunkData);
      savedChunks.push(savedChunk);
    }

    console.log(`✅ Successfully processed ${fileName}: ${savedChunks.length} chunks saved with category: ${category}`);

    return {
      success: true,
      fileId: fileId,
      chunks: savedChunks,
      topicsExtracted: topics.length,
      totalChunks: savedChunks.length,
      category: category,
    };
  } catch (error) {
    console.error(`❌ Error processing enterprise file ${fileName}:`, error);
    throw error;
  }
}

/**
 * Process multiple enterprise brain files
 */
export async function processMultipleEnterpriseBrainFiles(fileDocs) {
  const results = [];
  
  for (const fileDoc of fileDocs) {
    try {
      const result = await processEnterpriseBrainFile(fileDoc);
      results.push(result);
    } catch (error) {
      results.push({
        success: false,
        file: fileDoc.originalName,
        error: error.message,
      });
    }
  }

  return results;
}

/**
 * Retrieve enterprise brain chunks by category and organization
 */
export async function retrieveEnterpriseBrainContext(organizationId, category, queryText, topK = 4) {
  console.log(`📚 [ENTERPRISE RETRIEVAL] Fetching chunks for org: ${organizationId}, category: ${category}`);
  
  if (!organizationId || !category || !queryText) {
    return [];
  }

  const queryTokens = queryText.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  
  const allChunks = await EnterpriseBrainChunk.find({
    organizationId: organizationId,
    category: category,
  })
    .sort({ createdAt: -1 })
    .limit(500)
    .lean();

  if (allChunks.length === 0) {
    console.log(`No chunks found for category: ${category}`);
    return [];
  }

  // Score chunks based on keyword overlap
  const scoredChunks = allChunks
    .map((chunk) => {
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
      };
    })
    .filter((chunk) => chunk._score >= 0.15)
    .sort((a, b) => b._score - a._score)
    .slice(0, topK);

  console.log(`✅ Found ${scoredChunks.length} relevant chunks for category: ${category}`);

  return scoredChunks.map((chunk) => ({
    fileId: chunk.fileId,
    fileName: chunk.file_name,
    category: chunk.category,
    topic: chunk.topic,
    topicHeader: chunk.topic_header,
    text: String(chunk.text || "").slice(0, 1000),
    score: chunk._score,
    keywords: chunk.keywords,
  }));
}

/**
 * Retrieve enterprise brain chunks by multiple categories
 */
export async function retrieveEnterpriseBrainContextMultiCategory(organizationId, categories, queryText, topK = 4) {
  console.log(`📚 [ENTERPRISE RETRIEVAL] Fetching chunks for org: ${organizationId}, categories: ${categories.join(', ')}`);
  
  if (!organizationId || !categories || categories.length === 0 || !queryText) {
    return [];
  }

  const queryTokens = queryText.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  
  const allChunks = await EnterpriseBrainChunk.find({
    organizationId: organizationId,
    category: { $in: categories },
  })
    .sort({ createdAt: -1 })
    .limit(500)
    .lean();

  if (allChunks.length === 0) {
    console.log(`No chunks found for categories: ${categories.join(', ')}`);
    return [];
  }

  // Score chunks based on keyword overlap
  const scoredChunks = allChunks
    .map((chunk) => {
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
      };
    })
    .filter((chunk) => chunk._score >= 0.15)
    .sort((a, b) => b._score - a._score)
    .slice(0, topK);

  console.log(`✅ Found ${scoredChunks.length} relevant chunks across categories`);

  return scoredChunks.map((chunk) => ({
    fileId: chunk.fileId,
    fileName: chunk.file_name,
    category: chunk.category,
    topic: chunk.topic,
    topicHeader: chunk.topic_header,
    text: String(chunk.text || "").slice(0, 1000),
    score: chunk._score,
    keywords: chunk.keywords,
  }));
}

export {
  extractTopicsFromDocument,
  chunkByTopics,
  extractKeywordsFromText,
};