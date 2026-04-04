import https from "https";

function httpsPost(url: string, apiKey: string, body: object): Promise<string> {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const urlObj = new URL(url);

        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": apiKey,
                "Content-Length": Buffer.byteLength(data),
            },
        };

        const req = https.request(options, (res) => {
            let result = "";
            res.on("data", (chunk) => (result += chunk));
            res.on("end", () => {
                if (res.statusCode !== 200) {
                    reject(new Error(`Gemini API error ${res.statusCode}: ${result}`));
                } else {
                    resolve(result);
                }
            });
        });

        req.on("error", reject);
        req.write(data);
        req.end();
    });
}

export async function askAgent(systemPrompt: string, userMessage: string): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set in environment variables.");

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`;

    const body = {
        system_instruction: {
            parts: [{ text: systemPrompt }],
        },
        contents: [
            {
                role: "user",
                parts: [{ text: userMessage }],
            },
        ],
        generationConfig: {
            maxOutputTokens: 4096,
            temperature: 0.3,
        },
    };

    const raw = await httpsPost(url, apiKey, body);
    const data = JSON.parse(raw);

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("No response from Gemini API.");
    return text;
}