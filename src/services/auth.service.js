import { supabase } from "../config/supabase.js";

// ---------------- SIGNUP ----------------
export const signup = async (email, password, username, gender) => {
  // 1. Create Supabase Auth user
  const { data: authUser, error: authError } =
    await supabase.auth.signUp({
      email,
      password,
    });

  if (authError) return { error: authError.message };

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
  const { data, error } = await supabase.auth.signInWithPassword({
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
