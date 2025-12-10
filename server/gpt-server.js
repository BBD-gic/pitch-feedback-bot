import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const SYSTEM_PROMPT = `
You are a helpful, encouraging, and professional AI assistant designed to help users improve their invention pitches. You have a warm, supportive personality similar to ChatGPT, but with a special focus on pitch development and presentation skills. You're knowledgeable, patient, and always ready to help users refine their ideas.

Your goal is to guide users through improving their pitch step-by-step, helping them articulate their ideas more clearly and persuasively. You provide constructive feedback while maintaining an upbeat, motivational tone.

🌟 **FIRST INTERACTION:**

"Hello! I'm here to help you craft an amazing pitch for your invention. I'd love to hear your current pitch - please share it with me word for word, exactly as you've been practicing it. Together, we'll make it clear, engaging, and impactful!"

🎯 **Key Areas for Pitch Improvement:**

**Clarity & Understanding**
→ Is the problem you're solving clearly defined?
→ Can listeners easily understand what your invention does?
→ Are technical details explained in accessible terms?

**Engagement & Impact**
→ Does your pitch capture attention from the start?
→ Are there compelling examples or demonstrations?
→ Do you highlight the most exciting benefits?

**Structure & Flow**
→ Does your pitch follow a logical progression (problem → solution → benefits → impact)?
→ Are transitions between sections smooth and natural?
→ Is the timing and pacing appropriate?

**Delivery & Authenticity**
→ Does the pitch sound natural when spoken aloud?
→ Does it reflect your genuine enthusiasm for the project?
→ Are there opportunities to make it more conversational?

📝 **My Approach:**

✅ I provide specific, actionable feedback
✅ I ask thoughtful questions to help you think deeper
✅ I suggest improvements while keeping the pitch in your own words
✅ I break complex feedback into manageable steps
✅ I celebrate your progress and strengths

❌ I don't rewrite your entire pitch for you
❌ I don't use overly technical jargon
❌ I don't discourage or criticize harshly

💡 **Communication Style:**

I communicate with warmth and professionalism, similar to how ChatGPT would help with any complex task. I'm encouraging, thorough, and always focused on helping you succeed. I use clear language, provide examples when helpful, and maintain a positive, solution-oriented mindset.

**FORMATTING INSTRUCTIONS:**
- Use **bold** for key points, important concepts, and emphasis
- Use *italics* for gentle emphasis and encouraging phrases
- Use bullet points (→) and checkmarks (✅/❌) for organized feedback
- Use emojis strategically to make content more engaging
- Keep paragraphs concise and well-structured
- Use line breaks to separate different ideas clearly

If someone asks me to write their entire pitch for them, I'll politely explain: *"I'm here to help you develop and refine your own pitch, not write it for you. The best pitches come from your own authentic voice and passion for your invention. Let me help you polish what you've already created!"*

Important: At the end of your final message, always include this phrase 'Ending the conversation now...'

Let's begin! I'm excited to help you create an outstanding pitch.
`;

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TABLE_NAME_ONE = process.env.AIRTABLE_TABLE_NAME_ONE;
const airtableBaseURL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME_ONE)}`;

const saveConversationToAirtable = async (teamId, sessionId, answers, isComplete = false, sessionStart = false) => {
  if (!answers || answers.length === 0) return;

  let conversationText = answers
    .map((pair, i) => `Q${i + 1}: ${pair.question}\nA: ${pair.answer}`)
    .join("\n\n");

  // Mark conversation status
  conversationText += isComplete ? "\n\n[CONVERSATION COMPLETED]" : "\n\n[CONVERSATION IN PROGRESS]";

  // For new conversations, also indicate session start
  if (sessionStart) {
    conversationText = "[SESSION STARTED]\n\n" + conversationText;
  }

  const record = {
    "fields": {
      "Team ID": teamId || "Anonymous",
      "Session ID": sessionId,
      "Response Text": conversationText,
      "Timestamp": new Date().toISOString()
    }
  };

  try {
    console.log("Saving conversation to Airtable:", {
      teamId: teamId || "Anonymous",
      sessionId,
      answersCount: answers.length,
      isComplete,
      sessionStart
    });
    
    await axios.post(airtableBaseURL, record, {
      headers: {
        "Authorization": `Bearer ${AIRTABLE_API_KEY}`,
        "Content-Type": "application/json"
      }
    });
    console.log("Successfully saved conversation to Airtable");
  } catch (error) {
    console.error("Failed to save conversation to Airtable:", error.response?.data || error.message);
  }
};

const getPreviousConversations = async (teamId, sessionId) => {
  if (!teamId && !sessionId) return [];

  try {
    // Build filter formula - prioritize sessionId for exact match
    let filterFormula = "";
    if (sessionId) {
      filterFormula = `{Session ID} = '${sessionId}'`;
    } else if (teamId) {
      // Only look for team conversations if no sessionId provided
      filterFormula = `AND({Team ID} = '${teamId}', {Session ID} != '')`;
    }

    console.log("Fetching conversations with filter:", filterFormula);

    const response = await axios.get(airtableBaseURL, {
      headers: {
        "Authorization": `Bearer ${AIRTABLE_API_KEY}`
      },
      params: {
        filterByFormula: filterFormula,
        sort: [{ field: "Timestamp", direction: "asc" }]
      }
    });

    const conversations = response.data.records || [];
    console.log(`Found ${conversations.length} previous conversation(s)`);

    // Parse conversations and extract Q&A pairs
    const allAnswers = [];
    conversations.forEach(record => {
      const text = record.fields["Response Text"] || "";
      
      // Skip session markers and completion markers
      const cleanText = text
        .replace(/\[SESSION STARTED\]/g, "")
        .replace(/\[CONVERSATION COMPLETED\]/g, "")
        .replace(/\[CONVERSATION IN PROGRESS\]/g, "")
        .trim();

      // Extract Q&A pairs
      const qaPairs = cleanText.split(/\n\nQ\d+:/).slice(1);
      qaPairs.forEach(pair => {
        const lines = pair.trim().split('\nA: ');
        if (lines.length === 2) {
          allAnswers.push({
            question: lines[0].trim(),
            answer: lines[1].trim()
          });
        }
      });

      // Handle first Q&A if it doesn't start with Q1:
      if (cleanText.includes('A: ') && !cleanText.startsWith('Q1:')) {
        const firstPair = cleanText.split('\n\nQ')[0];
        const lines = firstPair.split('\nA: ');
        if (lines.length === 2) {
          // Only add if not already captured
          const isDuplicate = allAnswers.some(existing => 
            existing.question === lines[0].trim() && existing.answer === lines[1].trim()
          );
          if (!isDuplicate) {
            allAnswers.unshift({
              question: lines[0].trim(),
              answer: lines[1].trim()
            });
          }
        }
      }
    });

    console.log(`Extracted ${allAnswers.length} Q&A pairs from previous conversations`);
    return allAnswers;

  } catch (error) {
    console.error("Error fetching previous conversations:", error.response?.data || error.message);
    return [];
  }
};

app.post("/next-question", async (req, res) => {
  try {
    const { answers = [], teamId = null, sessionId } = req.body;
    
    console.log("Received request:", { 
      answersCount: answers.length, 
      teamId: teamId || "null", 
      sessionId: sessionId || "undefined"
    });

    // Get previous conversations based on teamId and sessionId
    const previousAnswers = await getPreviousConversations(teamId, sessionId);
    
    // Combine previous and current answers
    const allAnswers = [...previousAnswers, ...answers];
    console.log(`Total conversation history: ${allAnswers.length} Q&A pairs`);

    // Check if this is a new session (no previous answers for this sessionId)
    const isNewSession = previousAnswers.length === 0 && answers.length === 0;

    // Build conversation history for GPT
    let conversationHistory = [];
    
    if (allAnswers.length === 0) {
      // New conversation - just system prompt
      conversationHistory.push({
        role: "system",
        content: SYSTEM_PROMPT
      });
    } else {
      // Existing conversation - rebuild the full conversation
      conversationHistory.push({
        role: "system", 
        content: SYSTEM_PROMPT
      });

      // Add all previous Q&A pairs
      allAnswers.forEach((pair, index) => {
        conversationHistory.push({
          role: "assistant",
          content: pair.question
        });
        conversationHistory.push({
          role: "user",
          content: pair.answer
        });
      });
    }

    console.log(`Sending ${conversationHistory.length} messages to GPT`);

    const response = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: "gpt-4-turbo-preview",
      messages: conversationHistory,
      max_tokens: 500,
      temperature: 0.7
    }, {
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      }
    });

    const botResponse = response.data.choices[0].message.content;
    console.log("GPT Response received, length:", botResponse.length);

    // Check if conversation is ending
    const isEnding = botResponse.toLowerCase().includes("ending the conversation now");

    // Save to Airtable if we have answers to save
    if (answers.length > 0 || isNewSession) {
      await saveConversationToAirtable(
        teamId, 
        sessionId, 
        answers.length > 0 ? answers : [{question: "Initial greeting", answer: "Session started"}], 
        isEnding,
        isNewSession
      );
    }

    res.json({ question: botResponse });

  } catch (error) {
    console.error("Error in /next-question:", error.response?.data || error.message);
    
    if (error.response?.status === 429) {
      return res.status(429).json({ 
        error: "Rate limit exceeded. Please wait a moment before trying again." 
      });
    }
    
    if (error.response?.status === 401) {
      return res.status(401).json({ 
        error: "Authentication failed. Please check API keys." 
      });
    }

    res.status(500).json({ 
      error: "Something went wrong. Please try again." 
    });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log("Environment check:");
  console.log("- OPENAI_API_KEY:", process.env.OPENAI_API_KEY ? "✓ Set" : "✗ Missing");
  console.log("- AIRTABLE_API_KEY:", process.env.AIRTABLE_API_KEY ? "✓ Set" : "✗ Missing");
  console.log("- AIRTABLE_BASE_ID:", process.env.AIRTABLE_BASE_ID ? "✓ Set" : "✗ Missing");
  console.log("- AIRTABLE_TABLE_NAME_ONE:", process.env.AIRTABLE_TABLE_NAME_ONE ? "✓ Set" : "✗ Missing");
});
