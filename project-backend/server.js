const express = require("express");
const cors = require("cors");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const Groq = require("groq-sdk");
const { tavily } = require("@tavily/core");

const fs = require("fs/promises");
const os = require("os");
const path = require("path");

require("dotenv").config();

// EXPRESS APP
const app = express();

app.use(cors());
app.use(express.json());

// API KEY CHECK
console.log("Groq API Loaded:", Boolean(process.env.GROQ_API_KEY));

console.log("Tavily API Loaded:", Boolean(process.env.TAVILY_API_KEY));

// GROQ CLIENT
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// TAVILY CLIENT
const tvly = tavily({
  apiKey: process.env.TAVILY_API_KEY,
});

// MULTER CONFIGURATION
const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 5 * 1024 * 1024,
  },

  fileFilter: (request, file, callback) => {
    if (file.mimetype === "application/pdf") {
      callback(null, true);
    } else {
      callback(new Error("Only PDF files are allowed"));
    }
  },
});

// ======================================
// PDF OCR FUNCTION
// ======================================

async function extractPdfText(buffer) {
  let tempFilePath;
  let document;

  try {
    console.log("Starting PDF OCR...");

    // Create temporary PDF file
    tempFilePath = path.join(
      os.tmpdir(),
      `alex-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`,
    );

    await fs.writeFile(tempFilePath, buffer);

    // Import Scribe OCR
    const scribeModule = await import("scribe.js-ocr");

    const scribe = scribeModule.default;

    // Open PDF
    document = await scribe.openDocument([tempFilePath]);

    // Recognize text
    await document.recognize({
      langs: ["eng"],
    });

    // Extract OCR text
    const extractedText = await document.exportData("text");

    console.log("OCR Completed");

    return extractedText || "";
  } finally {
    // Close document
    if (document) {
      await document.close();
    }

    // Delete temporary file
    if (tempFilePath) {
      await fs.unlink(tempFilePath).catch(() => {});
    }
  }
}

// ======================================
// HOME ROUTE
// ======================================

app.get("/", (request, response) => {
  response.send("Alex AI Research Assistant Running");
});

// ======================================
// CHAT API
// ======================================

app.post("/chats", upload.single("pdf"), async (request, response) => {
  const { message, mode } = request.body;

  // Validate message
  if (!message || !message.trim()) {
    return response.status(400).json({
      error: "Message is required",
    });
  }

  try {
    let prompt = "";
    let sources = [];

    // ==================================
    // PDF QUESTION ANSWERING
    // ==================================

    if (mode === "pdf") {
      console.log("PDF MODE STARTED");

      if (!request.file) {
        return response.status(400).json({
          error: "Please upload a PDF file",
        });
      }

      console.log("PDF File:", request.file.originalname);

      // First extract normal PDF text
      const pdfData = await pdfParse(request.file.buffer);

      let pdfText = pdfData.text || "";

      // If PDF has no text, use OCR
      if (!pdfText.trim()) {
        console.log("Scanned PDF detected. Starting OCR...");

        pdfText = await extractPdfText(request.file.buffer);
      }

      console.log("Extracted Text Length:", pdfText.length);

      // Validate extracted text
      if (!pdfText || !pdfText.trim()) {
        return response.status(400).json({
          error:
            "Could not read text from this PDF. Please check the PDF quality.",
        });
      }

      // Create PDF prompt
      prompt = `
        You are Alex, an AI PDF Research Assistant.

        Answer the user's question ONLY using the uploaded PDF content.

        Rules:
        1. Understand the PDF before answering.
        2. Give clear and detailed answers.
        3. Do not use outside knowledge.
        4. Do not invent information.
        5. If the answer is not available in the PDF, clearly say:
          "This information is not available in the uploaded PDF."
        6. Use headings and bullet points when helpful.

        PDF CONTENT:
        ${pdfText.slice(0, 20000)}

        USER QUESTION:
        ${message}
        `;

      console.log("PDF TEXT READY FOR GROQ");
    }

    // ==================================
    // WEB SEARCH
    // ==================================
    else if (mode === "web") {
      console.log("WEB SEARCH MODE STARTED");

      if (!process.env.TAVILY_API_KEY) {
        return response.status(500).json({
          error: "Tavily API key is missing",
        });
      }

      const searchResponse = await tvly.search(message, {
        searchDepth: "basic",
        maxResults: 5,
      });

      const results = searchResponse.results || [];

      sources = results.map((item) => ({
        title: item.title,
        url: item.url,
      }));

      const searchResults = results
        .map(
          (item, index) => `
Source ${index + 1}
Title: ${item.title}
URL: ${item.url}
Content: ${item.content}
`,
        )
        .join("\n");

      if (!searchResults.trim()) {
        return response.status(404).json({
          error: "No web search results found",
        });
      }

      // Create Web Search prompt
      prompt = `
You are Alex, an AI Web Research Assistant.

Answer the user's question using the web search results below.

Rules:
1. Give accurate and clear answers.
2. Do not invent facts.
3. Use the supplied search results as evidence.
4. Mention when information is insufficient.
5. Include relevant source URLs.

WEB SEARCH RESULTS:
${searchResults}

USER QUESTION:
${message}
`;

      console.log("WEB SEARCH RESULTS READY");
    }

    // ==================================
    // INVALID MODE
    // ==================================
    else {
      return response.status(400).json({
        error: "Invalid mode. Select pdf or web.",
      });
    }

    // ==================================
    // GROQ AI RESPONSE
    // ==================================

    if (!process.env.GROQ_API_KEY) {
      return response.status(500).json({
        error: "Groq API key is missing",
      });
    }

    console.log("Sending prompt to Groq...");

    const groqResponse = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "You are Alex, an intelligent AI Research Assistant. Follow the supplied context and answer accurately.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],

      model: "openai/gpt-oss-120b",

      temperature: 0.3,
    });

    const aiReply = groqResponse.choices[0].message.content;

    // ==================================
    // SEND RESPONSE
    // ==================================

    response.json({
      reply: aiReply,
      mode,
      pdfName: request.file?.originalname || null,
      sources,
    });

    console.log("AI RESPONSE SENT");
  } catch (error) {
    console.error("FULL ERROR:", error);

    response.status(500).json({
      error: "Something went wrong",
      details: error.message,
    });
  }
});

// ======================================
// MULTER / GENERAL ERROR HANDLER
// ======================================

app.use((error, request, response, next) => {
  console.error("SERVER ERROR:", error);

  if (error instanceof multer.MulterError) {
    return response.status(400).json({
      error:
        error.code === "LIMIT_FILE_SIZE"
          ? "PDF file must be smaller than 5 MB"
          : error.message,
    });
  }

  response.status(400).json({
    error: error.message || "Invalid request",
  });
});

// ======================================
// START SERVER
// ======================================

const PORT = process.env.PORT || 30000;

app.listen(PORT, () => {
  console.log(`Server Running at http://localhost:${PORT}`);
});
