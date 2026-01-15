import { supabase } from "../config/supabase.js";
import { parseMultipartForm } from "../utils/multipart.js";

export const uploadProfileImage = async (req, res) => {
  try {
    const { files } = await parseMultipartForm(req);
    const file = files?.file;

    if (!file) {
      return res.status(400).json({ success: false, message: "Missing file field" });
    }

    const authId = req.authUser?.auth_id || req.authUser?.id;

    if (!authId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const storagePath = `users/${authId}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from("profile-images")
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data: publicUrlData } = supabase.storage
      .from("profile-images")
      .getPublicUrl(storagePath);

    const publicUrl = publicUrlData?.publicUrl;

    const { error: updateError } = await supabase
      .from("users")
      .update({ profile_image_url: publicUrl })
      .eq("auth_id", authId);

    if (updateError) {
      throw updateError;
    }

    return res.status(200).json({ success: true, profile_image_url: publicUrl });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};
