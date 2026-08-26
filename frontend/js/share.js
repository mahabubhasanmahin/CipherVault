/**
 * CipherVault — share.js
 */

const API_BASE = window.CIPHERVAULT_API_BASE || "http://localhost:5000/api";

let shareData = null;

document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");

  if (!token) {
    showError("No share token provided in the link.");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/share/${token}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Link invalid or expired.");

    shareData = data;
    document.getElementById("share-filename").textContent = data.filename;
    document.getElementById("share-algorithm").textContent = data.algorithm;
    document.getElementById("share-panel").style.display = "block";
  } catch (err) {
    showError(err.message);
  }

  document.getElementById("unlock-btn").addEventListener("click", handleUnlock);
});

function showError(msg) {
  const panel = document.getElementById("load-error-panel");
  panel.style.display = "block";
  document.getElementById("load-error-text").textContent = msg;
}

async function handleUnlock() {
  const passphrase = document.getElementById("share-passphrase").value;

  // RSA-OAEP has no passphrase — it needs the recipient's private key
  // (JWK) instead. Previously this was hardcoded to null, so an RSA
  // shared item could never actually be decrypted here.
  let privateKeyJwk = null;
  if (shareData.algorithm === "RSA-OAEP") {
    const jwkStr = prompt("Paste the RSA private key (JWK JSON) you were given:");
    if (!jwkStr) return;
    try {
      privateKeyJwk = JSON.parse(jwkStr);
    } catch {
      alert("That doesn't look like valid JWK JSON.");
      return;
    }
  } else if (!passphrase) {
    alert("Enter the passphrase.");
    return;
  }

  try {
    const plainBytes = await CipherVaultCrypto.decrypt(
      shareData.algorithm, shareData.ciphertext, passphrase, privateKeyJwk
    );
    const decoded = new TextDecoder().decode(plainBytes);

    document.getElementById("result-panel").classList.remove("hidden");
    document.getElementById("result-output").value = decoded;
  } catch (err) {
    alert("Decryption failed — wrong passphrase or corrupted link.");
  }
}
