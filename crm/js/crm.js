// Owner CRM: browse/filter every lead, add manual leads, edit a lead, and attach
// documents (EagleView, permits, ...) stored in Supabase Storage.
(function () {
  window.CrmView = { init };

  let inited = false;
  let leads = [];
  let profilesById = {};
  let selected = null;

  const SOURCES = ["telemarketer", "canvasser", "web_form", "call_in", "manual", "other"];
  const STATUSES = ["new", "contacted", "qualified", "assigned", "converted", "dead", "duplicate", "spam"];
  const DOC_TYPES = ["eagleview", "permit", "contract", "measurement", "photo", "other"];

  function sb() { return window.CrmApp.supabase; }
  function $(id) { return document.getElementById(id); }
  function toast(el, t, k) { window.CrmApp.toast(el, t, k); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }
  function fmtDate(iso) { return iso ? new Date(iso).toLocaleDateString() : ""; }

  async function init() {
    if (!inited) { wire(); inited = true; }
    await loadProfiles();
    await loadLeads();
  }

  function wire() {
    $("btn-add").addEventListener("click", openAdd);
    $("btn-refresh").addEventListener("click", loadLeads);
    $("btn-download").addEventListener("click", downloadCSV);
    ["f-search", "f-source", "f-status", "f-rep", "f-type"].forEach((id) => {
      $(id).addEventListener("input", render);
      $(id).addEventListener("change", render);
    });
    $("d-close").addEventListener("click", () => closeModal("detail-modal"));
    $("d-save").addEventListener("click", saveDetail);
    $("d-delete").addEventListener("click", deleteLead);
    $("d-upload").addEventListener("click", uploadDocument);
    $("a-close").addEventListener("click", () => closeModal("add-modal"));
    $("a-submit").addEventListener("click", submitAdd);

    fillSelect($("f-source"), [""].concat(SOURCES), "All sources");
    fillSelect($("f-status"), [""].concat(STATUSES), "All statuses");
    fillSelect($("d-status"), STATUSES);
    fillSelect($("a-status"), STATUSES);
    fillSelect($("d-doctype"), DOC_TYPES);
  }

  function fillSelect(sel, values, allLabel) {
    sel.innerHTML = "";
    values.forEach((v) => sel.add(new Option(v === "" ? (allLabel || "—") : v, v)));
  }

  async function loadProfiles() {
    const { data } = await sb().from("profiles").select("id,email,full_name");
    profilesById = {};
    (data || []).forEach((p) => (profilesById[p.id] = p));
  }
  function repName(id) {
    if (!id) return "";
    const p = profilesById[id];
    return p ? (p.full_name || p.email || id) : id;
  }

  async function loadLeads() {
    $("crm-stats").textContent = "Loading…";
    const pageSize = 1000;
    let from = 0, all = [];
    for (;;) {
      const { data, error } = await sb().from("leads").select("*")
        .order("created_at", { ascending: false }).range(from, from + pageSize - 1);
      if (error) { $("crm-stats").textContent = error.message; return; }
      all = all.concat(data || []);
      if (!data || data.length < pageSize) break;
      from += pageSize;
    }
    leads = all;
    buildRepFilter();
    render();
  }

  function buildRepFilter() {
    const ids = Array.from(new Set(leads.map((l) => l.rep_profile_id).filter(Boolean)));
    const sel = $("f-rep");
    const cur = sel.value;
    sel.innerHTML = "";
    sel.add(new Option("All reps", ""));
    sel.add(new Option("Manual / none", "none"));
    ids.forEach((id) => sel.add(new Option(repName(id), id)));
    sel.value = cur;
  }

  function render() {
    const q = ($("f-search").value || "").toLowerCase();
    const src = $("f-source").value;
    const st = $("f-status").value;
    const rep = $("f-rep").value;
    const type = ($("f-type").value || "").toLowerCase();

    const rows = leads.filter((l) => {
      if (src && l.source !== src) return false;
      if (st && l.status !== st) return false;
      if (rep === "none" && l.rep_profile_id) return false;
      if (rep && rep !== "none" && l.rep_profile_id !== rep) return false;
      if (type && !((l.service_type || "").toLowerCase().includes(type))) return false;
      if (q) {
        const hay = [l.owner_name, l.phone, l.site_address, l.city, l.email]
          .map((v) => (v || "").toLowerCase()).join(" ");
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    $("crm-stats").textContent = rows.length + " of " + leads.length + " leads";
    const tb = $("leads-rows");
    tb.innerHTML = "";
    rows.forEach((l) => {
      const tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + esc(l.owner_name || "—") + "</td>" +
        "<td>" + esc(l.phone || "") + "</td>" +
        "<td>" + esc(l.city || "") + "</td>" +
        "<td>" + esc(l.service_type || "") + "</td>" +
        '<td><span class="tag">' + esc(l.status) + "</span></td>" +
        "<td>" + esc(l.source) + "</td>" +
        "<td>" + esc(l.rep_profile_id ? repName(l.rep_profile_id) : "—") + "</td>" +
        "<td>" + fmtDate(l.created_at) + "</td>";
      tr.addEventListener("click", () => openDetail(l));
      tb.appendChild(tr);
    });
  }

  // ----- detail -----
  async function openDetail(lead) {
    selected = lead;
    $("d-title").textContent = lead.owner_name || "(no name)";
    $("d-sub").textContent = [lead.phone, lead.site_address, lead.city].filter(Boolean).join(" · ");
    $("d-status").value = lead.status;
    $("d-type").value = lead.service_type || "";
    $("d-notes").value = lead.notes || "";
    $("d-meta").innerHTML =
      "Source: <b>" + esc(lead.source) + "</b> · Rep: <b>" +
      esc(lead.rep_profile_id ? repName(lead.rep_profile_id) : "—") + "</b> · Created: " + fmtDate(lead.created_at) +
      (lead.call_seconds ? " · Call: " + lead.call_seconds + "s" : "") +
      (lead.email ? " · " + esc(lead.email) : "");
    toast($("d-msg"), "");
    openModal("detail-modal");
    await loadDocuments(lead.id);
  }

  async function saveDetail() {
    if (!selected) return;
    toast($("d-msg"), "Saving…");
    const patch = {
      status: $("d-status").value,
      service_type: $("d-type").value.trim() || null,
      notes: $("d-notes").value.trim() || null,
    };
    const { error } = await sb().from("leads").update(patch).eq("id", selected.id);
    if (error) { toast($("d-msg"), error.message, "error"); return; }
    Object.assign(selected, patch);
    toast($("d-msg"), "Saved.", "ok");
    render();
  }

  async function deleteLead() {
    if (!selected) return;
    if (!confirm("Delete this lead permanently?")) return;
    const { error } = await sb().from("leads").delete().eq("id", selected.id);
    if (error) { toast($("d-msg"), error.message, "error"); return; }
    leads = leads.filter((l) => l.id !== selected.id);
    selected = null;
    closeModal("detail-modal");
    render();
  }

  // ----- documents -----
  async function loadDocuments(leadId) {
    const box = $("d-docs");
    box.innerHTML = "Loading…";
    const { data, error } = await sb().from("lead_documents").select("*")
      .eq("lead_id", leadId).order("created_at", { ascending: false });
    if (error) { box.textContent = error.message; return; }
    box.innerHTML = "";
    if (!data || data.length === 0) { box.innerHTML = '<p class="muted">No documents yet.</p>'; return; }
    data.forEach((d) => {
      const row = document.createElement("div");
      row.className = "doc-row";
      row.innerHTML =
        '<span class="tag">' + esc(d.doc_type) + "</span>" +
        '<span class="doc-title">' + esc(d.title || d.original_filename || "file") + "</span>";
      const open = document.createElement("button");
      open.className = "btn-link"; open.textContent = "Open";
      open.addEventListener("click", () => openDoc(d.storage_key));
      const del = document.createElement("button");
      del.className = "btn-link danger"; del.textContent = "Delete";
      del.addEventListener("click", () => deleteDoc(d));
      row.appendChild(open); row.appendChild(del);
      box.appendChild(row);
    });
  }

  async function uploadDocument() {
    if (!selected) return;
    const fileInput = $("d-file");
    const file = fileInput.files && fileInput.files[0];
    if (!file) { toast($("d-msg"), "Choose a file first.", "error"); return; }
    toast($("d-msg"), "Uploading…");
    const path = selected.id + "/" + Date.now() + "-" + file.name.replace(/[^\w.\-]+/g, "_");
    const up = await sb().storage.from("lead-docs").upload(path, file, { upsert: false });
    if (up.error) { toast($("d-msg"), up.error.message, "error"); return; }
    const ins = await sb().from("lead_documents").insert({
      lead_id: selected.id,
      doc_type: $("d-doctype").value,
      title: $("d-doctitle").value.trim() || file.name,
      storage_key: path,
      original_filename: file.name,
      uploaded_by: window.CrmApp.user.id,
    });
    if (ins.error) { toast($("d-msg"), ins.error.message, "error"); return; }
    fileInput.value = "";
    $("d-doctitle").value = "";
    toast($("d-msg"), "Uploaded.", "ok");
    loadDocuments(selected.id);
  }

  async function openDoc(key) {
    const { data, error } = await sb().storage.from("lead-docs").createSignedUrl(key, 3600);
    if (error) { toast($("d-msg"), error.message, "error"); return; }
    window.open(data.signedUrl, "_blank");
  }

  async function deleteDoc(d) {
    if (!confirm("Delete this document?")) return;
    await sb().storage.from("lead-docs").remove([d.storage_key]);
    await sb().from("lead_documents").delete().eq("id", d.id);
    loadDocuments(selected.id);
  }

  // ----- add -----
  function openAdd() {
    ["a-name", "a-phone", "a-address", "a-city", "a-email", "a-type", "a-notes"].forEach((id) => ($(id).value = ""));
    $("a-status").value = "new";
    toast($("a-msg"), "");
    openModal("add-modal");
  }

  async function submitAdd() {
    const owner_name = $("a-name").value.trim();
    const phone = $("a-phone").value.trim();
    if (!owner_name && !phone) { toast($("a-msg"), "Enter at least a name or phone.", "error"); return; }
    toast($("a-msg"), "Saving…");
    const { error } = await sb().from("leads").insert({
      source: "manual",
      status: $("a-status").value,
      owner_name: owner_name || null,
      phone: phone || null,
      site_address: $("a-address").value.trim() || null,
      city: $("a-city").value.trim() || null,
      email: $("a-email").value.trim() || null,
      service_type: $("a-type").value.trim() || null,
      notes: $("a-notes").value.trim() || null,
    });
    if (error) { toast($("a-msg"), error.message, "error"); return; }
    closeModal("add-modal");
    loadLeads();
  }

  // ----- csv -----
  function downloadCSV() {
    const cols = ["created_at", "owner_name", "phone", "site_address", "city", "email", "service_type", "status", "source", "notes", "call_seconds"];
    const q = (v) => { if (v == null) return ""; const s = String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const header = cols.concat(["rep"]).join(",");
    const body = leads.map((l) => cols.map((c) => q(l[c])).concat(q(repName(l.rep_profile_id))).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF" + header + "\r\n" + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "leads-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function openModal(id) { $(id).classList.remove("hidden"); }
  function closeModal(id) { $(id).classList.add("hidden"); }
})();
