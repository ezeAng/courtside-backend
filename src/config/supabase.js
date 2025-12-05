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

export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
export const supabaseAuth = supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : supabase;
