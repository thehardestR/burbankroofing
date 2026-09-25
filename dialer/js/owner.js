// Owner view: upload a CSV/Excel campaign, map columns, assign reps, watch progress.
(function () {
  window.DialerOwner = { init };

  let parsed = null;   // { headers, rows }
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
    await loadCampaignsDropdown();
  }

  function wire() {
    $("camp-file").addEventListener("change", onFile);
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

  function onFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    msg("Reading file…");
    const name = file.name.toLowerCase();
    if (name.endsWith(".csv")) {
      window.Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => setParsed(res.meta.fields || [], res.data),
        error: (err) => msg("Could not read CSV: " + err.message, "error"),
      });
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const wb = window.XLSX.read(ev.target.result, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = window.XLSX.utils.sheet_to_json(ws, { defval: "" });
          const headers = rows.length ? Object.keys(rows[0]) : [];
          setParsed(headers, rows);
        } catch (err) {
          msg("Could not read Excel: " + err.message, "error");
        }
      };
      reader.readAsArrayBuffer(file);
    }
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

    const rows = parsed.rows
      .map((r) => ({
        campaign_id: camp.id,
        owner_name: pick(r, map.owner_name),
        site_address: pick(r, map.site_address),
        phone: pick(r, map.phone),
        city: pick(r, map.city),
        email: pick(r, map.email),
        raw: r,
      }))
      .filter((r) => r.phone);

    const BATCH = 500;
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const { error } = await sb().from("call_list").insert(chunk);
      if (error) { msg("Uploaded " + i + " rows, then failed: " + error.message, "error"); return; }
      msg("Uploading… " + Math.min(i + BATCH, rows.length) + "/" + rows.length);
    }

    msg('Campaign "' + name + '" uploaded with ' + rows.length + " contacts.", "ok");
    $("camp-name").value = "";
    $("camp-file").value = "";
    $("map-area").classList.add("hidden");
    parsed = null;
    await loadCampaignsDropdown();
  }

  function pick(row, col) {
    if (!col) return null;
    const v = row[col];
    return v === undefined || v === null || v === "" ? null : String(v).trim();
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
    const { data, error } = await sb().from("profiles").select("id,email,full_name").order("email");
    if (error) return;
    agents = data || [];
    const sel = $("assign-agent");
    sel.innerHTML = "";
    agents.forEach((a) => sel.add(new Option(a.email || a.full_name || a.id, a.id)));
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
