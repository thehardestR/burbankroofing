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
    $("c-notes").value = "";
    msg("Loading next contact…");

    const { data, error } = await sb().rpc("claim_next_contact", { p_campaign: current });
    if (error) { msg(error.message, "error"); return; }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) { showDone("All done 🎉", "No more contacts in this campaign right now."); return; }

    contact = row;
    renderContact();
    updateProgress();
    msg("");
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

  function telDigits(phone) { return (phone || "").replace(/[^\d+]/g, ""); }
  function fmt(s) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return String(m).padStart(2, "0") + ":" + String(r).padStart(2, "0");
  }
})();
