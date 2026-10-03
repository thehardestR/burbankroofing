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
    $("signup-form").addEventListener("submit", onSignup);
    $("reset-form").addEventListener("submit", onReset);
    $("btn-signout").addEventListener("click", onSignout);
    $("btn-signout-pending").addEventListener("click", onSignout);
    $("btn-pending-refresh").addEventListener("click", recheckStatus);
    $("link-signup").addEventListener("click", () => { clearAuthMsgs(); show("screen-signup"); });
    $("link-signin").addEventListener("click", () => { clearAuthMsgs(); show("screen-login"); });
    $("link-forgot").addEventListener("click", onForgotPassword);

    // A password-reset link returns here with a recovery token in the URL.
    App.supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") { show("screen-reset"); return; }
      if (!session) { App.user = null; appbar(false); show("screen-login"); }
    });
    if (window.location.hash.includes("type=recovery")) { show("screen-reset"); return; }

    const { data } = await App.supabase.auth.getSession();
    if (data.session) await onAuthed(data.session.user);
    else show("screen-login");
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

  async function onSignup(e) {
    e.preventDefault();
    const name = $("signup-name").value.trim();
    const email = $("signup-email").value.trim();
    const password = $("signup-password").value;
    $("signup-error").textContent = "";
    const { data, error } = await App.supabase.auth.signUp({ email, password });
    if (error) { $("signup-error").textContent = error.message; return; }
    if (!data.session) {
      // Email confirmation is enabled: no session yet. Confirm, then sign in.
      $("signup-error").textContent = "Account created. Check your email to confirm, then sign in.";
      return;
    }
    App.user = data.user;
    await App.supabase.from("profiles")
      .upsert({ id: data.user.id, email, full_name: name || null }, { onConflict: "id" });
    await App.supabase.from("telemarketers")
      .upsert({ profile_id: data.user.id, status: "pending" }, { onConflict: "profile_id", ignoreDuplicates: true });
    await onAuthed(data.user);
  }

  async function onForgotPassword() {
    const email = $("login-email").value.trim();
    if (!email) { $("login-error").textContent = "Enter your email above, then tap “Forgot password?”."; return; }
    const redirectTo = window.location.origin + window.location.pathname;
    const { error } = await App.supabase.auth.resetPasswordForEmail(email, { redirectTo });
    $("login-error").textContent = error ? error.message : "Check your email for a password-reset link.";
  }

  async function onReset(e) {
    e.preventDefault();
    const password = $("reset-password").value;
    toast($("reset-msg"), "Saving…");
    const { error } = await App.supabase.auth.updateUser({ password });
    if (error) { toast($("reset-msg"), error.message, "error"); return; }
    toast($("reset-msg"), "Password updated.", "ok");
    const { data } = await App.supabase.auth.getSession();
    if (data.session) await onAuthed(data.session.user);
    else show("screen-login");
  }

  async function recheckStatus() {
    const { data } = await App.supabase.auth.getSession();
    if (data.session) await onAuthed(data.session.user);
    else show("screen-login");
  }

  function renderPending(status) {
    if (status === "rejected" || status === "disabled") {
      $("pending-title").textContent = "Account not active";
      $("pending-text").textContent = "Your account isn’t active. Please contact the owner.";
    } else {
      $("pending-title").textContent = "Waiting for approval";
      $("pending-text").textContent = "Your account was created. The owner needs to approve you before you can start calling.";
    }
  }

  function clearAuthMsgs() {
    $("login-error").textContent = "";
    $("signup-error").textContent = "";
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
      return;
    }

    // Non-owner: only an approved telemarketer may use the dialer. New sign-ups and
    // not-yet-approved reps wait on the pending screen (the approval flag lives in
    // the telemarketers table, which reps cannot modify).
    $("appbar-title").textContent = "Dialer";
    let { data: rep } = await App.supabase
      .from("telemarketers").select("status").eq("profile_id", user.id).maybeSingle();
    if (!rep) {
      // First authenticated load (e.g. right after email confirmation): record the
      // signup so the owner gets an approval request even when email confirmation is on.
      await App.supabase.from("telemarketers")
        .upsert({ profile_id: user.id, status: "pending" }, { onConflict: "profile_id", ignoreDuplicates: true });
      rep = { status: "pending" };
    }
    if (rep.status !== "approved") {
      renderPending(rep.status);
      show("screen-pending");
      return;
    }

    show("screen-rep");
    window.DialerRep && window.DialerRep.init();
  }

  function appbar(on) { $("appbar").classList.toggle("hidden", !on); }

  function registerSW() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }
})();
