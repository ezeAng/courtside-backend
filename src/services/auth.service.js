import { supabaseAdmin, supabaseClient } from "../config/supabase.js";

const DEFAULT_ELO = 1000;
const MIN_ELO = 800;
const MAX_ELO = 1800;

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

const resolveSeedElo = (input) => {
  const parsed = Number.parseInt(input, 10);

  if (!Number.isInteger(parsed)) {
    return DEFAULT_ELO;
  }

  if (parsed < MIN_ELO) return MIN_ELO;
  if (parsed > MAX_ELO) return MAX_ELO;

  return parsed;
};

// ---------------- SIGNUP ----------------
export const signup = async (email, username, password, gender, seedEloInput) => {
  const normalizedEmail = normalizeIdentifier(email);
  const normalizedUsername = normalizeIdentifier(username);

  if (!normalizedEmail || !normalizedUsername || !password) {
    return { error: "Email, username, and password are required" };
  }

  const seedElo = resolveSeedElo(seedEloInput);

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
      // Leave email_confirm false to allow Supabase to send a confirmation email
      email_confirm: false,
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
        singles_elo: seedElo,
        doubles_elo: seedElo,
        overall_elo: seedElo,
        is_profile_private: false,
        share_contact_with_connections: true,
      },
    ])
    .select()
    .single();

  if (insertError) return { error: insertError.message };

  // Attempt to explicitly send a confirmation email. Wrap in a try/catch and log
  // so that any failure here does not break the signup flow.
  try {
    const { error: resendError } = await supabaseAdmin.auth.resend({
      type: "signup",
      email: normalizedEmail,
    });

    if (resendError) {
      console.error("Failed to resend confirmation email after signup:", resendError);
    }
  } catch (err) {
    console.error("Error resending confirmation email after signup:", err);
  }

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

  const authId = data?.user?.id || data?.session?.user?.id;

  if (!authId) {
    return { error: "Login failed to resolve user profile" };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("users")
    .select(
      "auth_id, username, gender, region, address, bio, profile_image_url, singles_elo, doubles_elo, overall_elo, is_profile_private, share_contact_with_connections, country_code, phone_number, contact_email, membership_tier, is_premium"
    )
    .eq("auth_id", authId)
    .single();

  if (profileError) {
    return { error: profileError.message };
  }

  if (profile) {
    profile.is_profile_private = false;
    profile.share_contact_with_connections = true;
  }

  return {
    message: "Login successful",
    session: data.session,
    profile,
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

export const resendConfirmationEmail = async (email) => {
  const normalizedEmail = normalizeIdentifier(email);

  if (!normalizedEmail) {
    return { error: "Email is required" };
  }

  const { data: existingUser, error: lookupError } = await supabaseAdmin
    .from("users")
    .select("auth_id")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (lookupError && lookupError.code !== "PGRST116") {
    return { error: lookupError.message };
  }

  if (!existingUser) {
    return { error: "User not found" };
  }

  // MUST use admin client
  const { error: resendError } = await supabaseAdmin.auth.resend({
    type: "signup",
    email: normalizedEmail,
  });

  if (resendError) {
    return { error: resendError.message };
  }

  return { message: "Confirmation email resent" };
};


export const sendPasswordResetEmail = async (identifier) => {
  const resolvedEmail = await resolveEmailForIdentifier(identifier);

  if (resolvedEmail.error) {
    return { error: resolvedEmail.error };
  }

  const redirectUrl = process.env.SUPABASE_RESET_REDIRECT_URL?.trim();

  const { error } = await supabaseClient.auth.resetPasswordForEmail(
    resolvedEmail.email,
    { redirectTo: redirectUrl }
  );


  if (error) {
    return { error: error.message };
  }

  return { message: "Password reset email sent" };
};

export const resetPassword = async (accessToken, newPassword) => {
  if (!accessToken) {
    return { error: "Missing recovery token" };
  }

  if (!newPassword) {
    return { error: "New password is required" };
  }

  // 1. Resolve user from recovery token
  const { data: userData, error: userError } =
    await supabaseAdmin.auth.getUser(accessToken);

  if (userError || !userData?.user) {
    return { error: "Invalid or expired recovery token" };
  }

  const userId = userData.user.id;

  // 2. Update password using Admin API
  const { error: updateError } =
    await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: newPassword,
    });

  if (updateError) {
    return { error: updateError.message };
  }

  return {
    message: "Password updated successfully",
  };
};
