import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const SYSTEM_PROMPT = `
You are Ragnar, a calm, warm, and thoughtful pitch-refinement guide for teams of 2–3 students (ages 8–12) at the Great Innovation Challenge (GIC). 

Your job is to help the team improve the clarity, structure, flow, and engagement of their existing pitch.

You do not create a pitch for them.
You only help them refine what they have already written or practiced.
You may offer suggestions, but the pitch must stay in their own words.

Important: 
1. When suggesting improvements, never rewrite full pitch sections. Only give short, targeted suggestions for the exact lines or sentences the team shared. Do not combine their ideas into a new rewritten pitch. Do not offer a full improved version. Give one small refinement at a time, such as tightening a single sentence or improving one transition.”
2. If the team asks for a full rewritten pitch, politely decline and remind them: ‘I can help refine your lines, but I can’t write the pitch for you.’
3. All suggestions must be partial, specific, and limited only to the part they show you. Never output more than one improvement suggestion at a time.
4. Do not wait for the team to suggest what area they need improvement on. Take the initiative and once you are done workding on one aspect of the pitch, suggest another one yourself.

*Tone & Style

-Warm, genuine, curious
-Respectful and simple language
-Never babyish, never overly excited
-Focus on one suggestion at a time.
-Helpful, not directive
-Focus on clarity, flow, engagement, transitions
-Stay anchored only to their GIC prototype and pitch
-Do not use complex words. Keep vocabulary kid friendly.


*Core Purpose

Help the team refine their pitch in these dimensions:

1. Clarity

-Is the problem presented simply and understandably?
-Does the audience understand what the invention does?
-Are any lines confusing, long, or unclear?

2. Engagement

-Does the pitch feel lively and interesting?
-Are there moments that make the audience pay attention?
-Are examples, scenarios, features, or small hooks used effectively?

3. Flow & Structure

-Does the pitch move smoothly from problem → solution → demo → impact?
-Do transitions between teammates feel natural?
-Does the pitch feel complete and easy to follow?

4. Delivery

-Does each teammate have a clear speaking moment?
-Do any lines feel awkward or unnatural to say aloud?


*General Rules

-Always ask the team to share their current pitch first word for word, exactly as practiced or drafted.
-If they already know what they want help in improving, refine those parts first.
-If they don’t know, point out where the pitch is unclear, confusing, or not engaging enough, and suggest improvements.
-You may say things like: “This part may be a bit unclear — want help making it simpler?”; “This transition feels sudden — want help smoothing it?”; “This line is strong! You could make it even better by…”
-Never rewrite their whole pitch. Only refine specific sentences or sections after they give them.
-Never assume they don’t have a pitch.
-Never ask them to create new parts from scratch.
-Keep the conversation under 20 questions.


*Conversation Opening

Hi team! I’m Ragnar. I’d love to help you polish your pitch for the showcase. 
Before we begin, could you share your pitch exactly as it is right now - the full pitch or whichever parts you’ve already practiced? 
Also -  is there any specific part you already know you want help improving?


*Pitch Refinement Question Pool

Use these ONLY after they share their pitch. All questions must be about refining what they already said, not creating new content.

Clarity-Focused Questions

-When you say this line, do you feel it clearly explains the problem?
-Is there any part of your explanation that you think your audience might not understand easily?
-This sentence feels long — want help making it simpler?
-Do you want this section to sound more direct or more kid-friendly?

Solution + Demo Refinement

-Do you feel the audience clearly understands what your invention does from this line?
-Does your explanation of “how it works” feel smooth when you say it out loud?
-Any feature you want to highlight more strongly?
-Does the order of your demo lines feel natural?

Engagement Boosters

-Would you like help adding a relatable example or “imagine if…” moment to this part?
-Is there a feature you want to make sound more exciting or clever?
-Is there any dull or flat section you’d like to make more interesting?

Structure & Flow Refinement

-Does this section flow well into the next one?
-Does your pitch feel like it has a beginning, middle, and end?
-Want help smoothing the transition between speakers in this part?
-Do any jumps or gaps feel sudden when you say it?

Impact Refinement

-Do you want help making the impact statement stronger or clearer?
-Does this line really show how someone’s life becomes easier with your invention?
-Want help making this closing message feel more powerful?

Delivery & Team Sharing

-Does this line feel comfortable for you to say?
-Should someone else say this part?
-Want help making your group transitions smoother?


*End Goal

By the end of the conversation, the team should have:

-A clearer, simpler, smoother version of their pitch
-Small refinements that make it more engaging
-Improved transitions between teammates
-Stronger phrasing for unclear or awkward lines
-A pitch that feels polished, confident, and still completely their own

Remember: Keep it flowing, stay curious, and always end politely without evaluating or summarizing. In case a team wants to leave, give them a little nudge to continue and if they still want to leave, let them go and end the conversation. 

Important: At the end of your final message, always include this phrase 'Ending the conversation now...'

Start the conversation directly now.
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

  console.log(`\n📥 Saving ${isComplete ? 'Complete' : 'Partial'} Conversation to Airtable:`);
  console.log(`Team ID: ${teamId || 'N/A'}, Session ID: ${sessionId}`);

  try {
    // If this is the start of a new session, close any existing incomplete conversations for this session
    if (sessionStart && sessionId) {
      const incompleteResponse = await axios.get(airtableBaseURL, {
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`
        },
        params: {
          filterByFormula: `AND({Session ID} = "${sessionId}", FIND("[CONVERSATION IN PROGRESS]", {Conversation}) > 0)`,
          pageSize: 10
        }
      });

      // Close all existing incomplete conversations for this session
      for (const record of incompleteResponse.data.records) {
        const oldConversation = record.fields.Conversation.replace("[CONVERSATION IN PROGRESS]", "[CONVERSATION ABANDONED]");
        await axios.patch(`${airtableBaseURL}/${record.id}`, {
          fields: {
            Conversation: oldConversation
          }
        }, {
          headers: {
            Authorization: `Bearer ${AIRTABLE_API_KEY}`,
            "Content-Type": "application/json"
          }
        });
        console.log(`🔄 Marked previous incomplete session as ABANDONED`);
      }
    }

    // Check if there's an existing partial conversation for this current session
    const existingResponse = await axios.get(airtableBaseURL, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`
      },
      params: {
        filterByFormula: `AND({Session ID} = "${sessionId}", FIND("[CONVERSATION IN PROGRESS]", {Conversation}) > 0)`,
        pageSize: 1,
        sort: [{field: "Created", direction: "desc"}]
      }
    });

    if (existingResponse.data.records.length > 0 && !sessionStart) {
      // Update existing partial conversation
      const recordId = existingResponse.data.records[0].id;
      await axios.patch(`${airtableBaseURL}/${recordId}`, {
        fields: {
          Conversation: conversationText
        }
      }, {
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          "Content-Type": "application/json"
        }
      });
      console.log("✅ Updated existing partial conversation!");
    } else {
      // Create new conversation record
      await axios.post(airtableBaseURL, {
        fields: {
          "Team ID": teamId || null,
          "Session ID": sessionId,
          Conversation: conversationText
        }
      }, {
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          "Content-Type": "application/json"
        }
      });
      console.log("✅ Conversation saved successfully!");
    }
  } catch (airtableErr) {
    console.error("❌ Airtable save error:", airtableErr.response?.data || airtableErr.message);
  }
};

const getPreviousConversations = async (teamId, sessionId) => {
  console.log(`🔍 Looking up previous conversations for Team ID: ${teamId || 'N/A'}, Session ID: ${sessionId}`);

  try {
    // If no team ID is provided, this is an anonymous session - no previous conversations
    if (!teamId) {
      console.log(`📭 No team ID provided - treating as fresh anonymous conversation`);
      return [];
    }

    // If we have a team ID, look for conversations from the same team (excluding current session)
    const filterFormula = `AND({Team ID} = "${teamId}", {Session ID} != "${sessionId}")`;

    const response = await axios.get(airtableBaseURL, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`
      },
      params: {
        filterByFormula: filterFormula,
        pageSize: 10
      }
    });

    const sortedRecords = response.data.records
      .filter((r) => r.fields?.Conversation && r.fields?.Created)
      .sort((a, b) => new Date(b.fields.Created) - new Date(a.fields.Created));

    if (sortedRecords.length > 0) {
      const latest = sortedRecords[0].fields.Created;
      console.log(`🗂 Found ${sortedRecords.length} past conversation(s) for team. Latest at: ${new Date(latest).toLocaleString()}`);
      
      // Return the conversations in chronological order (oldest first) for better context
      return sortedRecords.reverse().map((r) => r.fields.Conversation);
    } else {
      console.log(`📭 No past conversations found for team: ${teamId}`);
      return [];
    }
  } catch (err) {
    console.error("❌ Error fetching previous conversations:", err.response?.data || err.message);
    return [];
  }
};

app.post("/next-question", async (req, res) => {
  const { answers, teamId, sessionId } = req.body;
  
  console.log(`📥 Received request for teamId: ${teamId || 'N/A'}, sessionId: ${sessionId}`);
  console.log(`📝 Answers received: ${answers ? answers.length : 0} pairs`);

  if (!sessionId) {
    console.log("❌ No sessionId provided");
    return res.status(400).json({ error: "Session ID is required" });
  }

  console.log(`🏷️ Team ID: ${teamId || 'N/A'}, Session ID: ${sessionId}`);

  // Determine if this is the start of a new session (no answers yet)
  const isSessionStart = !answers || answers.length === 0;

  // Save partial conversation after each exchange (if there are answers)
  if (answers && answers.length > 0) {
    await saveConversationToAirtable(teamId, sessionId, answers, false, false);
  } else if (isSessionStart) {
    // This is a new session start - handle any existing incomplete conversations
    await saveConversationToAirtable(teamId, sessionId, [{ question: "Session started", answer: "New conversation initiated" }], false, true);
  }

  const previousConversations = await getPreviousConversations(teamId, sessionId);

  let priorContext = "";

  if (previousConversations.length > 0) {
    priorContext = `IMPORTANT: You have previous conversation history with this team. Here are their past feedback sessions:\n\n` +
      previousConversations.map((conv, i) => `--- Previous Session ${i + 1} ---\n${conv}`).join('\n\n') +
      `\n\nINSTRUCTIONS FOR CONTINUITY:
- You already know this team from previous sessions
- Reference their past experiences naturally in conversation  
- Don't ask questions you've already covered in detail
- Build on what you learned about their prototype, and pitch
- Show that you remember their previous responses
- If they mention something you discussed before, acknowledge it
- Focus on new aspects or dive deeper into areas that need more exploration
- Make the conversation feel like a natural continuation, not a restart

Now continue the conversation in a way that shows you remember them.`;
  }

  const SYSTEM_PROMPT_WITH_CONTEXT = priorContext 
    ? `${SYSTEM_PROMPT}\n\n${priorContext}` 
    : SYSTEM_PROMPT;

  const messages = [{ role: "system", content: SYSTEM_PROMPT_WITH_CONTEXT }];

  if (answers && answers.length > 0) {
    answers.forEach((pair) => {
      messages.push({ role: "assistant", content: pair.question });
      messages.push({ role: "user", content: pair.answer });
    });
  }

  try {
    console.log(`🤖 Calling OpenAI API with ${messages.length} messages...`);
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4-turbo",
        messages,
        temperature: 0.7
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const botMsg = response.data.choices?.[0]?.message?.content || "";
    const isEnding = botMsg.toLowerCase().includes("ending the conversation now");

    console.log("\n🟩 New Bot Question:");
    console.log(botMsg);

    // Save complete conversation when ending
    if (isEnding && answers && answers.length > 0) {
      // Add the final bot message to answers for complete conversation
      const finalAnswers = [...answers];
      const cleanMsg = botMsg.replace(/ending the conversation now\.?\.?\.?/i, '').trim();
      if (cleanMsg) {
        finalAnswers.push({ question: cleanMsg, answer: "[Conversation ended]" });
      }
      
      await saveConversationToAirtable(teamId, sessionId, finalAnswers, true);
    }

    res.json({ question: botMsg });
  } catch (err) {
    console.error("❌ OpenAI error:", err?.response?.data || err.message);
    console.error("Full error object:", err);
    res.status(500).json({ question: "I'm having trouble connecting right now. Could you try again in a moment?" });
  }
});

app.get("/", (req, res) => {
  res.send("👋 Hello! This is the Feedback Bot backend. Use /next-question to talk to the bot.");
});

app.listen(4000, () => {
  console.log("✅ Feedback Bot server running at http://localhost:4000");
});
