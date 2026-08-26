/**
 * CipherVault — admin.js
 * Requires a JWT with role=admin (from login.html signing in with the
 * ADMIN_EMAIL/ADMIN_PASSWORD account, or any user promoted to admin
 * directly in the users collection).
 */

const API_BASE = window.CIPHERVAULT_API_BASE || "http://localhost:5000/api";

function authHeader() {
  const token = localStorage.getItem("cv_token");
  return token ? { "Authorization": "Bearer " + token } : {};
}

document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("cv_token");
  const role = localStorage.getItem("cv_role");

  if (!token) {
    window.location.href = "login.html";
    return;
  }
  if (role !== "admin") {
    // Logged in, but not an admin — send them to their normal dashboard.
    window.location.href = "dashboard.html";
    return;
  }

  document.getElementById("logout-link").addEventListener("click", (e) => {
    e.preventDefault();
    localStorage.removeItem("cv_token");
    localStorage.removeItem("cv_user_id");
    localStorage.removeItem("cv_role");
    window.location.href = "login.html";
  });

  loadStats();
  loadUsers();
  loadAllVaultItems();
});

async function loadStats() {
  try {
    const res = await fetch(`${API_BASE}/admin/stats`, { headers: authHeader() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "failed to load stats");

    document.getElementById("stat-total-users").textContent = data.total_users;
    document.getElementById("stat-admins").textContent = data.total_admins;
    document.getElementById("stat-regular").textContent = data.total_regular_users;
    document.getElementById("stat-items").textContent = data.total_vault_items;
  } catch (err) {
    // Non-critical — leave the placeholders ("—") if this fails.
    console.error("Could not load stats:", err.message);
  }
}

async function loadUsers() {
  const tbody = document.getElementById("users-body");
  const empty = document.getElementById("users-empty");
  try {
    const res = await fetch(`${API_BASE}/admin/users`, { headers: authHeader() });
    if (res.status === 403) {
      window.location.href = "dashboard.html";
      return;
    }
    const users = await res.json();
    if (!res.ok) throw new Error(users.error || "failed to load users");

    tbody.innerHTML = "";
    if (!users.length) {
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");

    users.forEach(u => {
      const tr = document.createElement("tr");
      const created = u.created_at ? new Date(u.created_at).toLocaleString() : "—";
      const roleBadgeClass = u.role === "admin" ? "badge badge-admin" : "badge";
      tr.innerHTML = `
        <td>${escapeHtml(u.email)}</td>
        <td><span class="${roleBadgeClass}">${escapeHtml(u.role || "user")}</span></td>
        <td>${created}</td>
        <td class="actions">
          <button class="btn btn-danger btn-small" data-action="delete-user" data-id="${u.user_id}" ${u.role === "admin" ? "disabled title='cannot delete an admin account here'" : ""}>Delete</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll("[data-action='delete-user']").forEach(btn => {
      btn.addEventListener("click", () => deleteUser(btn.dataset.id));
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-state">Could not load users: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function deleteUser(userId) {
  if (!confirm("Delete this user and all of their vault items?")) return;
  try {
    const res = await fetch(`${API_BASE}/admin/users/${userId}`, {
      method: "DELETE",
      headers: authHeader(),
    });
    if (!res.ok) throw new Error((await res.json()).error || "delete failed");
    loadUsers();
    loadAllVaultItems();
  } catch (err) {
    alert("Could not delete user: " + err.message);
  }
}

async function loadAllVaultItems() {
  const tbody = document.getElementById("items-body");
  const empty = document.getElementById("items-empty");
  try {
    const res = await fetch(`${API_BASE}/admin/vault`, { headers: authHeader() });
    const items = await res.json();
    if (!res.ok) throw new Error(items.error || "failed to load vault items");

    tbody.innerHTML = "";
    if (!items.length) {
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");

    items.forEach(item => {
      const tr = document.createElement("tr");
      const created = new Date(item.created_at).toLocaleString();
      tr.innerHTML = `
        <td>${escapeHtml(item.filename)}</td>
        <td>${escapeHtml(item.owner_id)}</td>
        <td><span class="badge">${escapeHtml(item.algorithm)}</span></td>
        <td>${created}</td>
        <td class="actions">
          <button class="btn btn-danger btn-small" data-action="delete-item" data-id="${item.item_id}">Delete</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll("[data-action='delete-item']").forEach(btn => {
      btn.addEventListener("click", () => deleteVaultItem(btn.dataset.id));
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Could not load vault items: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function deleteVaultItem(itemId) {
  if (!confirm("Delete this vault item permanently?")) return;
  try {
    const res = await fetch(`${API_BASE}/admin/vault/${itemId}`, {
      method: "DELETE",
      headers: authHeader(),
    });
    if (!res.ok) throw new Error((await res.json()).error || "delete failed");
    loadAllVaultItems();
  } catch (err) {
    alert("Could not delete item: " + err.message);
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
