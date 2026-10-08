// Palm Crest Builders — password-gated photo uploader (serverless).
//
// The shared crew password is checked HERE, on the server, using the
// ADMIN_PASSWORD environment variable — it is never sent to the browser.
// On success the photo is committed to the repo and an entry is appended to
// palmcrestbuilders/data/gallery.json via the GitHub Contents API, using a
// fine-grained token stored in the GITHUB_TOKEN environment variable.
//
// Required Netlify environment variables:
//   ADMIN_PASSWORD  - the shared password the project manager will type
//   GITHUB_TOKEN    - fine-grained PAT with "Contents: Read and write" on the repo
// Optional overrides: GH_OWNER, GH_REPO, GH_BRANCH

const crypto = require("crypto");

const OWNER = process.env.GH_OWNER || "thehardestR";
const REPO = process.env.GH_REPO || "burbankroofing";
const BRANCH = process.env.GH_BRANCH || "main";
const IMAGES_DIR = "palmcrestbuilders/images/gallery/uploads";
const DATA_PATH = "palmcrestbuilders/data/gallery.json";
const GALLERY_HTML = "palmcrestbuilders/gallery.html";
const MAX_BASE64 = 5 * 1024 * 1024; // ~3.7MB image; well under Netlify's request limit

const VALID_SERVICES = new Set([
  "roofing", "whole-home", "kitchen", "bathroom", "room-additions", "adus",
  "new-construction", "garage-conversions", "foundation-structural",
  "decks-patios", "landscaping", "commercial", "uncategorized",
]);

function json(statusCode, obj) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) };
}

function passwordOk(supplied, actual) {
  const a = Buffer.from(String(supplied));
  const b = Buffer.from(String(actual));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function gh(path, options = {}) {
  return fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "pcb-photo-uploader",
      ...(options.headers || {}),
    },
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  const password = process.env.ADMIN_PASSWORD;
  const token = process.env.GITHUB_TOKEN;
  if (!password || !token) return json(500, { error: "Uploader not configured yet. Set ADMIN_PASSWORD and GITHUB_TOKEN in Netlify." });

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Bad request" }); }

  if (!passwordOk(body.password || "", password)) {
    await wait(500); // slow down brute-force guesses
    return json(401, { error: "Incorrect password" });
  }

  if (body.action === "verify") return json(200, { ok: true });

  // ---- delete ----
  if (body.action === "delete") {
    const rel = (typeof body.image === "string" ? body.image : "").replace(/^\/+/, "");
    // Only gallery images may be removed — blocks path traversal / arbitrary repo writes.
    if (rel.includes("..") || !/^images\/gallery\/[\w./-]+\.(jpe?g|png|webp|gif)$/i.test(rel)) {
      return json(400, { error: "Invalid image path" });
    }
    const filePath = `palmcrestbuilders/${rel}`;

    // 1) Drop the entry from gallery.json (read-modify-write, retry on write conflict).
    let removed = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      const getRes = await gh(`/repos/${OWNER}/${REPO}/contents/${DATA_PATH}?ref=${BRANCH}`);
      if (!getRes.ok) return json(502, { error: "Could not read the gallery list." });
      const meta = await getRes.json();

      let data;
      try { data = JSON.parse(Buffer.from(meta.content, "base64").toString("utf8")); }
      catch { data = { photos: [] }; }
      if (!Array.isArray(data.photos)) data.photos = [];

      const before = data.photos.length;
      data.photos = data.photos.filter((p) => String((p && p.image) || "").replace(/^\/+/, "") !== rel);
      removed = data.photos.length < before;
      if (!removed) break; // nothing matched — leave gallery.json untouched

      const newContent = Buffer.from(JSON.stringify(data, null, 2) + "\n", "utf8").toString("base64");
      const putRes = await gh(`/repos/${OWNER}/${REPO}/contents/${DATA_PATH}`, {
        method: "PUT",
        body: JSON.stringify({ message: "Remove gallery photo", content: newContent, branch: BRANCH, sha: meta.sha }),
      });
      if (putRes.ok) break;
      if (putRes.status !== 409) {
        const detail = (await putRes.text()).slice(0, 200);
        return json(502, { error: "Photo list update failed.", detail });
      }
      if (attempt === 2) return json(409, { error: "Busy — please try that again." });
      await wait(300); // someone else just wrote; refetch and retry
    }

    // 2) Delete the image file itself (ignore if it was already gone).
    const fileRes = await gh(`/repos/${OWNER}/${REPO}/contents/${filePath}?ref=${BRANCH}`);
    if (fileRes.ok) {
      const fileMeta = await fileRes.json();
      await gh(`/repos/${OWNER}/${REPO}/contents/${filePath}`, {
        method: "DELETE",
        body: JSON.stringify({ message: "Delete gallery image", sha: fileMeta.sha, branch: BRANCH }),
      });
    }

    // 3) Best-effort: drop the matching tile from the legacy static grid in gallery.html.
    const htmlRes = await gh(`/repos/${OWNER}/${REPO}/contents/${GALLERY_HTML}?ref=${BRANCH}`);
    if (htmlRes.ok) {
      const htmlMeta = await htmlRes.json();
      const html = Buffer.from(htmlMeta.content, "base64").toString("utf8");
      const esc = rel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const tileRe = new RegExp(`[ \\t]*<div class="gallery-item">\\s*<img src="/?${esc}"[^>]*>\\s*</div>[ \\t]*\\r?\\n?`, "g");
      const newHtml = html.replace(tileRe, "");
      if (newHtml !== html) {
        await gh(`/repos/${OWNER}/${REPO}/contents/${GALLERY_HTML}`, {
          method: "PUT",
          body: JSON.stringify({ message: "Remove gallery photo from static grid", content: Buffer.from(newHtml, "utf8").toString("base64"), branch: BRANCH, sha: htmlMeta.sha }),
        });
      }
    }

    if (!removed) return json(404, { error: "That photo was not found in the gallery." });
    return json(200, { ok: true, image: body.image });
  }

  // ---- upload ----
  const { imageBase64, service, caption } = body;
  if (!imageBase64 || typeof imageBase64 !== "string") return json(400, { error: "No photo received" });
  if (imageBase64.length > MAX_BASE64) return json(413, { error: "Photo is too large — try again." });
  const svc = VALID_SERVICES.has(service) ? service : "uncategorized";

  const stamp = Date.now().toString(36) + crypto.randomBytes(3).toString("hex");
  const finalName = `pcb-${stamp}.jpg`;
  const imagePath = `${IMAGES_DIR}/${finalName}`;

  // 1) commit the image file
  const imgRes = await gh(`/repos/${OWNER}/${REPO}/contents/${imagePath}`, {
    method: "PUT",
    body: JSON.stringify({ message: `Add gallery photo (${svc})`, content: imageBase64, branch: BRANCH }),
  });
  if (!imgRes.ok) {
    const detail = (await imgRes.text()).slice(0, 200);
    return json(502, { error: "Could not save the photo.", detail });
  }

  // 2) append the entry to gallery.json (read-modify-write with one retry on conflict)
  for (let attempt = 0; attempt < 3; attempt++) {
    const getRes = await gh(`/repos/${OWNER}/${REPO}/contents/${DATA_PATH}?ref=${BRANCH}`);
    if (!getRes.ok) return json(502, { error: "Could not read the gallery list." });
    const meta = await getRes.json();

    let data;
    try { data = JSON.parse(Buffer.from(meta.content, "base64").toString("utf8")); }
    catch { data = { photos: [] }; }
    if (!Array.isArray(data.photos)) data.photos = [];
    data.photos.push({
      image: `/images/gallery/uploads/${finalName}`,
      service: svc,
      caption: caption ? String(caption).slice(0, 200) : "",
    });

    const newContent = Buffer.from(JSON.stringify(data, null, 2) + "\n", "utf8").toString("base64");
    const putRes = await gh(`/repos/${OWNER}/${REPO}/contents/${DATA_PATH}`, {
      method: "PUT",
      body: JSON.stringify({ message: `Tag gallery photo (${svc})`, content: newContent, branch: BRANCH, sha: meta.sha }),
    });
    if (putRes.ok) return json(200, { ok: true, image: `/images/gallery/uploads/${finalName}`, service: svc });
    if (putRes.status !== 409) {
      const detail = (await putRes.text()).slice(0, 200);
      return json(502, { error: "Photo saved, but tagging it failed.", detail });
    }
    await wait(300); // conflict — someone else just wrote; retry
  }
  return json(409, { error: "Busy — please try that upload again." });
};
