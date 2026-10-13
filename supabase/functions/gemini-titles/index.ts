// Supabase Edge Function: gemini-titles
// POST { "youtubeUrl": string } -> { "titles": string | null }
// Asks Gemini to list every movie title mentioned, shown, or discussed
// in a YouTube video. Titles are returned as a single newline-joined
// string (or null). Failures always return 200 { "titles": null }.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent";

const PROMPT =
  "List every movie title mentioned, shown, or discussed in this video. " +
  "Return only the titles, one per line, with year in parentheses when stated. " +
  "If no movies appear, reply with exactly: NONE";

const UPSTREAM_TIMEOUT_MS = 30_000;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function validYoutubeUrl(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.startsWith("http");
}

async function extractTitles(apiKey: string, youtubeUrl: string): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: PROMPT },
              { fileData: { fileUri: youtubeUrl } },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return null;
    const text = parts
      .map((p) => (typeof p?.text === "string" ? p.text : ""))
      .join("")
      .trim();
    if (text === "" || text.toUpperCase() === "NONE") return null;
    const titles = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "" && line.toUpperCase() !== "NONE");
    return titles.length > 0 ? titles.join("\n") : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ titles: null });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ titles: null });
  }

  const youtubeUrl = (body as { youtubeUrl?: unknown } | null)?.youtubeUrl;
  if (!validYoutubeUrl(youtubeUrl)) {
    return jsonResponse({ titles: null });
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
  if (apiKey === "") {
    return jsonResponse({ titles: null });
  }

  const titles = await extractTitles(apiKey, youtubeUrl);
  return jsonResponse({ titles });
});
