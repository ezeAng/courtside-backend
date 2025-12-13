import { supabase } from "../config/supabase.js";

const parseMultipartFile = (req) => {
  return new Promise((resolve, reject) => {
    const contentType = req.headers["content-type"] || "";
    const boundaryMatch = contentType.match(/boundary=(.*)$/);

    if (!boundaryMatch) {
      return reject(new Error("Missing multipart boundary"));
    }

    const boundary = boundaryMatch[1];
    const boundaryBuffer = Buffer.from(`--${boundary}`);
    const chunks = [];

    req.on("data", (chunk) => chunks.push(chunk));

    req.on("error", (err) => reject(err));

    req.on("end", () => {
      const buffer = Buffer.concat(chunks);

      const start = buffer.indexOf(boundaryBuffer);
      if (start === -1) {
        return reject(new Error("Invalid multipart payload"));
      }

      const headerStart = start + boundaryBuffer.length + 2; // Skip boundary + CRLF
      const headerEnd = buffer.indexOf(Buffer.from("\r\n\r\n"), headerStart);

      if (headerEnd === -1) {
        return reject(new Error("Malformed multipart payload"));
      }

      const headersText = buffer
        .slice(headerStart, headerEnd)
        .toString("utf8");

      const dispositionMatch =
        /name="([^"]+)"; filename="([^"]+)"/i.exec(headersText);
      const contentTypeMatch = /Content-Type: ([^\r\n]+)/i.exec(headersText);

      if (!dispositionMatch) {
        return reject(new Error("No file field provided"));
      }

      const fieldName = dispositionMatch[1];
      const filename = dispositionMatch[2];
      const mimetype = contentTypeMatch ? contentTypeMatch[1] : "application/octet-stream";

      const fileStart = headerEnd + 4; // Skip header + CRLF CRLF
      const nextBoundaryIndex = buffer.indexOf(boundaryBuffer, fileStart);
      const fileEnd =
        nextBoundaryIndex !== -1 ? nextBoundaryIndex - 2 : buffer.length - 2; // Trim trailing CRLF

      const fileBuffer = buffer.slice(fileStart, fileEnd);

      resolve({
        file: {
          fieldName,
          originalname: filename,
          mimetype,
          buffer: fileBuffer,
        },
      });
    });
  });
};

export const uploadProfileImage = async (req, res) => {
  try {
    const { file } = await parseMultipartFile(req);

    if (!file || file.fieldName !== "file") {
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
