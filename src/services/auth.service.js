import { supabase, supabaseAuth } from "../config/supabase.js";

// ---------------- SIGNUP ----------------
export const signup = async (email, password, username, gender) => {
  // Ensure the username is available before creating the auth user
  const { data: existingUsername, error: usernameError } = await supabase
    .from("users")
    .select("username")
    .eq("username", username)
    .maybeSingle();

  if (usernameError && usernameError.code !== "PGRST116")
    return { error: usernameError.message };

  if (existingUsername) {
    return { error: "Username already taken" };
  }

  // 1. Create Supabase Auth user without requiring email confirmation
  const { data: authUser, error: authError } =
    await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username, gender },
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

  // 2. Insert into your own "users" table
  const { data: userRow, error: insertError } = await supabase
    .from("users")
    .insert([
      {
        auth_id,
        username,
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
export const login = async (email, password) => {
  const { data, error } = await supabaseAuth.auth.signInWithPassword({
    email,
    password,
  });

  if (error) return { error: error.message };

  return {
    message: "Login successful",
    session: data.session,
  };
};

export const checkUsername = async (username) => {
  const { data, error } = await supabase
    .from("users")
    .select("username")
    .eq("username", username)
    .single();

  if (error && error.code === "PGRST116") {
    // No rows found → available
    return { available: true };
  }

  if (data) {
    return { available: false };
  }

  return { error: "Unexpected error checking username" };
};
