import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** true si les variables d'environnement Supabase sont définies */
export const isConfigured = Boolean(url && anonKey);

/** Client Supabase (null si non configuré) */
export const supabase = isConfigured ? createClient(url, anonKey) : null;

/** Charge le blob JSON de l'utilisateur (null si première visite) */
export async function loadUserData(userId) {
  const { data, error } = await supabase
    .from("user_data")
    .select("data")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ? data.data : null;
}

/** Enregistre (upsert) le blob JSON de l'utilisateur */
export async function saveUserData(userId, payload) {
  const { error } = await supabase.from("user_data").upsert({
    user_id: userId,
    data: payload,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}
