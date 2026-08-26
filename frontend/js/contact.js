/**
 * CipherVault — contact.js
 * There is no backend endpoint for the contact form (this is an academic
 * project with no mail service configured). Validate on the client and
 * show a clear status message rather than pretending a message was sent
 * anywhere. If you wire up a real backend/mail route later, swap the
 * body of handleSubmit for a fetch() call the way auth.js does.
 */

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("contact-form");
  const submitBtn = document.getElementById("contact-submit-btn");
  const statusEl = document.getElementById("contact-status");

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    statusEl.textContent = "";

    const name = document.getElementById("contact-name").value.trim();
    const email = document.getElementById("contact-email").value.trim();
    const message = document.getElementById("contact-message").value.trim();

    if (!name || !email || !message) {
      statusEl.textContent = "Fill in your name, email, and a message before sending.";
      return;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      statusEl.textContent = "That email address doesn't look right.";
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Sending...";

    // No backend route exists for this yet — this is where a real
    // submission would go. For now, confirm locally and reset the form.
    setTimeout(() => {
      statusEl.textContent = `Thanks, ${name} — this demo form isn't wired to a mail service yet, so nothing was actually sent. See the note below for how to reach the team.`;
      submitBtn.disabled = false;
      submitBtn.textContent = "Send message";
      form.reset();
    }, 400);
  });
});
