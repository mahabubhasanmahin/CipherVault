/**
 * CipherVault — dashboard.js
 */

const API_BASE = window.CIPHERVAULT_API_BASE || "http://localhost:5000/api";

function authHeader() {
  const token = localStorage.getItem("cv_token");
  return token ? { "Authorization": "Bearer " + token } : {};
}

function requireAuth() {
  if (!localStorage.getItem("cv_token")) {
    window.location.href = "login.html";
    return false;
  }
  return true;
}

document.addEventListener("DOMContentLoaded", () => {
  if (!requireAuth()) return;

  document.getElementById("logout-link").addEventListener("click", (e) => {
    e.preventDefault();
    localStorage.removeItem("cv_token");
    localStorage.removeItem("cv_user_id");
    window.location.href = "login.html";
  });

  loadVaultItems();
});

async function loadVaultItems() {
  const tbody = document.getElementById("vault-body");
  const emptyState = document.getElementById("empty-state");

  try {
    const res = await fetch(`${API_BASE}/vault`, { headers: authHeader() });
    if (res.status === 401) {
      localStorage.removeItem("cv_token");
      window.location.href = "login.html";
      return;
    }
    const items = await res.json();

    tbody.innerHTML = "";
    if (!items.length) {
      emptyState.classList.remove("hidden");
      return;
    }
    emptyState.classList.add("hidden");

    items.forEach(item => {
      const tr = document.createElement("tr");
      const created = new Date(item.created_at).toLocaleString();
      tr.innerHTML = `
        <td>${escapeHtml(item.filename)}</td>
        <td><span class="badge">${escapeHtml(item.algorithm)}</span></td>
        <td>${created}</td>
        <td class="actions">
          <button class="btn btn-ghost btn-small" data-action="share" data-id="${item.item_id}">Share</button>
          <button class="btn btn-danger btn-small" data-action="delete" data-id="${item.item_id}">Delete</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll("[data-action='delete']").forEach(btn => {
      btn.addEventListener("click", () => deleteItem(btn.dataset.id));
    });
    tbody.querySelectorAll("[data-action='share']").forEach(btn => {
      btn.addEventListener("click", () => shareItem(btn.dataset.id));
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-state">Could not load vault: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function deleteItem(itemId) {
  if (!confirm("Delete this item permanently?")) return;
  try {
    const res = await fetch(`${API_BASE}/vault/${itemId}`, {
      method: "DELETE",
      headers: authHeader(),
    });
    if (!res.ok) throw new Error((await res.json()).error || "delete failed");
    loadVaultItems();
  } catch (err) {
    alert("Could not delete: " + err.message);
  }
}

async function shareItem(itemId) {
  try {
    const res = await fetch(`${API_BASE}/share/${itemId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ expires_in_hours: 24 }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "failed");

    const link = `${window.location.origin}/share.html?token=${data.share_token}`;
    document.getElementById("share-result-panel").classList.remove("hidden");
    document.getElementById("share-link-box").value = link;
  } catch (err) {
    alert("Could not create share link: " + err.message);
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
