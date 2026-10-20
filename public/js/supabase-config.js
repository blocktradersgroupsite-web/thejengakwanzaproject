// JENGAKWANZA Supabase Cloud Backend Configuration
//
// HOW TO CONFIGURE SUPABASE:
// 1. Go to https://supabase.com/dashboard
// 2. Click "New Project" and choose your region
// 3. Open "SQL Editor" -> Click "New query" -> Paste the script from supabase/schema.sql -> Click "Run"
// 4. In Supabase Dashboard -> Project Settings -> API:
//    - Copy "Project URL" (URL)
//    - Copy "anon public" (anonKey)
// 5. Paste them into the "Supabase Cloud Backend" section inside JENGAKWANZA Settings!

window.SUPABASE_CONFIG = {
  url: "",
  anonKey: ""
};

// Check if saved in localStorage
const savedSupabaseConfig = localStorage.getItem('jengakwanza_supabase_config');
if (savedSupabaseConfig) {
  try {
    const parsed = JSON.parse(savedSupabaseConfig);
    if (parsed && parsed.url && parsed.anonKey) {
      window.SUPABASE_CONFIG = parsed;
    }
  } catch (e) {
    console.warn('Could not parse stored Supabase config:', e);
  }
}
