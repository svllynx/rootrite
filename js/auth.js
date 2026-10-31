/* RootRite: log in, register, forgot and reset password. */

const params = new URLSearchParams(location.search);
const nextPage = /^[a-z0-9-]+\.html(#[\w-]*)?$/i.test(params.get("next") || "") ? params.get("next") : "app.html";
const forms = [...document.querySelectorAll(".auth-form")];
const tabs = [...document.querySelectorAll(".auth-switch [role=tab]")];
const message = document.getElementById("form-message");

function say(text, kind) {
  message.textContent = text;
  message.className = `notice${kind ? ` notice-${kind}` : ""}`;
  message.hidden = !text;
}

function setMode(mode, focus) {
  forms.forEach(f => { f.hidden = f.dataset.mode !== mode; });
  const tabMode = mode === "register" ? "register" : "login";
  tabs.forEach(t => {
    const on = t.dataset.mode === tabMode;
    t.setAttribute("aria-selected", on);
    t.tabIndex = on ? 0 : -1;
  });
  document.querySelector(".auth-switch").hidden = mode === "reset";
  document.title = { login: "Log in", register: "Create account", forgot: "Reset password", reset: "New password" }[mode] + " · RootRite";
  say("");
  const url = new URL(location.href);
  url.searchParams.set("mode", mode);
  history.replaceState(null, "", url);
  if (focus) document.querySelector(`.auth-form[data-mode="${mode}"] input`)?.focus();
}

function busy(form, on) {
  const b = form.querySelector("button[type=submit]");
  b.disabled = on;
  if (on) { b.dataset.label = b.textContent; b.textContent = "Please wait…"; }
  else if (b.dataset.label) b.textContent = b.dataset.label;
}

const validEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

tabs.forEach((t, i) => {
  t.addEventListener("click", () => setMode(t.dataset.mode, true));
  t.addEventListener("keydown", e => {
    const k = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (k) { e.preventDefault(); const n = tabs[(i + k + tabs.length) % tabs.length]; n.focus(); setMode(n.dataset.mode); }
  });
});
document.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => setMode(b.dataset.go, true)));
document.querySelectorAll("[data-price]").forEach(n => { n.textContent = RR_CONFIG.premiumPrice; });

const client = rrClient();
if (!client) {
  document.getElementById("setup-notice").hidden = false;
  forms.forEach(f => f.querySelectorAll("input, button[type=submit]").forEach(n => { n.disabled = true; }));
}

setMode(["login", "register", "forgot", "reset"].includes(params.get("mode")) ? params.get("mode") : "login");

if (client) {
  // Already signed in: go straight to the app, unless setting a new password.
  client.auth.getSession().then(({ data }) => {
    if (data.session && params.get("mode") !== "reset") location.replace(nextPage);
  });
  client.auth.onAuthStateChange(event => {
    if (event === "PASSWORD_RECOVERY") setMode("reset", true);
  });
}

document.getElementById("form-login").addEventListener("submit", async e => {
  e.preventDefault();
  const f = e.currentTarget, email = f.email.value.trim(), password = f.password.value;
  if (!validEmail(email)) return say("Enter a valid email address.", "error");
  if (!password) return say("Enter your password.", "error");
  busy(f, true);
  const { error } = await client.auth.signInWithPassword({ email, password });
  busy(f, false);
  if (error) return say(rrErrorText(error), "error");
  location.replace(nextPage);
});

document.getElementById("form-register").addEventListener("submit", async e => {
  e.preventDefault();
  const f = e.currentTarget;
  const name = f.fullname.value.trim(), email = f.email.value.trim(), password = f.password.value;
  if (!name) return say("Enter your full name.", "error");
  if (!validEmail(email)) return say("Enter a valid email address.", "error");
  if (password.length < 8) return say("Use a password of at least 8 characters.", "error");
  if (password !== f.confirm.value) return say("The two passwords don't match.", "error");
  busy(f, true);
  const { data, error } = await client.auth.signUp({
    email, password,
    options: { data: { full_name: name }, emailRedirectTo: new URL("app.html", location.href).href }
  });
  busy(f, false);
  if (error) return say(rrErrorText(error), "error");
  // Supabase returns a user with no identities when the email is already registered.
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return say("An account with this email already exists. Log in instead.", "error");
  }
  if (data.session) return location.replace(nextPage);
  f.reset();
  setMode("login");
  say(`Almost done. We sent a confirmation link to ${email}. Open it, then log in here.`, "ok");
});

document.getElementById("form-forgot").addEventListener("submit", async e => {
  e.preventDefault();
  const f = e.currentTarget, email = f.email.value.trim();
  if (!validEmail(email)) return say("Enter a valid email address.", "error");
  busy(f, true);
  const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: new URL("auth.html?mode=reset", location.href).href });
  busy(f, false);
  if (error) return say(rrErrorText(error), "error");
  say(`If ${email} has an account, a reset link is on its way.`, "ok");
});

document.getElementById("form-reset").addEventListener("submit", async e => {
  e.preventDefault();
  const f = e.currentTarget, password = f.password.value;
  if (password.length < 8) return say("Use a password of at least 8 characters.", "error");
  if (password !== f.confirm.value) return say("The two passwords don't match.", "error");
  busy(f, true);
  const { error } = await client.auth.updateUser({ password });
  busy(f, false);
  if (error) return say(rrErrorText(error), "error");
  say("Password saved. Taking you to the app…", "ok");
  setTimeout(() => location.replace("app.html"), 900);
});
