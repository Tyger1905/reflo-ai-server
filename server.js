import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.get("/", (req, res) => {
  res.send("Reflo AI Server running");
});

app.post("/recommend-handyman", async (req, res) => {
  try {
    const { job, handymen } = req.body;

    const prompt = `
You are Reflo AI dispatcher.

Analyze this handyman job and recommend the BEST handyman.

JOB:
${JSON.stringify(job, null, 2)}

HANDYMEN:
${JSON.stringify(handymen, null, 2)}

Return ONLY valid JSON:

{
  "recommendedName": "",
  "recommendedUserId": "",
  "confidence": 0,
  "reason": ""
}
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a professional handyman dispatch AI.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
    });

    const text = completion.choices[0].message.content;

    const parsed = JSON.parse(text);

    res.json({
      success: true,
      recommendation: parsed,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Reflo AI Server running on port ${PORT}`);
});