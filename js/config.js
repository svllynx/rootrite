/*
  RootRite: Supabase connection.
  Paste your project's values from Supabase → Project Settings → API.
  The anon key is meant to be public; the database rules in supabase/schema.sql protect the data.
*/
window.RR_CONFIG = {
  supabaseUrl: "https://mvobkmfazkwwkrhimxfe.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12b2JrbWZhemt3d2tyaGlteGZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0NDQ1MzYsImV4cCI6MjEwOTAyMDUzNn0.8ZWcs0mHZ-V1kFA8pdJm5x8v0_gnVNwjRBjp4k1ZnIg",
  premiumPrice: "₱75",
  seasonPrice: "₱299", // also written on the pricing card in index.html
  seasonMonths: 6,     // also set in set_demo_plan in supabase/schema.sql
  orgPrice: "₱649",
  orgSeats: 10 // also set in join_organisation in supabase/schema.sql
};
