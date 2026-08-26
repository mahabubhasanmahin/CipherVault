/**
 * CipherVault — client-side encryption.
 * Plaintext never leaves the browser: AES-GCM and RSA-OAEP use the native
 * Web Crypto API; ChaCha20-Poly1305 (not in Web Crypto) uses libsodium.js.
 */

const CipherVaultCrypto = (() => {

  function toB64(buf) {
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
  }
  function fromB64(b64) {
    return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  }

  async function deriveKeyAESGCM(passphrase, salt) {
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey(
      "raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: 200000, hash: "SHA-256" },
      baseKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  async function encryptAESGCM(plaintextBytes, passphrase) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKeyAESGCM(passphrase, salt);
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintextBytes);

    const packed = new Uint8Array(salt.length + iv.length + ct.byteLength);
    packed.set(salt, 0);
    packed.set(iv, salt.length);
    packed.set(new Uint8Array(ct), salt.length + iv.length);

    return { ciphertext: toB64(packed), iv: toB64(iv) };
  }

  async function decryptAESGCM(ciphertextB64, passphrase) {
    const packed = fromB64(ciphertextB64);
    const salt = packed.slice(0, 16);
    const iv = packed.slice(16, 28);
    const ct = packed.slice(28);
    const key = await deriveKeyAESGCM(passphrase, salt);
    const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    return new Uint8Array(plainBuf);
  }

  async function generateRSAKeyPair() {
    return crypto.subtle.generateKey(
      { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["encrypt", "decrypt"]
    );
  }

  async function encryptRSA(plaintextBytes, publicKey) {
    const ct = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, plaintextBytes);
    return { ciphertext: toB64(ct), iv: null };
  }

  async function decryptRSA(ciphertextB64, privateKey) {
    const ct = fromB64(ciphertextB64);
    const plainBuf = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateKey, ct);
    return new Uint8Array(plainBuf);
  }

  async function encryptChaCha20(plaintextBytes, passphrase) {
    await sodium.ready;
    const salt = sodium.randombytes_buf(16);
    const key = sodium.crypto_pwhash(
      32, passphrase, salt,
      sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
      sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
      sodium.crypto_pwhash_ALG_DEFAULT
    );
    const nonce = sodium.randombytes_buf(sodium.crypto_aead_chacha20poly1305_ietf_NPUBBYTES);
    const ct = sodium.crypto_aead_chacha20poly1305_ietf_encrypt(plaintextBytes, null, null, nonce, key);

    const packed = new Uint8Array(salt.length + nonce.length + ct.length);
    packed.set(salt, 0);
    packed.set(nonce, salt.length);
    packed.set(ct, salt.length + nonce.length);

    return { ciphertext: toB64(packed), iv: toB64(nonce) };
  }

  async function decryptChaCha20(ciphertextB64, passphrase) {
    await sodium.ready;
    const packed = fromB64(ciphertextB64);
    const salt = packed.slice(0, 16);
    const nonce = packed.slice(16, 16 + sodium.crypto_aead_chacha20poly1305_ietf_NPUBBYTES);
    const ct = packed.slice(16 + sodium.crypto_aead_chacha20poly1305_ietf_NPUBBYTES);

    const key = sodium.crypto_pwhash(
      32, passphrase, salt,
      sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
      sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
      sodium.crypto_pwhash_ALG_DEFAULT
    );
    return sodium.crypto_aead_chacha20poly1305_ietf_decrypt(null, ct, null, nonce, key);
  }

  async function encrypt(algorithm, plaintextBytes, passphrase) {
    if (algorithm === "AES-GCM") return encryptAESGCM(plaintextBytes, passphrase);
    if (algorithm === "ChaCha20") return encryptChaCha20(plaintextBytes, passphrase);
    if (algorithm === "RSA-OAEP") {
      const keyPair = await generateRSAKeyPair();
      const result = await encryptRSA(plaintextBytes, keyPair.publicKey);
      const exportedPrivate = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
      result.privateKeyJwk = exportedPrivate;
      return result;
    }
    throw new Error("Unsupported algorithm: " + algorithm);
  }

  async function decrypt(algorithm, ciphertextB64, passphrase, privateKeyJwk) {
    if (algorithm === "AES-GCM") return decryptAESGCM(ciphertextB64, passphrase);
    if (algorithm === "ChaCha20") return decryptChaCha20(ciphertextB64, passphrase);
    if (algorithm === "RSA-OAEP") {
      const privateKey = await crypto.subtle.importKey(
        "jwk", privateKeyJwk, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["decrypt"]
      );
      return decryptRSA(ciphertextB64, privateKey);
    }
    throw new Error("Unsupported algorithm: " + algorithm);
  }

  return { encrypt, decrypt, toB64, fromB64 };
})();
