import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error("SUPABASE_URL is not configured");
}

if (!supabaseServiceRoleKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
}

if (!supabaseAnonKey) {
  throw new Error("SUPABASE_ANON_KEY is not configured");
}

const supabaseClientOptions = {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
};

export const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseServiceRoleKey,
  supabaseClientOptions
);

export const supabaseClient = createClient(
  supabaseUrl,
  supabaseAnonKey,
  supabaseClientOptions
);

export const supabase = supabaseAdmin;

export const getSupabaseUserClient = (accessToken) =>
  createClient(supabaseUrl, supabaseAnonKey, {
    ...supabaseClientOptions,
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
