/**
 * CipherVault — contact.js
 * There is no backend endpoint for the contact form (this is an academic
 * project with no mail service configured). Validate on the client and
 * show a clear status message rather than pretending a message was sent
 * anywhere. If you wire up a real backend/mail route later, swap the
 * body of the setTimeout block below for a fetch() call the way auth.js
 * calls the API.
 */

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("contact-form");
  const submitBtn = document.getElementById("contact-submit-btn");
  const statusEl = document.getElementById("contact-status");
  const nameInput = document.getElementById("contact-name");
  const emailInput = document.getElementById("contact-email");
  const messageInput = document.getElementById("contact-message");
  const charCountEl = document.getElementById("contact-char-count");

  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function setStatus(message, kind) {
    statusEl.textContent = message;
    statusEl.classList.remove("status-error", "status-success");
    if (kind) statusEl.classList.add(`status-${kind}`);
  }

  // Live character counter for the message field.
  if (messageInput && charCountEl) {
    messageInput.addEventListener("input", () => {
      charCountEl.textContent = messageInput.value.length;
    });
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    const message = messageInput.value.trim();

    if (!name || !email || !message) {
      setStatus("Fill in your name, email, and a message before sending.", "error");
      return;
    }

    if (!EMAIL_PATTERN.test(email)) {
      setStatus("That email address doesn't look right.", "error");
      emailInput.focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Sending...";
    setStatus("", null);

    // No backend route exists for this yet — this is where a real
    // submission would go. For now, confirm locally and reset the form.
    setTimeout(() => {
      setStatus(
        `Thanks, ${name} — this demo form isn't wired to a mail service yet, so nothing was actually sent. See "Other ways to reach us" for how to contact the team directly.`,
        "success"
      );
      submitBtn.disabled = false;
      submitBtn.textContent = "Send message";
      form.reset();
      if (charCountEl) charCountEl.textContent = "0";
    }, 400);
  });
});
