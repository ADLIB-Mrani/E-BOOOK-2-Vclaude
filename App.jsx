import React, { useState, useEffect, useRef } from "react";
import {
  LayoutDashboard, Map, BookOpen, BarChart3, Plus, Trash2, Download, Upload,
  Moon, Sun, Sparkles, ChevronLeft, Check, Loader2, Search, RefreshCw,
  Copy, X, Clock, CalendarDays, Layers, Pencil, Mail, MessageCircle, Send, Database, LogOut, KeyRound, Eye, EyeOff
} from "lucide-react";
import { supabase, isConfigured, loadUserData, saveUserData } from "./lib/supabase";
import { askClaude, getApiKey, setApiKey, hasApiKey } from "./lib/ai";

/* ================================================================
   EBOOK-V-001 — "L'Atelier" · Version Web
   Plans personnalisés · E-books · Suivi · Gantt · Coach IA
   React + Vite + Supabase (auth + base de données PostgreSQL).
   IA optionnelle via votre clé API Anthropic (voir README.md).
   ================================================================ */

const DISPLAY = "Georgia, 'Times New Roman', serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

const THEME = (d) => d ? {
  bg: "#131521", surface: "#1B1E2E", surface2: "#232742", border: "#2E3352",
  ink: "#EDEFF7", sub: "#9AA1BC", faint: "#6B7290",
  accent: "#7B8CFF", accent2: "#B08CFF", accentInk: "#FFFFFF", accentSoft: "rgba(123,140,255,0.15)",
  gold: "#E3A44A", goldSoft: "rgba(227,164,74,0.16)",
  green: "#3FBF8F", greenSoft: "rgba(63,191,143,0.15)", red: "#E36565",
  shadow: "0 10px 30px rgba(0,0,0,0.35)",
} : {
  bg: "#F4F6FB", surface: "#FFFFFF", surface2: "#EEF1F8", border: "#E1E5F0",
  ink: "#20263C", sub: "#5A6178", faint: "#98A0B6",
  accent: "#4F5DE8", accent2: "#8B5CF6", accentInk: "#FFFFFF", accentSoft: "rgba(79,93,232,0.09)",
  gold: "#C08A1E", goldSoft: "rgba(192,138,30,0.12)",
  green: "#189A6C", greenSoft: "rgba(24,154,108,0.10)", red: "#D65757",
  shadow: "0 12px 32px rgba(32,38,60,0.10)",
};

const PRIO = {
  haute: { label: "Haute", color: "#D65757" },
  moyenne: { label: "Moyenne", color: "#C08A1E" },
  basse: { label: "Basse", color: "#189A6C" },
};

/* ---------------- helpers ---------------- */
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const now = () => Date.now();
const DAY = 86400000;
const fmtDate = (ts) => new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
const fmtShort = (ts) => new Date(ts).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
const fmtTime = (ts) => new Date(ts).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const daysLeft = (iso) => { if (!iso) return null; return Math.ceil((new Date(iso + "T23:59:59") - new Date()) / DAY); };
const pad2 = (n) => String(n).padStart(2, "0");

function extractJSON(text) {
  let t = (text || "").replace(/```json/gi, "").replace(/```/g, "").trim();
  const a = t.indexOf("{"); const b = t.lastIndexOf("}");
  if (a === -1 || b === -1) throw new Error("Pas de JSON dans la réponse");
  return JSON.parse(t.slice(a, b + 1));
}

function downloadFile(name, content, mime) {
  try {
    const blob = new Blob([content], { type: mime || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 300);
    return true;
  } catch (e) { return false; }
}

function openMailto(subject, body) {
  try {
    const a = document.createElement("a");
    a.href = "mailto:?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    return true;
  } catch (e) { return false; }
}

function copyText(text) {
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    document.execCommand("copy"); document.body.removeChild(ta);
    return true;
  } catch (e) { return false; }
}

function slug(s) { return s.replace(/[^\w\sàâäéèêëîïôöùûüç-]/gi, "").trim().replace(/\s+/g, "-").toLowerCase(); }

/* Mini rendu Markdown */
function mdToHtml(md) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s) => s
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
  const lines = (md || "").split("\n");
  let html = ""; let inList = false;
  for (const raw of lines) {
    const l = esc(raw.trimEnd());
    const isLi = /^\s*[-*]\s+/.test(l);
    if (inList && !isLi) { html += "</ul>"; inList = false; }
    if (/^###\s+/.test(l)) html += "<h3>" + inline(l.replace(/^###\s+/, "")) + "</h3>";
    else if (/^##\s+/.test(l)) html += "<h2>" + inline(l.replace(/^##\s+/, "")) + "</h2>";
    else if (/^#\s+/.test(l)) html += "<h1>" + inline(l.replace(/^#\s+/, "")) + "</h1>";
    else if (isLi) { if (!inList) { html += "<ul>"; inList = true; } html += "<li>" + inline(l.replace(/^\s*[-*]\s+/, "")) + "</li>"; }
    else if (l.trim() === "") html += "";
    else html += "<p>" + inline(l) + "</p>";
  }
  if (inList) html += "</ul>";
  return html;
}

/* ---------------- progression & planning ---------------- */
function planStats(plan) {
  let total = 0, done = 0;
  (plan.phases || []).forEach(ph => (ph.etapes || []).forEach(et => (et.taches || []).forEach(t => { total++; if (t.done) done++; })));
  return { total, done, pct: total ? Math.round(done / total * 100) : 0 };
}
function ebookStats(eb) {
  const total = (eb.chapitres || []).length;
  const done = (eb.chapitres || []).filter(c => c.contenu && c.contenu.trim().length > 50).length;
  return { total, done, pct: total ? Math.round(done / total * 100) : 0 };
}
function wordCount(eb) {
  return (eb.chapitres || []).reduce((n, c) => n + (c.contenu ? c.contenu.split(/\s+/).filter(Boolean).length : 0), 0);
}

/* Dates + priorités automatiques (repris de l'ancienne version, amélioré) */
function assignSchedule(plan) {
  const start = plan.created || now();
  const dl = plan.deadline ? new Date(plan.deadline + "T23:59:59").getTime() : null;
  const span = dl && dl > start ? dl - start : 90 * DAY;
  const flat = [];
  plan.phases.forEach(ph => ph.etapes.forEach(et => et.taches.forEach(t => flat.push(t))));
  const N = flat.length || 1;
  flat.forEach((t, i) => {
    t.due = Math.round(start + span * ((i + 1) / N));
    t.prio = i < N / 3 ? "haute" : i < (2 * N) / 3 ? "moyenne" : "basse";
  });
  return plan;
}

/* Tâches aplaties avec dates garanties (compatible anciennes données) */
function flatTasks(plan) {
  const start = plan.created || now();
  const dl = plan.deadline ? new Date(plan.deadline + "T23:59:59").getTime() : null;
  const span = dl && dl > start ? dl - start : 90 * DAY;
  const flat = [];
  plan.phases.forEach(ph => ph.etapes.forEach(et => et.taches.forEach(t => flat.push({ ...t, phase: ph.titre, etape: et.titre }))));
  const N = flat.length || 1;
  return flat.map((t, i) => ({
    ...t,
    due: t.due || Math.round(start + span * ((i + 1) / N)),
    prio: t.prio || (i < N / 3 ? "haute" : i < (2 * N) / 3 ? "moyenne" : "basse"),
  }));
}

/* ---------------- modèles de plans ---------------- */
const TEMPLATES = [
  {
    key: "lancement", titre: "Lancement de produit", desc: "De l'idée au lancement public en 4 phases.",
    phases: [
      { titre: "Cadrage", etapes: [
        { titre: "Définir l'offre", taches: ["Décrire le problème résolu en 1 phrase", "Définir le client cible", "Fixer le prix de départ"] },
        { titre: "Valider le marché", taches: ["Interroger 5 clients potentiels", "Analyser 3 concurrents"] },
      ]},
      { titre: "Construction", etapes: [
        { titre: "Créer le MVP", taches: ["Lister les 3 fonctionnalités essentielles", "Construire une première version", "Tester avec 3 utilisateurs"] },
        { titre: "Préparer la vente", taches: ["Créer une page de vente", "Préparer le tunnel de paiement"] },
      ]},
      { titre: "Lancement", etapes: [
        { titre: "Communication", taches: ["Annoncer sur les réseaux", "Contacter sa liste email", "Publier 3 contenus de lancement"] },
        { titre: "Premières ventes", taches: ["Offre de lancement limitée", "Collecter les premiers retours"] },
      ]},
      { titre: "Amélioration", etapes: [
        { titre: "Itérer", taches: ["Analyser les retours clients", "Corriger les 3 problèmes principaux", "Planifier la V2"] },
      ]},
    ],
  },
  {
    key: "apprentissage", titre: "Apprendre une compétence", desc: "Méthode structurée pour maîtriser un sujet.",
    phases: [
      { titre: "Fondations", etapes: [
        { titre: "Cartographier le sujet", taches: ["Lister les notions clés à maîtriser", "Choisir 2 ressources de référence"] },
        { titre: "Routine", taches: ["Bloquer des créneaux hebdomadaires", "Créer un système de notes"] },
      ]},
      { titre: "Pratique", etapes: [
        { titre: "Exercices", taches: ["Faire un exercice par session", "Tenir un journal des erreurs"] },
        { titre: "Projet fil rouge", taches: ["Choisir un mini-projet concret", "Avancer chaque semaine"] },
      ]},
      { titre: "Consolidation", etapes: [
        { titre: "Transmettre", taches: ["Expliquer le sujet à quelqu'un", "Rédiger une synthèse personnelle"] },
        { titre: "Évaluer", taches: ["S'auto-tester sans notes", "Identifier les lacunes restantes"] },
      ]},
    ],
  },
  {
    key: "ebook", titre: "Écrire et vendre un e-book", desc: "Pipeline complet d'écriture et de diffusion.",
    phases: [
      { titre: "Préparation", etapes: [
        { titre: "Positionnement", taches: ["Choisir le sujet et l'angle", "Définir le lecteur idéal", "Étudier 3 e-books concurrents"] },
        { titre: "Structure", taches: ["Rédiger le sommaire détaillé", "Valider le sommaire avec 2 lecteurs cibles"] },
      ]},
      { titre: "Rédaction", etapes: [
        { titre: "Premier jet", taches: ["Rédiger 1 chapitre par session", "Ne pas éditer pendant le premier jet"] },
        { titre: "Révision", taches: ["Relire et restructurer", "Faire relire par un tiers"] },
      ]},
      { titre: "Publication", etapes: [
        { titre: "Mise en forme", taches: ["Créer la couverture", "Exporter en PDF/EPUB"] },
        { titre: "Diffusion", taches: ["Choisir la plateforme de vente", "Préparer la page de vente", "Lancer avec une offre limitée"] },
      ]},
    ],
  },
];

function templateToPlan(t) {
  const plan = {
    id: uid(), titre: t.titre, description: t.desc, objectif: t.desc, deadline: "",
    created: now(), notes: "",
    phases: t.phases.map(ph => ({
      id: uid(), titre: ph.titre,
      etapes: ph.etapes.map(et => ({
        id: uid(), titre: et.titre,
        taches: et.taches.map(x => ({ id: uid(), text: x, done: false })),
      })),
    })),
  };
  return assignSchedule(plan);
}

/* ================================================================
   ATOMES UI
   ================================================================ */
function Eyebrow({ c, children, color }) {
  return <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: color || c.faint }}>{children}</div>;
}

function Btn({ c, children, onClick, kind = "solid", small, disabled, title }) {
  const base = {
    display: "inline-flex", alignItems: "center", gap: 7, cursor: disabled ? "default" : "pointer",
    borderRadius: 9, fontSize: small ? 12.5 : 13.5, fontWeight: 600, border: "1px solid transparent",
    padding: small ? "6px 11px" : "9px 16px", opacity: disabled ? 0.45 : 1,
  };
  const kinds = {
    solid: { background: "linear-gradient(120deg," + c.accent + "," + c.accent2 + ")", color: c.accentInk, boxShadow: "0 4px 14px " + c.accentSoft },
    ghost: { background: c.surface, color: c.sub, borderColor: c.border },
    soft: { background: c.accentSoft, color: c.accent },
    danger: { background: c.surface, color: c.red, borderColor: c.border },
  };
  return <button className="btnh" title={title} disabled={disabled} onClick={onClick} style={{ ...base, ...kinds[kind] }}>{children}</button>;
}

function Card({ c, children, style, onClick, lift, delay }) {
  return (
    <div onClick={onClick} className={"fadeup" + ((onClick || lift) ? " cardlift" : "")}
      style={{
        background: c.surface, border: "1px solid " + c.border, borderRadius: 14,
        padding: 18, cursor: onClick ? "pointer" : "default", animationDelay: (delay || 0) + "ms", ...style,
      }}>{children}</div>
  );
}

/* Barre "tranche de livre" avec marque-page doré */
function Spine({ c, pct, color, height = 8 }) {
  return (
    <div style={{ position: "relative", height, background: c.surface2, borderRadius: 99, overflow: "hidden", border: "1px solid " + c.border }}>
      <div style={{ position: "absolute", inset: 0, width: pct + "%", background: "linear-gradient(90deg," + (color || c.accent) + "," + (color ? color : c.accent2) + ")", borderRadius: 99, transition: "width .5s ease" }} />
      {pct > 0 && pct < 100 && (
        <div style={{ position: "absolute", left: "calc(" + pct + "% - 2px)", top: -2, bottom: -2, width: 3, background: c.gold, borderRadius: 2 }} title="Marque-page" />
      )}
    </div>
  );
}

function Field({ c, label, hint, children }) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: c.sub, marginBottom: 5 }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: 11.5, color: c.faint, marginTop: 4 }}>{hint}</div>}
    </label>
  );
}

const inputStyle = (c) => ({
  width: "100%", background: c.surface2, color: c.ink, border: "1px solid " + c.border,
  borderRadius: 9, padding: "9px 12px", fontSize: 13.5, outline: "none", fontFamily: "inherit",
});

function TocRow({ c, left, right, onClick, num, done, active, dot }) {
  return (
    <div onClick={onClick} className={onClick ? "rowh" : ""} style={{
      display: "flex", alignItems: "baseline", gap: 10, padding: "10px 8px", cursor: onClick ? "pointer" : "default",
      borderRadius: 8, background: active ? c.accentSoft : "transparent",
    }}>
      {dot && <span style={{ width: 8, height: 8, borderRadius: 99, background: dot, alignSelf: "center", flexShrink: 0 }} />}
      {num != null && <span style={{ fontFamily: MONO, fontSize: 11.5, color: done ? c.green : c.faint, minWidth: 24 }}>{pad2(num)}</span>}
      <span style={{ fontSize: 14, color: c.ink, fontWeight: active ? 700 : 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "58%" }}>{left}</span>
      <span style={{ flex: 1, borderBottom: "1.5px dotted " + c.border, transform: "translateY(-3px)" }} />
      <span style={{ fontFamily: MONO, fontSize: 11.5, color: done ? c.green : c.faint, whiteSpace: "nowrap" }}>{right}</span>
    </div>
  );
}

function Confirm({ c, msg, onYes, onNo }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,24,40,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }}>
      <div className="fadeup" style={{ background: c.surface, border: "1px solid " + c.border, borderRadius: 14, padding: 24, maxWidth: 380, width: "100%", boxShadow: c.shadow }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 19, color: c.ink, marginBottom: 8 }}>Confirmer</div>
        <div style={{ fontSize: 13.5, color: c.sub, marginBottom: 18 }}>{msg}</div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn c={c} kind="ghost" onClick={onNo}>Annuler</Btn>
          <Btn c={c} kind="solid" onClick={onYes}>Confirmer</Btn>
        </div>
      </div>
    </div>
  );
}

function AiOverlay({ c, label }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,24,40,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60 }}>
      <div style={{ background: c.surface, border: "1px solid " + c.border, borderRadius: 14, padding: "26px 34px", display: "flex", alignItems: "center", gap: 14, boxShadow: c.shadow }}>
        <Loader2 size={22} color={c.accent} style={{ animation: "spin 1s linear infinite" }} />
        <div>
          <div style={{ fontFamily: DISPLAY, fontSize: 17, color: c.ink }}>Génération en cours…</div>
          <div style={{ fontSize: 12.5, color: c.sub, marginTop: 2 }}>{label}</div>
        </div>
      </div>
    </div>
  );
}

/* Bandeau affiché quand la clé API (IA) n'est pas configurée */
function NoKeyNotice({ c }) {
  if (hasApiKey()) return null;
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", background: c.goldSoft, border: "1px solid " + c.border, borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 12.5, color: c.sub }}>
      <KeyRound size={15} color={c.gold} style={{ flexShrink: 0, marginTop: 2 }} />
      <span>
        La génération IA est désactivée : aucune clé API n'est configurée. Ajoutez votre clé Anthropic dans
        <strong> Suivi &amp; données</strong> pour l'activer. Les modèles prêts à l'emploi, l'édition manuelle,
        le Gantt et les exports fonctionnent sans clé.
      </span>
    </div>
  );
}

/* ================================================================
   DIAGRAMME DE GANTT (repris de l'ancienne version, en mieux)
   ================================================================ */
function Gantt({ c, plan }) {
  const tasks = flatTasks(plan);
  if (!tasks.length) return <div style={{ color: c.faint, fontSize: 13 }}>Aucune tâche à planifier.</div>;
  const start = plan.created || now();
  const end = Math.max(...tasks.map(t => t.due), start + 14 * DAY);
  const span = end - start;
  const pctOf = (ts) => Math.min(100, Math.max(0, ((ts - start) / span) * 100));

  const months = [];
  const d0 = new Date(start); d0.setDate(1);
  for (let d = new Date(d0); d.getTime() <= end; d.setMonth(d.getMonth() + 1)) {
    months.push({ label: d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" }), pct: pctOf(d.getTime()) });
  }
  const today = now();
  const LABEL_W = 170;

  return (
    <div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 12 }}>
        {Object.entries(PRIO).map(([k, v]) => (
          <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: c.sub }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: v.color }} /> Priorité {v.label.toLowerCase()}
          </span>
        ))}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: c.sub }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: c.faint }} /> Terminée
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: c.sub }}>
          <span style={{ width: 2, height: 12, background: c.gold }} /> Aujourd'hui
        </span>
      </div>

      {/* En-tête des mois */}
      <div style={{ display: "flex" }}>
        <div style={{ width: LABEL_W, flexShrink: 0 }} />
        <div style={{ flex: 1, position: "relative", height: 22, borderBottom: "1px solid " + c.border }}>
          {months.map((m, i) => (
            <span key={i} style={{ position: "absolute", left: m.pct + "%", fontFamily: MONO, fontSize: 10.5, color: c.faint, textTransform: "capitalize" }}>{m.label}</span>
          ))}
        </div>
      </div>

      {/* Lignes */}
      <div style={{ maxHeight: 420, overflowY: "auto" }}>
        {tasks.map((t, i) => {
          const barStart = i === 0 ? start : tasks[i - 1].due;
          const left = pctOf(barStart);
          const width = Math.max(1.5, pctOf(t.due) - left);
          const color = t.done ? c.faint : PRIO[t.prio].color;
          return (
            <div key={t.id} style={{ display: "flex", alignItems: "center", minHeight: 30 }}>
              <div title={t.text} style={{ width: LABEL_W, flexShrink: 0, paddingRight: 10, fontSize: 11.5, color: t.done ? c.faint : c.sub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textDecoration: t.done ? "line-through" : "none" }}>{t.text}</div>
              <div style={{ flex: 1, position: "relative", height: 30, borderBottom: "1px dashed " + c.border }}>
                {months.map((m, j) => <span key={j} style={{ position: "absolute", left: m.pct + "%", top: 0, bottom: 0, borderLeft: "1px solid " + c.border, opacity: 0.5 }} />)}
                {today >= start && today <= end && <span style={{ position: "absolute", left: pctOf(today) + "%", top: 0, bottom: 0, borderLeft: "2px solid " + c.gold, zIndex: 2 }} />}
                <div title={t.text + " — échéance " + fmtDate(t.due)} style={{
                  position: "absolute", left: left + "%", width: width + "%", top: 7, height: 14,
                  background: color, borderRadius: 99, opacity: t.done ? 0.5 : 0.9, transition: "all .3s",
                }} />
              </div>
              <div style={{ width: 66, flexShrink: 0, textAlign: "right", fontFamily: MONO, fontSize: 10.5, color: t.done ? c.green : c.faint }}>{fmtShort(t.due)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ================================================================
   TABLEAU DE BORD
   ================================================================ */
function Dashboard({ c, data, go }) {
  const plans = data.plans, ebooks = data.ebooks;
  const tAll = plans.reduce((a, p) => { const s = planStats(p); a.total += s.total; a.done += s.done; return a; }, { total: 0, done: 0 });
  const cAll = ebooks.reduce((a, e) => { const s = ebookStats(e); a.total += s.total; a.done += s.done; return a; }, { total: 0, done: 0 });
  const globalPct = (tAll.total + cAll.total) ? Math.round((tAll.done + cAll.done) / (tAll.total + cAll.total) * 100) : 0;
  const recent = [...data.activity].slice(0, 6);

  const upcoming = plans.flatMap(p => flatTasks(p).filter(t => !t.done).map(t => ({ ...t, planId: p.id, planTitre: p.titre })))
    .sort((a, b) => a.due - b.due).slice(0, 5);

  const stats = [
    { label: "Plans actifs", value: plans.length, icon: <Map size={16} /> },
    { label: "E-books", value: ebooks.length, icon: <BookOpen size={16} /> },
    { label: "Tâches faites", value: tAll.done + " / " + tAll.total, icon: <Check size={16} /> },
    { label: "Chapitres rédigés", value: cAll.done + " / " + cAll.total, icon: <Pencil size={16} /> },
  ];

  return (
    <div>
      {/* Bandeau d'accueil */}
      <Card c={c} style={{ background: "linear-gradient(115deg," + c.accentSoft + ", transparent 60%), " + c.surface, marginBottom: 20, padding: "26px 24px" }}>
        <Eyebrow c={c} color={c.accent}>Tableau de bord</Eyebrow>
        <h1 style={{ fontFamily: DISPLAY, fontSize: 34, color: c.ink, margin: "8px 0 6px", fontWeight: 700, lineHeight: 1.1 }}>L'Atelier</h1>
        <p style={{ color: c.sub, fontSize: 14, margin: "0 0 18px", maxWidth: 520 }}>Vos plans, vos e-books et votre progression — enregistrés automatiquement dans votre base de données personnelle.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Btn c={c} onClick={() => go({ name: "plan-new" })}><Sparkles size={15} /> Créer un plan</Btn>
          <Btn c={c} kind="ghost" onClick={() => go({ name: "ebook-new" })}><BookOpen size={15} /> Créer un e-book</Btn>
          <Btn c={c} kind="ghost" onClick={() => go({ name: "coach" })}><MessageCircle size={15} /> Parler au coach IA</Btn>
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3" style={{ marginBottom: 20 }}>
        {stats.map((s, i) => (
          <Card key={i} c={c} lift delay={i * 60} style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: c.accent, marginBottom: 8 }}>
              {s.icon}<Eyebrow c={c}>{s.label}</Eyebrow>
            </div>
            <div style={{ fontFamily: DISPLAY, fontSize: 26, color: c.ink }}>{s.value}</div>
          </Card>
        ))}
      </div>

      <Card c={c} style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
          <Eyebrow c={c}>Progression globale</Eyebrow>
          <span style={{ fontFamily: MONO, fontSize: 13, color: c.gold }}>{globalPct}%</span>
        </div>
        <Spine c={c} pct={globalPct} height={10} />
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card c={c}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <Eyebrow c={c}>Prochaines échéances</Eyebrow>
            <CalendarDays size={15} color={c.faint} />
          </div>
          {upcoming.length === 0 && <div style={{ color: c.faint, fontSize: 13, padding: "12px 0" }}>Aucune tâche planifiée. Créez un plan pour générer un calendrier automatique.</div>}
          {upcoming.map(t => (
            <TocRow key={t.id} c={c} left={t.text} right={fmtShort(t.due)} dot={PRIO[t.prio].color} onClick={() => go({ name: "plan", id: t.planId })} />
          ))}
        </Card>
        <Card c={c}>
          <Eyebrow c={c}>Activité récente</Eyebrow>
          {recent.length === 0 && <div style={{ color: c.faint, fontSize: 13, padding: "12px 0" }}>Votre journal d'activité apparaîtra ici.</div>}
          <div style={{ marginTop: 6 }}>
            {recent.map(a => (
              <div key={a.id} style={{ display: "flex", gap: 12, padding: "8px 0", borderBottom: "1px solid " + c.border, alignItems: "baseline" }}>
                <span style={{ fontFamily: MONO, fontSize: 11, color: c.faint, minWidth: 100 }}>{fmtTime(a.ts)}</span>
                <span style={{ fontSize: 13, color: c.sub }}>{a.text}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4" style={{ marginTop: 16 }}>
        <Card c={c}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <Eyebrow c={c}>Plans récents</Eyebrow>
            <Btn c={c} kind="soft" small onClick={() => go({ name: "plan-new" })}><Plus size={14} /> Nouveau</Btn>
          </div>
          {plans.length === 0 && <div style={{ color: c.faint, fontSize: 13, padding: "12px 0" }}>Aucun plan pour l'instant.</div>}
          {plans.slice(0, 4).map(p => {
            const s = planStats(p);
            return <TocRow key={p.id} c={c} left={p.titre} right={s.pct + "%"} done={s.pct === 100} onClick={() => go({ name: "plan", id: p.id })} />;
          })}
        </Card>
        <Card c={c}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <Eyebrow c={c}>E-books récents</Eyebrow>
            <Btn c={c} kind="soft" small onClick={() => go({ name: "ebook-new" })}><Plus size={14} /> Nouveau</Btn>
          </div>
          {ebooks.length === 0 && <div style={{ color: c.faint, fontSize: 13, padding: "12px 0" }}>Aucun e-book pour l'instant.</div>}
          {ebooks.slice(0, 4).map(e => {
            const s = ebookStats(e);
            return <TocRow key={e.id} c={c} left={e.titre} right={s.done + "/" + s.total + " chap."} done={s.pct === 100} onClick={() => go({ name: "ebook", id: e.id })} />;
          })}
        </Card>
      </div>
    </div>
  );
}

/* ================================================================
   PLANS
   ================================================================ */
function PlanWizard({ c, onCreate, onBack, busy, setBusy, addActivity }) {
  const [f, setF] = useState({ objectif: "", type: "Business / entrepreneuriat", niveau: "Débutant", temps: "5h / semaine", deadline: "", details: "" });
  const [err, setErr] = useState("");
  const set = (k, v) => setF({ ...f, [k]: v });

  const generate = async () => {
    if (!f.objectif.trim()) { setErr("Décrivez d'abord votre objectif."); return; }
    setErr(""); setBusy("Construction de votre plan personnalisé…");
    try {
      const sys = "Tu es un expert en stratégie et en gestion de projet. Tu réponds UNIQUEMENT avec du JSON valide, sans aucun texte avant ou après, sans balises markdown.";
      const prompt = "Crée un plan d'action personnalisé.\n" +
        "Objectif: " + f.objectif + "\nDomaine: " + f.type + "\nNiveau: " + f.niveau +
        "\nTemps disponible: " + f.temps + (f.deadline ? "\nÉchéance: " + f.deadline : "") +
        (f.details ? "\nPrécisions: " + f.details : "") +
        "\n\nRéponds en JSON compact, exactement ce format:\n" +
        '{"titre":"...","description":"1 phrase","phases":[{"titre":"...","etapes":[{"titre":"...","taches":["...","..."]}]}]}' +
        "\nContraintes: 3 à 4 phases, 2 étapes par phase, 2 à 3 tâches courtes, concrètes et actionnables par étape. Tout en français. Aucun texte hors du JSON.";
      const raw = await askClaude(prompt, sys);
      const j = extractJSON(raw);
      let plan = {
        id: uid(), titre: j.titre || f.objectif, description: j.description || "",
        objectif: f.objectif, deadline: f.deadline, created: now(), notes: "",
        phases: (j.phases || []).map(ph => ({
          id: uid(), titre: ph.titre || "Phase",
          etapes: (ph.etapes || []).map(et => ({
            id: uid(), titre: et.titre || "Étape",
            taches: (et.taches || []).map(t => ({ id: uid(), text: String(t), done: false })),
          })),
        })),
      };
      if (!plan.phases.length) throw new Error("Plan vide");
      plan = assignSchedule(plan);
      addActivity('Plan créé par IA : « ' + plan.titre + ' »');
      onCreate(plan);
    } catch (e) {
      setErr("La génération a échoué (" + e.message + "). Réessayez, ou partez d'un modèle ci-dessous.");
    } finally { setBusy(""); }
  };

  return (
    <div style={{ maxWidth: 680 }}>
      <Btn c={c} kind="ghost" small onClick={onBack}><ChevronLeft size={14} /> Retour</Btn>
      <div style={{ marginTop: 12 }}>
        <Eyebrow c={c} color={c.accent}><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Sparkles size={12} /> Assistant IA</span></Eyebrow>
      </div>
      <h1 style={{ fontFamily: DISPLAY, fontSize: 28, color: c.ink, margin: "6px 0 18px" }}>Nouveau plan personnalisé</h1>
      <NoKeyNotice c={c} />

      <Card c={c}>
        <div style={{ display: "grid", gap: 14 }}>
          <Field c={c} label="Votre objectif" hint="Ex : lancer une offre de coaching en ligne, apprendre SQL, publier mon premier e-book…">
            <textarea rows={2} style={{ ...inputStyle(c), resize: "vertical" }} value={f.objectif} onChange={e => set("objectif", e.target.value)} placeholder="Décrivez ce que vous voulez accomplir" />
          </Field>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field c={c} label="Domaine">
              <select style={inputStyle(c)} value={f.type} onChange={e => set("type", e.target.value)}>
                {["Business / entrepreneuriat", "Apprentissage / formation", "Création de contenu", "Marketing / vente", "Projet personnel", "Autre"].map(o => <option key={o}>{o}</option>)}
              </select>
            </Field>
            <Field c={c} label="Votre niveau">
              <select style={inputStyle(c)} value={f.niveau} onChange={e => set("niveau", e.target.value)}>
                {["Débutant", "Intermédiaire", "Avancé"].map(o => <option key={o}>{o}</option>)}
              </select>
            </Field>
            <Field c={c} label="Temps disponible">
              <select style={inputStyle(c)} value={f.temps} onChange={e => set("temps", e.target.value)}>
                {["2h / semaine", "5h / semaine", "10h / semaine", "Temps plein"].map(o => <option key={o}>{o}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field c={c} label="Échéance (optionnel)" hint="Sert à générer automatiquement le calendrier et le Gantt.">
              <input type="date" style={inputStyle(c)} value={f.deadline} onChange={e => set("deadline", e.target.value)} />
            </Field>
            <Field c={c} label="Précisions (optionnel)">
              <input style={inputStyle(c)} value={f.details} onChange={e => set("details", e.target.value)} placeholder="Contraintes, budget, préférences…" />
            </Field>
          </div>
          {err && <div style={{ color: c.red, fontSize: 13 }}>{err}</div>}
          <div>
            <Btn c={c} onClick={generate} disabled={!!busy}><Sparkles size={15} /> Générer mon plan</Btn>
          </div>
        </div>
      </Card>

      <div style={{ margin: "26px 0 8px" }}><Eyebrow c={c}>Ou partez d'un modèle prêt à l'emploi</Eyebrow></div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {TEMPLATES.map((t, i) => (
          <Card key={t.key} c={c} delay={i * 70} onClick={() => { const p = templateToPlan(t); addActivity('Plan créé depuis le modèle « ' + t.titre + ' »'); onCreate(p); }}>
            <Layers size={16} color={c.gold} />
            <div style={{ fontFamily: DISPLAY, fontSize: 16, color: c.ink, margin: "8px 0 4px" }}>{t.titre}</div>
            <div style={{ fontSize: 12.5, color: c.sub }}>{t.desc}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function PlansList({ c, data, go, onDelete, onDuplicate }) {
  const [q, setQ] = useState("");
  const list = data.plans.filter(p => p.titre.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
        <div>
          <Eyebrow c={c}>Plans</Eyebrow>
          <h1 style={{ fontFamily: DISPLAY, fontSize: 28, color: c.ink, margin: "6px 0 0" }}>Plans personnalisés</h1>
        </div>
        <Btn c={c} onClick={() => go({ name: "plan-new" })}><Plus size={15} /> Nouveau plan</Btn>
      </div>
      <div style={{ position: "relative", maxWidth: 340, marginBottom: 16 }}>
        <Search size={15} color={c.faint} style={{ position: "absolute", left: 11, top: 11 }} />
        <input style={{ ...inputStyle(c), paddingLeft: 34, background: c.surface }} placeholder="Rechercher un plan…" value={q} onChange={e => setQ(e.target.value)} />
      </div>
      {list.length === 0 && <Card c={c}><div style={{ color: c.faint, fontSize: 13.5 }}>Aucun plan trouvé. Créez-en un : décrivez votre objectif et l'IA construit les phases, les tâches, les dates et le Gantt.</div></Card>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {list.map((p, i) => {
          const s = planStats(p); const dl = daysLeft(p.deadline);
          return (
            <Card key={p.id} c={c} lift delay={i * 50}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div onClick={() => go({ name: "plan", id: p.id })} style={{ cursor: "pointer", flex: 1 }}>
                  <div style={{ fontFamily: DISPLAY, fontSize: 18, color: c.ink }}>{p.titre}</div>
                  <div style={{ fontSize: 12.5, color: c.sub, margin: "4px 0 10px" }}>{p.description}</div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                  <Btn c={c} kind="ghost" small title="Dupliquer" onClick={() => onDuplicate(p)}><Copy size={13} /></Btn>
                  <Btn c={c} kind="danger" small title="Supprimer" onClick={() => onDelete(p)}><Trash2 size={13} /></Btn>
                </div>
              </div>
              <Spine c={c} pct={s.pct} />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                <span style={{ fontFamily: MONO, fontSize: 11, color: c.faint }}>{s.done}/{s.total} tâches · {s.pct}%</span>
                {dl != null && <span style={{ fontFamily: MONO, fontSize: 11, color: dl < 0 ? c.red : dl <= 7 ? c.gold : c.faint }}><Clock size={11} style={{ display: "inline", marginRight: 4 }} />{dl < 0 ? "échéance dépassée" : "J-" + dl}</span>}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function exportPlanHtml(plan) {
  const tasks = flatTasks(plan);
  let rows = "";
  plan.phases.forEach((ph, pi) => {
    rows += "<h2>Phase " + (pi + 1) + " — " + ph.titre + "</h2>";
    ph.etapes.forEach(et => {
      rows += "<h3>" + et.titre + "</h3><table><tr><th></th><th>Tâche</th><th>Échéance</th><th>Priorité</th></tr>";
      et.taches.forEach(t => {
        const ft = tasks.find(x => x.id === t.id) || t;
        rows += "<tr><td>" + (t.done ? "☑" : "☐") + "</td><td>" + t.text + "</td><td>" + fmtDate(ft.due || plan.created) + "</td><td>" + (PRIO[ft.prio] ? PRIO[ft.prio].label : "—") + "</td></tr>";
      });
      rows += "</table>";
    });
  });
  const s = planStats(plan);
  const html = "<!DOCTYPE html><html lang='fr'><head><meta charset='utf-8'><title>" + plan.titre + "</title><style>" +
    "body{font-family:Georgia,serif;max-width:760px;margin:0 auto;padding:48px 24px;color:#20263c;line-height:1.6}" +
    "h1{margin-bottom:4px}.sub{color:#666;margin-bottom:24px}h2{margin-top:2em;border-bottom:2px solid #4F5DE8;padding-bottom:4px}" +
    "table{width:100%;border-collapse:collapse;margin:8px 0 16px;font-size:14px}td,th{border:1px solid #ddd;padding:6px 10px;text-align:left}" +
    "th{background:#eef1f8}@media print{h2{page-break-before:auto}}" +
    "</style></head><body><h1>" + plan.titre + "</h1><p class='sub'>" + (plan.description || "") +
    "<br>Progression : " + s.done + "/" + s.total + " tâches (" + s.pct + "%)" +
    (plan.deadline ? " · Échéance : " + plan.deadline : "") + "</p>" + rows +
    "<hr><p style='font-size:12px;color:#888'>Généré par L'Atelier — Ebook-V-001</p></body></html>";
  return downloadFile(slug(plan.titre) + "-plan.html", html, "text/html;charset=utf-8");
}

function PlanDetail({ c, plan, update, onBack, addActivity }) {
  const s = planStats(plan);
  const dl = daysLeft(plan.deadline);
  const [tab, setTab] = useState("taches");
  const [newTask, setNewTask] = useState({});
  const [msg, setMsg] = useState("");
  const flat = flatTasks(plan);
  const dueOf = (id) => { const f = flat.find(x => x.id === id); return f ? f : null; };

  const toggleTask = (phId, etId, tId) => {
    const t = plan.phases.find(p => p.id === phId).etapes.find(e => e.id === etId).taches.find(x => x.id === tId);
    if (!t.done) addActivity('Tâche terminée : « ' + t.text + ' » (' + plan.titre + ")");
    update({ ...plan, phases: plan.phases.map(ph => ph.id !== phId ? ph : ({
      ...ph, etapes: ph.etapes.map(et => et.id !== etId ? et : ({
        ...et, taches: et.taches.map(x => x.id !== tId ? x : ({ ...x, done: !x.done })),
      })),
    })) });
  };
  const addTask = (phId, etId) => {
    const key = phId + etId; const text = (newTask[key] || "").trim();
    if (!text) return;
    update({ ...plan, phases: plan.phases.map(ph => ph.id !== phId ? ph : ({
      ...ph, etapes: ph.etapes.map(et => et.id !== etId ? et : ({ ...et, taches: [...et.taches, { id: uid(), text, done: false, prio: "moyenne", due: now() + 7 * DAY }] })),
    })) });
    setNewTask({ ...newTask, [key]: "" });
  };
  const delTask = (phId, etId, tId) => {
    update({ ...plan, phases: plan.phases.map(ph => ph.id !== phId ? ph : ({
      ...ph, etapes: ph.etapes.map(et => et.id !== etId ? et : ({ ...et, taches: et.taches.filter(t => t.id !== tId) })),
    })) });
  };

  const shareEmail = () => {
    const body = plan.titre + "\n" + (plan.description || "") +
      "\n\nProgression : " + s.done + "/" + s.total + " tâches (" + s.pct + "%)" +
      (plan.deadline ? "\nÉchéance : " + plan.deadline : "") + "\n\n" +
      plan.phases.map((ph, i) => "PHASE " + (i + 1) + " — " + ph.titre + "\n" +
        ph.etapes.map(et => "  • " + et.titre + " : " + et.taches.map(t => (t.done ? "[x] " : "[ ] ") + t.text).join(" ; ")).join("\n")
      ).join("\n\n") + "\n\n— Généré par L'Atelier";
    openMailto("Mon plan : " + plan.titre, body.slice(0, 1800));
    setMsg("Votre client email va s'ouvrir avec le plan pré-rempli.");
    setTimeout(() => setMsg(""), 3500);
  };

  return (
    <div style={{ maxWidth: 820 }}>
      <Btn c={c} kind="ghost" small onClick={onBack}><ChevronLeft size={14} /> Plans</Btn>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, margin: "12px 0 6px" }}>
        <div>
          <Eyebrow c={c}>Plan · créé le {fmtDate(plan.created)}</Eyebrow>
          <h1 style={{ fontFamily: DISPLAY, fontSize: 30, color: c.ink, margin: "4px 0 4px" }}>{plan.titre}</h1>
          <p style={{ color: c.sub, fontSize: 14, margin: 0 }}>{plan.description}</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn c={c} kind="ghost" small onClick={() => { if (exportPlanHtml(plan)) { setMsg("HTML téléchargé — ouvrez-le puis Imprimer → PDF."); setTimeout(() => setMsg(""), 3500); } }}><Download size={13} /> PDF</Btn>
          <Btn c={c} kind="ghost" small onClick={shareEmail}><Mail size={13} /> Envoyer par email</Btn>
        </div>
      </div>

      <Card c={c} style={{ margin: "14px 0 18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
          <span style={{ fontFamily: MONO, fontSize: 12, color: c.gold }}>{s.done}/{s.total} tâches · {s.pct}%</span>
          {dl != null && <span style={{ fontFamily: MONO, fontSize: 12, color: dl < 0 ? c.red : c.faint }}><CalendarDays size={12} style={{ display: "inline", marginRight: 5 }} />{plan.deadline}{dl >= 0 ? " · J-" + dl : " · dépassée"}</span>}
        </div>
        <Spine c={c} pct={s.pct} height={10} />
      </Card>
      {msg && <div style={{ marginBottom: 12, fontSize: 13, color: c.green }}>{msg}</div>}

      {/* Onglets */}
      <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
        {[["taches", "Tâches", <Check key="i" size={14} />], ["gantt", "Diagramme de Gantt", <BarChart3 key="i" size={14} />]].map(([k, label, icon]) => (
          <button key={k} onClick={() => setTab(k)} className="btnh" style={{
            display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 9, cursor: "pointer",
            border: "1px solid " + (tab === k ? "transparent" : c.border), fontSize: 13, fontWeight: 600,
            background: tab === k ? c.accentSoft : c.surface, color: tab === k ? c.accent : c.sub,
          }}>{icon}{label}</button>
        ))}
      </div>

      {tab === "gantt" && (
        <Card c={c} style={{ marginBottom: 20 }}>
          <div style={{ marginBottom: 12 }}><Eyebrow c={c}>Chronologie des tâches</Eyebrow></div>
          <Gantt c={c} plan={plan} />
        </Card>
      )}

      {tab === "taches" && plan.phases.map((ph, pi) => {
        const phTotal = ph.etapes.reduce((n, e) => n + e.taches.length, 0);
        const phDone = ph.etapes.reduce((n, e) => n + e.taches.filter(t => t.done).length, 0);
        return (
          <div key={ph.id} style={{ marginBottom: 26 }} className="fadeup">
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 10 }}>
              <span style={{ fontFamily: MONO, fontSize: 12, color: c.accent }}>PHASE {pad2(pi + 1)}</span>
              <h2 style={{ fontFamily: DISPLAY, fontSize: 21, color: c.ink, margin: 0 }}>{ph.titre}</h2>
              <span style={{ flex: 1, borderBottom: "1.5px dotted " + c.border }} />
              <span style={{ fontFamily: MONO, fontSize: 11.5, color: phDone === phTotal && phTotal ? c.green : c.faint }}>{phDone}/{phTotal}</span>
            </div>
            {ph.etapes.map(et => {
              const key = ph.id + et.id;
              return (
                <Card key={et.id} c={c} style={{ marginBottom: 10, padding: 14 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: c.ink, marginBottom: 8 }}>{et.titre}</div>
                  {et.taches.map(t => {
                    const ft = dueOf(t.id);
                    return (
                      <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
                        <button onClick={() => toggleTask(ph.id, et.id, t.id)} style={{
                          width: 19, height: 19, borderRadius: 5, cursor: "pointer", flexShrink: 0,
                          border: "1.5px solid " + (t.done ? c.green : c.border),
                          background: t.done ? c.green : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "all .15s",
                        }}>{t.done && <Check size={13} color="#fff" />}</button>
                        <span style={{ flex: 1, fontSize: 13.5, color: t.done ? c.faint : c.ink, textDecoration: t.done ? "line-through" : "none" }}>{t.text}</span>
                        {ft && <span title={"Priorité " + PRIO[ft.prio].label.toLowerCase()} style={{ width: 8, height: 8, borderRadius: 99, background: t.done ? c.faint : PRIO[ft.prio].color, flexShrink: 0 }} />}
                        {ft && <span style={{ fontFamily: MONO, fontSize: 10.5, color: c.faint, minWidth: 52, textAlign: "right" }}>{fmtShort(ft.due)}</span>}
                        <button onClick={() => delTask(ph.id, et.id, t.id)} title="Supprimer" style={{ background: "none", border: "none", cursor: "pointer", color: c.faint, padding: 2 }}><X size={13} /></button>
                      </div>
                    );
                  })}
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <input style={{ ...inputStyle(c), padding: "6px 10px", fontSize: 12.5 }} placeholder="Ajouter une tâche…" value={newTask[key] || ""}
                      onChange={e => setNewTask({ ...newTask, [key]: e.target.value })}
                      onKeyDown={e => { if (e.key === "Enter") addTask(ph.id, et.id); }} />
                    <Btn c={c} kind="soft" small onClick={() => addTask(ph.id, et.id)}><Plus size={13} /></Btn>
                  </div>
                </Card>
              );
            })}
          </div>
        );
      })}

      <Card c={c}>
        <Eyebrow c={c}>Notes du projet</Eyebrow>
        <textarea rows={4} style={{ ...inputStyle(c), marginTop: 8, resize: "vertical" }} placeholder="Idées, blocages, décisions…"
          value={plan.notes || ""} onChange={e => update({ ...plan, notes: e.target.value })} />
      </Card>
    </div>
  );
}

/* ================================================================
   E-BOOKS
   ================================================================ */
function EbookWizard({ c, onCreate, onBack, busy, setBusy, addActivity }) {
  const [step, setStep] = useState(1);
  const [f, setF] = useState({ sujet: "", audience: "", ton: "Pédagogique et accessible", nb: 6, objectif: "" });
  const [outline, setOutline] = useState(null);
  const [err, setErr] = useState("");
  const set = (k, v) => setF({ ...f, [k]: v });

  const genOutline = async () => {
    if (!f.sujet.trim()) { setErr("Indiquez d'abord le sujet du livre."); return; }
    setErr(""); setBusy("Construction du sommaire…");
    try {
      const sys = "Tu es un auteur et éditeur professionnel. Tu réponds UNIQUEMENT avec du JSON valide, sans texte avant/après ni markdown.";
      const prompt = "Conçois le sommaire d'un e-book.\nSujet: " + f.sujet +
        (f.audience ? "\nAudience: " + f.audience : "") + "\nTon: " + f.ton +
        (f.objectif ? "\nObjectif du livre: " + f.objectif : "") +
        "\nNombre de chapitres: " + f.nb +
        '\n\nRéponds en JSON compact exactement dans ce format:\n{"titre":"...","sousTitre":"...","description":"1 phrase","chapitres":[{"titre":"...","resume":"1 phrase"}]}' +
        "\nContraintes: exactement " + f.nb + " chapitres, titres accrocheurs, tout en français, aucun texte hors JSON.";
      const raw = await askClaude(prompt, sys);
      const j = extractJSON(raw);
      if (!j.chapitres || !j.chapitres.length) throw new Error("Sommaire vide");
      setOutline(j); setStep(2);
    } catch (e) { setErr("La génération a échoué (" + e.message + "). Réessayez."); }
    finally { setBusy(""); }
  };

  const create = () => {
    const eb = {
      id: uid(), titre: outline.titre, sousTitre: outline.sousTitre || "", description: outline.description || "",
      sujet: f.sujet, audience: f.audience, ton: f.ton, created: now(), notes: "",
      chapitres: outline.chapitres.map(ch => ({ id: uid(), titre: ch.titre, resume: ch.resume || "", contenu: "" })),
    };
    addActivity('E-book créé : « ' + eb.titre + ' » (' + eb.chapitres.length + " chapitres)");
    onCreate(eb);
  };

  return (
    <div style={{ maxWidth: 680 }}>
      <Btn c={c} kind="ghost" small onClick={onBack}><ChevronLeft size={14} /> Retour</Btn>
      <div style={{ marginTop: 12 }}>
        <Eyebrow c={c} color={c.accent}><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Sparkles size={12} /> Assistant IA · étape {step}/2</span></Eyebrow>
      </div>
      <h1 style={{ fontFamily: DISPLAY, fontSize: 28, color: c.ink, margin: "6px 0 18px" }}>{step === 1 ? "Nouvel e-book" : "Validez le sommaire"}</h1>
      <NoKeyNotice c={c} />

      {step === 1 && (
        <Card c={c}>
          <div style={{ display: "grid", gap: 14 }}>
            <Field c={c} label="Sujet du livre" hint="Ex : le freelancing pour développeurs, la productivité des étudiants, investir avec un petit budget…">
              <textarea rows={2} style={{ ...inputStyle(c), resize: "vertical" }} value={f.sujet} onChange={e => set("sujet", e.target.value)} placeholder="De quoi parle votre e-book ?" />
            </Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field c={c} label="Audience cible">
                <input style={inputStyle(c)} value={f.audience} onChange={e => set("audience", e.target.value)} placeholder="Ex : freelances débutants" />
              </Field>
              <Field c={c} label="Ton">
                <select style={inputStyle(c)} value={f.ton} onChange={e => set("ton", e.target.value)}>
                  {["Pédagogique et accessible", "Professionnel et direct", "Inspirant et motivant", "Expert et technique", "Conversationnel et léger"].map(o => <option key={o}>{o}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field c={c} label="Nombre de chapitres">
                <select style={inputStyle(c)} value={f.nb} onChange={e => set("nb", Number(e.target.value))}>
                  {[4, 5, 6, 7, 8, 9, 10].map(n => <option key={n} value={n}>{n} chapitres</option>)}
                </select>
              </Field>
              <Field c={c} label="Objectif du lecteur (optionnel)">
                <input style={inputStyle(c)} value={f.objectif} onChange={e => set("objectif", e.target.value)} placeholder="Ce que le lecteur saura faire à la fin" />
              </Field>
            </div>
            {err && <div style={{ color: c.red, fontSize: 13 }}>{err}</div>}
            <div><Btn c={c} onClick={genOutline} disabled={!!busy}><Sparkles size={15} /> Générer le sommaire</Btn></div>
          </div>
        </Card>
      )}

      {step === 2 && outline && (
        <Card c={c}>
          <input style={{ ...inputStyle(c), fontFamily: DISPLAY, fontSize: 18, marginBottom: 8 }} value={outline.titre} onChange={e => setOutline({ ...outline, titre: e.target.value })} />
          <input style={{ ...inputStyle(c), marginBottom: 16 }} value={outline.sousTitre || ""} placeholder="Sous-titre" onChange={e => setOutline({ ...outline, sousTitre: e.target.value })} />
          <Eyebrow c={c}>Table des matières — modifiable</Eyebrow>
          <div style={{ margin: "10px 0 16px" }}>
            {outline.chapitres.map((ch, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontFamily: MONO, fontSize: 11.5, color: c.faint, minWidth: 24 }}>{pad2(i + 1)}</span>
                <input style={{ ...inputStyle(c), padding: "7px 10px", fontSize: 13 }} value={ch.titre}
                  onChange={e => { const cs = [...outline.chapitres]; cs[i] = { ...cs[i], titre: e.target.value }; setOutline({ ...outline, chapitres: cs }); }} />
                <button onClick={() => setOutline({ ...outline, chapitres: outline.chapitres.filter((_, j) => j !== i) })}
                  style={{ background: "none", border: "none", color: c.faint, cursor: "pointer" }}><X size={14} /></button>
              </div>
            ))}
            <Btn c={c} kind="ghost" small onClick={() => setOutline({ ...outline, chapitres: [...outline.chapitres, { titre: "Nouveau chapitre", resume: "" }] })}><Plus size={13} /> Ajouter un chapitre</Btn>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Btn c={c} kind="ghost" onClick={genOutline} disabled={!!busy}><RefreshCw size={14} /> Regénérer</Btn>
            <Btn c={c} onClick={create}><Check size={15} /> Créer l'e-book</Btn>
          </div>
        </Card>
      )}
    </div>
  );
}

function EbooksList({ c, data, go, onDelete, onDuplicate }) {
  const [q, setQ] = useState("");
  const list = data.ebooks.filter(e => e.titre.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
        <div>
          <Eyebrow c={c}>Bibliothèque</Eyebrow>
          <h1 style={{ fontFamily: DISPLAY, fontSize: 28, color: c.ink, margin: "6px 0 0" }}>Vos e-books</h1>
        </div>
        <Btn c={c} onClick={() => go({ name: "ebook-new" })}><Plus size={15} /> Nouvel e-book</Btn>
      </div>
      <div style={{ position: "relative", maxWidth: 340, marginBottom: 16 }}>
        <Search size={15} color={c.faint} style={{ position: "absolute", left: 11, top: 11 }} />
        <input style={{ ...inputStyle(c), paddingLeft: 34, background: c.surface }} placeholder="Rechercher un e-book…" value={q} onChange={e => setQ(e.target.value)} />
      </div>
      {list.length === 0 && <Card c={c}><div style={{ color: c.faint, fontSize: 13.5 }}>Aucun e-book. Lancez l'assistant : sujet → sommaire validé → chapitres générés un par un, puis export.</div></Card>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {list.map((e, i) => {
          const s = ebookStats(e);
          return (
            <Card key={e.id} c={c} lift delay={i * 50}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div onClick={() => go({ name: "ebook", id: e.id })} style={{ cursor: "pointer", flex: 1 }}>
                  <div style={{ fontFamily: DISPLAY, fontSize: 18, color: c.ink }}>{e.titre}</div>
                  <div style={{ fontSize: 12.5, color: c.sub, margin: "4px 0 10px", fontStyle: "italic" }}>{e.sousTitre}</div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                  <Btn c={c} kind="ghost" small title="Dupliquer" onClick={() => onDuplicate(e)}><Copy size={13} /></Btn>
                  <Btn c={c} kind="danger" small title="Supprimer" onClick={() => onDelete(e)}><Trash2 size={13} /></Btn>
                </div>
              </div>
              <Spine c={c} pct={s.pct} color={c.gold} />
              <div style={{ marginTop: 8, fontFamily: MONO, fontSize: 11, color: c.faint }}>{s.done}/{s.total} chapitres · {wordCount(e).toLocaleString("fr-FR")} mots</div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function EbookDetail({ c, ebook, update, onBack, busy, setBusy, addActivity }) {
  const [sel, setSel] = useState(ebook.chapitres[0] ? ebook.chapitres[0].id : null);
  const [preview, setPreview] = useState(false);
  const [msg, setMsg] = useState("");
  const s = ebookStats(ebook);
  const chap = ebook.chapitres.find(ch => ch.id === sel);

  const setChap = (id, patch) => update({ ...ebook, chapitres: ebook.chapitres.map(ch => ch.id === id ? { ...ch, ...patch } : ch) });

  const genChapter = async (ch) => {
    const idx = ebook.chapitres.findIndex(x => x.id === ch.id);
    setBusy("Rédaction du chapitre " + (idx + 1) + " : " + ch.titre);
    try {
      const sommaire = ebook.chapitres.map((x, i) => (i + 1) + ". " + x.titre).join("\n");
      const sys = "Tu es un auteur professionnel d'e-books. Tu rédiges en français, uniquement en Markdown, sans commentaire hors du texte du chapitre.";
      const prompt = "Livre: " + ebook.titre + (ebook.sousTitre ? " — " + ebook.sousTitre : "") +
        "\nAudience: " + (ebook.audience || "grand public") + "\nTon: " + ebook.ton +
        "\nSommaire complet:\n" + sommaire +
        "\n\nRédige UNIQUEMENT le chapitre " + (idx + 1) + " : « " + ch.titre + " »" +
        (ch.resume ? "\nRésumé prévu: " + ch.resume : "") +
        "\n\nFormat: commence par '## " + ch.titre + "', 400 à 600 mots, 2 à 3 sous-sections '###', conseils concrets et exemples, termine par une courte liste '### Points clés'. Ne rédige aucun autre chapitre.";
      const text = await askClaude(prompt, sys);
      setChap(ch.id, { contenu: text.trim() });
      addActivity('Chapitre rédigé : « ' + ch.titre + ' » (' + ebook.titre + ")");
    } catch (e) { setMsg("Échec de la génération : " + e.message); setTimeout(() => setMsg(""), 4000); }
    finally { setBusy(""); }
  };

  const genAll = async () => {
    for (const ch of ebook.chapitres) {
      if (!ch.contenu || ch.contenu.trim().length < 50) { await genChapter(ch); }
    }
  };

  const fullMarkdown = () => {
    let md = "# " + ebook.titre + "\n";
    if (ebook.sousTitre) md += "*" + ebook.sousTitre + "*\n";
    md += "\n" + (ebook.description || "") + "\n\n---\n\n## Table des matières\n";
    ebook.chapitres.forEach((ch, i) => { md += (i + 1) + ". " + ch.titre + "\n"; });
    md += "\n---\n\n";
    ebook.chapitres.forEach(ch => { md += (ch.contenu || "## " + ch.titre + "\n\n*(chapitre non rédigé)*") + "\n\n---\n\n"; });
    return md;
  };

  const exportMd = () => {
    const ok = downloadFile(slug(ebook.titre) + ".md", fullMarkdown(), "text/markdown;charset=utf-8");
    setMsg(ok ? "Fichier Markdown téléchargé." : "Téléchargement bloqué. Réessayez.");
    if (ok) addActivity('E-book exporté en Markdown : « ' + ebook.titre + ' »');
    setTimeout(() => setMsg(""), 3000);
  };

  const exportHtml = () => {
    const body = ebook.chapitres.map(ch => mdToHtml(ch.contenu || "## " + ch.titre + "\n\n*(chapitre non rédigé)*")).join("<hr/>");
    const toc = ebook.chapitres.map((ch) => "<li>" + ch.titre + "</li>").join("");
    const html = "<!DOCTYPE html><html lang='fr'><head><meta charset='utf-8'><title>" + ebook.titre + "</title><style>" +
      "body{font-family:Georgia,serif;max-width:720px;margin:0 auto;padding:48px 24px;color:#20263c;line-height:1.7}" +
      "h1{font-size:2.4em;margin-bottom:0}h2{margin-top:2em;border-bottom:1px solid #ddd;padding-bottom:6px}" +
      ".sub{font-style:italic;color:#666;font-size:1.15em}.cover{text-align:center;padding:80px 0;border-bottom:3px double #999;margin-bottom:40px}" +
      "ol,ul{padding-left:1.3em}hr{border:none;border-top:1px solid #e1e5f0;margin:2.5em 0}" +
      "@media print{.cover{page-break-after:always}h2{page-break-before:always}}" +
      "</style></head><body><div class='cover'><h1>" + ebook.titre + "</h1><p class='sub'>" + (ebook.sousTitre || "") + "</p><p>" + (ebook.description || "") + "</p></div>" +
      "<h2>Table des matières</h2><ol>" + toc + "</ol>" + body + "</body></html>";
    const ok = downloadFile(slug(ebook.titre) + ".html", html, "text/html;charset=utf-8");
    setMsg(ok ? "HTML téléchargé — ouvrez-le puis Imprimer → PDF." : "Téléchargement bloqué.");
    if (ok) addActivity('E-book exporté en HTML : « ' + ebook.titre + ' »');
    setTimeout(() => setMsg(""), 4000);
  };

  const copyChap = () => { if (chap && copyText(chap.contenu || "")) { setMsg("Chapitre copié."); setTimeout(() => setMsg(""), 2500); } };

  return (
    <div>
      <Btn c={c} kind="ghost" small onClick={onBack}><ChevronLeft size={14} /> E-books</Btn>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, margin: "10px 0 16px" }}>
        <div>
          <Eyebrow c={c}>E-book · {ebook.ton}</Eyebrow>
          <h1 style={{ fontFamily: DISPLAY, fontSize: 28, color: c.ink, margin: "4px 0 2px" }}>{ebook.titre}</h1>
          {ebook.sousTitre && <div style={{ color: c.sub, fontStyle: "italic", fontSize: 14 }}>{ebook.sousTitre}</div>}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn c={c} kind="ghost" small onClick={exportMd}><Download size={13} /> Markdown</Btn>
          <Btn c={c} kind="ghost" small onClick={exportHtml}><Download size={13} /> HTML / PDF</Btn>
          <Btn c={c} kind="soft" small onClick={genAll} disabled={!!busy || s.done === s.total}><Sparkles size={13} /> Tout rédiger</Btn>
        </div>
      </div>

      <Card c={c} style={{ marginBottom: 18, padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontFamily: MONO, fontSize: 11.5, color: c.gold }}>{s.done}/{s.total} chapitres · {wordCount(ebook).toLocaleString("fr-FR")} mots</span>
          <span style={{ fontFamily: MONO, fontSize: 11.5, color: c.faint }}>{s.pct}%</span>
        </div>
        <Spine c={c} pct={s.pct} color={c.gold} />
      </Card>
      {msg && <div style={{ marginBottom: 14, fontSize: 13, color: c.green }}>{msg}</div>}

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="md:col-span-2">
          <Card c={c} style={{ padding: 12 }}>
            <div style={{ padding: "2px 6px 8px" }}><Eyebrow c={c}>Table des matières</Eyebrow></div>
            {ebook.chapitres.map((ch, i) => {
              const done = ch.contenu && ch.contenu.trim().length > 50;
              return <TocRow key={ch.id} c={c} num={i + 1} left={ch.titre} right={done ? "rédigé" : "à écrire"} done={!!done} active={sel === ch.id} onClick={() => { setSel(ch.id); setPreview(false); }} />;
            })}
          </Card>
          <Card c={c} style={{ marginTop: 14 }}>
            <Eyebrow c={c}>Notes de travail</Eyebrow>
            <textarea rows={3} style={{ ...inputStyle(c), marginTop: 8, resize: "vertical" }} placeholder="Idées, sources, choses à vérifier…"
              value={ebook.notes || ""} onChange={e => update({ ...ebook, notes: e.target.value })} />
          </Card>
        </div>

        <div className="md:col-span-3">
          {chap ? (
            <Card c={c}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                <div style={{ fontFamily: DISPLAY, fontSize: 17, color: c.ink }}>{chap.titre}</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <Btn c={c} kind="ghost" small onClick={() => setPreview(!preview)}>{preview ? <Pencil size={13} /> : <BookOpen size={13} />} {preview ? "Éditer" : "Aperçu"}</Btn>
                  <Btn c={c} kind="ghost" small onClick={copyChap} title="Copier"><Copy size={13} /></Btn>
                  <Btn c={c} kind="soft" small onClick={() => genChapter(chap)} disabled={!!busy}>
                    {chap.contenu ? <RefreshCw size={13} /> : <Sparkles size={13} />} {chap.contenu ? "Regénérer" : "Rédiger avec l'IA"}
                  </Btn>
                </div>
              </div>
              {preview ? (
                <div style={{ fontFamily: DISPLAY, fontSize: 15, color: c.ink, lineHeight: 1.7 }}
                  dangerouslySetInnerHTML={{ __html: mdToHtml(chap.contenu || "*Chapitre vide — cliquez sur « Rédiger avec l'IA » ou écrivez-le vous-même.*") }} />
              ) : (
                <textarea rows={18} style={{ ...inputStyle(c), fontFamily: MONO, fontSize: 12.5, lineHeight: 1.6, resize: "vertical" }}
                  placeholder={"Contenu du chapitre en Markdown…\n\nCliquez sur « Rédiger avec l'IA » pour générer un premier jet, puis retouchez librement."}
                  value={chap.contenu || ""} onChange={e => setChap(chap.id, { contenu: e.target.value })} />
              )}
            </Card>
          ) : <Card c={c}><div style={{ color: c.faint }}>Sélectionnez un chapitre.</div></Card>}
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   COACH IA (le chatbot de l'ancienne version, avec une vraie IA)
   ================================================================ */
function CoachView({ c, data, setData, busy, setBusy }) {
  const [input, setInput] = useState("");
  const [err, setErr] = useState("");
  const endRef = useRef(null);
  const msgs = data.coach || [];

  useEffect(() => { if (endRef.current) endRef.current.scrollIntoView({ behavior: "smooth" }); }, [msgs.length]);

  const contextBrief = () => {
    const plans = data.plans.map(p => {
      const s = planStats(p);
      const next = flatTasks(p).filter(t => !t.done).slice(0, 3).map(t => t.text).join("; ");
      return "- Plan « " + p.titre + " » : " + s.pct + "% (" + s.done + "/" + s.total + " tâches)" + (next ? ". Prochaines tâches: " + next : "");
    }).join("\n");
    const ebooks = data.ebooks.map(e => { const s = ebookStats(e); return "- E-book « " + e.titre + " » : " + s.done + "/" + s.total + " chapitres rédigés"; }).join("\n");
    return (plans || "Aucun plan.") + "\n" + (ebooks || "Aucun e-book.");
  };

  const send = async (text) => {
    const q = (text || input).trim();
    if (!q || busy) return;
    setInput(""); setErr("");
    const history = [...msgs, { role: "user", content: q }];
    setData(d => ({ ...d, coach: history.slice(-30) }));
    setBusy("Le coach réfléchit…");
    try {
      const sys = "Tu es un coach en productivité et en business, bienveillant, concret et direct. Tu réponds en français, en 150 mots maximum, avec des conseils actionnables. Voici l'état actuel des projets de l'utilisateur dans son application:\n" + contextBrief();
      const reply = await askClaude(q, sys, msgs.slice(-10));
      setData(d => ({ ...d, coach: [...history, { role: "assistant", content: reply }].slice(-30) }));
    } catch (e) {
      setErr("Le coach n'a pas pu répondre (" + e.message + "). Réessayez.");
      setData(d => ({ ...d, coach: msgs }));
    } finally { setBusy(""); }
  };

  const suggestions = ["Que devrais-je faire aujourd'hui ?", "Comment prioriser mes projets ?", "Donne-moi 3 idées pour vendre mon e-book", "Je manque de motivation, des conseils ?"];

  return (
    <div style={{ maxWidth: 720 }}>
      <Eyebrow c={c}>Coach</Eyebrow>
      <h1 style={{ fontFamily: DISPLAY, fontSize: 28, color: c.ink, margin: "6px 0 4px" }}>Coach IA</h1>
      <p style={{ color: c.sub, fontSize: 13.5, margin: "0 0 16px" }}>Il connaît l'avancement de vos plans et e-books, et vous aide à avancer.</p>
      <NoKeyNotice c={c} />

      <Card c={c} style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: 18, minHeight: 280, maxHeight: 440, overflowY: "auto" }}>
          {msgs.length === 0 && (
            <div>
              <div style={{ color: c.faint, fontSize: 13.5, marginBottom: 14 }}>Posez une question, ou commencez par une suggestion :</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {suggestions.map(sg => (
                  <button key={sg} className="btnh" onClick={() => send(sg)} style={{
                    background: c.accentSoft, color: c.accent, border: "none", borderRadius: 99,
                    padding: "7px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                  }}>{sg}</button>
                ))}
              </div>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className="fadeup" style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 10 }}>
              <div style={{
                maxWidth: "82%", padding: "10px 14px", borderRadius: 14, fontSize: 13.5, lineHeight: 1.55,
                background: m.role === "user" ? "linear-gradient(120deg," + c.accent + "," + c.accent2 + ")" : c.surface2,
                color: m.role === "user" ? "#fff" : c.ink,
                borderBottomRightRadius: m.role === "user" ? 4 : 14,
                borderBottomLeftRadius: m.role === "user" ? 14 : 4,
              }}>
                {m.role === "assistant"
                  ? <div dangerouslySetInnerHTML={{ __html: mdToHtml(m.content) }} />
                  : m.content}
              </div>
            </div>
          ))}
          {busy && <div style={{ display: "flex", alignItems: "center", gap: 8, color: c.faint, fontSize: 12.5 }}><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Le coach rédige sa réponse…</div>}
          {err && <div style={{ color: c.red, fontSize: 13, marginTop: 8 }}>{err}</div>}
          <div ref={endRef} />
        </div>
        <div style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid " + c.border, background: c.surface }}>
          <input style={{ ...inputStyle(c) }} placeholder="Écrivez votre message…" value={input}
            onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") send(); }} />
          <Btn c={c} onClick={() => send()} disabled={!!busy || !input.trim()}><Send size={14} /></Btn>
        </div>
      </Card>
      {msgs.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <Btn c={c} kind="ghost" small onClick={() => setData(d => ({ ...d, coach: [] }))}><Trash2 size={13} /> Effacer la conversation</Btn>
        </div>
      )}
    </div>
  );
}

/* ================================================================
   SUIVI & BASE DE DONNÉES
   ================================================================ */
/* Carte de configuration de la clé API Anthropic (IA optionnelle) */
function ApiKeyCard({ c }) {
  const [key, setKey] = useState(getApiKey());
  const [show, setShow] = useState(false);
  const [note, setNote] = useState("");
  const save = () => {
    setApiKey(key);
    setNote(key.trim() ? "Clé enregistrée dans ce navigateur — IA activée." : "Clé supprimée — IA désactivée.");
    setTimeout(() => setNote(""), 3500);
  };
  return (
    <Card c={c} style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <KeyRound size={16} color={c.gold} />
        <Eyebrow c={c} color={c.gold}>IA (optionnel) — clé API Anthropic</Eyebrow>
      </div>
      <p style={{ fontSize: 13, color: c.sub, margin: "0 0 12px", lineHeight: 1.6 }}>
        Pour activer la génération IA (plans, sommaires, chapitres, coach), collez votre clé API Anthropic
        (créée sur console.anthropic.com — facturée à l'usage). Elle est stockée uniquement dans ce navigateur,
        jamais dans la base de données. Sans clé, l'application reste entièrement utilisable.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
          <input type={show ? "text" : "password"} style={{ ...inputStyle(c), paddingRight: 38 }} placeholder="sk-ant-…" value={key} onChange={e => setKey(e.target.value)} />
          <button onClick={() => setShow(!show)} style={{ position: "absolute", right: 8, top: 8, background: "none", border: "none", cursor: "pointer", color: c.faint }}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
        </div>
        <Btn c={c} onClick={save}><Check size={14} /> Enregistrer</Btn>
      </div>
      {note && <div style={{ marginTop: 10, fontSize: 12.5, color: c.green }}>{note}</div>}
    </Card>
  );
}

function ProgressView({ c, data, go, onImport, addActivity, lastSaved, saving, saveErr }) {
  const fileRef = useRef(null);
  const [msg, setMsg] = useState("");

  const exportAll = () => {
    const ok = downloadFile("ebook-v-001-sauvegarde-" + new Date().toISOString().slice(0, 10) + ".json", JSON.stringify(data, null, 2), "application/json");
    setMsg(ok ? "Sauvegarde téléchargée." : "Téléchargement bloqué.");
    setTimeout(() => setMsg(""), 3000);
  };
  const importAll = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const j = JSON.parse(r.result);
        if (!j.plans || !j.ebooks) throw new Error("format invalide");
        onImport(j);
        setMsg("Données restaurées avec succès.");
        addActivity("Sauvegarde importée");
      } catch (err) { setMsg("Import impossible : fichier invalide."); }
      setTimeout(() => setMsg(""), 3500);
    };
    r.readAsText(file);
    e.target.value = "";
  };

  return (
    <div style={{ maxWidth: 760 }}>
      <Eyebrow c={c}>Suivi</Eyebrow>
      <h1 style={{ fontFamily: DISPLAY, fontSize: 28, color: c.ink, margin: "6px 0 20px" }}>Avancement & données</h1>

      <Card c={c} style={{ marginBottom: 18, background: "linear-gradient(115deg," + c.greenSoft + ", transparent 55%), " + c.surface }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <Database size={16} color={c.green} />
          <Eyebrow c={c} color={c.green}>Base de données intégrée</Eyebrow>
        </div>
        <p style={{ fontSize: 13, color: c.sub, margin: "0 0 12px" }}>
          Tous vos plans, e-books, tâches et conversations sont enregistrés automatiquement dans votre base
          Supabase (PostgreSQL), liés à votre compte et accessibles depuis n'importe quel appareil.
          {saving && <span style={{ fontFamily: MONO, fontSize: 11.5 }}> Enregistrement…</span>}
          {!saving && lastSaved && <span style={{ fontFamily: MONO, fontSize: 11.5 }}> Dernier enregistrement : {fmtTime(lastSaved)}.</span>}
          {saveErr && <span style={{ color: c.red }}> {saveErr}</span>}
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Btn c={c} kind="ghost" onClick={exportAll}><Download size={14} /> Exporter tout (JSON)</Btn>
          <Btn c={c} kind="ghost" onClick={() => fileRef.current && fileRef.current.click()}><Upload size={14} /> Importer une sauvegarde</Btn>
          <input ref={fileRef} type="file" accept="application/json" style={{ display: "none" }} onChange={importAll} />
        </div>
        {msg && <div style={{ marginTop: 10, fontSize: 13, color: c.green }}>{msg}</div>}
      </Card>

      <ApiKeyCard c={c} />

      <Card c={c} style={{ marginBottom: 18 }}>
        <Eyebrow c={c}>Plans</Eyebrow>
        {data.plans.length === 0 && <div style={{ color: c.faint, fontSize: 13, padding: "10px 0" }}>Aucun plan à suivre.</div>}
        {data.plans.map(p => {
          const s = planStats(p);
          return (
            <div key={p.id} className="rowh" onClick={() => go({ name: "plan", id: p.id })} style={{ cursor: "pointer", padding: "10px 6px", borderBottom: "1px solid " + c.border, borderRadius: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 13.5, color: c.ink, fontWeight: 600 }}>{p.titre}</span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: c.faint }}>{s.done}/{s.total} · {s.pct}%</span>
              </div>
              <Spine c={c} pct={s.pct} height={6} />
            </div>
          );
        })}
      </Card>

      <Card c={c} style={{ marginBottom: 18 }}>
        <Eyebrow c={c}>E-books</Eyebrow>
        {data.ebooks.length === 0 && <div style={{ color: c.faint, fontSize: 13, padding: "10px 0" }}>Aucun e-book à suivre.</div>}
        {data.ebooks.map(e => {
          const s = ebookStats(e);
          return (
            <div key={e.id} className="rowh" onClick={() => go({ name: "ebook", id: e.id })} style={{ cursor: "pointer", padding: "10px 6px", borderBottom: "1px solid " + c.border, borderRadius: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 13.5, color: c.ink, fontWeight: 600 }}>{e.titre}</span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: c.faint }}>{s.done}/{s.total} chap. · {wordCount(e).toLocaleString("fr-FR")} mots</span>
              </div>
              <Spine c={c} pct={s.pct} height={6} color={c.gold} />
            </div>
          );
        })}
      </Card>

      <Card c={c}>
        <Eyebrow c={c}>Journal d'activité</Eyebrow>
        <div style={{ marginTop: 6, maxHeight: 300, overflowY: "auto" }}>
          {data.activity.length === 0 && <div style={{ color: c.faint, fontSize: 13, padding: "10px 0" }}>Rien pour l'instant.</div>}
          {data.activity.map(a => (
            <div key={a.id} style={{ display: "flex", gap: 12, padding: "7px 0", borderBottom: "1px solid " + c.border, alignItems: "baseline" }}>
              <span style={{ fontFamily: MONO, fontSize: 11, color: c.faint, minWidth: 110 }}>{fmtTime(a.ts)}</span>
              <span style={{ fontSize: 13, color: c.sub }}>{a.text}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ================================================================
   AUTHENTIFICATION & CONFIGURATION
   ================================================================ */
function ConfigMissing() {
  const c = THEME(false);
  return (
    <div style={{ minHeight: "100vh", background: c.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "system-ui" }}>
      <div style={{ background: c.surface, border: "1px solid " + c.border, borderRadius: 14, padding: 28, maxWidth: 560, boxShadow: c.shadow }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 22, color: c.ink, marginBottom: 10 }}>Configuration Supabase manquante</div>
        <p style={{ fontSize: 13.5, color: c.sub, lineHeight: 1.7, margin: 0 }}>
          Les variables <code>VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_ANON_KEY</code> ne sont pas définies.
          En local : copiez <code>.env.example</code> en <code>.env</code>, remplissez-le avec les valeurs de votre projet
          Supabase (Settings → API), puis relancez <code>npm run dev</code>.
          Sur Vercel ou GitHub Pages : ajoutez ces deux variables dans les réglages du déploiement.
          Le pas-à-pas complet est dans le <strong>README.md</strong>.
        </p>
      </div>
    </div>
  );
}

function AuthView({ c }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email.trim() || pwd.length < 6) { setErr("Email valide et mot de passe d'au moins 6 caractères requis."); return; }
    setErr(""); setInfo(""); setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password: pwd });
        if (error) throw error;
        if (!data.session) setInfo("Compte créé ! Si la confirmation par email est activée dans votre projet Supabase, cliquez sur le lien reçu avant de vous connecter.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pwd });
        if (error) throw error;
      }
    } catch (e) {
      setErr(e.message === "Invalid login credentials" ? "Identifiants invalides." : (e.message || "Erreur d'authentification."));
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: "100vh", background: c.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      <style>{"@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}.fadeup{animation:fadeUp .45s ease both}@keyframes spin{to{transform:rotate(360deg)}}"}</style>
      <div className="fadeup" style={{ background: c.surface, border: "1px solid " + c.border, borderRadius: 16, padding: 30, width: "100%", maxWidth: 400, boxShadow: c.shadow }}>
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <div style={{ fontFamily: DISPLAY, fontSize: 26, color: c.ink, fontWeight: 700 }}>L'Atelier</div>
          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", color: c.faint, marginTop: 4 }}>PLANS · E-BOOKS · SUIVI</div>
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 18, background: c.surface2, borderRadius: 10, padding: 4 }}>
          {[["login", "Connexion"], ["signup", "Créer un compte"]].map(([k, label]) => (
            <button key={k} onClick={() => { setMode(k); setErr(""); setInfo(""); }} style={{
              flex: 1, padding: "8px 0", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
              background: mode === k ? c.surface : "transparent", color: mode === k ? c.accent : c.sub,
              boxShadow: mode === k ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
            }}>{label}</button>
          ))}
        </div>
        <div style={{ display: "grid", gap: 12 }}>
          <Field c={c} label="Email">
            <input style={inputStyle(c)} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="vous@exemple.com" onKeyDown={e => { if (e.key === "Enter") submit(); }} />
          </Field>
          <Field c={c} label="Mot de passe">
            <div style={{ position: "relative" }}>
              <input style={{ ...inputStyle(c), paddingRight: 38 }} type={show ? "text" : "password"} value={pwd} onChange={e => setPwd(e.target.value)} placeholder="6 caractères minimum" onKeyDown={e => { if (e.key === "Enter") submit(); }} />
              <button onClick={() => setShow(!show)} style={{ position: "absolute", right: 8, top: 8, background: "none", border: "none", cursor: "pointer", color: c.faint }}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </div>
          </Field>
          {err && <div style={{ color: c.red, fontSize: 12.5 }}>{err}</div>}
          {info && <div style={{ color: c.green, fontSize: 12.5 }}>{info}</div>}
          <Btn c={c} onClick={submit} disabled={loading}>
            {loading ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> : <Check size={15} />} {mode === "login" ? "Se connecter" : "Créer mon compte"}
          </Btn>
        </div>
        <p style={{ fontSize: 11.5, color: c.faint, marginTop: 16, textAlign: "center", lineHeight: 1.5 }}>
          Vos données sont stockées dans votre base Supabase (PostgreSQL), protégées par Row Level Security : chaque compte n'accède qu'à ses propres données.
        </p>
      </div>
    </div>
  );
}

/* ================================================================
   APP
   ================================================================ */
const DEFAULT_DATA = { plans: [], ebooks: [], activity: [], coach: [], settings: { dark: false } };

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = vérification en cours
  const [data, setData] = useState(null);
  const [view, setView] = useState({ name: "dashboard" });
  const [busy, setBusy] = useState("");
  const [confirm, setConfirm] = useState(null);
  const [lastSaved, setLastSaved] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const loadedOnce = useRef(false);

  /* --- Session Supabase --- */
  useEffect(() => {
    if (!isConfigured) return;
    supabase.auth.getSession().then(({ data: d }) => setSession(d.session || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session && session.user ? session.user.id : null;

  /* --- Chargement des données de l'utilisateur connecté --- */
  useEffect(() => {
    if (!userId) { setData(null); loadedOnce.current = false; return; }
    let alive = true;
    (async () => {
      try {
        const d = await loadUserData(userId);
        if (alive) { loadedOnce.current = false; setData({ ...DEFAULT_DATA, ...(d || {}) }); }
      } catch (e) {
        if (alive) { loadedOnce.current = false; setData(DEFAULT_DATA); }
      }
    })();
    return () => { alive = false; };
  }, [userId]);

  /* --- Sauvegarde automatique (debounce 800 ms) --- */
  useEffect(() => {
    if (!data || !userId) return;
    if (!loadedOnce.current) { loadedOnce.current = true; return; }
    setSaving(true);
    const t = setTimeout(async () => {
      try {
        await saveUserData(userId, data);
        setLastSaved(now()); setSaveErr("");
      } catch (e) {
        setSaveErr("Échec de la sauvegarde — vérifiez votre connexion et que le schéma SQL a bien été exécuté.");
      } finally { setSaving(false); }
    }, 800);
    return () => clearTimeout(t);
  }, [data, userId]);

  /* --- Écrans hors application --- */
  if (!isConfigured) return <ConfigMissing />;
  const cLight = THEME(false);
  if (session === undefined || (session && !data)) {
    return (
      <div style={{ minHeight: "100vh", background: cLight.bg, display: "flex", alignItems: "center", justifyContent: "center", color: cLight.sub, fontFamily: "system-ui" }}>
        <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
        <Loader2 size={22} style={{ animation: "spin 1s linear infinite", marginRight: 10 }} /> Ouverture de l'atelier…
      </div>
    );
  }
  if (!session) return <AuthView c={cLight} />;

  const dark = !!data.settings.dark;
  const c = THEME(dark);
  const addActivity = (text) => setData(d => ({ ...d, activity: [{ id: uid(), ts: now(), text }, ...d.activity].slice(0, 120) }));
  const upPlan = (plan) => setData(d => ({ ...d, plans: d.plans.map(p => p.id === plan.id ? plan : p) }));
  const upEbook = (eb) => setData(d => ({ ...d, ebooks: d.ebooks.map(e => e.id === eb.id ? eb : e) }));

  const NAV = [
    { key: "dashboard", label: "Tableau de bord", icon: <LayoutDashboard size={16} /> },
    { key: "plans", label: "Plans", icon: <Map size={16} /> },
    { key: "ebooks", label: "E-books", icon: <BookOpen size={16} /> },
    { key: "coach", label: "Coach IA", icon: <MessageCircle size={16} /> },
    { key: "progress", label: "Suivi & données", icon: <BarChart3 size={16} /> },
  ];
  const activeNav = view.name.startsWith("plan") ? "plans" : view.name.startsWith("ebook") ? "ebooks" : view.name === "coach" ? "coach" : view.name === "progress" ? "progress" : "dashboard";

  const body = () => {
    if (view.name === "dashboard") return <Dashboard c={c} data={data} go={setView} />;
    if (view.name === "plans") return (
      <PlansList c={c} data={data} go={setView}
        onDelete={(p) => setConfirm({ msg: 'Supprimer le plan « ' + p.titre + ' » ? Cette action est définitive.', yes: () => { setData(d => ({ ...d, plans: d.plans.filter(x => x.id !== p.id) })); addActivity('Plan supprimé : « ' + p.titre + ' »'); setConfirm(null); } })}
        onDuplicate={(p) => { const copy = JSON.parse(JSON.stringify(p)); copy.id = uid(); copy.titre = p.titre + " (copie)"; copy.created = now(); setData(d => ({ ...d, plans: [copy, ...d.plans] })); addActivity('Plan dupliqué : « ' + p.titre + ' »'); }} />
    );
    if (view.name === "plan-new") return (
      <PlanWizard c={c} busy={busy} setBusy={setBusy} addActivity={addActivity} onBack={() => setView({ name: "plans" })}
        onCreate={(p) => { setData(d => ({ ...d, plans: [p, ...d.plans] })); setView({ name: "plan", id: p.id }); }} />
    );
    if (view.name === "plan") {
      const p = data.plans.find(x => x.id === view.id);
      if (!p) return <PlansList c={c} data={data} go={setView} onDelete={() => {}} onDuplicate={() => {}} />;
      return <PlanDetail c={c} plan={p} update={upPlan} addActivity={addActivity} onBack={() => setView({ name: "plans" })} />;
    }
    if (view.name === "ebooks") return (
      <EbooksList c={c} data={data} go={setView}
        onDelete={(e) => setConfirm({ msg: 'Supprimer l\'e-book « ' + e.titre + ' » ? Les chapitres rédigés seront perdus.', yes: () => { setData(d => ({ ...d, ebooks: d.ebooks.filter(x => x.id !== e.id) })); addActivity('E-book supprimé : « ' + e.titre + ' »'); setConfirm(null); } })}
        onDuplicate={(e) => { const copy = JSON.parse(JSON.stringify(e)); copy.id = uid(); copy.titre = e.titre + " (copie)"; copy.created = now(); copy.chapitres.forEach(ch => ch.id = uid()); setData(d => ({ ...d, ebooks: [copy, ...d.ebooks] })); addActivity('E-book dupliqué : « ' + e.titre + ' »'); }} />
    );
    if (view.name === "ebook-new") return (
      <EbookWizard c={c} busy={busy} setBusy={setBusy} addActivity={addActivity} onBack={() => setView({ name: "ebooks" })}
        onCreate={(e) => { setData(d => ({ ...d, ebooks: [e, ...d.ebooks] })); setView({ name: "ebook", id: e.id }); }} />
    );
    if (view.name === "ebook") {
      const e = data.ebooks.find(x => x.id === view.id);
      if (!e) return <EbooksList c={c} data={data} go={setView} onDelete={() => {}} onDuplicate={() => {}} />;
      return <EbookDetail c={c} ebook={e} update={upEbook} busy={busy} setBusy={setBusy} addActivity={addActivity} onBack={() => setView({ name: "ebooks" })} />;
    }
    if (view.name === "coach") return <CoachView c={c} data={data} setData={setData} busy={busy} setBusy={setBusy} />;
    if (view.name === "progress") return <ProgressView c={c} data={data} go={setView} addActivity={addActivity} lastSaved={lastSaved} saving={saving} saveErr={saveErr} onImport={(j) => setData({ ...DEFAULT_DATA, ...j })} />;
    return null;
  };

  const css =
    "@keyframes spin{to{transform:rotate(360deg)}}" +
    "@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}" +
    ".fadeup{animation:fadeUp .45s ease both}" +
    ".cardlift{transition:transform .18s ease, box-shadow .18s ease}" +
    ".cardlift:hover{transform:translateY(-3px);box-shadow:" + c.shadow + "}" +
    ".btnh{transition:transform .15s ease, filter .15s ease}" +
    ".btnh:hover:not(:disabled){transform:translateY(-1px);filter:brightness(1.05)}" +
    ".rowh{transition:background .15s ease}" +
    ".rowh:hover{background:" + c.accentSoft + "}" +
    "::selection{background:" + c.accentSoft + "}" +
    "button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:2px solid " + c.accent + ";outline-offset:2px}" +
    "@media (prefers-reduced-motion: reduce){*{animation:none!important;transition:none!important}}";

  return (
    <div style={{ minHeight: "100vh", background: c.bg, fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      <style>{css}</style>
      {busy && view.name !== "coach" && <AiOverlay c={c} label={busy} />}
      {confirm && <Confirm c={c} msg={confirm.msg} onYes={confirm.yes} onNo={() => setConfirm(null)} />}

      <div className="flex flex-col md:flex-row" style={{ minHeight: "100vh" }}>
        {/* Barre latérale */}
        <aside className="md:w-60 w-full md:min-h-screen" style={{ background: c.surface, borderRight: "1px solid " + c.border, borderBottom: "1px solid " + c.border, padding: "20px 14px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22, padding: "0 6px" }}>
            <div>
              <div style={{ fontFamily: DISPLAY, fontSize: 19, color: c.ink, fontWeight: 700, lineHeight: 1 }}>L'Atelier</div>
              <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.12em", color: c.faint, marginTop: 4 }}>EBOOK-V-001 · WEB</div>
            </div>
            <button title={dark ? "Mode clair" : "Mode sombre"} onClick={() => setData(d => ({ ...d, settings: { ...d.settings, dark: !d.settings.dark } }))}
              className="btnh" style={{ background: c.surface2, border: "1px solid " + c.border, borderRadius: 9, padding: 7, cursor: "pointer", color: c.sub, display: "flex" }}>
              {dark ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
          <nav className="flex md:flex-col flex-row gap-1 overflow-x-auto">
            {NAV.map(n => (
              <button key={n.key} onClick={() => setView({ name: n.key })} className="btnh"
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 9, border: "none",
                  cursor: "pointer", fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", width: "100%", textAlign: "left",
                  background: activeNav === n.key ? c.accentSoft : "transparent",
                  color: activeNav === n.key ? c.accent : c.sub,
                }}>
                {n.icon}{n.label}
              </button>
            ))}
          </nav>
          <div className="hidden md:block" style={{ marginTop: 28, padding: "14px 10px 0", borderTop: "1px solid " + c.border }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Database size={13} color={saveErr ? c.red : c.green} />
              <div style={{ fontSize: 11.5, color: saveErr ? c.red : c.faint, lineHeight: 1.4 }}>
                {saving ? "Enregistrement…" : saveErr ? "Erreur de sauvegarde" : "Base Supabase · synchronisée"}
              </div>
            </div>
            <div title={session.user.email} style={{ fontSize: 11.5, color: c.faint, marginBottom: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session.user.email}</div>
            <button className="btnh" onClick={() => supabase.auth.signOut()} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "1px solid " + c.border, borderRadius: 8, padding: "6px 10px", fontSize: 12, color: c.sub, cursor: "pointer" }}>
              <LogOut size={13} /> Se déconnecter
            </button>
          </div>
        </aside>

        {/* Contenu */}
        <main style={{ flex: 1, padding: "28px 22px", maxWidth: 1060, width: "100%", margin: "0 auto" }}>
          <div key={view.name} className="fadeup">{body()}</div>
        </main>
      </div>
    </div>
  );
}
