// Supabase Edge Function: delete-account
//
// Deletes the authenticated caller's account and all of their data:
// their watchlist rows, push token, queued videos and feedback, then
// the auth user itself. The caller is identified ONLY by the
// Authorization Bearer token — never by a user id from the request
// body — so a caller can only ever delete their own account.
//
// Order matters: the data rows go first, the auth user last. If any
// row delete fails, the auth user is left alone (HTTP 500) so the
// user can retry. If the user delete fails after the rows are gone,
// the retry is safe — the row deletes are idempotent no-ops.
//
// Never throws: every failure path returns a JSON error response.
//
// Env: SUPABASE_URL + SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY
// (all built-in function secrets — no new secret needed).

// @ts-ignore - Deno-only specifier; the app's tsc cannot resolve `npm:` imports.
// eslint-disable-next-line import/no-unresolved -- Deno resolves `npm:` at runtime.
import { createClient } from "npm:@supabase/supabase-js@2";

// Keeps the app's `tsc --noEmit` (which type-checks **/*.ts) at its
// pre-existing baseline; Deno provides the real global at runtime.
declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Promise<Response> | Response): void;
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Tables holding this user's data, in delete order. Every one has a
// user_id column.
const USER_TABLES = ["user_movies", "push_tokens", "fetch_queue", "feedback"];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function run(req: Request): Promise<Response> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !anonKey || !serviceKey) {
    console.error("delete-account: missing SUPABASE_URL, SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY");
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }

  // Authenticate the caller from the Bearer token. No user id is ever
  // read from the request body.
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return jsonResponse({ error: "Missing authorization token" }, 401);
  }
  const anonClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await anonClient.auth.getUser(token);
  const userId = userData?.user?.id;
  if (userError || !userId) {
    return jsonResponse({ error: "Invalid authorization token" }, 401);
  }

  const sb = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // Data rows first: any failure stops here and the auth user stays,
  // so the user can retry.
  for (const table of USER_TABLES) {
    const { error } = await sb.from(table).delete().eq("user_id", userId);
    if (error) {
      console.error(`delete-account: delete from ${table} failed: ${error.message}`);
      return jsonResponse({ error: `Failed to delete data from ${table}` }, 500);
    }
  }

  // Auth user last. A retry after this point is safe: the row deletes
  // above are no-ops when the rows are already gone.
  const { error: deleteError } = await sb.auth.admin.deleteUser(userId);
  if (deleteError) {
    console.error(`delete-account: deleteUser failed: ${deleteError.message}`);
    return jsonResponse({ error: "Failed to delete account" }, 500);
  }

  return jsonResponse({ deleted: true });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  try {
    return await run(req);
  } catch (e) {
    console.error(`delete-account: unexpected error: ${e instanceof Error ? e.message : e}`);
    return jsonResponse({ error: "Failed to delete account" }, 500);
  }
});
