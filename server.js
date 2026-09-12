// server.js

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import multer from "multer";

dotenv.config();

const app = express();


// =========================================================
// ENVIRONMENT
// =========================================================

const PORT =
  Number(
    process.env.PORT ||
    3001
  );


const OPENAI_API_KEY =
  process.env.OPENAI_API_KEY;


const ALLOWED_ORIGINS =
  String(
    process.env.ALLOWED_ORIGINS ||
    ""
  )
    .split(",")
    .map(
      (item) =>
        item.trim()
    )
    .filter(
      Boolean
    );


// =========================================================
// STARTUP VALIDATION
// =========================================================

if (
  !OPENAI_API_KEY
) {
  console.error(
    "ERROR: OPENAI_API_KEY is missing."
  );
}


// =========================================================
// OPENAI CLIENT
// =========================================================

const client =
  new OpenAI({
    apiKey:
      OPENAI_API_KEY,
  });


// =========================================================
// CORS
// =========================================================

app.use(
  cors({
    origin:
      (
        origin,
        callback
      ) => {
        /*
        Native iOS / Android requests
        often do not contain a browser Origin header.
        */

        if (
          !origin
        ) {
          return callback(
            null,
            true
          );
        }


        /*
        During early production rollout,
        allow all origins if no allowlist
        has been configured.
        */

        if (
          ALLOWED_ORIGINS.length ===
          0
        ) {
          return callback(
            null,
            true
          );
        }


        if (
          ALLOWED_ORIGINS.includes(
            origin
          )
        ) {
          return callback(
            null,
            true
          );
        }


        return callback(
          new Error(
            "Origin not allowed by CORS."
          )
        );
      },

    methods: [
      "GET",
      "POST",
      "OPTIONS",
    ],

    allowedHeaders: [
      "Content-Type",
      "Authorization",
    ],
  })
);


// =========================================================
// JSON BODY
// =========================================================

app.use(
  express.json({
    limit:
      "2mb",
  })
);


// =========================================================
// BASIC REQUEST LOGGING
// =========================================================

app.use(
  (
    req,
    res,
    next
  ) => {
    console.log(
      `${new Date().toISOString()} ${req.method} ${req.path}`
    );

    next();
  }
);


// =========================================================
// MULTER AUDIO UPLOAD
// =========================================================

const upload =
  multer({
    storage:
      multer.memoryStorage(),

    limits: {
      fileSize:
        20 *
        1024 *
        1024,
    },

    fileFilter:
      (
        req,
        file,
        callback
      ) => {
        const allowedMimeTypes =
          [
            "audio/m4a",
            "audio/x-m4a",
            "audio/mp4",
            "audio/mpeg",
            "audio/mp3",
            "audio/wav",
            "audio/x-wav",
            "audio/webm",
            "video/mp4",
          ];


        if (
          allowedMimeTypes.includes(
            file.mimetype
          )
        ) {
          callback(
            null,
            true
          );

          return;
        }


        callback(
          new Error(
            `Unsupported audio type: ${file.mimetype}`
          )
        );
      },
  });


// =========================================================
// HEALTH CHECK
// =========================================================

app.get(
  "/",

  (
    req,
    res
  ) => {
    res.json({
      success:
        true,

      service:
        "Koronzi AI Server",

      status:
        "running",

      timestamp:
        new Date().toISOString(),
    });
  }
);


app.get(
  "/health",

  (
    req,
    res
  ) => {
    res.json({
      success:
        true,

      status:
        "healthy",

      openaiConfigured:
        Boolean(
          OPENAI_API_KEY
        ),

      timestamp:
        new Date().toISOString(),
    });
  }
);


// =========================================================
// RECOMMEND SERVICE PROVIDER
// =========================================================

app.post(
  "/recommend-handyman",

  async (
    req,
    res
  ) => {
    try {
      if (
        !OPENAI_API_KEY
      ) {
        return res
          .status(500)
          .json({
            success:
              false,

            error:
              "AI service is not configured.",
          });
      }


      const {
        job,
        handymen,
      } =
        req.body ||
        {};


      if (
        !job
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            error:
              "Job data is required.",
          });
      }


      if (
        !Array.isArray(
          handymen
        ) ||
        handymen.length ===
          0
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            error:
              "At least one service provider is required.",
          });
      }


      const prompt = `
You are Koronzi AI dispatcher.

Analyze this service job and recommend the BEST matching service provider.

JOB:
${JSON.stringify(
  job,
  null,
  2
)}

SERVICE PROVIDERS:
${JSON.stringify(
  handymen,
  null,
  2
)}

Return ONLY valid JSON:

{
  "recommendedName": "",
  "recommendedUserId": "",
  "confidence": 0,
  "reason": ""
}
`;


      const completion =
        await client
          .chat
          .completions
          .create({
            model:
              "gpt-4.1-mini",

            messages: [
              {
                role:
                  "system",

                content:
                  "You are a professional service-provider dispatch AI for Koronzi.",
              },

              {
                role:
                  "user",

                content:
                  prompt,
              },
            ],

            temperature:
              0.3,
          });


      const responseText =
        String(
          completion
            ?.choices?.[0]
            ?.message
            ?.content ||
          ""
        ).trim();


      if (
        !responseText
      ) {
        throw new Error(
          "AI returned an empty recommendation."
        );
      }


      /*
      Remove optional markdown fences
      in case the model ever returns them.
      */

      const cleanedText =
        responseText
          .replace(
            /^```json\s*/i,
            ""
          )
          .replace(
            /^```\s*/i,
            ""
          )
          .replace(
            /```$/,
            ""
          )
          .trim();


      let parsed;


      try {
        parsed =
          JSON.parse(
            cleanedText
          );
      } catch (
        parseError
      ) {
        console.error(
          "AI JSON PARSE ERROR:",
          cleanedText
        );


        throw new Error(
          "AI recommendation was not valid JSON."
        );
      }


      return res.json({
        success:
          true,

        recommendation:
          parsed,
      });
    } catch (
      err
    ) {
      console.error(
        "RECOMMEND HANDYMAN ERROR:",
        err
      );


      return res
        .status(500)
        .json({
          success:
            false,

          error:
            err?.message ||
            "Could not generate recommendation.",
        });
    }
  }
);


// =========================================================
// AI SPEECH TO TEXT
// =========================================================

app.post(
  "/transcribe-audio",

  upload.single(
    "audio"
  ),

  async (
    req,
    res
  ) => {
    try {
      // =====================================================
      // SERVER CONFIG
      // =====================================================

      if (
        !OPENAI_API_KEY
      ) {
        return res
          .status(500)
          .json({
            success:
              false,

            error:
              "AI transcription service is not configured.",
          });
      }


      // =====================================================
      // VALIDATE AUDIO
      // =====================================================

      if (
        !req.file
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            error:
              "Audio file is required.",
          });
      }


      if (
        !req.file.buffer ||
        req.file.buffer.length ===
          0
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            error:
              "The uploaded audio file is empty.",
          });
      }


      console.log(
        "AUDIO UPLOAD:",
        {
          name:
            req.file.originalname,

          type:
            req.file.mimetype,

          bytes:
            req.file.size,
        }
      );


      // =====================================================
      // LANGUAGE
      // =====================================================

      const language =
        String(
          req.body
            ?.language ||
          ""
        ).trim();


      // =====================================================
      // BUILD FILE FOR OPENAI
      // =====================================================

      const mimeType =
        req.file.mimetype ||
        "audio/mp4";


      let fileName =
        req.file.originalname ||
        "koronzi-voice.m4a";


      /*
      Make sure uploaded file has a useful extension.
      */

      if (
        !fileName.includes(
          "."
        )
      ) {
        if (
          mimeType.includes(
            "wav"
          )
        ) {
          fileName +=
            ".wav";
        } else if (
          mimeType.includes(
            "webm"
          )
        ) {
          fileName +=
            ".webm";
        } else if (
          mimeType.includes(
            "mpeg"
          ) ||
          mimeType.includes(
            "mp3"
          )
        ) {
          fileName +=
            ".mp3";
        } else {
          fileName +=
            ".m4a";
        }
      }


      const audioFile =
        new File(
          [
            req.file.buffer,
          ],

          fileName,

          {
            type:
              mimeType,
          }
        );


      // =====================================================
      // TRANSCRIPTION OPTIONS
      // =====================================================

      const transcriptionOptions =
        {
          file:
            audioFile,

          model:
            "gpt-4o-mini-transcribe",

          prompt:
            [
              "The speaker is a Koronzi customer describing a local service job.",
              "The request may involve handyman work, plumbing, electrical work,",
              "cleaning, yard work, furniture assembly, appliance repair,",
              "renovation, maintenance, moving, auto service, real estate,",
              "mortgage, insurance, professional services, food and hospitality,",
              "or another local service.",
              "Preserve measurements, room names, addresses, locations,",
              "product names, damage descriptions, urgency, dates,",
              "and important job details.",
            ].join(
              " "
            ),
        };


      if (
        language
      ) {
        transcriptionOptions.language =
          language;
      }


      // =====================================================
      // CALL OPENAI
      // =====================================================

      const transcription =
        await client
          .audio
          .transcriptions
          .create(
            transcriptionOptions
          );


      const transcriptText =
        String(
          transcription
            ?.text ||
          ""
        ).trim();


      if (
        !transcriptText
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            error:
              "No speech was detected.",
          });
      }


      console.log(
        "TRANSCRIPTION SUCCESS:",
        {
          language:
            language ||
            "auto",

          characters:
            transcriptText.length,
        }
      );


      // =====================================================
      // SUCCESS
      // =====================================================

      return res.json({
        success:
          true,

        text:
          transcriptText,

        language:
          language ||
          null,
      });
    } catch (
      err
    ) {
      console.error(
        "TRANSCRIBE AUDIO ERROR:",
        err
      );


      /*
      Handle Multer/file problems more cleanly.
      */

      if (
        err?.code ===
        "LIMIT_FILE_SIZE"
      ) {
        return res
          .status(413)
          .json({
            success:
              false,

            error:
              "Audio file is too large.",
          });
      }


      return res
        .status(500)
        .json({
          success:
            false,

          error:
            err?.message ||
            "Could not transcribe audio.",
        });
    }
  }
);


// =========================================================
// EXPRESS ERROR HANDLER
// =========================================================

app.use(
  (
    err,
    req,
    res,
    next
  ) => {
    console.error(
      "SERVER ERROR:",
      err
    );


    if (
      err?.message?.startsWith(
        "Unsupported audio type:"
      )
    ) {
      return res
        .status(415)
        .json({
          success:
            false,

          error:
            err.message,
        });
    }


    return res
      .status(500)
      .json({
        success:
          false,

        error:
          "Internal server error.",
      });
  }
);


// =========================================================
// 404
// =========================================================

app.use(
  (
    req,
    res
  ) => {
    return res
      .status(404)
      .json({
        success:
          false,

        error:
          "Route not found.",
      });
  }
);


// =========================================================
// START SERVER
// =========================================================

app.listen(
  PORT,

  "0.0.0.0",

  () => {
    console.log(
      `Koronzi AI Server running on port ${PORT}`
    );

    console.log(
      "OpenAI configured:",
      Boolean(
        OPENAI_API_KEY
      )
    );

    console.log(
      "Allowed web origins:",
      ALLOWED_ORIGINS.length > 0
        ? ALLOWED_ORIGINS
        : "All origins"
    );
  }
);