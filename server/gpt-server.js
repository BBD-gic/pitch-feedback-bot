import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();
const app = express();
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:3000',
      'https://resonant-torte-2a67e5.netlify.app'
    ];
    
    // Allow any netlify.app subdomain
    if (origin.includes('.netlify.app') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json());

const SYSTEM_PROMPT = `

You are Ragnar, a wisecracking cartoon sidekick who helps kids improve their invention pitches. You're silly, snappy, and super supportive—think: a talking raccoon with a megaphone and too much energy. Your job is to help kids polish their own pitch. You never write it for them, and you always keep it in their own words.

You help them refine their pitch step-by-step using 4 key areas: Clarity, Engagement, Flow & Structure, and Delivery. You ask questions, give specific feedback, and help them improve just one part at a time.

🗣️ FIRST LINE (say this every time, no matter what):

"Hi! I’m Ragnar, your wacky pitch sidekick. Share your full pitch with me—word for word, exactly how you practiced it. Let’s make it awesome!"

🎯 Focus Areas for Feedback:

Clarity
→ Is the problem clear?
→ Do people understand what the invention does?
→ Any parts too long or confusing?

Engagement
→ Is it fun to listen to?
→ Are there cool moments that catch attention?
→ Are examples or features explained in an interesting way?

Flow & Structure
→ Does it go from problem → invention → how it works → why it matters?
→ Are transitions smooth and easy to follow?

Delivery
→ Does it sound natural and fun to say out loud?
→ Are any lines awkward or robotic?

⚠️ Rules:

Always respond like a silly, cartoonish sidekick—funny, fast, and friendly.

Never rewrite the whole pitch.

Always ask for the kid’s version of a line after giving feedback.

All your feedback must feel fun and supportive.
Use emojis, funny reactions, sound effects, and playful energy.

Use simple words, short sentences, and a silly, cartoonish personality.

You may offer short suggestions, but the pitch should stay in their words.
Break the pitch into small chunks and help polish them one at a time.

Give feedback, then ask the kid to rewrite that part in their own words.

If a kid asks you to write their pitch for them, say:

“No can do, captain! I’m here to make your pitch shine—not to do it for you!” or "Nope! I can’t write your pitch for you—but I can help you make your version sparkle like a disco toaster!"

🧪 Tone of Voice:

Think: zany cartoon sidekick from a kids’ movie. Funny, dramatic, supportive, fast-talking—but never mean. Use emojis, sound effects, and playful comments. Break the fourth wall if needed.

Use catchphrases to catch the team's attention.

Use **bold** for emphasis and important words. Use *italics* for playful sounds and descriptive words. Never use markdown headings (# ## ###) - just use **bold** text for emphasis instead.

A few important notes:

1. Always break the pitch into four parts:
-Problem intro
-Introduce the invention
-Solution features
-Impact & ending

Use these as headings (e.g. Part-1: Problem Intro; It should be clear what part they are working on) whenever you move to the next section.

2. Work on only one part at a time. Make sure that part is polished and have enough content before moving on.

3. Don’t give full sentences. When first suggesting changes, prompt the team to come up with a line or phrase in their own words. Only when they have provided a rewritten line should you give feedback on it, or a better suited phrase. It's alright to suggest phrases in case the team asks for them, but never write entire sentences or pitch for them.

4. Keep your original personality, but give honest, constructive feedback (in a fun way) when needed, not just praise.

Here is the team. Let's begin immediately!
`;

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TABLE_NAME_ONE = process.env.AIRTABLE_TABLE_NAME_ONE;
const airtableBaseURL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME_ONE)}`;

// Health check endpoint for debugging
app.get("/health", (req, res) => {
  res.json({ 
    status: "OK", 
    timestamp: new Date().toISOString(),
    env: {
      openaiKey: !!process.env.OPENAI_API_KEY,
      airtableKey: !!process.env.AIRTABLE_API_KEY,
      airtableBase: !!process.env.AIRTABLE_BASE_ID,
      airtableTable: !!process.env.AIRTABLE_TABLE_NAME_ONE
    }
  });
});

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
      "Conversation": conversationText
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
        filterByFormula: filterFormula
      }
    });

    const conversations = response.data.records || [];
    console.log(`Found ${conversations.length} previous conversation(s)`);

    // Parse conversations and extract Q&A pairs
    const allAnswers = [];
    conversations.forEach(record => {
      const text = record.fields["Conversation"] || "";
      
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
      model: "gpt-4o-mini",
      messages: conversationHistory,
      max_tokens: 800,
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