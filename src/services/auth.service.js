import { supabaseAdmin, supabaseClient } from "../config/supabase.js";

const normalizeIdentifier = (value) => value?.trim().toLowerCase();

const resolveEmailForIdentifier = async (identifier) => {
  const normalized = normalizeIdentifier(identifier);

  if (!normalized) {
    return { error: "Email or username is required" };
  }

  if (normalized.includes("@")) {
    return { email: normalized };
  }

  const { data, error } = await supabaseAdmin
    .from("users")
    .select("email")
    .eq("username", normalized)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    return { error: error.message };
  }

  if (!data?.email) {
    return { error: "Username not found" };
  }

  return { email: data.email };
};

// ---------------- SIGNUP ----------------
export const signup = async (email, username, password, gender) => {
  const normalizedEmail = normalizeIdentifier(email);
  const normalizedUsername = normalizeIdentifier(username);

  if (!normalizedEmail || !normalizedUsername || !password) {
    return { error: "Email, username, and password are required" };
  }

  const { data: existingUsername, error: usernameError } = await supabaseAdmin
    .from("users")
    .select("username")
    .eq("username", normalizedUsername)
    .maybeSingle();

  if (usernameError && usernameError.code !== "PGRST116") {
    return { error: usernameError.message };
  }

  if (existingUsername) {
    return { error: "Username already taken" };
  }

  const { data: authUser, error: authError } =
    await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: { username: normalizedUsername, gender },
    });

  if (authError) {
    if (authError.message?.toLowerCase().includes("user not allowed")) {
      return {
        error:
          "Signup requires the Supabase service role key. Verify SUPABASE_SERVICE_ROLE_KEY is configured on the server.",
      };
    }

    return { error: authError.message };
  }

  const auth_id = authUser.user?.id;

  const { data: userRow, error: insertError } = await supabaseAdmin
    .from("users")
    .insert([
      {
        auth_id,
        email: normalizedEmail,
        username: normalizedUsername,
        gender,
      },
    ])
    .select()
    .single();

  if (insertError) return { error: insertError.message };

  return {
    message: "Signup successful",
    user: userRow,
  };
};

// ---------------- LOGIN ----------------
export const login = async (identifier, password) => {
  if (!password) {
    return { error: "Password is required" };
  }

  const resolvedEmail = await resolveEmailForIdentifier(identifier);
  if (resolvedEmail.error) {
    return { error: resolvedEmail.error };
  }

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: resolvedEmail.email,
    password,
  });

  if (error) return { error: error.message };

  return {
    message: "Login successful",
    session: data.session,
  };
};

export const checkUsername = async (username) => {
  const normalizedUsername = normalizeIdentifier(username);

  if (!normalizedUsername) {
    return { error: "Username is required" };
  }

  const { data, error } = await supabaseAdmin
    .from("users")
    .select("username")
    .eq("username", normalizedUsername)
    .single();

  if (error && error.code === "PGRST116") {
    return { available: true };
  }

  if (data) {
    return { available: false };
  }

  return { error: "Unexpected error checking username" };
};
