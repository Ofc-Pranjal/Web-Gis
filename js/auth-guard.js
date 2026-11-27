// Gate the map app behind a Supabase session.
// Loaded before app.js; the page stays hidden until the session check resolves.

(async function guard() {
  const { data } = await supabaseClient.auth.getSession();

  if (!data.session) {
    window.location.replace('login.html');
    return;
  }

  // Used by the layer loader in app.js so REST reads run as the signed-in user.
  window.authToken = data.session.access_token;

  document.documentElement.classList.remove('auth-pending');

  const emailLabel = document.getElementById('userEmail');
  if (emailLabel) emailLabel.textContent = data.session.user.email || '';

  // Bounce to the login page if the session ends (sign out, token revoked, expiry).
  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (!session) {
      window.location.replace('login.html');
      return;
    }
    window.authToken = session.access_token;
  });
})();

async function logout() {
  await supabaseClient.auth.signOut();
  window.location.replace('login.html');
}
