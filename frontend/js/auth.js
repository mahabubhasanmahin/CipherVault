/**
 * CipherVault — auth.js
 * Handles login/signup, stores JWT + role, redirects based on role.
 */

const API_BASE = window.CIPHERVAULT_API_BASE || "http://localhost:5000/api";

document.addEventListener("DOMContentLoaded", () => {
  const tabs = document.querySelectorAll(".tab");
  const heading = document.getElementById("form-heading");
  const submitBtn = document.getElementById("auth-submit-btn");
  const form = document.getElementById("auth-form");
  const errorEl = document.getElementById("auth-error");

  let mode = "login";

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      mode = tab.dataset.mode;
      heading.textContent = mode === "login" ? "Welcome back." : "Create your vault.";
      submitBtn.textContent = mode === "login" ? "Log in" : "Sign up";
      errorEl.textContent = "";
    });
  });

  // already logged in? skip straight to the right dashboard
  const existingToken = localStorage.getItem("cv_token");
  if (existingToken) {
    redirectByRole(localStorage.getItem("cv_role"));
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.textContent = "";

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    if (!email || !password) {
      errorEl.textContent = "Enter both email and password.";
      return;
    }

    const endpoint = mode === "login" ? "/auth/login" : "/auth/signup";

    try {
      submitBtn.disabled = true;
      submitBtn.textContent = "Working...";

      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error(`Server returned an unexpected response (status ${res.status}). Check that the API URL is reachable.`);
      }

      if (!res.ok) {
        throw new Error(data.error || `Request failed (status ${res.status}).`);
      }

      localStorage.setItem("cv_token", data.token);
      localStorage.setItem("cv_user_id", data.user_id);
      localStorage.setItem("cv_role", data.role || "user");
      redirectByRole(data.role);
    } catch (err) {
      // Most common real-world cause of a blank/failed signup or login:
      // the frontend is still pointed at localhost while deployed, or the
      // backend/database is unreachable. TypeError: Failed to fetch means
      // the request never reached the server at all.
      if (err instanceof TypeError) {
        errorEl.textContent = "Could not reach the server. Check that the backend is running and CIPHERVAULT_API_BASE is set correctly.";
      } else {
        errorEl.textContent = err.message;
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = mode === "login" ? "Log in" : "Sign up";
    }
  });
});

function redirectByRole(role) {
  window.location.href = role === "admin" ? "admin.html" : "dashboard.html";
}
