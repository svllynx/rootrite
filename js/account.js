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
  const { data: profile, error } = await client.from("profiles").select("full_name, plan, premium_since, free_site_used, billing, premium_until").eq("id", session.user.id).single();
  if (error) console.warn("RootRite: could not load the profile", error.message);
  const passEnded = !!profile?.premium_until && new Date(profile.premium_until) <= new Date();
  return {
    user: session.user,
    name: profile?.full_name || session.user.user_metadata?.full_name || session.user.email,
    plan: profile?.plan === "premium" && !passEnded ? "premium" : "free",
    premiumSince: profile?.premium_since || null,
    billing: profile?.billing || null,
    premiumUntil: profile?.premium_until || null,
    passEnded,
    freeSiteUsed: !!profile?.free_site_used
  };
}

/* The organisations this person belongs to, with their role in each. */
async function rrMyOrganisations() {
  const client = rrClient();
  if (!client) return [];
  const { data: { session } } = await client.auth.getSession();
  if (!session) return [];
  const { data, error } = await client.from("org_members").select("role, organisations(id, name, kind)").eq("user_id", session.user.id);
  if (error) { console.warn("RootRite: could not load organisations", error.message); return []; }
  return (data || []).filter(m => m.organisations).map(m => ({ ...m.organisations, role: m.role }));
}

/* Demo checkout: switches the plan through a database function; no payment is taken. */
async function rrSetPlan(plan, billing = "monthly") {
  const client = rrClient();
  const { data, error } = await client.rpc("set_demo_plan", { new_plan: plan, new_billing: billing });
  if (error) throw error;
  return data;
}

/* Counts which upgrade prompts people tap, with no link to who tapped. It never gets in the way if it fails. */
function rrCountUpgrade(source, kind, billing = null) {
  try {
    rrClient()?.from("upgrade_events").insert({ source, kind, billing }).then(() => {}, () => {});
  } catch (e) { /* counting is optional */ }
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
