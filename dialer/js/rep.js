// Rep view: pull the next unclaimed contact, dial via the paired iPhone, time the
// call, and record the outcome. Claiming happens server-side so two reps never
// land on the same person.
(function () {
  window.DialerRep = { init };

  let inited = false;
  let campaigns = [];
  let current = null;   // current campaign id
  let contact = null;   // current call_list row
  let timerId = null;
  let startedAt = 0;
  let elapsed = 0;

  function sb() { return window.DialerApp.supabase; }
  function $(id) { return document.getElementById(id); }
  function msg(text, kind) { window.DialerApp.toast($("rep-msg"), text, kind); }

  function init() {
    if (!inited) { wire(); inited = true; }
    loadCampaigns();
  }

  function wire() {
    $("btn-call").addEventListener("click", onCall);
    $("btn-end").addEventListener("click", onEnd);
    $("btn-good").addEventListener("click", () => disposition("good"));
    $("btn-no").addEventListener("click", () => disposition("not_interested"));
    $("btn-noanswer").addEventListener("click", () => disposition("no_answer"));
    $("btn-badnum").addEventListener("click", () => disposition("bad_number"));
    $("btn-recheck").addEventListener("click", loadNext);
    // Save the note as she types so it survives an accidental app close.
    $("c-notes").addEventListener("input", () => {
      if (contact) localStorage.setItem(noteKey(contact.id), $("c-notes").value);
    });
    // Leads tab + manual entry
    $("nav-call").addEventListener("click", () => showMode("call"));
    $("nav-leads").addEventListener("click", () => showMode("leads"));
    $("leads-search").addEventListener("input", renderMyLeads);
    $("btn-add-lead").addEventListener("click", openAddLead);
    $("al-save").addEventListener("click", submitAddLead);
    $("al-cancel").addEventListener("click", () => { $("rep-add").classList.add("hidden"); $("rep-leads").classList.remove("hidden"); });
  }

  async function loadCampaigns() {
    const { data: rows, error } = await sb()
      .from("campaign_assignments")
      .select("campaign_id");
    if (error) { msg(error.message, "error"); return; }

    const ids = (rows || []).map((r) => r.campaign_id);
    if (ids.length === 0) {
      showDone("No campaigns yet", "Ask the owner to assign you a campaign.");
      return;
    }

    const { data: camps, error: cErr } = await sb()
      .from("campaigns")
      .select("id,name,status")
      .in("id", ids)
      .order("name");
    if (cErr) { msg(cErr.message, "error"); return; }

    campaigns = (camps || []).filter((c) => c.status !== "done");
    if (campaigns.length === 0) {
      showDone("No active campaigns", "Ask the owner to assign you a campaign.");
      return;
    }
    if (campaigns.length === 1) { current = campaigns[0].id; startCampaign(); }
    else renderPicker();
  }

  function renderPicker() {
    $("rep-card").classList.add("hidden");
    $("rep-done").classList.add("hidden");
    const ul = $("rep-campaigns");
    ul.innerHTML = "";
    campaigns.forEach((c) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.className = "btn";
      b.textContent = c.name;
      b.addEventListener("click", () => { current = c.id; startCampaign(); });
      li.appendChild(b);
      ul.appendChild(li);
    });
    $("rep-pick").classList.remove("hidden");
  }

  function startCampaign() {
    $("rep-pick").classList.add("hidden");
    const c = campaigns.find((x) => x.id === current);
    $("rep-campaign-name").textContent = c ? c.name : "";
    loadNext();
  }

  async function loadNext() {
    resetTimer();
    msg("Loading…");

    // Resume an in-progress claim first (e.g. the app was closed mid-call) so we
    // never skip past the contact the rep is still working.
    const existing = await getMyClaim();
    if (existing) {
      contact = existing;
      renderContact();
      updateProgress();
      msg("Resumed your call — finish your note and pick an outcome.");
      return;
    }

    const { data, error } = await sb().rpc("claim_next_contact", { p_campaign: current });
    if (error) { msg(error.message, "error"); return; }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) { showDone("All done 🎉", "No more contacts in this campaign right now."); return; }

    contact = row;
    renderContact();
    updateProgress();
    msg("");
  }

  // Returns this rep's still-open (claimed, not yet dispositioned) contact, if any.
  async function getMyClaim() {
    const uid = window.DialerApp.user && window.DialerApp.user.id;
    if (!uid) return null;
    const { data, error } = await sb()
      .from("call_list")
      .select("*")
      .eq("campaign_id", current)
      .eq("claimed_by", uid)
      .eq("status", "claimed")
      .order("claimed_at", { ascending: true })
      .limit(1);
    if (error) return null;
    return (data && data[0]) || null;
  }

  function renderContact() {
    $("rep-done").classList.add("hidden");
    $("rep-pick").classList.add("hidden");
    $("rep-card").classList.remove("hidden");

    $("c-name").textContent = contact.owner_name || "(no name)";
    $("c-addr").textContent =
      [contact.site_address, contact.city].filter(Boolean).join(", ") || "—";

    const tel = telDigits(contact.phone);
    const a = $("c-phone");
    a.textContent = contact.phone || "—";
    a.href = tel ? "tel:" + tel : "#";

    // Restore a saved draft (survives an app close), else any note already stored.
    $("c-notes").value = localStorage.getItem(noteKey(contact.id)) || contact.notes || "";

    $("btn-end").classList.add("hidden");
    $("btn-call").classList.remove("hidden");
  }

  function onCall() {
    const tel = telDigits(contact && contact.phone);
    if (tel) window.location.href = "tel:" + tel; // routes through the paired iPhone
    startTimer();
    $("btn-call").classList.add("hidden");
    $("btn-end").classList.remove("hidden");
  }

  function onEnd() {
    stopTimer();
    $("btn-end").classList.add("hidden");
    $("btn-call").classList.remove("hidden");
    $("btn-call").textContent = "📞 Redial";
  }

  async function disposition(outcome) {
    if (!contact) return;
    stopTimer();
    const notes = $("c-notes").value.trim();
    msg("Saving…");
    const { error } = await sb().rpc("disposition_contact", {
      p_contact: contact.id,
      p_outcome: outcome,
      p_notes: notes || null,
      p_seconds: elapsed || null,
    });
    if (error) { msg("Could not save — check your connection, then try again. " + error.message, "error"); return; }
    localStorage.removeItem(noteKey(contact.id));
    loadNext();
  }

  async function updateProgress() {
    const total = await count(null);
    const pending = await count("pending");
    const claimed = await count("claimed");
    $("rep-progress").textContent = (total - pending - claimed) + " / " + total;
  }

  async function count(status) {
    let q = sb().from("call_list").select("id", { count: "exact", head: true }).eq("campaign_id", current);
    if (status) q = q.eq("status", status);
    const { count: n } = await q;
    return n || 0;
  }

  function showDone(title, body) {
    contact = null;
    $("rep-pick").classList.add("hidden");
    $("rep-card").classList.add("hidden");
    const done = $("rep-done");
    done.querySelector("h1").textContent = title;
    done.querySelector("p").textContent = body;
    done.classList.remove("hidden");
  }

  // ----- timer -----
  function startTimer() {
    startedAt = Date.now() - elapsed * 1000;
    if (timerId) clearInterval(timerId);
    timerId = setInterval(tick, 250);
  }
  function tick() {
    elapsed = Math.floor((Date.now() - startedAt) / 1000);
    $("timer").textContent = fmt(elapsed);
  }
  function stopTimer() {
    if (timerId) { clearInterval(timerId); timerId = null; }
  }
  function resetTimer() {
    stopTimer();
    elapsed = 0;
    startedAt = 0;
    $("timer").textContent = "00:00";
    $("btn-call").textContent = "📞 Call";
  }

  // ----- My Leads (rep view of past leads + manual entry) -----
  let myLeads = [];

  function showMode(mode) {
    const leadsMode = mode === "leads";
    $("rep-call-views").classList.toggle("hidden", leadsMode);
    $("rep-leads").classList.toggle("hidden", !leadsMode);
    $("rep-add").classList.add("hidden");
    $("nav-call").classList.toggle("active", !leadsMode);
    $("nav-leads").classList.toggle("active", leadsMode);
    if (leadsMode) loadMyLeads();
  }

  async function loadMyLeads() {
    const uid = window.DialerApp.user && window.DialerApp.user.id;
    if (!uid) return;
    $("leads-count").textContent = "Loading…";
    const { data, error } = await sb()
      .from("leads")
      .select("id, owner_name, phone, site_address, city, service_type, status, notes, created_at")
      .eq("rep_profile_id", uid)
      .order("created_at", { ascending: false });
    if (error) { $("leads-count").textContent = error.message; return; }
    myLeads = data || [];
    renderMyLeads();
  }

  function renderMyLeads() {
    const q = ($("leads-search").value || "").toLowerCase();
    const rows = myLeads.filter((l) =>
      !q || [l.owner_name, l.phone, l.site_address, l.city, l.service_type]
        .some((v) => (v || "").toLowerCase().includes(q))
    );
    $("leads-count").textContent = rows.length + (rows.length === 1 ? " lead" : " leads");
    const ul = $("leads-list");
    ul.innerHTML = "";
    if (rows.length === 0) {
      const li = document.createElement("li");
      li.className = "lead-empty";
      li.textContent = myLeads.length === 0 ? "No leads yet. Tap + Add to enter one." : "No matches.";
      ul.appendChild(li);
      return;
    }
    rows.forEach((l) => {
      const li = document.createElement("li");
      li.className = "lead-item";
      const type = l.service_type ? " · " + l.service_type : "";
      const addr = [l.site_address, l.city].filter(Boolean).join(", ");
      li.innerHTML =
        '<div class="lead-name">' + esc(l.owner_name || "(no name)") + "</div>" +
        '<div class="lead-sub">' + esc(l.phone || "") + esc(type) + "</div>" +
        (addr ? '<div class="lead-sub muted">' + esc(addr) + "</div>" : "") +
        (l.notes ? '<div class="lead-notes">' + esc(l.notes) + "</div>" : "") +
        '<div class="lead-meta">' + fmtDate(l.created_at) + " · " + esc(l.status) + "</div>";
      ul.appendChild(li);
    });
  }

  function openAddLead() {
    ["al-name", "al-phone", "al-address", "al-city", "al-email", "al-type", "al-notes"].forEach((id) => ($(id).value = ""));
    window.DialerApp.toast($("al-msg"), "");
    $("rep-leads").classList.add("hidden");
    $("rep-add").classList.remove("hidden");
  }

  async function submitAddLead() {
    const uid = window.DialerApp.user && window.DialerApp.user.id;
    const owner_name = $("al-name").value.trim();
    const phone = $("al-phone").value.trim();
    if (!owner_name && !phone) { window.DialerApp.toast($("al-msg"), "Enter at least a name or phone.", "error"); return; }
    window.DialerApp.toast($("al-msg"), "Saving…");
    const { error } = await sb().from("leads").insert({
      source: "manual",
      status: "new",
      rep_profile_id: uid,
      owner_name: owner_name || null,
      phone: phone || null,
      site_address: $("al-address").value.trim() || null,
      city: $("al-city").value.trim() || null,
      email: $("al-email").value.trim() || null,
      service_type: $("al-type").value.trim() || null,
      notes: $("al-notes").value.trim() || null,
    });
    if (error) { window.DialerApp.toast($("al-msg"), error.message, "error"); return; }
    $("rep-add").classList.add("hidden");
    $("rep-leads").classList.remove("hidden");
    loadMyLeads();
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }
  function fmtDate(iso) { return iso ? new Date(iso).toLocaleDateString() : ""; }

  function noteKey(id) { return "dialer:note:" + id; }
  function telDigits(phone) { return (phone || "").replace(/[^\d+]/g, ""); }
  function fmt(s) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return String(m).padStart(2, "0") + ":" + String(r).padStart(2, "0");
  }
})();
