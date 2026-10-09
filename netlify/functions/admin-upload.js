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

function htmlEscape(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// Read a repo text file's decoded contents at a given ref (commit sha or branch).
async function ghContent(path, ref) {
  const res = await gh(`/repos/${OWNER}/${REPO}/contents/${path}?ref=${ref}`);
  if (res.status === 404) return path.endsWith(".json") ? '{"photos":[]}' : "";
  if (!res.ok) throw new Error(`Could not read ${path}`);
  const meta = await res.json();
  return Buffer.from(meta.content, "base64").toString("utf8");
}

// Write all new images + the updated gallery.json + gallery.html in ONE commit (via the
// Git Data API) so each upload — of one photo or many — triggers only a single deploy.
// Retries if another writer moves the branch between read and update.
async function commitPhotos(items) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const refRes = await gh(`/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`);
    if (!refRes.ok) throw new Error("Could not read branch ref");
    const headSha = (await refRes.json()).object.sha;
    const baseCommitRes = await gh(`/repos/${OWNER}/${REPO}/git/commits/${headSha}`);
    if (!baseCommitRes.ok) throw new Error("Could not read base commit");
    const baseTree = (await baseCommitRes.json()).tree.sha;

    let data;
    try { data = JSON.parse(await ghContent(DATA_PATH, headSha)); } catch { data = { photos: [] }; }
    if (!Array.isArray(data.photos)) data.photos = [];
    let html = await ghContent(GALLERY_HTML, headSha);
    const marker = '<div class="gallery-grid">';

    const tree = [];
    for (const it of items) {
      const blobRes = await gh(`/repos/${OWNER}/${REPO}/git/blobs`, {
        method: "POST",
        body: JSON.stringify({ content: it.b64, encoding: "base64" }),
      });
      if (!blobRes.ok) throw new Error("Could not upload a photo");
      tree.push({ path: it.repoPath, mode: "100644", type: "blob", sha: (await blobRes.json()).sha });

      data.photos.push({ image: it.webPath, service: it.svc, caption: it.caption });
      const at = html.indexOf(marker);
      if (at !== -1) {
        const alt = htmlEscape(it.caption || "Palm Crest Builders project");
        const tile = `\n                <div class="gallery-item"><img src="${it.gridPath}" alt="${alt}" loading="lazy"></div>`;
        const cut = at + marker.length;
        html = html.slice(0, cut) + tile + html.slice(cut);
      }
    }
    tree.push({ path: DATA_PATH, mode: "100644", type: "blob", content: JSON.stringify(data, null, 2) + "\n" });
    tree.push({ path: GALLERY_HTML, mode: "100644", type: "blob", content: html });

    const treeRes = await gh(`/repos/${OWNER}/${REPO}/git/trees`, {
      method: "POST",
      body: JSON.stringify({ base_tree: baseTree, tree }),
    });
    if (!treeRes.ok) throw new Error("Could not build commit tree");
    const newTree = (await treeRes.json()).sha;

    const message = items.length === 1 ? `Add gallery photo (${items[0].svc})` : `Add ${items.length} gallery photos`;
    const commitRes = await gh(`/repos/${OWNER}/${REPO}/git/commits`, {
      method: "POST",
      body: JSON.stringify({ message, tree: newTree, parents: [headSha] }),
    });
    if (!commitRes.ok) throw new Error("Could not create commit");
    const newCommit = (await commitRes.json()).sha;

    const patchRes = await gh(`/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: newCommit }),
    });
    if (patchRes.ok) return { ok: true, count: items.length, images: items.map((i) => i.webPath) };
    if (patchRes.status === 422) { await wait(400); continue; } // branch moved — rebuild on the new head
    throw new Error("Could not update branch");
  }
  throw new Error("Busy — please try that upload again.");
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

  // ---- upload (one commit → one deploy, for a single photo or a batch) ----
  const incoming = Array.isArray(body.photos)
    ? body.photos
    : (body.imageBase64 ? [{ imageBase64: body.imageBase64, service: body.service, caption: body.caption }] : []);
  if (!incoming.length) return json(400, { error: "No photo received" });
  if (incoming.length > 12) return json(413, { error: "Too many photos at once — send up to 12 per upload." });

  let totalBytes = 0;
  const items = [];
  for (const p of incoming) {
    const b64 = p && typeof p.imageBase64 === "string" ? p.imageBase64 : "";
    if (!b64) return json(400, { error: "No photo received" });
    if (b64.length > MAX_BASE64) return json(413, { error: "A photo is too large — try again." });
    totalBytes += b64.length;
    const name = `pcb-${Date.now().toString(36)}${crypto.randomBytes(4).toString("hex")}.jpg`;
    items.push({
      b64,
      svc: VALID_SERVICES.has(p.service) ? p.service : "uncategorized",
      caption: p.caption ? String(p.caption).slice(0, 200) : "",
      repoPath: `${IMAGES_DIR}/${name}`,
      webPath: `/images/gallery/uploads/${name}`,
      gridPath: `images/gallery/uploads/${name}`,
    });
  }
  if (totalBytes > MAX_BASE64 * 1.1) return json(413, { error: "Those photos are too large together — send fewer at once." });

  try {
    return json(200, await commitPhotos(items));
  } catch (e) {
    return json(502, { error: String((e && e.message) || "Upload failed.").slice(0, 200) });
  }
};
