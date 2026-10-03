// Owner view: upload a CSV/Excel campaign, map columns, assign reps, watch progress.
(function () {
  window.DialerOwner = { init };

  let parsed = null;   // { headers, rows }
  let scrub = null;    // { headers, rows } optional clean/DNC results file
  let cleanSet = new Set(); // normalized numbers explicitly marked clean (allowlist)
  let explodeData = null;   // { headers, rows } raw file for the explode tool
  let agents = [];
  let inited = false;

  function sb() { return window.DialerApp.supabase; }
  function $(id) { return document.getElementById(id); }
  function msg(text, kind) { window.DialerApp.toast($("owner-msg"), text, kind); }

  const FIELDS = ["owner_name", "site_address", "phone", "city", "email"];
  const GUESS = {
    owner_name: /(owner|name|contact)/i,
    site_address: /(address|situs|street|property)/i,
    phone: /(phone|tel|mobile|cell)/i,
    city: /city/i,
    email: /e-?mail/i,
  };

  async function init() {
    if (!inited) { wire(); inited = true; }
    await loadAgents();
    await loadPending();
    await loadCampaignsDropdown();
  }

  function wire() {
    $("camp-file").addEventListener("change", onFile);
    $("scrub-file").addEventListener("change", onScrubFile);
    $("explode-file").addEventListener("change", onExplodeFile);
    $("btn-explode").addEventListener("click", downloadExplode);
    $("btn-upload").addEventListener("click", onUpload);
    $("btn-assign").addEventListener("click", onAssign);
    $("assign-campaign").addEventListener("change", loadAssignments);
    $("btn-refresh-progress").addEventListener("click", loadProgress);
    $("btn-download-leads").addEventListener("click", () =>
      downloadCSV("leads",
        ["created_at", "owner_name", "phone", "site_address", "city", "email", "call_seconds", "notes", "status"],
        "leads"));
    $("btn-download-calls").addEventListener("click", () =>
      downloadCSV("call_list",
        ["created_at", "owner_name", "phone", "site_address", "city", "email", "status", "call_seconds", "notes", "disposition_at"],
        "call-log"));
  }

  function readSheet(file, done, onErr) {
    const name = file.name.toLowerCase();
    if (name.endsWith(".csv")) {
      window.Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => done(res.meta.fields || [], res.data),
        error: (err) => onErr("Could not read CSV: " + err.message),
      });
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const wb = window.XLSX.read(ev.target.result, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = window.XLSX.utils.sheet_to_json(ws, { defval: "" });
          const headers = rows.length ? Object.keys(rows[0]) : [];
          done(headers, rows);
        } catch (err) {
          onErr("Could not read Excel: " + err.message);
        }
      };
      reader.readAsArrayBuffer(file);
    }
  }

  function onFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    msg("Reading file…");
    readSheet(file, (h, r) => setParsed(h, r), (m) => msg(m, "error"));
  }

  function onScrubFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) { scrub = null; cleanSet = new Set(); $("scrub-info").textContent = ""; return; }
    readSheet(file, (h, r) => {
      scrub = { headers: h, rows: r };
      cleanSet = buildCleanSet();
      $("scrub-info").textContent =
        "Clean results: " + r.length + " numbers checked · " + cleanSet.size + " clean (only these will be dialed)." +
        (cleanSet.size === 0 ? " ⚠ none marked clean — check the file's columns." : "");
    }, (m) => { $("scrub-info").textContent = m; });
  }

  // ---- Explode tool: flatten all phone columns into one list for the DNC scrubber ----
  function phoneColumns(headers) {
    return headers.filter((c) => PHONE_RE.test(c) && !/type/i.test(c));
  }

  function onExplodeFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) { explodeData = null; $("btn-explode").disabled = true; $("explode-info").textContent = ""; return; }
    $("explode-info").textContent = "Reading…";
    readSheet(file, (h, r) => {
      explodeData = { headers: h, rows: r };
      const cols = phoneColumns(h);
      $("btn-explode").disabled = cols.length === 0;
      $("explode-info").textContent = cols.length
        ? (r.length + " rows · " + cols.length + " phone columns found. Click to download.")
        : "No phone columns found in this file.";
    }, (m) => { $("explode-info").textContent = m; });
  }

  function downloadExplode() {
    if (!explodeData) return;
    const idCol = explodeData.headers.find((h) => /^id$/i.test(h)) ||
                  explodeData.headers.find((h) => /\bid\b/i.test(h)) || null;
    const cols = phoneColumns(explodeData.headers);
    const seen = new Set();
    const out = [["Id", "phone"]];
    explodeData.rows.forEach((r, i) => {
      const id = idCol ? String(r[idCol] == null ? "" : r[idCol]).trim() : String(i + 1);
      cols.forEach((c) => {
        const n = normPhone(r[c]);
        if (!n) return;
        const key = id + "|" + n;
        if (seen.has(key)) return;
        seen.add(key);
        out.push([id, n]);
      });
    });
    const csv = out.map((row) => row.map(csvCell).join(",")).join("\r\n");
    triggerDownload(csv, "to_scrub.csv");
    $("explode-info").textContent = "Downloaded " + (out.length - 1) + " numbers → upload to_scrub.csv to the scrubber.";
  }

  function setParsed(headers, rows) {
    parsed = { headers, rows };
    buildMapping(headers);
    $("map-area").classList.remove("hidden");
    $("camp-count").textContent = rows.length + " rows found";
    msg("");
  }

  function buildMapping(headers) {
    FIELDS.forEach((f) => {
      const sel = $("map-" + f);
      sel.innerHTML = "";
      sel.add(new Option("— none —", ""));
      let guess = "";
      headers.forEach((h) => {
        sel.add(new Option(h, h));
        if (!guess && GUESS[f].test(h)) guess = h;
      });
      sel.value = guess;
    });
  }

  async function onUpload() {
    if (!parsed) return;
    const name = $("camp-name").value.trim();
    if (!name) { msg("Give the campaign a name.", "error"); return; }

    const map = {};
    FIELDS.forEach((f) => { map[f] = $("map-" + f).value; });
    if (!map.phone) { msg("Pick which column holds the phone number.", "error"); return; }

    msg("Creating campaign…");
    const { data: camp, error: cErr } = await sb()
      .from("campaigns")
      .insert({ name, source: "telemarketer", created_by: window.DialerApp.user.id })
      .select("id")
      .single();
    if (cErr) { msg("Upload failed: " + cErr.message, "error"); return; }

    // Collect each contact's numbers (mapped column first, then other phone columns).
    // When a clean/DNC results file is loaded, keep ONLY numbers on the clean allowlist;
    // otherwise keep them all. phones[] drives the rep's "try the next number" cycling.
    const phoneCols = [map.phone].concat(parsed.headers.filter((h) => h !== map.phone && PHONE_RE.test(h) && !/type/i.test(h)));
    const filtering = cleanSet.size > 0;
    let droppedNumbers = 0, skippedContacts = 0;
    const rows = [];
    parsed.rows.forEach((r) => {
      const seen = new Set();
      const nums = [];
      phoneCols.forEach((c) => {
        const v = pick(r, c);
        if (!v) return;
        const n = normPhone(v);
        if (!n || seen.has(n)) return;
        seen.add(n);
        nums.push({ display: v, norm: n });
      });
      const before = nums.length;
      const keep = filtering ? nums.filter((x) => cleanSet.has(x.norm)) : nums;
      droppedNumbers += before - keep.length;
      if (keep.length === 0) { if (before > 0) skippedContacts++; return; }
      rows.push({
        campaign_id: camp.id,
        owner_name: pick(r, map.owner_name),
        site_address: pick(r, map.site_address),
        phone: keep[0].display,
        phones: keep.map((x) => x.display),
        city: pick(r, map.city),
        email: pick(r, map.email),
        raw: r,
      });
    });

    if (rows.length === 0) { msg("No contacts with a usable phone number to upload.", "error"); return; }

    const BATCH = 500;
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const { error } = await sb().from("call_list").insert(chunk);
      if (error) { msg("Uploaded " + i + " rows, then failed: " + error.message, "error"); return; }
      msg("Uploading… " + Math.min(i + BATCH, rows.length) + "/" + rows.length);
    }

    let summary = 'Campaign "' + name + '" uploaded with ' + rows.length + " contacts.";
    if (filtering) summary += " Clean numbers only — removed " + droppedNumbers + " non-clean, skipped " + skippedContacts + " with no clean number.";
    msg(summary, "ok");
    $("camp-name").value = "";
    $("camp-file").value = "";
    $("scrub-file").value = "";
    $("scrub-info").textContent = "";
    $("map-area").classList.add("hidden");
    parsed = null; scrub = null; cleanSet = new Set();
    await loadCampaignsDropdown();
  }

  function pick(row, col) {
    if (!col) return null;
    const v = row[col];
    return v === undefined || v === null || v === "" ? null : String(v).trim();
  }

  const PHONE_RE = /(phone|tel|mobile|cell)/i;

  // Numbers are compared by their last 10 digits so formatting never matters.
  function normPhone(v) {
    const d = String(v == null ? "" : v).replace(/\D/g, "");
    if (d.length === 11 && d[0] === "1") return d.slice(1);
    if (d.length >= 10) return d.slice(-10);
    return null;
  }

  function csvCell(v) {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function detectScrubPhoneCol(headers, rows) {
    const llr = headers.find((h) => /llr.*(phone|number)/i.test(h));
    if (llr) return llr;
    const byName = headers.find((h) => /phone|number|tel|mobile|cell/i.test(h));
    if (byName) return byName;
    let best = headers[0], bestScore = -1;
    headers.forEach((h) => {
      let score = 0;
      rows.slice(0, 25).forEach((r) => { if (normPhone(r[h])) score++; });
      if (score > bestScore) { bestScore = score; best = h; }
    });
    return best;
  }

  // Allowlist: a number is dialable only if the results file marks it clean (and not an
  // invalid line type). Anything not explicitly clean is withheld.
  function buildCleanSet() {
    const set = new Set();
    if (!scrub || !scrub.rows.length) return set;
    const H = scrub.headers;
    const phoneCol = detectScrubPhoneCol(H, scrub.rows);
    const dncCol = H.find((h) => /dnc/i.test(h));
    const ltCol = H.find((h) => /line.?type/i.test(h));
    scrub.rows.forEach((r) => {
      const n = normPhone(r[phoneCol]);
      if (!n) return;
      const dnc = String((dncCol ? r[dncCol] : "") || "").trim().toLowerCase();
      const lt = String((ltCol ? r[ltCol] : "") || "").trim().toLowerCase();
      const okDnc = dncCol ? dnc === "clean" : true;
      const okLt = lt !== "invalid";
      if (okDnc && okLt) set.add(n);
    });
    return set;
  }

  async function loadCampaignsDropdown() {
    const { data, error } = await sb()
      .from("campaigns")
      .select("id,name,status")
      .order("created_at", { ascending: false });
    if (error) return;
    const sel = $("assign-campaign");
    sel.innerHTML = "";
    (data || []).forEach((c) =>
      sel.add(new Option(c.name + (c.status !== "active" ? " (" + c.status + ")" : ""), c.id))
    );
    if (data && data.length) await loadAssignments();
    await loadProgress();
  }

  async function loadAgents() {
    // Only approved telemarketers are assignable.
    const { data, error } = await sb()
      .from("telemarketers")
      .select("profile_id, profiles(email, full_name)")
      .eq("status", "approved");
    if (error) return;
    agents = (data || []).map((r) => ({
      id: r.profile_id,
      email: r.profiles && r.profiles.email,
      full_name: r.profiles && r.profiles.full_name,
    }));
    agents.sort((a, b) => (a.email || "").localeCompare(b.email || ""));
    const sel = $("assign-agent");
    sel.innerHTML = "";
    agents.forEach((a) => sel.add(new Option(a.email || a.full_name || a.id, a.id)));
  }

  async function loadPending() {
    const ul = $("pending-list");
    if (!ul) return;
    const { data, error } = await sb()
      .from("telemarketers")
      .select("profile_id, status, created_at, profiles(email, full_name)")
      .eq("status", "pending")
      .order("created_at");
    ul.innerHTML = "";
    if (error) { window.DialerApp.toast($("pending-msg"), error.message, "error"); return; }
    if (!data || data.length === 0) {
      const li = document.createElement("li");
      li.className = "muted";
      li.textContent = "No reps waiting for approval.";
      ul.appendChild(li);
      return;
    }
    data.forEach((r) => {
      const who = (r.profiles && (r.profiles.email || r.profiles.full_name)) || r.profile_id;
      const li = document.createElement("li");
      li.className = "pending-item";
      const span = document.createElement("span");
      span.className = "who";
      span.textContent = who;
      const ok = document.createElement("button");
      ok.className = "btn btn-good";
      ok.textContent = "Approve";
      ok.addEventListener("click", () => setRepStatus(r.profile_id, "approved"));
      const no = document.createElement("button");
      no.className = "btn btn-muted";
      no.textContent = "Reject";
      no.addEventListener("click", () => setRepStatus(r.profile_id, "rejected"));
      li.append(span, ok, no);
      ul.appendChild(li);
    });
  }

  async function setRepStatus(profileId, status) {
    const { error } = await sb().rpc("set_rep_status", { p_profile: profileId, p_status: status });
    const m = $("pending-msg");
    if (error) { window.DialerApp.toast(m, error.message, "error"); return; }
    window.DialerApp.toast(m, status === "approved" ? "Rep approved." : "Rep rejected.", "ok");
    await loadPending();
    await loadAgents();
  }

  async function onAssign() {
    const campaign_id = $("assign-campaign").value;
    const agent_profile_id = $("assign-agent").value;
    if (!campaign_id || !agent_profile_id) return;
    const { error } = await sb().from("campaign_assignments").insert({ campaign_id, agent_profile_id });
    const m = $("assign-msg");
    if (error) { window.DialerApp.toast(m, error.message, "error"); return; }
    window.DialerApp.toast(m, "Rep assigned.", "ok");
    await loadAssignments();
  }

  async function loadAssignments() {
    const campaign_id = $("assign-campaign").value;
    if (!campaign_id) return;
    const { data } = await sb()
      .from("campaign_assignments")
      .select("id, agent_profile_id")
      .eq("campaign_id", campaign_id);
    const ul = $("assign-list");
    ul.innerHTML = "";
    (data || []).forEach((row) => {
      const a = agents.find((x) => x.id === row.agent_profile_id);
      const li = document.createElement("li");
      li.textContent = (a && (a.email || a.full_name)) || row.agent_profile_id;
      ul.appendChild(li);
    });
  }

  async function loadProgress() {
    const area = $("progress-area");
    const { data: camps } = await sb()
      .from("campaigns")
      .select("id,name")
      .order("created_at", { ascending: false });
    area.innerHTML = "";
    for (const c of camps || []) {
      const counts = await countByStatus(c.id);
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      const worked = total - (counts.pending || 0) - (counts.claimed || 0);
      const div = document.createElement("div");
      div.className = "progress-row";
      div.innerHTML =
        "<strong>" + escapeHtml(c.name) + "</strong> — " +
        worked + "/" + total + " worked · " +
        (counts.good || 0) + " good · " +
        (counts.not_interested || 0) + " no";
      area.appendChild(div);
    }
  }

  async function countByStatus(campaignId) {
    const statuses = ["pending", "claimed", "good", "not_interested", "no_answer", "bad_number", "dnc"];
    const out = {};
    await Promise.all(
      statuses.map(async (s) => {
        const { count } = await sb()
          .from("call_list")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", campaignId)
          .eq("status", s);
        out[s] = count || 0;
      })
    );
    return out;
  }

  async function downloadCSV(table, columns, prefix) {
    const dl = $("download-msg");
    window.DialerApp.toast(dl, "Preparing download…");
    try {
      const rows = await fetchAll(table, columns);
      if (rows.length === 0) { window.DialerApp.toast(dl, "Nothing to export yet.", "error"); return; }
      triggerDownload(toCSV(rows, columns), prefix + "-" + new Date().toISOString().slice(0, 10) + ".csv");
      window.DialerApp.toast(dl, "Downloaded " + rows.length + " rows.", "ok");
    } catch (e) {
      window.DialerApp.toast(dl, "Download failed: " + e.message, "error");
    }
  }

  async function fetchAll(table, columns) {
    const pageSize = 1000;
    let from = 0;
    let all = [];
    for (;;) {
      const { data, error } = await sb()
        .from(table)
        .select(columns.join(","))
        .order("created_at", { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      all = all.concat(data || []);
      if (!data || data.length < pageSize) break;
      from += pageSize;
    }
    return all;
  }

  function toCSV(rows, columns) {
    const esc = (v) => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const header = columns.join(",");
    const body = rows.map((r) => columns.map((c) => esc(r[c])).join(",")).join("\r\n");
    return header + "\r\n" + body;
  }

  function triggerDownload(csv, filename) {
    // BOM so Excel opens it as UTF-8 (keeps accents and special characters intact).
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }
})();
