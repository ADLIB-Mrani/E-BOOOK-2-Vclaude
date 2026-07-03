/*
 * IA optionnelle — appel direct de l'API Anthropic depuis le navigateur.
 * Nécessite VOTRE clé API (console.anthropic.com), facturée à l'usage.
 * La clé est stockée uniquement dans le navigateur (localStorage),
 * jamais envoyée à Supabase. Docs : https://docs.claude.com/en/api/overview
 */
const KEY_STORAGE = "atelier:anthropic_key";

export function getApiKey() {
  try { return localStorage.getItem(KEY_STORAGE) || ""; } catch (e) { return ""; }
}
export function setApiKey(k) {
  try {
    if (k && k.trim()) localStorage.setItem(KEY_STORAGE, k.trim());
    else localStorage.removeItem(KEY_STORAGE);
  } catch (e) { /* stockage indisponible */ }
}
export function hasApiKey() { return Boolean(getApiKey()); }

export async function askClaude(userPrompt, systemPrompt, history, maxTokens = 2000) {
  const key = getApiKey();
  if (!key) throw new Error("Aucune clé API configurée — ajoutez-la dans « Suivi & données » pour activer l'IA.");
  const messages = [...(history || []), { role: "user", content: userPrompt }];
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      // Autorise l'appel direct depuis un navigateur (CORS) :
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    }),
  });
  if (!res.ok) {
    let msg = "Erreur API (" + res.status + ")";
    try { const j = await res.json(); if (j.error && j.error.message) msg += " : " + j.error.message; } catch (e) { /* noop */ }
    throw new Error(msg);
  }
  const data = await res.json();
  return (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
}
