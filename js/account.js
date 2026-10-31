/* RootRite: the Supabase client and account helpers shared by every page. */

let rrClientInstance = null;

function rrConfigured() {
  const c = window.RR_CONFIG || {};
  return /^https:\/\/.+\.supabase\.co\/?$/.test(c.supabaseUrl || "") && (c.supabaseAnonKey || "").length > 40;
}

function rrClient() {
  if (rrClientInstance) return rrClientInstance;
  if (!rrConfigured() || !window.supabase) return null;
  rrClientInstance = window.supabase.createClient(RR_CONFIG.supabaseUrl, RR_CONFIG.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  return rrClientInstance;
}

/* The signed-in user and their profile row, or null. */
async function rrCurrentAccount() {
  const client = rrClient();
  if (!client) return null;
  const { data: { session } } = await client.auth.getSession();
  if (!session) return null;
  const { data: profile, error } = await client.from("profiles").select("full_name, plan, premium_since").eq("id", session.user.id).single();
  if (error) console.warn("RootRite: could not load the profile", error.message);
  return {
    user: session.user,
    name: profile?.full_name || session.user.user_metadata?.full_name || session.user.email,
    plan: profile?.plan === "premium" ? "premium" : "free",
    premiumSince: profile?.premium_since || null
  };
}

/* Demo checkout: switches the plan through a database function; no payment is taken. */
async function rrSetPlan(plan) {
  const client = rrClient();
  const { data, error } = await client.rpc("set_demo_plan", { new_plan: plan });
  if (error) throw error;
  return data;
}

async function rrSignOut() {
  const client = rrClient();
  if (client) await client.auth.signOut();
  location.href = "index.html";
}

/* Supabase error messages, in plain words */
function rrErrorText(err) {
  const m = (err && err.message) || String(err || "");
  if (/invalid login credentials/i.test(m)) return "That email and password don't match an account.";
  if (/email not confirmed/i.test(m)) return "Confirm your email first: open the link we sent you, then log in.";
  if (/already registered|already been registered/i.test(m)) return "An account with this email already exists. Log in instead.";
  if (/password should be at least/i.test(m)) return "Use a password of at least 8 characters.";
  if (/rate limit|too many/i.test(m)) return "Too many attempts. Wait a minute and try again.";
  if (/failed to fetch|network/i.test(m)) return "Can't reach the server. Check your connection and try again.";
  return m || "Something went wrong. Try again.";
}
