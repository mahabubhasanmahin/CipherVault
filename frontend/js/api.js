/**
 * CipherVault — page controller for index.html
 */

const API_BASE = window.CIPHERVAULT_API_BASE || "http://localhost:5000/api";

let lastResult = null;

document.addEventListener("DOMContentLoaded", () => {
  const tabs = document.querySelectorAll(".tab");
  const textGroup = document.getElementById("text-input-group");
  const fileGroup = document.getElementById("file-input-group");
  const fileInput = document.getElementById("file-input");
  const fileNameHint = document.getElementById("file-name-hint");

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      const isText = tab.dataset.tab === "text";
      textGroup.classList.toggle("hidden", !isText);
      fileGroup.classList.toggle("hidden", isText);
    });
  });

  fileInput.addEventListener("change", () => {
    fileNameHint.textContent = fileInput.files[0] ? `Selected: ${fileInput.files[0].name}` : "";
  });

  document.getElementById("encrypt-btn").addEventListener("click", handleEncrypt);
  document.getElementById("decrypt-btn").addEventListener("click", handleDecrypt);
  document.getElementById("copy-btn").addEventListener("click", copyResult);
  document.getElementById("save-vault-btn").addEventListener("click", saveToVault);
  document.getElementById("share-btn").addEventListener("click", createShareLink);
});

async function getInputBytes() {
  const activeTab = document.querySelector(".tab.active").dataset.tab;
  if (activeTab === "file") {
    const file = document.getElementById("file-input").files[0];
    if (!file) throw new Error("Choose a file first.");
    return { bytes: new Uint8Array(await file.arrayBuffer()), filename: file.name, isFile: true };
  }
  const text = document.getElementById("plaintext").value;
  if (!text) throw new Error("Enter some text first.");
  return { bytes: new TextEncoder().encode(text), filename: "text-item", isFile: false };
}

async function handleEncrypt() {
  try {
    const algorithm = document.getElementById("algorithm").value;
    const passphrase = document.getElementById("passphrase").value;
    if (algorithm !== "RSA-OAEP" && !passphrase) {
      alert("Enter a passphrase.");
      return;
    }

    const { bytes, filename, isFile } = await getInputBytes();
    const result = await CipherVaultCrypto.encrypt(algorithm, bytes, passphrase);
    result.algorithm = algorithm;
    result.filename = filename;
    lastResult = result;

    const title = isFile ? `Encrypted "${filename}" (base64)` : "Encrypted (base64)";
    showResult(
      title,
      result.ciphertext + (result.privateKeyJwk
        ? "\n\n⚠ Save this private key — it will not be shown again:\n" + JSON.stringify(result.privateKeyJwk)
        : "")
    );
  } catch (err) {
    alert("Encryption failed: " + err.message);
  }
}

async function handleDecrypt() {
  try {
    const algorithm = document.getElementById("algorithm").value;
    const passphrase = document.getElementById("passphrase").value;
    const ciphertext = document.getElementById("plaintext").value.trim();
    if (!ciphertext) throw new Error("Paste ciphertext into the text box to decrypt.");

    let privateKeyJwk = null;
    if (algorithm === "RSA-OAEP") {
      const jwkStr = prompt("Paste your RSA private key (JWK JSON):");
      if (!jwkStr) return;
      privateKeyJwk = JSON.parse(jwkStr);
    }

    const plainBytes = await CipherVaultCrypto.decrypt(algorithm, ciphertext, passphrase, privateKeyJwk);
    const decoded = new TextDecoder().decode(plainBytes);
    showResult("Decrypted", decoded);
  } catch (err) {
    alert("Decryption failed — check your passphrase/key. (" + err.message + ")");
  }
}

function showResult(title, text) {
  document.getElementById("result-panel").classList.remove("hidden");
  document.getElementById("result-title").textContent = title;
  document.getElementById("result-output").value = text;
  document.getElementById("share-link-output").textContent = "";
}

function copyResult() {
  const output = document.getElementById("result-output");
  output.select();
  document.execCommand("copy");
}

function authHeader() {
  const token = localStorage.getItem("cv_token");
  return token ? { "Authorization": "Bearer " + token } : {};
}

async function saveToVault() {
  if (!lastResult) return;
  const token = localStorage.getItem("cv_token");
  if (!token) {
    alert("Log in first to save items to your vault.");
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/vault`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({
        algorithm: lastResult.algorithm,
        ciphertext: lastResult.ciphertext,
        iv: lastResult.iv,
        filename: lastResult.filename || ("item-" + Date.now()),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "save failed");
    alert("Saved to vault (id: " + data.item_id + ")");
    lastResult.item_id = data.item_id;
  } catch (err) {
    alert("Could not save: " + err.message);
  }
}

async function createShareLink() {
  if (!lastResult || !lastResult.item_id) {
    alert("Save to vault first, then create a share link.");
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/share/${lastResult.item_id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ expires_in_hours: 24 }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "failed");
    const link = `${window.location.origin}/share.html?token=${data.share_token}`;
    document.getElementById("share-link-output").textContent = "Share link (expires in 24h): " + link;
  } catch (err) {
    alert("Could not create link: " + err.message);
  }
}
