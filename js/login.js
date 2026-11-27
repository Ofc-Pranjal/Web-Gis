// Login page logic — Supabase email/password auth.

const authForm = document.getElementById('authForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const submitBtn = document.getElementById('submitBtn');
const submitLabel = document.getElementById('submitLabel');
const messageBox = document.getElementById('authMessage');
const switchBtn = document.getElementById('switchBtn');
const switchPrompt = document.getElementById('switchPrompt');
const resetBtn = document.getElementById('resetBtn');
const revealBtn = document.getElementById('revealBtn');

let mode = 'signin'; // or 'signup'

// Already signed in? Go straight to the map.
supabaseClient.auth.getSession().then(({ data }) => {
  if (data.session) window.location.replace('index.html');
});

function showMessage(text, type) {
  messageBox.textContent = text;
  messageBox.className = `message ${type}`;
  messageBox.hidden = false;
}

function clearMessage() {
  messageBox.hidden = true;
  messageBox.textContent = '';
}

function setBusy(busy, busyLabel) {
  submitBtn.disabled = busy;
  submitLabel.textContent = busy ? busyLabel : (mode === 'signin' ? 'Sign In' : 'Create Account');
}

function setMode(next) {
  mode = next;
  clearMessage();
  if (mode === 'signin') {
    submitLabel.textContent = 'Sign In';
    switchPrompt.textContent = "Don't have an account?";
    switchBtn.textContent = 'Create one';
    passwordInput.setAttribute('autocomplete', 'current-password');
    passwordInput.placeholder = 'Enter your password';
    resetBtn.hidden = false;
  } else {
    submitLabel.textContent = 'Create Account';
    switchPrompt.textContent = 'Already registered?';
    switchBtn.textContent = 'Sign in';
    passwordInput.setAttribute('autocomplete', 'new-password');
    passwordInput.placeholder = 'At least 6 characters';
    resetBtn.hidden = true;
  }
}

switchBtn.addEventListener('click', () => setMode(mode === 'signin' ? 'signup' : 'signin'));

revealBtn.addEventListener('click', () => {
  const hidden = passwordInput.type === 'password';
  passwordInput.type = hidden ? 'text' : 'password';
  revealBtn.innerHTML = `<i class="fas fa-eye${hidden ? '-slash' : ''}"></i>`;
  revealBtn.title = hidden ? 'Hide password' : 'Show password';
});

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearMessage();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (mode === 'signin') {
    setBusy(true, 'Signing in...');
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      showMessage(error.message || 'Unable to sign in. Check your credentials.', 'error');
      return;
    }
    window.location.replace('index.html');
  } else {
    setBusy(true, 'Creating account...');
    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    setBusy(false);
    if (error) {
      showMessage(error.message || 'Unable to create the account.', 'error');
      return;
    }
    // With email confirmation enabled Supabase returns a user but no session.
    if (data.session) {
      window.location.replace('index.html');
    } else {
      showMessage(`Account created. Check ${email} for the confirmation link, then sign in.`, 'success');
      setMode('signin');
    }
  }
});

resetBtn.addEventListener('click', async () => {
  const email = emailInput.value.trim();
  if (!email) {
    showMessage('Enter your email address first, then click the reset link again.', 'error');
    return;
  }
  clearMessage();
  const redirectTo = window.location.href.replace(/login\.html.*$/, 'login.html');
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) showMessage(error.message || 'Could not send the reset email.', 'error');
  else showMessage(`Password reset link sent to ${email}.`, 'success');
});
