// lib/ai-assistant/brain-chunking.service.js

import Anthropic from "@anthropic-ai/sdk";
import BrainFile from "../../models/BrainFile.model.js";
import BrainChunk from "../../models/BrainChunk.model.js";
import { getFileFromGridFS } from "../../../lib/gridfs.js";

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
// 2. FILE LOADERS WITH ENCRYPTION HANDLING
// =============================================

/**
 * Extract text from buffer based on file type
 */
async function extractTextFromBuffer(buffer, fileType, fileName) {
  if (!buffer || buffer.length === 0) return "";

  const extension = fileName.split(".").pop().toLowerCase();

  try {
    switch (extension) {
      case "pdf":
        return await extractPDFText(buffer);
      case "docx":
        return await extractDOCXText(buffer);
      case "txt":
      case "md":
      case "text":
      case "csv":
      case "json":
      case "xml":
        return buffer.toString("utf-8");
      default:
        return buffer.toString("utf-8");
    }
  } catch (error) {
    console.error(`Error extracting text from ${fileName}:`, error);
    return buffer.toString("utf-8");
  }
}

/**
 * Extract text from PDF with encryption handling
 */
async function extractPDFText(buffer) {
  // First, check if PDF is encrypted
  const isEncrypted = checkIfPDFIsEncrypted(buffer);
  if (isEncrypted) {
    console.log('⚠️ PDF appears to be encrypted. Trying to extract anyway...');
  }

  // Method 1: Try pdf-parse first (better for encrypted PDFs)
  try {
    const result = await extractPDFWithPdfParse(buffer);
    if (result && result.trim().length > 100 && !isGarbageText(result)) {
      console.log('✅ PDF extracted using pdf-parse');
      return result;
    }
  } catch (error) {
    console.log('pdf-parse extraction failed:', error.message);
  }

  // Method 2: Try pdf2json
  try {
    const result = await extractPDFWithPdf2Json(buffer);
    if (result && result.trim().length > 100 && !isGarbageText(result)) {
      console.log('✅ PDF extracted using pdf2json');
      return result;
    }
  } catch (error) {
    console.log('pdf2json extraction failed:', error.message);
  }

  // Method 3: Try simple text extraction
  try {
    const result = extractPDFTextSimple(buffer);
    if (result && result.trim().length > 100 && !isGarbageText(result)) {
      console.log('✅ PDF extracted using simple method');
      return result;
    }
  } catch (error) {
    console.log('Simple extraction failed:', error.message);
  }

  // If all methods fail, return a helpful message
  console.log('❌ All PDF extraction methods failed. The PDF may be corrupted or encrypted.');
  return "PDF content could not be extracted. Please ensure the PDF is not password protected and contains readable text.";
}

/**
 * Check if PDF is encrypted
 */
function checkIfPDFIsEncrypted(buffer) {
  const text = buffer.toString('utf-8', 0, 1000);
  // Look for encryption indicators in PDF header
  return text.includes('/Encrypt') || 
         text.includes('/Filter') && text.includes('/Standard');
}

/**
 * Check if extracted text is garbage (encrypted or corrupted)
 */
function isGarbageText(text) {
  if (!text || text.length < 50) return true;
  
  // Count printable characters
  const printable = text.match(/[a-zA-Z0-9\s.,!?;:()\-'"\n]/g) || [];
  const ratio = printable.length / text.length;
  
  // If less than 70% printable, it's likely garbage
  return ratio < 0.7;
}

/**
 * Extract using pdf-parse (best for most PDFs)
 */
async function extractPDFWithPdfParse(buffer) {
  try {
    const pdfParse = await import('pdf-parse');
    const parseFn = pdfParse.default || pdfParse;
    const data = await parseFn(buffer, {
      max: 0, // No page limit
      version: 'v1.10.100'
    });
    
    let text = data.text || "";
    
    // If text is garbage, throw error to try next method
    if (isGarbageText(text)) {
      throw new Error('Extracted text appears to be garbage/encrypted');
    }
    
    return processPDFText(text);
  } catch (error) {
    throw new Error(`pdf-parse failed: ${error.message}`);
  }
}

/**
 * Extract using pdf2json with safe decoding
 */
async function extractPDFWithPdf2Json(buffer) {
  try {
    const PDFParser = (await import('pdf2json')).default;
    const pdfParser = new PDFParser();
    
    return new Promise((resolve, reject) => {
      pdfParser.on('pdfParser_dataReady', (pdfData) => {
        try {
          let fullText = '';
          if (pdfData && pdfData.Pages) {
            for (let pageIdx = 0; pageIdx < pdfData.Pages.length; pageIdx++) {
              const page = pdfData.Pages[pageIdx];
              let pageText = '';
              
              if (page.Texts) {
                for (const textItem of page.Texts) {
                  if (textItem.R) {
                    for (const line of textItem.R) {
                      if (line.T) {
                        let decoded = '';
                        try {
                          decoded = decodeURIComponent(line.T);
                        } catch (e) {
                          decoded = line.T;
                        }
                        // Skip if decoded is garbage
                        if (!isGarbageText(decoded)) {
                          pageText += decoded + ' ';
                        }
                      }
                    }
                  }
                }
              }
              
              if (pageText.trim().length > 0) {
                fullText += `\n${pageText.trim()}\n\n`;
              }
            }
          }
          
          // If text is garbage, reject
          if (isGarbageText(fullText)) {
            reject(new Error('Extracted text appears to be garbage/encrypted'));
          }
          
          resolve(processPDFText(fullText));
        } catch (error) {
          reject(error);
        }
      });
      
      pdfParser.on('pdfParser_dataError', (error) => {
        reject(error);
      });
      
      pdfParser.parseBuffer(buffer);
    });
  } catch (error) {
    throw new Error(`pdf2json failed: ${error.message}`);
  }
}

/**
 * Simple text extraction from PDF (no dependencies)
 */
function extractPDFTextSimple(buffer) {
  const text = buffer.toString('utf-8');
  const lines = text.split('\n');
  const textLines = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip PDF binary/command lines
    if (trimmed.match(/^[0-9]+ [0-9]+ obj/) || 
        trimmed.match(/^endobj/) ||
        trimmed.match(/^stream/) ||
        trimmed.match(/^endstream/) ||
        trimmed.match(/^\/[A-Z]/) ||
        trimmed.match(/^[0-9]+ [0-9]+ [A-Z]/) ||
        trimmed.match(/^%PDF-/) ||
        trimmed.match(/^%%EOF/)) {
      continue;
    }
    
    // Try to extract text from parentheses
    const matches = trimmed.match(/\(([^)]*)\)/g);
    if (matches) {
      for (const match of matches) {
        const clean = match.slice(1, -1);
        if (clean.length > 2 && !clean.match(/^[0-9]+$/)) {
          textLines.push(clean);
        }
      }
    } else if (trimmed.length > 3 && !trimmed.match(/^[0-9]+$/)) {
      textLines.push(trimmed);
    }
  }
  
  const result = textLines.join('\n');
  
  // If result is garbage, return empty
  if (isGarbageText(result)) {
    return "";
  }
  
  return result;
}

/**
 * Process extracted PDF text to preserve structure
 */
function processPDFText(text) {
  if (!text) return "";
  
  let processed = text;
  
  // Remove garbage characters
  processed = processed.replace(/[^\x20-\x7E\n\r\t]/g, ' ');
  processed = processed.replace(/\s+/g, ' ');
  processed = processed.replace(/\n\s*\n/g, '\n\n');
  
  // Try to detect and preserve headers
  const lines = processed.split('\n');
  const processedLines = lines.map(line => {
    const trimmed = line.trim();
    
    if (trimmed.length > 0 && trimmed.length < 100) {
      // All caps headers (but skip if it's just a page number)
      if (trimmed === trimmed.toUpperCase() && trimmed.length > 3 && !trimmed.match(/^PAGE/i)) {
        return `## ${trimmed}`;
      }
      // Title case headers
      if (trimmed.match(/^[A-Z][a-z]+(\s+[A-Z][a-z]+)*$/) && !trimmed.match(/^Page/i)) {
        return `## ${trimmed}`;
      }
      // Headers ending with colon
      if (trimmed.endsWith(':') && trimmed.length > 3) {
        return `## ${trimmed}`;
      }
    }
    return line;
  });
  
  processed = processedLines.join('\n');
  processed = processed.replace(/\n{3,}/g, '\n\n');
  
  // Remove any remaining garbage
  processed = processed.replace(/[^\x20-\x7E\n\r\t]/g, ' ');
  
  return processed.trim();
}

/**
 * Extract text from DOCX using mammoth
 */
async function extractDOCXText(buffer) {
  try {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value || "";
  } catch (error) {
    console.error("DOCX extraction failed:", error);
    return buffer.toString("utf-8");
  }
}

// =============================================
// 3. TOPIC EXTRACTION (Fixed)
// =============================================

/**
 * Extract topics using AI with better error handling
 */
async function extractTopicsFromDocument(text, fileName) {
  try {
    // Clean the text before sending to AI
    const cleanText = text
      .replace(/[^\x20-\x7E\n\r\t]/g, ' ') // Remove non-printable chars
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
    
    // If text is too short or garbage, use fallback
    if (cleanText.length < 100 || isGarbageText(cleanText)) {
      console.log('Text too short or appears to be garbage, using fallback');
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
    
    // Try to extract JSON from response
    let jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        const topics = JSON.parse(jsonMatch[0]);
        // Validate topics
        if (Array.isArray(topics) && topics.length > 0 && topics[0].topic) {
          return topics;
        }
      } catch (parseError) {
        console.log('JSON parse error:', parseError.message);
      }
    }
    
    // If JSON parsing fails, try to extract topics manually
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

  // Clean the text first
  const cleanText = text.replace(/[^\x20-\x7E\n\r\t]/g, ' ');

  for (const line of cleanText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    // Skip page markers and garbage
    if (trimmed.match(/^--- PAGE \d+ ---$/i)) continue;
    if (trimmed.match(/^Page \d+$/i)) continue;
    if (trimmed.length < 3) continue;

    // Check for section breaks
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

    // Enhanced header detection
    let isHeader = false;
    let headerText = null;

    // All caps headers (but skip common words)
    if (trimmed.length > 3 && trimmed.length < 80 && 
        trimmed === trimmed.toUpperCase() && 
        trimmed.match(/^[A-Z][A-Z\s]+$/)) {
      // Skip if it's not a real header (like "NOVAGRID TECHNOLOGIES" is good)
      const commonWords = ['THE', 'AND', 'FOR', 'WITH', 'THIS', 'THAT'];
      const words = trimmed.split(/\s+/);
      const hasRealContent = words.some(w => w.length > 3 && !commonWords.includes(w));
      if (hasRealContent) {
        isHeader = true;
        headerText = trimmed;
      }
    }
    // Title case headers
    else if (trimmed.length > 3 && trimmed.length < 80 && 
             trimmed.match(/^[A-Z][a-z]+(\s+[A-Z][a-z]+)*$/) &&
             !trimmed.match(/[.!?]$/)) {
      isHeader = true;
      headerText = trimmed;
    }
    // Headers ending with colon
    else if (trimmed.endsWith(':') && trimmed.length > 3 && trimmed.length < 80) {
      isHeader = true;
      headerText = trimmed.slice(0, -1).trim();
    }

    // If we detected a header, save current topic and start new one
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

    // If we have a current topic, add content
    if (currentTopic) {
      // Clean the line
      let cleanLine = trimmed
        .replace(/^[-*+]\s+/, "")
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/\*(.+?)\*/g, "$1")
        .replace(/`(.+?)`/g, "$1")
        .replace(/\s{2,}/g, " ");
      
      // Skip page numbers and garbage
      if (!cleanLine.match(/^Page\s+\d+$/i) && cleanLine.length > 2) {
        currentContent.push(cleanLine);
      }
    }
  }

  // Save the last topic
  if (currentTopic && currentContent.length > 0) {
    topics.push({
      topic: currentTopic,
      header: currentTopic,
      keywords: extractKeywordsFromText(currentContent.join(" ")),
      summary: currentContent.slice(0, 3).join(" ").slice(0, 200),
    });
  }

  // If no topics found, try splitting by sections
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

  // If still no topics, create one generic topic
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
// 4. CHUNKING FUNCTIONS
// =============================================

function chunkByTopics(text, topics, fileName) {
  const chunks = [];
  
  if (!topics || topics.length === 0) {
    return simpleChunking(text, fileName);
  }

  // Clean text before chunking
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

/**
 * Extract content related to a specific topic
 */
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

/**
 * Split content into smaller chunks
 */
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

/**
 * Simple fallback chunking without topics
 */
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
// 5. HELPER FUNCTIONS
// =============================================

/**
 * Extract keywords from text
 */
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

/**
 * Estimate token count
 */
function estimateTokenCount(text) {
  return text.split(/\s+/).length;
}

/**
 * Detect section type
 */
function detectSectionType(text) {
  if (text.match(/^[•●○\-*]\s/)) return "list";
  if (text.match(/^\d+\.\s/)) return "list";
  if (text.match(/\|\s*---/)) return "table";
  if (text.length < 80) return "header";
  return "paragraph";
}

// =============================================
// 6. MAIN PROCESSING FUNCTION
// =============================================

export async function processBrainFile(fileBuffer, fileInfo, userId) {
  const { fileName, fileType, fileSize, gridfsFileId, bucketName } = fileInfo;
  
  try {
    console.log(`Processing file: ${fileName} for user: ${userId}`);

    // Step 1: Extract text from file
    const fullText = await extractTextFromBuffer(fileBuffer, fileType, fileName);
    
    if (!fullText || fullText.trim().length < 10) {
      throw new Error("File content is empty or too short");
    }

    // Clean the text
    const cleanText = fullText.replace(/[^\x20-\x7E\n\r\t]/g, ' ').trim();
    
    console.log(`Extracted ${cleanText.length} characters from ${fileName}`);
    
    // Debug: Show first 500 chars of extracted text
    console.log('First 300 chars of extracted text:');
    console.log('─'.repeat(40));
    console.log(cleanText.slice(0, 300));
    console.log('─'.repeat(40));

    // Step 2: Extract topics
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

    // Log topics found
    if (topics.length > 0) {
      console.log('Topics found:');
      topics.forEach((t, i) => {
        console.log(`  ${i+1}. ${t.topic} (${t.keywords?.length || 0} keywords)`);
      });
    } else {
      console.log('⚠️ No topics found, using fallback');
      topics = extractTopicsFallback(cleanText);
    }

    // Step 3: Create chunks based on topics
    const chunks = chunkByTopics(cleanText, topics, fileName);
    console.log(`Created ${chunks.length} chunks`);

    // Step 4: Delete existing chunks for this file
    await BrainChunk.deleteMany({ 
      file_id: gridfsFileId, 
      user_id: userId 
    });

    // Step 5: Save chunks to database
    const savedChunks = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      // Clean chunk text
      const cleanChunkText = chunk.text.replace(/[^\x20-\x7E]/g, ' ').trim();
      
      if (cleanChunkText.length < 10) continue; // Skip empty chunks
      
      const chunkData = {
        user_id: userId,
        file_id: gridfsFileId,
        file_name: fileName,
        chunk_index: i,
        topic: chunk.topic || "general",
        topic_header: chunk.topic_header || "General",
        topic_keywords: chunk.topic_keywords || [],
        text: cleanChunkText,
        keywords: extractKeywordsFromText(cleanChunkText),
        token_count: estimateTokenCount(cleanChunkText),
        section_type: detectSectionType(cleanChunkText),
      };

      const savedChunk = await BrainChunk.create(chunkData);
      savedChunks.push(savedChunk);
    }

    // Step 6: Update file record
    const updatedFile = await BrainFile.findOneAndUpdate(
      { _id: gridfsFileId },
      {
        ingestion_status: "ready",
        chunk_count: savedChunks.length,
        parse_chars: cleanText.length,
        last_ingested_at: new Date(),
        ingestion_error: "",
      },
      { new: true }
    );

    console.log(`✅ Successfully processed ${fileName}: ${savedChunks.length} chunks`);

    return {
      success: true,
      file: updatedFile,
      chunks: savedChunks,
      topicsExtracted: topics.length,
      totalChunks: savedChunks.length,
    };
  } catch (error) {
    console.error(`❌ Error processing file ${fileName}:`, error);
    
    await BrainFile.findOneAndUpdate(
      { _id: gridfsFileId },
      {
        ingestion_status: "failed",
        ingestion_error: error.message,
        last_ingested_at: new Date(),
      }
    );

    throw error;
  }
}

export async function processMultipleBrainFiles(files, userId) {
  const results = [];
  
  for (const file of files) {
    try {
      const result = await processBrainFile(file.buffer, file.info, userId);
      results.push(result);
    } catch (error) {
      results.push({
        success: false,
        file: file.info.fileName,
        error: error.message,
      });
    }
  }

  return results;
}