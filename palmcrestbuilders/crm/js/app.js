// App shell: auth + owner gate (reps are denied). Same Supabase project as the dialer.
(function () {
  const cfg = window.CRM_CONFIG || {};
  const configured =
    cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
    !cfg.SUPABASE_URL.includes("YOUR_") && !cfg.SUPABASE_ANON_KEY.includes("YOUR_");

  const App = (window.CrmApp = { supabase: null, user: null, show, toast });

  function $(id) { return document.getElementById(id); }
  function show(id) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.add("hidden"));
    const el = $(id);
    if (el) el.classList.remove("hidden");
  }
  function toast(el, text, kind) {
    if (!el) return;
    el.textContent = text || "";
    el.className = "msg" + (kind ? " " + kind : "");
  }

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    if (!configured) { show("screen-setup"); return; }
    App.supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

    $("login-form").addEventListener("submit", onLogin);
    $("btn-signout").addEventListener("click", onSignout);

    const { data } = await App.supabase.auth.getSession();
    if (data.session) await onAuthed(data.session.user);
    else show("screen-login");

    App.supabase.auth.onAuthStateChange((_e, s) => {
      if (!s) { App.user = null; appbar(false); show("screen-login"); }
    });
  }

  async function onLogin(e) {
    e.preventDefault();
    const email = $("login-email").value.trim();
    const password = $("login-password").value;
    $("login-error").textContent = "";
    const { data, error } = await App.supabase.auth.signInWithPassword({ email, password });
    if (error) { $("login-error").textContent = error.message; return; }
    await onAuthed(data.user);
  }

  async function onSignout() {
    await App.supabase.auth.signOut();
    App.user = null;
    appbar(false);
    show("screen-login");
  }

  async function onAuthed(user) {
    App.user = user;
    const { data: isOwner } = await App.supabase.rpc("is_platform_owner");
    if (!isOwner) { appbar(false); show("screen-denied"); return; }
    $("appbar-user").textContent = user.email || "";
    appbar(true);
    show("screen-crm");
    window.CrmView && window.CrmView.init();
  }

  function appbar(on) { $("appbar").classList.toggle("hidden", !on); }
})();
