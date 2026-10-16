"use strict";

/* ==========================================
   FINORA
   Storage keys keep the old PaisaTrack names
   so existing saved data still loads.
========================================== */

const STORAGE_KEY = "paisaTrackTransactions";
const BUDGET_KEY = "paisaTrackCategoryBudgets";
const GOAL_KEY = "paisaTrackSavingsGoal";
const LAST_ENTRY_KEY = "finoraLastEntry";
const RECURRING_KEY = "finoraRecurringRules";
const THEME_KEY = "finoraTheme";
const FREQUENCY_LABELS = { weekly: "Every week", monthly: "Every month", yearly: "Every year" };
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_KEY = "finoraCurrency";
const CURRENCIES = [
  "INR", "USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "CNY", "SGD",
  "AED", "SAR", "ZAR", "BRL", "MXN", "NZD", "SEK", "NOK", "KRW", "IDR",
  "PHP", "THB", "MYR", "PKR", "BDT", "LKR", "NPR", "NGN", "KES", "EGP", "TRY"
];
const REGION_CURRENCY = {
  IN: "INR", US: "USD", GB: "GBP", JP: "JPY", AU: "AUD", CA: "CAD", CH: "CHF",
  CN: "CNY", SG: "SGD", AE: "AED", SA: "SAR", ZA: "ZAR", BR: "BRL", MX: "MXN",
  NZ: "NZD", SE: "SEK", NO: "NOK", KR: "KRW", ID: "IDR", PH: "PHP", TH: "THB",
  MY: "MYR", PK: "PKR", BD: "BDT", LK: "LKR", NP: "NPR", NG: "NGN", KE: "KES",
  EG: "EGP", TR: "TRY"
};
const EURO_REGIONS = ["DE", "FR", "IT", "ES", "NL", "BE", "AT", "IE", "PT", "FI", "GR", "LU", "SK", "SI", "EE", "LV", "LT", "MT", "CY", "HR"];
const formatterCache = {};

// The person's own browser language drives number and date formats.
const LOCALE = (() => {
  try {
    const wanted = (navigator.languages && navigator.languages[0]) || navigator.language || "en-US";
    return Intl.NumberFormat.supportedLocalesOf(wanted).length ? wanted : "en-US";
  } catch {
    return "en-US";
  }
})();
const PAGE_SIZE = 10;

const $ = id => document.getElementById(id);

const expenseCategories = [
  "Food", "Transport", "Shopping", "Bills", "Rent",
  "Entertainment", "Health", "Education", "Travel", "Other"
];
const incomeCategories = [
  "Salary", "Freelance", "Business", "Investment", "Gift", "Other"
];
const pieColors = [
  "#8B7BFF", "#FF7058", "#5EF0C4", "#FFC15A",
  "#8BA6FF", "#C58BFF", "#FF9E7A", "#7BE08A",
  "#F5E1A4", "#FF6F9C", "#4FD1E8", "#B6C1A8"
];

/* ---------- Element references ---------- */
const transactionForm = $("transactionForm");
const transactionDate = $("transactionDate");
const amountInput = $("amount");
const categorySelect = $("category");
const customCategoryGroup = $("customCategoryGroup");
const customCategoryInput = $("customCategory");
const noteInput = $("note");
const cancelEditBtn = $("cancelEdit");
const transactionList = $("transactionList");
const monthSelector = $("monthSelector");
const periodSelect = $("periodSelect");
const searchInput = $("searchInput");
const typeFilter = $("typeFilter");
const categoryFilter = $("categoryFilter");
const showMoreBtn = $("showMoreBtn");
const pieMonthFilter = $("pieMonthFilter");
const expensePie = $("expensePieChart");
const duplicateWarning = $("duplicateWarning");

/* ---------- State ---------- */
let transactions = loadTransactions();
let editingId = null;
let visibleCount = PAGE_SIZE;
let selectedPieCategory = null;
let pieSegments = [];
let lastEntry = readObject(LAST_ENTRY_KEY);
let recurringRules = loadRecurring();
let currencyCode = loadCurrency();
let pendingDuplicateKey = null;
let submitLocked = false;

/* ==========================================
   Helpers
========================================== */
function makeId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function addMoney(a, b) {
  return round2(a + b);
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function isValidTransaction(item) {
  return item && typeof item === "object" &&
    Number.isFinite(Number(item.amount)) && Number(item.amount) > 0 &&
    (item.type === "income" || item.type === "expense") &&
    typeof item.date === "string";
}

function normalizeTransaction(item) {
  const category = String(item.category || item.description || "Other").trim() || "Other";
  return {
    ...item,
    id: item.id ? String(item.id) : makeId(),
    amount: round2(item.amount),
    category,
    description: category,
    note: typeof item.note === "string" ? item.note : ""
  };
}

function loadTransactions() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(saved)
      ? saved.filter(isValidTransaction).map(normalizeTransaction)
      : [];
  } catch (error) {
    console.error("Could not read saved transactions:", error);
    return [];
  }
}

function saveTransactions() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
    return true;
  } catch (error) {
    console.error("Could not save transactions:", error);
    toast("Could not save. Check your browser storage.", { type: "error" });
    return false;
  }
}

function readObject(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function saveObject(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error("Could not save setting:", error);
    toast("Could not save this setting. Check your browser storage.", { type: "error" });
    return false;
  }
}

function todayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function currentMonth() { return todayString().slice(0, 7); }
function monthOf(item) { return String(item.date || "").slice(0, 7); }
function categoryOf(item) { return String(item.category || item.description || "Other"); }

/* ---------- Currency and locale ---------- */
function regionCurrency() {
  try {
    const region = new Intl.Locale(LOCALE).maximize().region;
    if (REGION_CURRENCY[region]) return REGION_CURRENCY[region];
    if (EURO_REGIONS.includes(region)) return "EUR";
  } catch { /* fall through */ }
  return null;
}

function loadCurrency() {
  try {
    const saved = localStorage.getItem(CURRENCY_KEY);
    if (saved && CURRENCIES.includes(saved)) return saved;
  } catch { /* ignore */ }

  // Data saved before currencies existed was always in rupees, so keep that.
  const code = transactions.length || recurringRules.length ? "INR" : regionCurrency() || "USD";
  try { localStorage.setItem(CURRENCY_KEY, code); } catch { /* ignore */ }
  return code;
}

// Indian-style digit grouping (12,34,567) for rupees when the browser language is English.
function numberLocale() {
  return currencyCode === "INR" && LOCALE.toLowerCase().startsWith("en") ? "en-IN" : LOCALE;
}

function moneyFormatter(compact) {
  const key = `${currencyCode}|${numberLocale()}|${compact}`;
  if (!formatterCache[key]) {
    formatterCache[key] = new Intl.NumberFormat(numberLocale(), compact
      ? { style: "currency", currency: currencyCode, notation: "compact", maximumFractionDigits: 1 }
      : { style: "currency", currency: currencyCode });
  }
  return formatterCache[key];
}

function currencyDecimals() {
  return moneyFormatter(false).resolvedOptions().maximumFractionDigits;
}

function currencySymbol() {
  const part = moneyFormatter(false).formatToParts(0).find(item => item.type === "currency");
  return part ? part.value : currencyCode;
}

function currencyName(code) {
  try {
    return new Intl.DisplayNames([LOCALE], { type: "currency" }).of(code) || code;
  } catch {
    return code;
  }
}

function formatCurrency(value) {
  return moneyFormatter(false).format(Number(value) || 0);
}

function compactCurrency(value) {
  const amount = Number(value) || 0;
  return (Math.abs(amount) >= 10000 ? moneyFormatter(true) : moneyFormatter(false)).format(amount);
}

function formatDate(value) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(LOCALE, { day: "numeric", month: "short", year: "numeric" });
}

function sum(items, type) {
  return items
    .filter(item => item.type === type)
    .reduce((total, item) => addMoney(total, Number(item.amount || 0)), 0);
}

/* Expense totals per category, largest first: [[category, total], ...] */
function expenseEntries(items) {
  const totals = {};
  items.filter(item => item.type === "expense").forEach(item => {
    const category = categoryOf(item);
    totals[category] = addMoney(totals[category] || 0, Number(item.amount));
  });
  return Object.entries(totals).sort((a, b) => b[1] - a[1]);
}

function selectedMonth() {
  return monthSelector.value || currentMonth();
}

function selectedMonthTransactions() {
  const month = selectedMonth();
  return transactions.filter(item => monthOf(item) === month);
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* ==========================================
   Currency picker
========================================== */
function populateCurrencySelect() {
  const select = $("currencySelect");
  select.replaceChildren();
  CURRENCIES.forEach(code => {
    select.add(new Option(`${code} · ${currencyName(code)}`, code));
  });
  select.value = currencyCode;
}

function applyCurrencyUI() {
  const symbol = currencySymbol();
  const wholeUnits = currencyDecimals() === 0;

  document.querySelectorAll("[data-currency-code]").forEach(node => { node.textContent = currencyCode; });
  document.querySelectorAll("[data-currency-symbol]").forEach(node => { node.textContent = symbol; });
  document.documentElement.style.setProperty("--sym-len", String(Math.min(symbol.length, 4)));

  [amountInput, recAmount, $("budgetAmount"), $("goalAmount")].forEach(input => {
    input.step = wholeUnits ? "1" : "0.01";
    input.min = wholeUnits ? "1" : (input === amountInput || input === recAmount ? "0.01" : "1");
  });
  $("currencySelect").value = currencyCode;
}

$("currencySelect").addEventListener("change", event => {
  const code = event.target.value;
  if (!CURRENCIES.includes(code)) return;

  currencyCode = code;
  try { localStorage.setItem(CURRENCY_KEY, code); } catch { /* ignore */ }
  applyCurrencyUI();
  renderAll();
  toast(`Currency set to ${code}. Existing amounts are shown in ${code} but are not converted.`, { duration: 7000 });
});

/* ==========================================
   Theme (light / dark)
========================================== */
function currentTheme() {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function syncThemeToggle() {
  const dark = currentTheme() === "dark";
  const button = $("themeToggle");
  const label = dark ? "Switch to light mode" : "Switch to dark mode";
  button.setAttribute("aria-pressed", String(dark));
  button.setAttribute("aria-label", label);
  button.title = label;
  $("themeLabel").textContent = dark ? "Light" : "Dark";
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  syncThemeToggle();
}

$("themeToggle").addEventListener("click", () => {
  const next = currentTheme() === "dark" ? "light" : "dark";
  applyTheme(next);
  try { localStorage.setItem(THEME_KEY, next); } catch { /* theme just won't be remembered */ }
});

// Follow the operating system if the person never picked a theme themselves.
window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", event => {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "dark" || saved === "light") return;
  } catch { /* ignore */ }
  applyTheme(event.matches ? "dark" : "light");
});

/* ==========================================
   Duplicate-entry guard
========================================== */
function duplicateKeyFor(date, type, category, amount) {
  return [date, type, String(category).trim().toLowerCase(), round2(amount)].join("|");
}

function currentCategoryValue() {
  return categorySelect.value === "Other" ? customCategoryInput.value.trim() : categorySelect.value;
}

function refreshSubmitLabel() {
  $("submitLabel").textContent = pendingDuplicateKey
    ? "Save anyway"
    : editingId ? "Update transaction" : "Save transaction";
}

function showDuplicateWarning(match) {
  duplicateWarning.textContent =
    `This looks like a duplicate: ${categoryOf(match)} ${formatCurrency(match.amount)} on ${formatDate(match.date)} is already recorded. ` +
    "Press “Save anyway” if you really spent or earned it twice.";
  duplicateWarning.hidden = false;
  refreshSubmitLabel();
}

function clearDuplicateWarning() {
  pendingDuplicateKey = null;
  duplicateWarning.hidden = true;
  duplicateWarning.textContent = "";
  refreshSubmitLabel();
}

function lockSubmit() {
  // Stops a double-click or double-tap from saving the same entry twice.
  submitLocked = true;
  setTimeout(() => { submitLocked = false; }, 700);
}

[transactionDate, amountInput, categorySelect, customCategoryInput].forEach(control => {
  control.addEventListener("input", clearDuplicateWarning);
  control.addEventListener("change", clearDuplicateWarning);
});
document.querySelectorAll('input[name="transactionType"]').forEach(radio => {
  radio.addEventListener("change", clearDuplicateWarning);
});

/* ==========================================
   Recurring transactions
========================================== */
function parseISO(value) {
  const [y, m, d] = value.split("-").map(Number);
  return { y, m, d };
}

function toISO(y, m, d) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function daysInMonth(y, m) {
  return new Date(y, m, 0).getDate();
}

function addDaysISO(value, days) {
  const { y, m, d } = parseISO(value);
  const date = new Date(y, m - 1, d + days);
  return toISO(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function addMonthsISO(value, months, anchorDay) {
  const { y, m } = parseISO(value);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  // Keep the original day (e.g. the 31st) and clamp it in shorter months.
  return toISO(year, month, Math.min(anchorDay, daysInMonth(year, month)));
}

function nextOccurrence(rule, from) {
  if (rule.frequency === "weekly") return addDaysISO(from, 7);
  if (rule.frequency === "yearly") return addMonthsISO(from, 12, rule.anchorDay);
  return addMonthsISO(from, 1, rule.anchorDay);
}

function isValidRule(rule) {
  return Boolean(rule) && typeof rule === "object" &&
    Number(rule.amount) > 0 &&
    (rule.type === "income" || rule.type === "expense") &&
    Object.prototype.hasOwnProperty.call(FREQUENCY_LABELS, rule.frequency) &&
    ISO_DATE.test(String(rule.startDate || "")) &&
    ISO_DATE.test(String(rule.nextDue || ""));
}

function normalizeRule(rule) {
  const anchor = Number(rule.anchorDay);
  return {
    ...rule,
    id: rule.id ? String(rule.id) : makeId(),
    amount: round2(rule.amount),
    category: String(rule.category || "Other").trim() || "Other",
    note: typeof rule.note === "string" ? rule.note : "",
    endDate: ISO_DATE.test(String(rule.endDate || "")) ? rule.endDate : "",
    anchorDay: anchor >= 1 && anchor <= 31 ? anchor : Number(String(rule.startDate).slice(8, 10)),
    active: rule.active !== false
  };
}

function loadRecurring() {
  try {
    const saved = JSON.parse(localStorage.getItem(RECURRING_KEY) || "[]");
    return Array.isArray(saved) ? saved.filter(isValidRule).map(normalizeRule) : [];
  } catch (error) {
    console.error("Could not read recurring rules:", error);
    return [];
  }
}

function saveRecurring() {
  return saveObject(RECURRING_KEY, recurringRules);
}

function ruleStatus(rule) {
  if (!rule.active) return "Paused";
  if (rule.endDate && rule.nextDue > rule.endDate) return "Ended";
  return "Active";
}

function monthlyEquivalent(rule) {
  if (rule.frequency === "weekly") return rule.amount * 52 / 12;
  if (rule.frequency === "yearly") return rule.amount / 12;
  return rule.amount;
}

/* Pure function: which transactions are due, and the rules advanced past them. */
function generateDue(rules, existing, today) {
  const seen = new Set(existing.filter(item => item.recurringId).map(item => `${item.recurringId}|${item.date}`));
  const created = [];

  const updated = rules.map(rule => {
    if (!rule.active) return rule;

    let next = rule.nextDue;
    let lastGenerated = rule.lastGenerated;
    let guard = 0;

    while (next <= today && (!rule.endDate || next <= rule.endDate) && guard < 240) {
      const key = `${rule.id}|${next}`;
      if (!seen.has(key)) {
        seen.add(key);
        created.push({
          id: makeId(),
          date: next,
          amount: rule.amount,
          type: rule.type,
          category: rule.category,
          description: rule.category,
          note: rule.note,
          recurringId: rule.id,
          createdAt: new Date().toISOString()
        });
      }
      lastGenerated = next;
      next = nextOccurrence(rule, next);
      guard++;
    }
    return { ...rule, nextDue: next, lastGenerated };
  });

  return { rules: updated, created };
}

/* Adds anything that has come due. Safe to call repeatedly. */
function processRecurring({ announce = true } = {}) {
  const { rules, created } = generateDue(recurringRules, transactions, todayString());
  const changed = created.length > 0 || JSON.stringify(rules) !== JSON.stringify(recurringRules);
  if (!changed) return 0;

  const previousTransactions = transactions;
  const previousRules = recurringRules;
  transactions = [...transactions, ...created];
  recurringRules = rules;

  if (!saveTransactions() || !saveRecurring()) {
    transactions = previousTransactions;
    recurringRules = previousRules;
    return 0;
  }

  if (created.length && announce) {
    toast(`Added ${created.length} recurring transaction${created.length === 1 ? "" : "s"}.`);
  }
  return created.length;
}

const recForm = $("recurringForm");
const recType = $("recType");
const recCategory = $("recCategory");
const recCustomGroup = $("recCustomGroup");
const recCustom = $("recCustom");
const recAmount = $("recAmount");
const recFrequency = $("recFrequency");
const recStart = $("recStart");
const recEnd = $("recEnd");
const recNote = $("recNote");
const recError = $("recError");
let pendingRecurringKey = null;

function setRecError(message) {
  recError.textContent = message || "";
  recError.hidden = !message;
}

function resetRecurringPending() {
  pendingRecurringKey = null;
  setRecError("");
  $("recSubmitLabel").textContent = "Add recurring transaction";
}

function updateRecCategoryOptions() {
  const categories = recType.value === "income" ? incomeCategories : expenseCategories;
  recCategory.replaceChildren(new Option("Choose a category", ""));
  categories.forEach(category => recCategory.add(new Option(category, category)));
  recCustomGroup.hidden = true;
  recCustom.value = "";
}

recType.addEventListener("change", updateRecCategoryOptions);
recCategory.addEventListener("change", () => {
  const needsCustom = recCategory.value === "Other";
  recCustomGroup.hidden = !needsCustom;
  if (!needsCustom) recCustom.value = "";
  else recCustom.focus();
});
recForm.addEventListener("input", resetRecurringPending);
recForm.addEventListener("change", resetRecurringPending);

function failRecurring(message, field) {
  setRecError(message);
  field.focus();
}

recForm.addEventListener("submit", event => {
  event.preventDefault();

  const amount = Number(recAmount.value);
  const category = recCategory.value === "Other" ? recCustom.value.trim() : recCategory.value;

  if (!recCategory.value) return failRecurring("Pick a category.", recCategory);
  if (!category) return failRecurring("Type a name for this category.", recCustom);
  if (!recAmount.value || !Number.isFinite(amount) || amount <= 0) return failRecurring("Enter an amount greater than zero.", recAmount);
  if (amount > 1000000000) return failRecurring("That amount is too large.", recAmount);
  if (!recStart.value) return failRecurring("Choose the first date.", recStart);
  if (recEnd.value && recEnd.value < recStart.value) return failRecurring("The end date can't be before the first date.", recEnd);

  const key = [recType.value, category.toLowerCase(), round2(amount), recFrequency.value].join("|");
  const similar = recurringRules.some(rule =>
    [rule.type, rule.category.toLowerCase(), rule.amount, rule.frequency].join("|") === key
  );

  if (similar && pendingRecurringKey !== key) {
    pendingRecurringKey = key;
    setRecError("A similar recurring rule already exists. Press “Add anyway” if you want a second one.");
    $("recSubmitLabel").textContent = "Add anyway";
    return;
  }

  const rule = {
    id: makeId(),
    type: recType.value,
    category,
    amount: round2(amount),
    note: recNote.value.trim(),
    frequency: recFrequency.value,
    startDate: recStart.value,
    endDate: recEnd.value || "",
    anchorDay: parseISO(recStart.value).d,
    nextDue: recStart.value,
    active: true,
    createdAt: new Date().toISOString()
  };

  const previousRules = recurringRules;
  recurringRules = [...recurringRules, rule];
  if (!saveRecurring()) {
    recurringRules = previousRules;
    return;
  }

  const added = processRecurring({ announce: false });
  recAmount.value = "";
  recNote.value = "";
  recEnd.value = "";
  recStart.value = todayString();
  resetRecurringPending();
  renderAll();

  toast(
    added
      ? `Recurring ${rule.type} saved. ${added} entr${added === 1 ? "y" : "ies"} added to your transactions.`
      : `Recurring ${rule.type} saved. Next one is due ${formatDate(rule.nextDue)}.`
  );
});

function toggleRule(id) {
  const rule = recurringRules.find(item => item.id === id);
  if (!rule) return;

  let updated;
  if (rule.active) {
    updated = { ...rule, active: false };
  } else {
    // Resuming skips the dates missed while paused instead of back-filling them.
    let next = rule.nextDue;
    const today = todayString();
    let guard = 0;
    while (next < today && guard < 2000) {
      next = nextOccurrence(rule, next);
      guard++;
    }
    updated = { ...rule, active: true, nextDue: next };
  }

  const previous = recurringRules;
  recurringRules = recurringRules.map(item => (item.id === id ? updated : item));
  if (!saveRecurring()) {
    recurringRules = previous;
    return;
  }

  if (updated.active && processRecurring()) renderAll();
  renderRecurring();
  toast(updated.active ? `Resumed. Next due ${formatDate(updated.nextDue)}.` : "Rule paused.");
}

function deleteRule(id) {
  const index = recurringRules.findIndex(item => item.id === id);
  if (index < 0) return;

  const removed = recurringRules[index];
  const previous = recurringRules;
  recurringRules = recurringRules.filter(item => item.id !== id);
  if (!saveRecurring()) {
    recurringRules = previous;
    return;
  }

  renderRecurring();
  toast(`${removed.category} rule deleted. Past entries were kept.`, {
    actionLabel: "Undo",
    duration: 6500,
    onAction() {
      const before = recurringRules;
      const restored = [...recurringRules];
      restored.splice(Math.min(index, restored.length), 0, removed);
      recurringRules = restored;
      if (!saveRecurring()) {
        recurringRules = before;
        return;
      }
      renderRecurring();
    }
  });
}

function renderRecurring() {
  const summary = $("recurringSummary");
  const list = $("recurringList");
  summary.replaceChildren();
  list.replaceChildren();

  const active = recurringRules.filter(rule => ruleStatus(rule) === "Active");
  const income = round2(active.filter(rule => rule.type === "income").reduce((acc, rule) => acc + monthlyEquivalent(rule), 0));
  const expenses = round2(active.filter(rule => rule.type === "expense").reduce((acc, rule) => acc + monthlyEquivalent(rule), 0));

  [
    { label: "RECURRING INCOME", value: income, cls: "income-card", note: "Per month, estimated" },
    { label: "RECURRING EXPENSES", value: expenses, cls: "expense-card", note: "Per month, estimated" },
    { label: "NET PER MONTH", value: round2(income - expenses), cls: "balance-card", note: "Income minus expenses" }
  ].forEach(card => {
    const article = makeElement("article", `summary-card ${card.cls}`);
    article.append(
      makeElement("span", "stat-label", card.label),
      makeElement("strong", "", formatCurrency(card.value)),
      makeElement("small", "", card.note)
    );
    summary.appendChild(article);
  });

  $("recurringCount").textContent = `${recurringRules.length} rule${recurringRules.length === 1 ? "" : "s"}`;

  if (!recurringRules.length) {
    const empty = makeElement("div", "empty-state");
    empty.appendChild(makeElement("p", "", "No recurring rules yet. Add rent, salary or a subscription and Finora will record it for you."));
    list.appendChild(empty);
    return;
  }

  [...recurringRules]
    .sort((a, b) => a.nextDue.localeCompare(b.nextDue))
    .forEach(rule => {
      const status = ruleStatus(rule);
      const row = makeElement("div", `transaction-row${status === "Active" ? "" : " inactive"}`);

      const icon = makeElement("div", `transaction-icon ${rule.type}`, "↻");
      icon.setAttribute("aria-hidden", "true");

      const info = makeElement("div", "transaction-info");
      const title = makeElement("strong", "", `${rule.category} · ${FREQUENCY_LABELS[rule.frequency]}`);
      if (status !== "Active") title.appendChild(makeElement("span", `rule-badge ${status.toLowerCase()}`, status));

      const when = status === "Active"
        ? `Next due ${formatDate(rule.nextDue)}`
        : status === "Ended" ? `Ended ${formatDate(rule.endDate)}` : "Not recording while paused";
      const details = [when, rule.endDate && status === "Active" ? `until ${formatDate(rule.endDate)}` : "", rule.note]
        .filter(Boolean).join(" · ");
      info.append(title, makeElement("small", "", details));

      const right = makeElement("div", "transaction-right");
      right.appendChild(makeElement(
        "strong", rule.type,
        `${rule.type === "income" ? "+" : "−"}${formatCurrency(rule.amount)}`
      ));

      const actions = makeElement("div", "row-actions");
      if (status !== "Ended") {
        const toggle = makeElement("button", "edit-btn", rule.active ? "Pause" : "Resume");
        toggle.type = "button";
        toggle.setAttribute("aria-label", `${rule.active ? "Pause" : "Resume"} ${rule.category} recurring rule`);
        toggle.addEventListener("click", () => toggleRule(rule.id));
        actions.appendChild(toggle);
      }
      const remove = makeElement("button", "delete-btn", "Delete");
      remove.type = "button";
      remove.setAttribute("aria-label", `Delete ${rule.category} recurring rule`);
      remove.addEventListener("click", () => deleteRule(rule.id));
      actions.appendChild(remove);

      right.appendChild(actions);
      row.append(icon, info, right);
      list.appendChild(row);
    });
}

recStart.value = todayString();
updateRecCategoryOptions();

// Pick up anything that came due while the tab was in the background.
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && processRecurring()) renderAll();
});

/* ==========================================
   Toasts (replace alert / confirm)
========================================== */
function toast(message, options = {}) {
  const region = $("toastRegion");
  const element = makeElement("div", `toast${options.type === "error" ? " error" : ""}`);
  element.appendChild(makeElement("span", "toast-message", message));

  let timer;
  const close = () => {
    clearTimeout(timer);
    element.classList.add("leaving");
    setTimeout(() => element.remove(), 200);
  };

  if (options.actionLabel && options.onAction) {
    const action = makeElement("button", "toast-action", options.actionLabel);
    action.type = "button";
    action.addEventListener("click", () => {
      options.onAction();
      close();
    });
    element.appendChild(action);
  }

  region.appendChild(element);
  while (region.children.length > 3) region.firstElementChild.remove();
  timer = setTimeout(close, options.duration ?? 4500);
}

/* ==========================================
   Navigation
========================================== */
function setView(view) {
  ["dashboard", "recurring", "analytics"].forEach(name => {
    $(`${name}View`).hidden = view !== name;
  });

  document.querySelectorAll(".side-link[data-view]").forEach(link => {
    const active = link.dataset.view === view;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });

  if (view === "analytics") renderAnalytics();
  if (view === "recurring") {
    if (processRecurring()) renderAll();
    renderRecurring();
  }
  window.scrollTo({ top: 0 });
}

// Clicking the logo (sidebar) or the brand name (header) always returns to the dashboard.
document.querySelectorAll(".logo, .brand").forEach(link => {
  link.addEventListener("click", event => {
    event.preventDefault();
    setView("dashboard");
  });
});

document.querySelectorAll(".side-link[data-view]").forEach(button => {
  button.addEventListener("click", () => setView(button.dataset.view));
});

/* ==========================================
   Transaction form
========================================== */
function selectedType() {
  return document.querySelector('input[name="transactionType"]:checked')?.value;
}

function setError(inputId, errorId, message) {
  const error = $(errorId);
  const input = $(inputId);
  error.textContent = message || "";
  error.hidden = !message;
  if (message) input.setAttribute("aria-invalid", "true");
  else input.removeAttribute("aria-invalid");
}

function clearErrors() {
  setError("transactionDate", "dateError");
  setError("amount", "amountError");
  setError("category", "categoryError");
  setError("customCategory", "customCategoryError");
}

function syncCustomCategory() {
  const needsCustom = categorySelect.value === "Other";
  customCategoryGroup.hidden = !needsCustom;
  if (!needsCustom) customCategoryInput.value = "";
}

function updateCategoryOptions(preferred = "") {
  const type = selectedType() || "expense";
  const categories = type === "income" ? incomeCategories : expenseCategories;

  categorySelect.replaceChildren(new Option("Choose a category", ""));
  categories.forEach(category => categorySelect.add(new Option(category, category)));

  if (preferred && categories.includes(preferred)) categorySelect.value = preferred;
  syncCustomCategory();
}

function rememberEntry(type, categoryValue) {
  lastEntry = {
    type,
    categories: { ...(lastEntry.categories || {}), [type]: categoryValue }
  };
  saveObject(LAST_ENTRY_KEY, lastEntry);
}

function validateForm() {
  clearErrors();
  let firstInvalid = null;
  const fail = (inputId, errorId, message) => {
    setError(inputId, errorId, message);
    if (!firstInvalid) firstInvalid = $(inputId);
  };

  if (!transactionDate.value) fail("transactionDate", "dateError", "Choose a date.");

  const amount = Number(amountInput.value);
  if (!amountInput.value || !Number.isFinite(amount) || amount <= 0) {
    fail("amount", "amountError", "Enter an amount greater than zero.");
  } else if (amount > 1000000000) {
    fail("amount", "amountError", "That amount is too large.");
  }

  if (!categorySelect.value) {
    fail("category", "categoryError", "Pick a category.");
  } else if (categorySelect.value === "Other" && !customCategoryInput.value.trim()) {
    fail("customCategory", "customCategoryError", "Type a name for this category.");
  }

  if (firstInvalid) firstInvalid.focus();
  return !firstInvalid;
}

[transactionDate, amountInput, categorySelect, customCategoryInput].forEach(input => {
  const map = {
    transactionDate: "dateError", amount: "amountError",
    category: "categoryError", customCategory: "customCategoryError"
  };
  input.addEventListener("input", () => setError(input.id, map[input.id]));
});

document.querySelectorAll('input[name="transactionType"]').forEach(radio => {
  radio.addEventListener("change", () => {
    updateCategoryOptions(lastEntry.categories?.[selectedType()]);
    setError("category", "categoryError");
  });
});

categorySelect.addEventListener("change", () => {
  syncCustomCategory();
  if (!customCategoryGroup.hidden) customCategoryInput.focus();
});

function setEditUI(editing) {
  $("formEyebrow").textContent = editing ? "EDIT TRANSACTION" : "NEW TRANSACTION";
  refreshSubmitLabel();
  cancelEditBtn.hidden = !editing;
  $("entryPanel").classList.toggle("editing", editing);
}

function exitEditMode({ restoreDefaults = true } = {}) {
  editingId = null;
  setEditUI(false);
  clearErrors();
  amountInput.value = "";
  noteInput.value = "";
  customCategoryInput.value = "";

  if (restoreDefaults) {
    transactionDate.value = todayString();
    const type = lastEntry.type === "income" ? "income" : "expense";
    document.querySelector(`input[name="transactionType"][value="${type}"]`).checked = true;
    updateCategoryOptions(lastEntry.categories?.[type]);
  }
}

function startEdit(id) {
  const item = transactions.find(entry => entry.id === id);
  if (!item) return;

  editingId = id;
  clearErrors();
  document.querySelector(`input[name="transactionType"][value="${item.type}"]`).checked = true;
  updateCategoryOptions();

  const categories = item.type === "income" ? incomeCategories : expenseCategories;
  const known = categories.includes(item.category) && item.category !== "Other";

  if (known) {
    categorySelect.value = item.category;
  } else {
    categorySelect.value = "Other";
    syncCustomCategory();
    customCategoryInput.value = item.category;
  }

  transactionDate.value = item.date;
  amountInput.value = item.amount;
  noteInput.value = item.note || "";

  setEditUI(true);
  renderDashboard();
  transactionForm.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
  amountInput.focus({ preventScroll: true });
}

cancelEditBtn.addEventListener("click", () => {
  exitEditMode();
  renderDashboard();
});

transactionForm.addEventListener("keydown", event => {
  if (event.key === "Escape" && editingId) {
    exitEditMode();
    renderDashboard();
  }
});

transactionForm.addEventListener("submit", event => {
  event.preventDefault();
  if (!validateForm()) return;
  if (submitLocked) return;

  if (!editingId) {
    const key = duplicateKeyFor(transactionDate.value, selectedType(), currentCategoryValue(), amountInput.value);
    const match = transactions.find(item =>
      duplicateKeyFor(item.date, item.type, categoryOf(item), item.amount) === key
    );
    if (match && pendingDuplicateKey !== key) {
      pendingDuplicateKey = key;
      showDuplicateWarning(match);
      return;
    }
  }

  const type = selectedType();
  const selectValue = categorySelect.value;
  const category = selectValue === "Other" ? customCategoryInput.value.trim() : selectValue;

  const payload = {
    date: transactionDate.value,
    amount: round2(amountInput.value),
    type,
    category,
    description: category,
    note: noteInput.value.trim()
  };

  const previous = transactions;
  const wasEditing = Boolean(editingId);

  if (wasEditing) {
    transactions = transactions.map(item =>
      item.id === editingId
        ? { ...item, ...payload, updatedAt: new Date().toISOString() }
        : item
    );
  } else {
    transactions = [...transactions, { id: makeId(), ...payload, createdAt: new Date().toISOString() }];
  }

  if (!saveTransactions()) {
    transactions = previous;
    return;
  }

  rememberEntry(type, selectValue);
  clearDuplicateWarning();
  lockSubmit();

  if (wasEditing) {
    exitEditMode();
  } else {
    // Keep the date, type and category so several entries are quick to add.
    amountInput.value = "";
    noteInput.value = "";
    customCategoryInput.value = "";
    clearErrors();
  }

  renderAll();
  toast(
    wasEditing
      ? "Transaction updated."
      : `${type === "income" ? "Income" : "Expense"} of ${formatCurrency(payload.amount)} saved.`
  );
  amountInput.focus();
});

/* ==========================================
   Delete with undo
========================================== */
function deleteTransaction(id) {
  const index = transactions.findIndex(item => item.id === id);
  if (index < 0) return;

  const removed = transactions[index];
  const previous = transactions;
  transactions = transactions.filter(item => item.id !== id);

  if (!saveTransactions()) {
    transactions = previous;
    return;
  }

  if (editingId === id) exitEditMode();
  renderAll();

  toast(`${categoryOf(removed)} transaction deleted.`, {
    actionLabel: "Undo",
    duration: 6500,
    onAction() {
      const before = transactions;
      const restored = [...transactions];
      restored.splice(Math.min(index, restored.length), 0, removed);
      transactions = restored;
      if (!saveTransactions()) {
        transactions = before;
        return;
      }
      renderAll();
      toast("Transaction restored.");
    }
  });
}

/* ==========================================
   Dashboard
========================================== */
function filteredTransactions() {
  const query = searchInput.value.trim().toLowerCase();

  return [...transactions]
    .sort((a, b) =>
      b.date.localeCompare(a.date) ||
      String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
    )
    .filter(item => {
      if (typeFilter.value !== "all" && item.type !== typeFilter.value) return false;
      if (rangeFilter.from && item.date < rangeFilter.from) return false;
      if (rangeFilter.to && item.date > rangeFilter.to) return false;
      if (categoryFilter.value !== "all" && categoryOf(item) !== categoryFilter.value) return false;
      if (!query) return true;
      return [categoryOf(item), item.note || "", String(item.amount), formatDate(item.date)]
        .some(text => text.toLowerCase().includes(query));
    });
}

function renderFilterCategories() {
  const previous = categoryFilter.value;
  const categories = [...new Set(transactions.map(categoryOf))].sort((a, b) => a.localeCompare(b));

  categoryFilter.replaceChildren(new Option("All categories", "all"));
  categories.forEach(category => categoryFilter.add(new Option(category, category)));
  categoryFilter.value = categories.includes(previous) ? previous : "all";
}

function resetFilters() {
  rangeFilter = { from: "", to: "", label: "" };
  searchInput.value = "";
  typeFilter.value = "all";
  categoryFilter.value = "all";
  visibleCount = PAGE_SIZE;
  renderDashboard();
}

function renderSummary() {
  const monthOnly = periodSelect.value === "month";
  const base = monthOnly
    ? transactions.filter(item => monthOf(item) === currentMonth())
    : transactions;

  const income = sum(base, "income");
  const expenses = sum(base, "expense");

  $("totalIncome").textContent = formatCurrency(income);
  $("totalExpenses").textContent = formatCurrency(expenses);
  $("totalBalance").textContent = formatCurrency(round2(income - expenses));
  document.querySelectorAll(".period-label").forEach(label => {
    label.textContent = monthOnly ? "This month" : "All time";
  });
}

function renderDashboard() {
  renderSummary();
  renderFilterCategories();
  renderRangeChip();

  const filtered = filteredTransactions();
  const total = transactions.length;

  $("transactionCount").textContent = filtered.length === total
    ? `${total} item${total === 1 ? "" : "s"}`
    : `${filtered.length} of ${total} items`;

  transactionList.replaceChildren();
  showMoreBtn.hidden = true;

  if (!total) {
    const empty = makeElement("div", "empty-state");
    empty.appendChild(makeElement("p", "", "No transactions yet. Add your first income or expense to get started."));
    const start = makeElement("button", "secondary-btn", "Add your first transaction");
    start.type = "button";
    start.addEventListener("click", () => amountInput.focus());
    empty.appendChild(start);
    transactionList.appendChild(empty);
    return;
  }

  if (!filtered.length) {
    const empty = makeElement("div", "empty-state");
    empty.appendChild(makeElement("p", "", "No transactions match your filters."));
    const clear = makeElement("button", "secondary-btn", "Clear filters");
    clear.type = "button";
    clear.addEventListener("click", resetFilters);
    empty.appendChild(clear);
    transactionList.appendChild(empty);
    return;
  }

  filtered.slice(0, visibleCount).forEach(item => {
    const row = makeElement("div", `transaction-row${item.id === editingId ? " editing" : ""}`);
    const icon = makeElement("div", `transaction-icon ${item.type}`, item.type === "income" ? "↗" : "↘");
    icon.setAttribute("aria-hidden", "true");

    const info = makeElement("div", "transaction-info");
    const meta = [formatDate(item.date), item.recurringId ? "↻ Recurring" : "", item.note].filter(Boolean).join(" · ");
    info.append(makeElement("strong", "", categoryOf(item)), makeElement("small", "", meta));

    const right = makeElement("div", "transaction-right");
    const value = makeElement(
      "strong", item.type,
      `${item.type === "income" ? "+" : "−"}${formatCurrency(Number(item.amount))}`
    );

    const actions = makeElement("div", "row-actions");

    const edit = makeElement("button", "edit-btn", "Edit");
    edit.type = "button";
    edit.setAttribute("aria-label", `Edit ${categoryOf(item)} transaction from ${formatDate(item.date)}`);
    edit.addEventListener("click", () => startEdit(item.id));

    const remove = makeElement("button", "delete-btn", "Delete");
    remove.type = "button";
    remove.setAttribute("aria-label", `Delete ${categoryOf(item)} transaction from ${formatDate(item.date)}`);
    remove.addEventListener("click", () => deleteTransaction(item.id));

    actions.append(edit, remove);
    right.append(value, actions);
    row.append(icon, info, right);
    transactionList.appendChild(row);
  });

  const remaining = filtered.length - visibleCount;
  if (remaining > 0) {
    showMoreBtn.hidden = false;
    showMoreBtn.textContent = `Show more (${remaining} left)`;
  }
}

showMoreBtn.addEventListener("click", () => {
  visibleCount += PAGE_SIZE;
  renderDashboard();
});

[searchInput, typeFilter, categoryFilter].forEach(control => {
  control.addEventListener("input", () => {
    visibleCount = PAGE_SIZE;
    renderDashboard();
  });
});

periodSelect.addEventListener("change", renderSummary);

/* ==========================================
   Export / import
========================================== */
function download(filename, text, mime) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(value) {
  let text = String(value ?? "");
  // Stop spreadsheet apps from running text as a formula.
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

$("exportCsvBtn").addEventListener("click", () => {
  if (!transactions.length) {
    toast("Nothing to export yet.");
    return;
  }
  const rows = [["Date", "Type", "Category", "Amount", "Currency", "Note"]];
  [...transactions]
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach(item => rows.push([item.date, item.type, categoryOf(item), item.amount, currencyCode, item.note || ""]));

  download(`finora-transactions-${todayString()}.csv`, rows.map(row => row.map(csvCell).join(",")).join("\n"), "text/csv;charset=utf-8");
  toast("CSV exported.");
});

$("exportJsonBtn").addEventListener("click", () => {
  const backup = {
    app: "Finora",
    exportedAt: new Date().toISOString(),
    currency: currencyCode,
    transactions,
    budgets: readObject(BUDGET_KEY),
    goal: readObject(GOAL_KEY),
    recurring: recurringRules
  };
  download(`finora-backup-${todayString()}.json`, JSON.stringify(backup, null, 2), "application/json");
  toast("Backup saved to your downloads.");
});

$("importBtn").addEventListener("click", () => $("importInput").click());

$("importInput").addEventListener("change", async event => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;

  try {
    const data = JSON.parse(await file.text());
    const incoming = Array.isArray(data) ? data : data.transactions;
    if (!Array.isArray(incoming)) throw new Error("No transactions found in this file.");

    const existingIds = new Set(transactions.map(item => item.id));
    const fresh = incoming
      .filter(isValidTransaction)
      .map(normalizeTransaction)
      .filter(item => !existingIds.has(item.id));

    const previous = transactions;
    transactions = [...transactions, ...fresh];
    if (!saveTransactions()) {
      transactions = previous;
      return;
    }

    if (!Array.isArray(data) && data.budgets && typeof data.budgets === "object") {
      const budgets = readObject(BUDGET_KEY);
      Object.entries(data.budgets).forEach(([category, value]) => {
        if (Number(value) > 0 && !(category in budgets)) budgets[category] = Number(value);
      });
      saveObject(BUDGET_KEY, budgets);
    }

    if (!Array.isArray(data) && data.goal?.name && Number(data.goal.target) > 0 && !readObject(GOAL_KEY).name) {
      saveObject(GOAL_KEY, { name: String(data.goal.name), target: Number(data.goal.target) });
    }

    if (!Array.isArray(data) && Array.isArray(data.recurring)) {
      const knownRules = new Set(recurringRules.map(rule => rule.id));
      const freshRules = data.recurring.filter(isValidRule).map(normalizeRule).filter(rule => !knownRules.has(rule.id));
      if (freshRules.length) {
        recurringRules = [...recurringRules, ...freshRules];
        saveRecurring();
      }
    }

    const backupCurrency = Array.isArray(data) ? "" : String(data.currency || "");
    const currencyNote = backupCurrency && backupCurrency !== currencyCode
      ? ` Note: this backup was in ${backupCurrency}; amounts were not converted.`
      : "";

    renderAll();
    toast(fresh.length
      ? `Restored ${fresh.length} transaction${fresh.length === 1 ? "" : "s"}.${currencyNote}`
      : `Nothing new to restore. Everything in that file is already here.${currencyNote}`,
      { duration: currencyNote ? 8000 : 4500 });
  } catch (error) {
    console.error("Import failed:", error);
    toast("That file couldn't be read. Choose a Finora backup (.json).", { type: "error" });
  }
});

/* ==========================================
   Month selector
========================================== */
function renderMonthOptions() {
  const previous = monthSelector.value;
  const months = new Set([currentMonth()]);

  transactions.forEach(item => {
    if (/^\d{4}-\d{2}$/.test(monthOf(item))) months.add(monthOf(item));
  });

  const sorted = [...months].sort((a, b) => b.localeCompare(a));
  monthSelector.replaceChildren();

  sorted.forEach(key => {
    const [year, month] = key.split("-").map(Number);
    const label = new Date(year, month - 1, 1).toLocaleDateString(LOCALE, { month: "long", year: "numeric" });
    monthSelector.add(new Option(label, key));
  });

  monthSelector.value = sorted.includes(previous) ? previous : currentMonth();
}

monthSelector.addEventListener("change", renderAnalytics);

/* ==========================================
   Analytics
========================================== */
const SVG_NS = "http://www.w3.org/2000/svg";
let rangeFilter = { from: "", to: "", label: "" };
let trendView = "cards";
try {
  const savedTrend = localStorage.getItem("finoraTrendView");
  if (savedTrend === "cards" || savedTrend === "chart") trendView = savedTrend;
} catch { /* ignore */ }

const pieTypeFilter = $("pieTypeFilter");
const pieFrom = $("pieFrom");
const pieTo = $("pieTo");

function renderAll() {
  renderMonthOptions();
  renderDashboard();
  if (!$("analyticsView").hidden) renderAnalytics();
  if (!$("recurringView").hidden) renderRecurring();
}

/* ---------- Small helpers ---------- */
function svgEl(tag, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
  if (text !== undefined) node.textContent = text;
  return node;
}

function monthKeyOffset(key, delta) {
  const { y, m } = parseISO(`${key}-01`);
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

function monthName(key, short = false) {
  const { y, m } = parseISO(`${key}-01`);
  return new Date(y, m - 1, 1).toLocaleDateString(LOCALE, short ? { month: "short" } : { month: "long", year: "numeric" });
}

function monthTransactions(key) {
  return transactions.filter(item => monthOf(item) === key);
}

/* Totals per category for one type, largest first: [[category, total], ...] */
function categoryEntries(items, type) {
  const totals = {};
  items.filter(item => item.type === type).forEach(item => {
    const category = categoryOf(item);
    totals[category] = addMoney(totals[category] || 0, Number(item.amount));
  });
  return Object.entries(totals).sort((a, b) => b[1] - a[1]);
}

// Short axis labels with no decimals, e.g. ₹1.2K
function axisMoney(value) {
  const key = `axis|${currencyCode}|${numberLocale()}`;
  if (!formatterCache[key]) {
    formatterCache[key] = new Intl.NumberFormat(numberLocale(), {
      style: "currency", currency: currencyCode, notation: "compact",
      minimumFractionDigits: 0, maximumFractionDigits: 1
    });
  }
  return formatterCache[key].format(value);
}

function averageMonthlyNet() {
  const nets = [];
  for (let back = 0; back < 6; back++) {
    const items = monthTransactions(monthKeyOffset(currentMonth(), -back));
    if (items.length) nets.push(round2(sum(items, "income") - sum(items, "expense")));
  }
  return nets.length ? round2(nets.reduce((a, b) => a + b, 0) / nets.length) : 0;
}

function topWeekday(items) {
  const totals = Array(7).fill(0);
  items.filter(item => item.type === "expense").forEach(item => {
    const day = new Date(`${item.date}T00:00:00`).getDay();
    if (!Number.isNaN(day)) totals[day] = addMoney(totals[day], Number(item.amount));
  });
  const best = Math.max(...totals);
  if (best <= 0) return null;
  const index = totals.indexOf(best);
  // 1 Jan 2023 was a Sunday, so index maps straight onto the weekday.
  return {
    name: new Date(2023, 0, 1 + index).toLocaleDateString(LOCALE, { weekday: "long" }),
    total: best
  };
}

/* ---------- Jump from a chart to the matching transactions ---------- */
function openTransactions({ type = "all", category = "all", from = "", to = "", label = "" } = {}) {
  searchInput.value = "";
  typeFilter.value = type;
  rangeFilter = { from, to, label };
  visibleCount = PAGE_SIZE;

  renderFilterCategories();
  categoryFilter.value = [...categoryFilter.options].some(option => option.value === category) ? category : "all";

  setView("dashboard");
  renderDashboard();
  transactionList.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
}

function renderRangeChip() {
  const row = $("rangeChipRow");
  row.replaceChildren();

  const active = Boolean(rangeFilter.from || rangeFilter.to);
  row.hidden = !active;
  if (!active) return;

  const chip = makeElement("span", "range-chip");
  chip.appendChild(makeElement("span", "", `Date: ${rangeFilter.label || "custom range"}`));

  const remove = makeElement("button", "range-chip-x", "✕");
  remove.type = "button";
  remove.setAttribute("aria-label", "Remove date filter");
  remove.addEventListener("click", () => {
    rangeFilter = { from: "", to: "", label: "" };
    visibleCount = PAGE_SIZE;
    renderDashboard();
  });

  chip.appendChild(remove);
  row.appendChild(chip);
}

/* ---------- Main analytics render ---------- */
function renderAnalytics() {
  const selected = selectedMonth();
  const monthly = selectedMonthTransactions();
  const income = sum(monthly, "income");
  const expenses = sum(monthly, "expense");
  const net = round2(income - expenses);

  $("analyticsEmpty").hidden = transactions.length > 0;
  $("printHeader").textContent = `Finora report · ${monthName(selected)}`;

  $("monthlyIncome").textContent = formatCurrency(income);
  $("monthlyExpenses").textContent = formatCurrency(expenses);
  $("monthlyNet").textContent = formatCurrency(net);
  $("savingsRate").textContent = income > 0 ? `${((net / income) * 100).toFixed(1)}%` : "—";
  $("savingsHint").textContent = income === 0
    ? "Add income to calculate"
    : net < 0 ? "Expenses exceed income" : "Income after expenses";

  renderMetricComparison(selected, income, expenses, net);
  renderComparison(income, expenses);
  renderDaily(selected, monthly);
  renderSixMonthTrend(selected);
  renderPie();
  renderCategoryChanges(selected, monthly);
  populateBudgetCategories();
  renderBudgets(monthly);
  renderGoal();
  renderInsights(selected, monthly);
}

/* ---------- 1. Compare with last month ---------- */
function changeText(current, previous, hasPrevious, prevLabel, higherIsBetter, asAmount) {
  if (!hasPrevious) return { text: `No data for ${prevLabel}`, tone: "flat" };

  const diff = round2(current - previous);
  if (diff === 0) return { text: `Same as ${prevLabel}`, tone: "flat" };

  const up = diff > 0;
  const size = asAmount || previous <= 0
    ? formatCurrency(Math.abs(diff))
    : `${Math.abs(diff / previous * 100).toFixed(1)}%`;

  return { text: `${up ? "↑" : "↓"} ${size} vs ${prevLabel}`, tone: up === higherIsBetter ? "good" : "bad" };
}

function setDelta(id, change) {
  const element = $(id);
  element.textContent = change.text;
  element.className = `delta ${change.tone}`;
}

function renderMetricComparison(selected, income, expenses, net) {
  const prevKey = monthKeyOffset(selected, -1);
  const prevItems = monthTransactions(prevKey);
  const hasPrev = prevItems.length > 0;
  const prevLabel = monthName(prevKey, true);

  const prevIncome = sum(prevItems, "income");
  const prevExpenses = sum(prevItems, "expense");
  const prevNet = round2(prevIncome - prevExpenses);

  setDelta("incomeDelta", changeText(income, prevIncome, hasPrev, prevLabel, true, false));
  setDelta("expensesDelta", changeText(expenses, prevExpenses, hasPrev, prevLabel, false, false));
  setDelta("netDelta", changeText(net, prevNet, hasPrev, prevLabel, true, true));

  if (income > 0 && prevIncome > 0) {
    const rate = net / income * 100;
    const prevRate = prevNet / prevIncome * 100;
    const points = rate - prevRate;
    setDelta("rateDelta", Math.abs(points) < 0.05
      ? { text: `Same as ${prevLabel}`, tone: "flat" }
      : { text: `${points > 0 ? "↑" : "↓"} ${Math.abs(points).toFixed(1)} pts vs ${prevLabel}`, tone: points > 0 ? "good" : "bad" });
  } else {
    setDelta("rateDelta", { text: hasPrev ? "No income to compare" : `No data for ${prevLabel}`, tone: "flat" });
  }
}

function renderComparison(income, expenses) {
  const chart = $("monthlyBarChart");
  chart.replaceChildren();

  if (income === 0 && expenses === 0) {
    chart.appendChild(makeElement("div", "chart-empty", "No transactions for this month. Add transactions to see your comparison."));
    return;
  }

  const max = Math.max(income, expenses, 1);

  [
    { label: "Income", value: income, type: "income" },
    { label: "Expenses", value: expenses, type: "expense" }
  ].forEach(item => {
    const column = makeElement("div", "comparison-column");
    column.appendChild(makeElement("div", "comparison-value", formatCurrency(item.value)));

    const wrap = makeElement("div", "comparison-bar-wrap");
    const bar = makeElement("div", `comparison-bar ${item.type}`);
    bar.style.height = `${item.value > 0 ? Math.max(3, item.value / max * 100) : 0}%`;
    bar.title = `${item.label}: ${formatCurrency(item.value)}`;
    wrap.appendChild(bar);

    column.append(wrap, makeElement("div", "comparison-label", item.label));
    chart.appendChild(column);
  });
}

/* ---------- 2. Spending by day ---------- */
function renderDaily(selected, monthly) {
  const chart = $("dailyChart");
  const statsBox = $("dailyStats");
  chart.replaceChildren();
  statsBox.replaceChildren();

  const { y, m } = parseISO(`${selected}-01`);
  const days = daysInMonth(y, m);
  const daily = Array(days).fill(0);

  monthly.filter(item => item.type === "expense").forEach(item => {
    const day = Number(item.date.slice(8, 10));
    if (day >= 1 && day <= days) daily[day - 1] = addMoney(daily[day - 1], Number(item.amount));
  });

  const total = daily.reduce((acc, value) => addMoney(acc, value), 0);
  if (total === 0) {
    chart.appendChild(makeElement("div", "chart-empty", "No expenses this month yet. Your daily spending will appear here."));
    return;
  }

  const isCurrent = selected === currentMonth();
  const todayDay = Number(todayString().slice(8, 10));
  const elapsed = isCurrent ? todayDay : days;
  const projected = isCurrent && elapsed < days ? round2(total / elapsed * days) : null;

  const cumulative = [];
  let running = 0;
  for (let i = 0; i < elapsed; i++) {
    running = addMoney(running, daily[i]);
    cumulative.push(running);
  }

  const W = 720, H = 250, padL = 52, padR = 58, padT = 16, padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const slot = plotW / days;
  const barW = Math.max(3, slot * 0.62);
  const maxDaily = Math.max(...daily, 1);
  const maxCum = Math.max(total, projected || 0, 1);
  const yDaily = value => padT + plotH - (value / maxDaily) * plotH;
  const yCum = value => padT + plotH - (value / maxCum) * plotH;
  const xCenter = index => padL + index * slot + slot / 2;

  const svg = svgEl("svg", {
    viewBox: `0 0 ${W} ${H}`, class: "daily-svg", role: "img",
    "aria-label": `Daily spending for ${monthName(selected)}. Total ${formatCurrency(total)}.`
  });

  for (let g = 0; g <= 4; g++) {
    const yy = padT + plotH - (g / 4) * plotH;
    svg.appendChild(svgEl("line", { x1: padL, x2: W - padR, y1: yy, y2: yy, class: "grid-line" }));
    svg.appendChild(svgEl("text", { x: padL - 6, y: yy + 3, "text-anchor": "end", class: "axis-text" }, axisMoney(maxDaily * g / 4)));
    svg.appendChild(svgEl("text", { x: W - padR + 6, y: yy + 3, class: "axis-text axis-right" }, axisMoney(maxCum * g / 4)));
  }

  daily.forEach((value, index) => {
    if (value <= 0) return;
    const top = yDaily(value);
    const bar = svgEl("rect", {
      x: xCenter(index) - barW / 2, y: top, width: barW, height: padT + plotH - top, rx: 2,
      class: `daily-bar${isCurrent && index + 1 === todayDay ? " today" : ""}`
    });
    bar.appendChild(svgEl("title", {}, `${formatDate(toISO(y, m, index + 1))}: ${formatCurrency(value)}`));
    svg.appendChild(bar);
  });

  if (cumulative.length) {
    const points = cumulative.map((value, index) => `${xCenter(index).toFixed(1)},${yCum(value).toFixed(1)}`).join(" ");
    svg.appendChild(svgEl("polyline", { points, class: "daily-line" }));

    if (projected !== null) {
      const last = cumulative.length - 1;
      svg.appendChild(svgEl("line", {
        x1: xCenter(last), y1: yCum(cumulative[last]), x2: xCenter(days - 1), y2: yCum(projected), class: "daily-forecast"
      }));
      const dot = svgEl("circle", { cx: xCenter(days - 1), cy: yCum(projected), r: 4, class: "daily-forecast-dot" });
      dot.appendChild(svgEl("title", {}, `Projected month-end spending: ${formatCurrency(projected)}`));
      svg.appendChild(dot);
    }
  }

  [...new Set([1, 5, 10, 15, 20, 25, days])].filter(day => day <= days).forEach(day => {
    svg.appendChild(svgEl("text", { x: xCenter(day - 1), y: H - 9, "text-anchor": "middle", class: "axis-text" }, day));
  });

  chart.appendChild(svg);

  const highest = Math.max(...daily);
  const highestDay = daily.indexOf(highest) + 1;
  const noSpend = daily.slice(0, elapsed).filter(value => value === 0).length;

  [
    { label: "Average per day", value: formatCurrency(round2(total / elapsed)) },
    { label: "Highest day", value: `${formatCurrency(highest)} · ${formatDate(toISO(y, m, highestDay))}` },
    { label: "No-spend days", value: `${noSpend} of ${elapsed}` }
  ].forEach(stat => {
    const card = makeElement("div", "mini-stat");
    card.append(makeElement("span", "", stat.label), makeElement("strong", "", stat.value));
    statsBox.appendChild(card);
  });
}

/* ---------- Six-month trend (cards or chart) ---------- */
function syncTrendToggle() {
  document.querySelectorAll(".seg[data-trend]").forEach(button => {
    const on = button.dataset.trend === trendView;
    button.classList.toggle("active", on);
    button.setAttribute("aria-pressed", String(on));
  });
}

document.querySelectorAll(".seg[data-trend]").forEach(button => {
  button.addEventListener("click", () => {
    trendView = button.dataset.trend;
    try { localStorage.setItem("finoraTrendView", trendView); } catch { /* ignore */ }
    syncTrendToggle();
    renderSixMonthTrend(selectedMonth());
  });
});

function selectTrendMonth(entry) {
  if ([...monthSelector.options].some(option => option.value === entry.key)) {
    monthSelector.value = entry.key;
    renderAnalytics();
  } else {
    toast(`No transactions recorded in ${entry.fullLabel}.`);
  }
}

function renderTrendChart(container, months, selected) {
  const W = 720, H = 250, padL = 52, padR = 20, padT = 16, padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const max = Math.max(1, ...months.flatMap(entry => [entry.income, entry.expenses]));
  const xAt = index => padL + (months.length === 1 ? plotW / 2 : (index / (months.length - 1)) * plotW);
  const yAt = value => padT + plotH - (value / max) * plotH;

  const svg = svgEl("svg", {
    viewBox: `0 0 ${W} ${H}`, class: "daily-svg", role: "img",
    "aria-label": "Income and expenses for the last six months"
  });

  for (let g = 0; g <= 4; g++) {
    const yy = padT + plotH - (g / 4) * plotH;
    svg.appendChild(svgEl("line", { x1: padL, x2: W - padR, y1: yy, y2: yy, class: "grid-line" }));
    svg.appendChild(svgEl("text", { x: padL - 6, y: yy + 3, "text-anchor": "end", class: "axis-text" }, axisMoney(max * g / 4)));
  }

  [["income", "trend-line income"], ["expenses", "trend-line expense"]].forEach(([field, cls]) => {
    svg.appendChild(svgEl("polyline", {
      points: months.map((entry, index) => `${xAt(index).toFixed(1)},${yAt(entry[field]).toFixed(1)}`).join(" "),
      class: cls
    }));
  });

  months.forEach((entry, index) => {
    [["income", "income"], ["expenses", "expense"]].forEach(([field, kind]) => {
      const dot = svgEl("circle", {
        cx: xAt(index), cy: yAt(entry[field]), r: entry.key === selected ? 5 : 4,
        class: `trend-dot ${kind}`
      });
      dot.appendChild(svgEl("title", {}, `${entry.fullLabel} · ${field === "income" ? "Income" : "Expenses"}: ${formatCurrency(entry[field])}`));
      dot.addEventListener("click", () => selectTrendMonth(entry));
      svg.appendChild(dot);
    });

    const label = svgEl("text", {
      x: xAt(index), y: H - 9, "text-anchor": "middle",
      class: `axis-text${entry.key === selected ? " axis-current" : ""}`
    }, entry.label);
    svg.appendChild(label);
  });

  container.appendChild(svg);
}

function renderSixMonthTrend(selected) {
  const container = $("sixMonthTrend");
  container.replaceChildren();
  container.className = trendView === "chart" ? "trend-chart" : "trend-grid";

  const { y: year } = parseISO(`${selected}-01`);
  const months = [];

  for (let offset = 5; offset >= 0; offset--) {
    const key = monthKeyOffset(selected, -offset);
    const items = monthTransactions(key);
    const { y: keyYear, m: keyMonth } = parseISO(`${key}-01`);
    const date = new Date(keyYear, keyMonth - 1, 1);

    months.push({
      key,
      // Month name only; the year is added just for months from a different year.
      label: date.toLocaleDateString(LOCALE, keyYear === year ? { month: "short" } : { month: "short", year: "numeric" }),
      fullLabel: date.toLocaleDateString(LOCALE, { month: "long", year: "numeric" }),
      income: sum(items, "income"),
      expenses: sum(items, "expense")
    });
  }

  if (trendView === "chart") {
    renderTrendChart(container, months, selected);
    return;
  }

  const max = Math.max(1, ...months.flatMap(entry => [entry.income, entry.expenses]));

  months.forEach(entry => {
    const card = makeElement("button", `trend-month${entry.key === selected ? " current" : ""}`);
    card.type = "button";
    card.title = `Show ${entry.fullLabel}`;
    card.addEventListener("click", () => selectTrendMonth(entry));

    card.appendChild(makeElement("h4", "", entry.label));

    [
      { label: "Income", value: entry.income, type: "income" },
      { label: "Expenses", value: entry.expenses, type: "expense" }
    ].forEach(metric => {
      const line = makeElement("div", "trend-row");
      line.append(makeElement("span", "", metric.label), makeElement("strong", "", compactCurrency(metric.value)));

      const track = makeElement("div", "trend-track");
      const fill = makeElement("div", `trend-fill ${metric.type}`);
      fill.style.width = `${metric.value > 0 ? metric.value / max * 100 : 0}%`;
      fill.title = `${metric.label}: ${formatCurrency(metric.value)}`;
      track.appendChild(fill);
      card.append(line, track);
    });

    const net = round2(entry.income - entry.expenses);
    card.appendChild(makeElement("p", net < 0 ? "result-warning" : "result-success", `Net ${formatCurrency(net)}`));
    container.appendChild(card);
  });
}

/* ==========================================
   Category pie chart (expenses or income, any range)
========================================== */
function pieRange() {
  const selected = selectedMonth();
  const { y } = parseISO(`${selected}-01`);

  switch (pieMonthFilter.value) {
    case "month":
      return { from: `${selected}-01`, to: `${selected}-31`, label: monthName(selected) };
    case "last3":
      return { from: `${monthKeyOffset(selected, -2)}-01`, to: `${selected}-31`, label: `Last 3 months to ${monthName(selected)}` };
    case "last6":
      return { from: `${monthKeyOffset(selected, -5)}-01`, to: `${selected}-31`, label: `Last 6 months to ${monthName(selected)}` };
    case "year":
      return { from: `${y}-01-01`, to: `${y}-12-31`, label: String(y) };
    case "custom": {
      const from = pieFrom.value;
      const to = pieTo.value;
      return { from, to, label: `${from ? formatDate(from) : "the start"} to ${to ? formatDate(to) : "today"}` };
    }
    default:
      return { from: "", to: "", label: "All time" };
  }
}

function itemsInRange(range) {
  return transactions.filter(item =>
    (!range.from || item.date >= range.from) && (!range.to || item.date <= range.to)
  );
}

function renderPie() {
  const legend = $("pieLegend");
  const details = $("pieCategoryDetails");
  const type = pieTypeFilter.value === "income" ? "income" : "expense";
  const isIncome = type === "income";

  $("pieEyebrow").textContent = isIncome ? "INCOME ANALYSIS" : "EXPENSE ANALYSIS";
  $("pieHeading").textContent = isIncome ? "Where your income comes from" : "Where your money goes";
  $("pieCenterLabel").textContent = isIncome ? "Total earned" : "Total spent";

  const custom = pieMonthFilter.value === "custom";
  $("pieRangeRow").hidden = !custom;
  if (custom) {
    if (!pieFrom.value) pieFrom.value = `${selectedMonth()}-01`;
    if (!pieTo.value) pieTo.value = todayString();
  }

  const range = pieRange();
  const scope = itemsInRange(range);
  const entries = categoryEntries(scope, type);
  const total = entries.reduce((acc, [, value]) => addMoney(acc, value), 0);

  $("pieTotal").textContent = formatCurrency(total);
  legend.replaceChildren();
  details.replaceChildren();
  pieSegments = [];

  if (!entries.length) {
    expensePie.style.background = "var(--line-soft)";
    expensePie.setAttribute("aria-label", `No ${isIncome ? "income" : "expenses"} recorded for this period`);
    selectedPieCategory = null;
    legend.appendChild(makeElement("p", "result-muted", isIncome ? "No income yet." : "No expenses yet."));
    details.appendChild(makeElement("p", "", `Nothing recorded for ${range.label}. Try a different period.`));
    return;
  }

  if (!entries.some(([category]) => category === selectedPieCategory)) {
    selectedPieCategory = entries[0][0];
  }

  let angle = 0;
  pieSegments = entries.map(([category, amount], index) => {
    const start = angle;
    angle += amount / total * 360;
    return {
      category, amount,
      percentage: amount / total * 100,
      color: pieColors[index % pieColors.length],
      start, end: angle
    };
  });

  expensePie.style.background = `conic-gradient(${pieSegments
    .map(segment => `${segment.color} ${segment.start}deg ${segment.end}deg`).join(", ")})`;
  expensePie.setAttribute(
    "aria-label",
    `${isIncome ? "Income" : "Expense"} breakdown: ${pieSegments.map(segment => `${segment.category} ${segment.percentage.toFixed(0)}%`).join(", ")}`
  );

  pieSegments.forEach(segment => {
    const button = makeElement("button", segment.category === selectedPieCategory ? "selected" : "");
    button.type = "button";
    button.setAttribute("aria-pressed", String(segment.category === selectedPieCategory));

    const swatch = makeElement("span", "pie-swatch");
    swatch.style.background = segment.color;

    button.append(
      swatch,
      makeElement("span", "pie-legend-name", `${segment.category} · ${segment.percentage.toFixed(1)}%`),
      makeElement("span", "pie-legend-value", formatCurrency(segment.amount))
    );
    button.addEventListener("click", () => {
      selectedPieCategory = segment.category;
      renderPie();
    });
    legend.appendChild(button);
  });

  const selected = pieSegments.find(segment => segment.category === selectedPieCategory);
  const items = scope
    .filter(item => item.type === type && categoryOf(item) === selected.category)
    .sort((a, b) => b.date.localeCompare(a.date));

  details.appendChild(makeElement("h4", "", selected.category));
  details.appendChild(makeElement("p", "", `${isIncome ? "Earned" : "Spent"}: ${formatCurrency(selected.amount)}`));
  details.appendChild(makeElement("p", "", `${selected.percentage.toFixed(1)}% of your total recorded ${isIncome ? "income" : "expenses"} (${range.label})`));
  details.appendChild(makeElement("p", "", `${items.length} transaction${items.length === 1 ? "" : "s"} in this period`));

  if (items.length) {
    const list = makeElement("ul", "pie-recent");
    items.slice(0, 3).forEach(item => {
      const line = makeElement("li");
      line.append(
        makeElement("span", "", `${formatDate(item.date)}${item.note ? ` · ${item.note}` : ""}`),
        makeElement("strong", "", formatCurrency(item.amount))
      );
      list.appendChild(line);
    });
    details.appendChild(list);
  }

  const actions = makeElement("div", "pie-actions");

  const viewBtn = makeElement("button", "secondary-btn", "View these transactions");
  viewBtn.type = "button";
  viewBtn.addEventListener("click", () => openTransactions({
    type, category: selected.category, from: range.from, to: range.to, label: range.label
  }));
  actions.appendChild(viewBtn);

  if (!isIncome) {
    const budgetBtn = makeElement("button", "secondary-btn", `Set a budget for ${selected.category}`);
    budgetBtn.type = "button";
    budgetBtn.addEventListener("click", () => {
      const select = $("budgetCategory");
      select.value = selected.category;
      select.dispatchEvent(new Event("change"));
      $("budgetForm").scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
      $("budgetAmount").focus({ preventScroll: true });
    });
    actions.appendChild(budgetBtn);
  }

  details.appendChild(actions);
}

function pieSegmentAt(event) {
  const rect = expensePie.getBoundingClientRect();
  const x = event.clientX - rect.left - rect.width / 2;
  const y = event.clientY - rect.top - rect.height / 2;
  const radius = rect.width / 2;
  const distance = Math.hypot(x, y);

  // The inner 56% of the radius is the empty centre of the doughnut.
  if (distance < radius * 0.56 || distance > radius) return null;

  let angle = Math.atan2(x, -y) * 180 / Math.PI;
  if (angle < 0) angle += 360;
  return pieSegments.find(segment => angle >= segment.start && angle < segment.end) || null;
}

expensePie.addEventListener("click", event => {
  const segment = pieSegmentAt(event);
  if (segment) {
    selectedPieCategory = segment.category;
    renderPie();
  }
});

expensePie.addEventListener("mousemove", event => {
  const segment = pieSegmentAt(event);
  expensePie.style.cursor = segment ? "pointer" : "default";
  expensePie.title = segment ? `${segment.category}: ${formatCurrency(segment.amount)}` : "";
});

[pieMonthFilter, pieTypeFilter].forEach(control => control.addEventListener("change", () => {
  selectedPieCategory = null;
  renderPie();
}));
[pieFrom, pieTo].forEach(control => control.addEventListener("input", renderPie));

/* ---------- Category changes vs last month ---------- */
function renderCategoryChanges(selected, monthly) {
  const container = $("categoryChanges");
  container.replaceChildren();

  const prevKey = monthKeyOffset(selected, -1);
  const prevEntries = categoryEntries(monthTransactions(prevKey), "expense");
  const currentEntries = categoryEntries(monthly, "expense");

  if (!prevEntries.length || !currentEntries.length) {
    container.appendChild(makeElement("p", "muted", !currentEntries.length
      ? "Record expenses this month to see how your categories changed."
      : `No expenses were recorded in ${monthName(prevKey)}, so there is nothing to compare with yet.`));
    return;
  }

  const current = Object.fromEntries(currentEntries);
  const previous = Object.fromEntries(prevEntries);
  const rows = [...new Set([...Object.keys(current), ...Object.keys(previous)])]
    .map(category => ({
      category,
      now: current[category] || 0,
      before: previous[category] || 0,
      diff: round2((current[category] || 0) - (previous[category] || 0))
    }))
    .filter(row => row.diff !== 0);

  const columns = [
    { title: "Spending went up", items: rows.filter(row => row.diff > 0).sort((a, b) => b.diff - a.diff).slice(0, 4), up: true },
    { title: "Spending went down", items: rows.filter(row => row.diff < 0).sort((a, b) => a.diff - b.diff).slice(0, 4), up: false }
  ];

  columns.forEach(column => {
    const box = makeElement("div", "change-col");
    box.appendChild(makeElement("h4", "", column.title));

    if (!column.items.length) {
      box.appendChild(makeElement("p", "muted", "Nothing here."));
    }

    column.items.forEach(row => {
      const button = makeElement("button", "change-row");
      button.type = "button";
      button.title = `View ${row.category} transactions`;
      const size = row.before > 0 ? `${Math.abs(row.diff / row.before * 100).toFixed(0)}%` : "new";

      button.append(
        makeElement("span", "", row.category),
        makeElement("strong", column.up ? "bad" : "good", `${column.up ? "↑" : "↓"} ${formatCurrency(Math.abs(row.diff))} · ${size}`)
      );
      button.addEventListener("click", () => openTransactions({
        type: "expense", category: row.category,
        from: `${selected}-01`, to: `${selected}-31`, label: monthName(selected)
      }));
      box.appendChild(button);
    });

    container.appendChild(box);
  });
}

/* ==========================================
   Budgets
========================================== */
function populateBudgetCategories() {
  const select = $("budgetCategory");
  const previous = select.value;
  const categories = [...new Set([
    ...expenseCategories.filter(category => category !== "Other"),
    ...transactions.filter(item => item.type === "expense").map(categoryOf)
  ])].sort((a, b) => a.localeCompare(b));

  select.replaceChildren(new Option("Choose category", ""));
  categories.forEach(category => select.add(new Option(category, category)));
  if (categories.includes(previous)) select.value = previous;
}

$("budgetCategory").addEventListener("change", () => {
  const existing = readObject(BUDGET_KEY)[$("budgetCategory").value];
  $("budgetAmount").value = existing || "";
});

$("budgetForm").addEventListener("submit", event => {
  event.preventDefault();

  const category = $("budgetCategory").value;
  const amount = Number($("budgetAmount").value);

  if (!category || !Number.isFinite(amount) || amount <= 0) {
    toast("Choose a category and enter a valid budget.", { type: "error" });
    return;
  }

  const budgets = readObject(BUDGET_KEY);
  budgets[category] = round2(amount);

  if (saveObject(BUDGET_KEY, budgets)) {
    $("budgetAmount").value = "";
    renderBudgets(selectedMonthTransactions());
    renderInsights(selectedMonth(), selectedMonthTransactions());
    toast(`Budget set for ${category}.`);
  }
});

function renderBudgets(monthly) {
  const container = $("budgetResults");
  container.replaceChildren();

  const budgets = readObject(BUDGET_KEY);
  const entries = Object.entries(budgets).filter(([, value]) => Number(value) > 0);

  if (!entries.length) {
    container.appendChild(makeElement("p", "result-muted", "Set a category budget to track your spending."));
    return;
  }

  const selected = selectedMonth();
  const { y, m } = parseISO(`${selected}-01`);
  const isCurrent = selected === currentMonth();
  const daysLeft = daysInMonth(y, m) - Number(todayString().slice(8, 10)) + 1;

  entries.forEach(([category, rawBudget]) => {
    const budget = Number(rawBudget);
    const spent = monthly
      .filter(item => item.type === "expense" && categoryOf(item) === category)
      .reduce((acc, item) => addMoney(acc, Number(item.amount)), 0);

    const percent = spent / budget * 100;
    const state = percent > 100 ? "over" : percent >= 80 ? "warn" : "ok";

    const row = makeElement("div", "result-row");
    const line = makeElement("div", "result-line");

    const name = makeElement("button", "link-btn", category);
    name.type = "button";
    name.title = `View ${category} transactions`;
    name.addEventListener("click", () => openTransactions({
      type: "expense", category, from: `${selected}-01`, to: `${selected}-31`, label: monthName(selected)
    }));

    line.append(name, makeElement("strong", "", `${formatCurrency(spent)} / ${formatCurrency(budget)}`));

    const track = makeElement("div", "progress-track");
    track.setAttribute("role", "progressbar");
    track.setAttribute("aria-label", `${category} budget used`);
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", "100");
    track.setAttribute("aria-valuenow", String(Math.min(100, Math.round(percent))));
    const fill = makeElement("div", `progress-fill ${state}`);
    fill.style.width = `${Math.min(percent, 100)}%`;
    track.appendChild(fill);

    const left = round2(budget - spent);
    const perDay = isCurrent && state !== "over" && daysLeft > 0
      ? ` About ${formatCurrency(round2(left / daysLeft))} a day for the next ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`
      : "";

    const message = state === "over"
      ? `Over budget by ${formatCurrency(round2(spent - budget))}.`
      : state === "warn"
        ? `Careful: ${percent.toFixed(0)}% used, ${formatCurrency(left)} left.${perDay}`
        : `${formatCurrency(left)} remaining (${Math.max(0, 100 - percent).toFixed(1)}%).${perDay}`;
    const note = makeElement("p", state === "over" ? "result-warning" : state === "warn" ? "result-warn" : "result-success", message);

    const remove = makeElement("button", "delete-btn", "Remove budget");
    remove.type = "button";
    remove.setAttribute("aria-label", `Remove ${category} budget`);
    remove.addEventListener("click", () => {
      const updated = readObject(BUDGET_KEY);
      delete updated[category];
      if (saveObject(BUDGET_KEY, updated)) {
        renderBudgets(selectedMonthTransactions());
        renderInsights(selectedMonth(), selectedMonthTransactions());
        toast(`${category} budget removed.`, {
          actionLabel: "Undo",
          onAction() {
            const restored = readObject(BUDGET_KEY);
            restored[category] = budget;
            if (saveObject(BUDGET_KEY, restored)) {
              renderBudgets(selectedMonthTransactions());
              renderInsights(selectedMonth(), selectedMonthTransactions());
            }
          }
        });
      }
    });

    row.append(line, track, note, remove);
    container.appendChild(row);
  });
}

/* ==========================================
   Savings goal (with a finish-date estimate)
========================================== */
$("goalForm").addEventListener("submit", event => {
  event.preventDefault();

  const name = $("goalName").value.trim();
  const target = Number($("goalAmount").value);

  if (!name || !Number.isFinite(target) || target <= 0) {
    toast("Enter a goal name and a valid target.", { type: "error" });
    return;
  }

  if (saveObject(GOAL_KEY, { name, target: round2(target) })) {
    renderGoal();
    toast("Savings goal saved.");
  }
});

function renderGoal() {
  const container = $("goalResults");
  container.replaceChildren();

  const goal = readObject(GOAL_KEY);
  if (!goal.name || !Number.isFinite(Number(goal.target)) || Number(goal.target) <= 0) {
    container.appendChild(makeElement("p", "result-muted", "Create a savings goal to track progress."));
    return;
  }

  // Only pre-fill empty fields so we never overwrite what someone is typing.
  if (!$("goalName").value && !$("goalAmount").value) {
    $("goalName").value = goal.name;
    $("goalAmount").value = goal.target;
  }

  // Recorded transaction net, not a verified bank balance.
  const netBalance = round2(sum(transactions, "income") - sum(transactions, "expense"));
  const saved = Math.max(0, netBalance);
  const target = Number(goal.target);
  const percent = saved / target * 100;

  const row = makeElement("div", "result-row");
  row.appendChild(makeElement("h3", "", goal.name));
  row.appendChild(makeElement("p", "result-muted", `${formatCurrency(saved)} counted towards ${formatCurrency(target)}`));

  const track = makeElement("div", "progress-track");
  track.setAttribute("role", "progressbar");
  track.setAttribute("aria-label", `${goal.name} progress`);
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", "100");
  track.setAttribute("aria-valuenow", String(Math.min(100, Math.round(percent))));
  const fill = makeElement("div", "progress-fill ok");
  fill.style.width = `${Math.min(percent, 100)}%`;
  track.appendChild(fill);
  row.appendChild(track);

  row.appendChild(makeElement(
    "p", percent >= 100 ? "result-success" : "result-muted",
    percent >= 100
      ? "Goal reached based on your recorded transactions!"
      : `${Math.min(percent, 100).toFixed(1)}% complete · ${formatCurrency(round2(target - saved))} to go.`
  ));

  if (percent < 100) {
    const average = averageMonthlyNet();
    const remaining = round2(target - saved);
    if (average > 0) {
      const months = Math.ceil(remaining / average);
      row.appendChild(makeElement("p", "forecast-note",
        `At your recent average of ${formatCurrency(average)} saved per month, you could reach this goal around ${monthName(monthKeyOffset(currentMonth(), months))}.`));
    } else {
      row.appendChild(makeElement("p", "forecast-note",
        "Your recent months show no net savings, so a finish date can't be estimated yet."));
    }
  }

  const remove = makeElement("button", "delete-btn", "Remove goal");
  remove.type = "button";
  remove.addEventListener("click", () => {
    const old = { name: goal.name, target: goal.target };
    try {
      localStorage.removeItem(GOAL_KEY);
      $("goalForm").reset();
      renderGoal();
      toast("Savings goal removed.", {
        actionLabel: "Undo",
        onAction() {
          if (saveObject(GOAL_KEY, old)) renderGoal();
        }
      });
    } catch (error) {
      console.error("Could not remove goal:", error);
      toast("Could not remove the goal.", { type: "error" });
    }
  });

  row.appendChild(remove);
  container.appendChild(row);
}

/* ==========================================
   Smart insights
========================================== */
function renderInsights(selected, monthly) {
  const container = $("smartInsights");
  container.replaceChildren();

  const income = sum(monthly, "income");
  const expenses = sum(monthly, "expense");
  const net = round2(income - expenses);
  const top = expenseEntries(monthly)[0];

  const previousKey = monthKeyOffset(selected, -1);
  const previousExpenses = sum(monthTransactions(previousKey), "expense");

  const insights = [{
    icon: "💰",
    title: "Savings rate",
    text: income === 0
      ? "Record income to calculate your savings rate."
      : net < 0
        ? `Recorded expenses exceed income by ${formatCurrency(Math.abs(net))}.`
        : `${(net / income * 100).toFixed(1)}% of recorded income remains after expenses.`
  }];

  insights.push(top ? {
    icon: "🔎",
    title: "Top spending category",
    text: `${top[0]} is your highest expense at ${formatCurrency(top[1])}, accounting for ${(top[1] / expenses * 100).toFixed(1)}% of expenses.`
  } : {
    icon: "🧾",
    title: "No expenses yet",
    text: "Record expenses to find your highest-spending category."
  });

  if (previousExpenses > 0) {
    const change = expenses - previousExpenses;
    const percentage = change / previousExpenses * 100;
    insights.push({
      icon: change > 0 ? "📈" : change < 0 ? "📉" : "🗓️",
      title: "Monthly spending change",
      text: `${change > 0 ? "Spending increased" : change < 0 ? "Spending decreased" : "Spending stayed the same"} by ${Math.abs(percentage).toFixed(1)}% compared with the previous month.`
    });
  } else {
    insights.push({
      icon: "🗓️",
      title: "Monthly comparison",
      text: "Record expenses in consecutive months to compare spending."
    });
  }

  const budgets = readObject(BUDGET_KEY);
  const spentBy = Object.fromEntries(expenseEntries(monthly));
  const overBudgets = Object.entries(budgets).filter(
    ([category, budget]) => Number(budget) > 0 && (spentBy[category] || 0) > Number(budget)
  );

  insights.push(overBudgets.length ? {
    icon: "⚠️",
    title: "Budget alert",
    text: `${overBudgets.length} category budget${overBudgets.length > 1 ? "s are" : " is"} exceeded. Review the budget planner for details.`
  } : {
    icon: "🎯",
    title: "Budget check",
    text: Object.keys(budgets).length
      ? "No category budgets have been exceeded this month."
      : "Set category budgets to receive useful spending alerts."
  });

  // Richer observations
  const expenseItems = monthly.filter(item => item.type === "expense");
  if (expenseItems.length) {
    const biggest = expenseItems.reduce((best, item) => (Number(item.amount) > Number(best.amount) ? item : best));
    insights.push({
      icon: "💥",
      title: "Biggest single expense",
      text: `${categoryOf(biggest)} on ${formatDate(biggest.date)} for ${formatCurrency(biggest.amount)}${biggest.note ? ` (${biggest.note})` : ""}.`
    });

    const weekday = topWeekday(monthly);
    if (weekday) {
      insights.push({
        icon: "📅",
        title: "Priciest weekday",
        text: `You spend the most on ${weekday.name}s, ${formatCurrency(weekday.total)} in total this month.`
      });
    }

    const recurringSpend = expenseItems
      .filter(item => item.recurringId)
      .reduce((acc, item) => addMoney(acc, Number(item.amount)), 0);
    insights.push({
      icon: "🔁",
      title: "Recurring share",
      text: recurringSpend > 0
        ? `${(recurringSpend / expenses * 100).toFixed(1)}% of this month's spending (${formatCurrency(recurringSpend)}) comes from recurring bills.`
        : "None of this month's spending came from recurring rules."
    });

    const { y, m } = parseISO(`${selected}-01`);
    const elapsed = selected === currentMonth() ? Number(todayString().slice(8, 10)) : daysInMonth(y, m);
    const spendDays = new Set(expenseItems.map(item => item.date)).size;
    insights.push({
      icon: "🌿",
      title: "No-spend days",
      text: `${Math.max(0, elapsed - spendDays)} of ${elapsed} days so far had no spending.`
    });
  }

  insights.forEach(insight => {
    const card = makeElement("article", "insight-card");
    const icon = makeElement("div", "insight-icon", insight.icon);
    icon.setAttribute("aria-hidden", "true");
    card.append(icon, makeElement("h4", "", insight.title), makeElement("p", "", insight.text));
    container.appendChild(card);
  });
}

/* ---------- Print / save as PDF ---------- */
$("printBtn").addEventListener("click", () => {
  const previousTheme = currentTheme();
  if (previousTheme === "dark") applyTheme("light");
  window.addEventListener("afterprint", () => applyTheme(previousTheme), { once: true });
  window.print();
});

$("emptyStartBtn").addEventListener("click", () => {
  setView("dashboard");
  amountInput.focus();
});

/* ==========================================
   Start
========================================== */
transactionDate.value = todayString();
document.querySelector(`input[name="transactionType"][value="${lastEntry.type === "income" ? "income" : "expense"}"]`).checked = true;
updateCategoryOptions(lastEntry.categories?.[lastEntry.type === "income" ? "income" : "expense"]);
populateCurrencySelect();
applyCurrencyUI();
syncTrendToggle();
syncThemeToggle();
processRecurring();
renderAll();