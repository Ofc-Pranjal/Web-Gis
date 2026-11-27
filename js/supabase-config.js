// Shared Supabase connection used by both the login page and the map app.
const supabaseUrl = 'https://nmywnznzyxvcyrbxwley.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5teXduem56eXh2Y3lyYnh3bGV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3NzM4NDcsImV4cCI6MjA5NDM0OTg0N30.YUP_uUjULYnL4w6nzWOlWeRWqWVPSs4w8Ok68yqAI_U';

const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  }
});
