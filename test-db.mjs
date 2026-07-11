// Quick test: verify Supabase connection
// Run: node test-db.mjs
import { isEnabled, getDashboardStats } from './pipeline/lib/db.mjs';

console.log('Supabase enabled:', isEnabled());
if (isEnabled()) {
  const stats = await getDashboardStats();
  console.log('Dashboard stats:', stats);
  console.log('✅ Connection OK');
} else {
  console.log('❌ Supabase not configured — check .env for SUPABASE_URL and SUPABASE_SERVICE_KEY');
}
