// App shell: auth, role routing (owner vs rep), profile bootstrap, service worker.
(function () {
  const cfg = window.DIALER_CONFIG || {};
  const configured =
    cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
    !cfg.SUPABASE_URL.includes("YOUR_") && !cfg.SUPABASE_ANON_KEY.includes("YOUR_");

  const App = (window.DialerApp = {
    supabase: null,
    user: null,
    show,
    toast,
  });

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
    registerSW();

    $("login-form").addEventListener("submit", onLogin);
    $("btn-signout").addEventListener("click", onSignout);

    const { data } = await App.supabase.auth.getSession();
    if (data.session) await onAuthed(data.session.user);
    else show("screen-login");

    App.supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) { App.user = null; appbar(false); show("screen-login"); }
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
    // Ensure a profile row exists so the owner can see and assign this rep.
    await App.supabase.from("profiles").upsert({ id: user.id, email: user.email }, { onConflict: "id" });

    $("appbar-user").textContent = user.email || "";
    appbar(true);

    const { data: isOwner } = await App.supabase.rpc("is_platform_owner");
    if (isOwner) {
      $("appbar-title").textContent = "Dialer — Owner";
      show("screen-owner");
      window.DialerOwner && window.DialerOwner.init();
    } else {
      $("appbar-title").textContent = "Dialer";
      show("screen-rep");
      window.DialerRep && window.DialerRep.init();
    }
  }

  function appbar(on) { $("appbar").classList.toggle("hidden", !on); }

  function registerSW() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }
})();
