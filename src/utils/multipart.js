export const parseMultipartForm = (req) => {
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
      const fields = {};
      const files = {};
      let offset = buffer.indexOf(boundaryBuffer);

      while (offset !== -1) {
        offset += boundaryBuffer.length;

        if (buffer.slice(offset, offset + 2).toString() === "--") {
          break;
        }

        if (buffer.slice(offset, offset + 2).toString() === "\r\n") {
          offset += 2;
        }

        const headerEnd = buffer.indexOf(Buffer.from("\r\n\r\n"), offset);
        if (headerEnd === -1) {
          break;
        }

        const headersText = buffer.slice(offset, headerEnd).toString("utf8");
        const dispositionMatch =
          /name="([^"]+)"(?:; filename="([^"]+)")?/i.exec(headersText);
        const contentTypeMatch = /Content-Type: ([^\r\n]+)/i.exec(headersText);

        if (!dispositionMatch) {
          offset = buffer.indexOf(boundaryBuffer, headerEnd + 4);
          continue;
        }

        const fieldName = dispositionMatch[1];
        const filename = dispositionMatch[2];
        const bodyStart = headerEnd + 4;
        const nextBoundaryIndex = buffer.indexOf(boundaryBuffer, bodyStart);
        const bodyEnd =
          nextBoundaryIndex !== -1 ? nextBoundaryIndex - 2 : buffer.length - 2;
        const body = buffer.slice(bodyStart, bodyEnd);

        if (filename) {
          files[fieldName] = {
            fieldName,
            originalname: filename,
            mimetype: contentTypeMatch ? contentTypeMatch[1] : "application/octet-stream",
            buffer: body,
          };
        } else {
          fields[fieldName] = body.toString("utf8");
        }

        offset = nextBoundaryIndex;
      }

      resolve({ fields, files });
    });
  });
};
