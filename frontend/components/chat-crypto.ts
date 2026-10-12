// Versioned browser envelope. Private keys remain non-exportable in IndexedDB.
export type ChatIdentity = { privateKey: CryptoKey; publicKey: string };
type Envelope = { v: 1; ciphertext: string; keys: Record<string, string> };
const algorithm = { name: 'RSA-OAEP', hash: 'SHA-256' };
const bytes = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0));
const base64 = (value: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(value)));
const context = (conversation: string, sender: string) => new TextEncoder().encode(`rmf-chat-v1:${conversation}:${sender}`);

async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('rmf-chat-keys', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('identities');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Allow browser storage to use messages.'));
  });
}
async function stored(user: string, value?: ChatIdentity): Promise<ChatIdentity | undefined> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('identities', value ? 'readwrite' : 'readonly');
      const request = value ? tx.objectStore('identities').put(value, user) : tx.objectStore('identities').get(user);
      tx.oncomplete = () => resolve(value || request.result);
      tx.onerror = () => reject(new Error('Unable to save messaging keys in this browser.'));
      tx.onabort = () => reject(new Error('Unable to save messaging keys in this browser.'));
    });
  } finally { db.close(); }
}
export async function createIdentity(): Promise<ChatIdentity> {
  const pair = await crypto.subtle.generateKey({ ...algorithm, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) }, false, ['wrapKey', 'unwrapKey']);
  return { privateKey: pair.privateKey, publicKey: JSON.stringify(await crypto.subtle.exportKey('jwk', pair.publicKey)) };
}
export async function prepareIdentity(user: string, getPublic: () => Promise<string | null>, publish: (key: string) => Promise<void>) {
  if (!crypto.subtle || !navigator.locks) throw new Error('Open this page using HTTPS or localhost to use messages.');
  return navigator.locks.request(`rmf-chat:${user}`, async () => {
    let local = await stored(user);
    const remote = await getPublic();
    if (remote && (!local || local.publicKey !== remote)) {
      throw new Error('Open Messages in the browser you originally used. Your messaging key is not available in this browser.');
    }
    if (!local) { local = await createIdentity(); await stored(user, local); }
    if (!remote) await publish(local.publicKey);
    return local;
  });
}
async function publicKey(value: string) {
  return crypto.subtle.importKey('jwk', JSON.parse(value), algorithm, false, ['wrapKey']);
}
export async function encryptMessage(text: string, conversation: string, sender: string, recipients: Record<string, string>) {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: context(conversation, sender) }, key, new TextEncoder().encode(text));
  const keys: Record<string, string> = {};
  for (const [id, value] of Object.entries(recipients)) keys[id] = base64(await crypto.subtle.wrapKey('raw', key, await publicKey(value), 'RSA-OAEP'));
  return { encrypted_content: JSON.stringify({ v: 1, ciphertext: base64(ciphertext), keys } satisfies Envelope), encryption_nonce: base64(iv.buffer), message_type: 'text' };
}
export async function decryptMessage(message: { encrypted_content: string | null; encryption_nonce: string | null; conversation_id: string; sender_id: string }, user: string, identity: ChatIdentity) {
  const envelope: Envelope = JSON.parse(message.encrypted_content || '');
  if (envelope.v !== 1 || !envelope.keys[user] || !message.encryption_nonce) throw new Error('Unsupported message');
  const key = await crypto.subtle.unwrapKey('raw', bytes(envelope.keys[user]), identity.privateKey, 'RSA-OAEP', { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(message.encryption_nonce), additionalData: context(message.conversation_id, message.sender_id) }, key, bytes(envelope.ciphertext));
  return new TextDecoder().decode(plaintext);
}
