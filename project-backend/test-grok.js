require("dotenv").config();

async function testGrok() {
  const apiKey = process.env.XAI_API_KEY?.trim();

  if (!apiKey) {
    console.log("Grok API key is missing");
    return;
  }

  try {
    const response = await fetch("https://api.x.ai/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.XAI_MODEL || "grok-4.7",
        input: "Explain React.js in two simple sentences.",
      }),
    });

    const data = await response.json();

    console.log("Status Code:", response.status);

    if (!response.ok) {
      console.log("Grok API Error:", data);
      return;
    }

    const answer = (data.output || [])
      .filter((item) => item.type === "message")
      .flatMap((item) => item.content || [])
      .filter((item) => item.type === "output_text")
      .map((item) => item.text)
      .join("\n");

    console.log("Grok Response:", answer);
  } catch (error) {
    console.log("Connection Error:", error.message);
  }
}

testGrok();
