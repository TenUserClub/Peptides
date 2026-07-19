// Quick test: verify Supabase connection
// Run: node test-db.mjs
import { isEnabled, checkConnection, getDashboardStats } from './pipeline/lib/db.mjs';

console.log('Supabase enabled:', isEnabled());
if (isEnabled()) {
  const connection = await checkConnection();
  if (!connection.ok) {
    console.error('Supabase connection or schema check failed:', connection.error);
    process.exitCode = 1;
  } else {
    const stats = await getDashboardStats();
    console.log('Dashboard stats:', stats);
    console.log('Connection OK');
  }
} else {
  console.log('Supabase is optional and is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the root .env file to enable it.');
}
