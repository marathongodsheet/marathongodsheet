const STORAGE_KEY = "marathon-godsheet-v33-state";
const HISTORY_KEY = "marathon-godsheet-v33-history";
const VAULT_KEY = "marathon-godsheet-v33-vault";
const UPGRADE_ALLOCATIONS_KEY = "marathon-godsheet-v33-upgrade-allocations";
const UI_STATE_KEY = "marathon-godsheet-v33-ui";
const CATEGORIES = ["Grey", "Green", "Blue", "Purple", "Gold"];

const rarityClass = { Grey: "grey", Green: "green", Blue: "blue", Purple: "purple", Gold: "gold" };
const data = window.INITIAL_DATA;

function idFor(category, name) {
  return `${category}::${name}`.toLowerCase().replace(/\s+/g, " ").trim();
}

const materials = data.flatMap(group => group.items.map(item => ({
  id: idFor(group.category, item.name),
  category: group.category,
  name: item.name.trim(),
  start: Number(item.total) || 0
})));

const byId = Object.fromEntries(materials.map(item => [item.id, item]));
let state = loadState();
let history = loadHistory();
let vault = loadVaultState();
var upgradeState;
var upgradeAllocations;
const undoStack = [];
const UNDO_LIMIT = 30;

function cloneForUndo(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function pushUndoSnapshot() {
  undoStack.unshift({
    state: cloneForUndo(state),
    history: cloneForUndo(history),
    vault: cloneForUndo(vault),
    upgradeState: cloneForUndo(typeof upgradeState !== "undefined" ? upgradeState : {}),
    upgradeAllocations: cloneForUndo(typeof upgradeAllocations !== "undefined" ? upgradeAllocations : {})
  });
  if (undoStack.length > UNDO_LIMIT) undoStack.length = UNDO_LIMIT;
  updateUndoButton();
}

function updateUndoButton() {
  const btn = document.getElementById("undoBtn");
  if (btn) btn.disabled = undoStack.length === 0;
}

function undoLastAction() {
  const snapshot = undoStack.shift();
  if (!snapshot) {
    alert("There is nothing to undo.");
    updateUndoButton();
    return;
  }
  state = snapshot.state;
  history = snapshot.history;
  vault = snapshot.vault;
  upgradeState = snapshot.upgradeState;
  upgradeAllocations = snapshot.upgradeAllocations;
  saveUpgradeState();
  saveUpgradeAllocations();
  save();
  if (upgradeTrackerReady) renderUpgradeTracker();
  renderAll();
  updateUndoButton();
}

const totalsTable = document.getElementById("totalsTable");
const raritySelect = document.getElementById("raritySelect");
const materialSelect = document.getElementById("materialSelect");
const amountInput = document.getElementById("amountInput");
const selectedReadout = document.getElementById("selectedReadout");
const historyList = document.getElementById("historyList");
const rarityDropdowns = document.getElementById("rarityDropdowns");
const vaultList = document.getElementById("vaultList");

function defaultState() {
  const next = {};
  materials.forEach(item => {
    next[item.id] = { start: item.start, left: item.start, used: 0, returned: 0 };
  });
  return next;
}

function loadState() {
  const defaults = defaultState();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && typeof saved === "object") {
      materials.forEach(item => {
        const record = saved[item.id] || {};
        defaults[item.id] = {
          start: Number(record.start ?? item.start) || 0,
          left: Number(record.left ?? item.start) || 0,
          used: Number(record.used ?? 0) || 0,
          returned: Number(record.returned ?? 0) || 0
        };
      });
    }
  } catch {}
  return defaults;
}

function loadHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem(HISTORY_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function defaultVaultState() {
  const next = {};
  materials.forEach(item => { next[item.id] = 0; });
  return next;
}

function loadVaultState() {
  const defaults = defaultVaultState();
  try {
    const saved = JSON.parse(localStorage.getItem(VAULT_KEY));
    if (saved && typeof saved === "object") {
      materials.forEach(item => {
        defaults[item.id] = Math.max(0, Number(saved[item.id] || 0));
      });
    }
  } catch {}
  return defaults;
}

function loadUiState() {
  try {
    const saved = JSON.parse(localStorage.getItem(UI_STATE_KEY));
    return saved && typeof saved === "object" ? saved : {};
  } catch {
    return {};
  }
}

function saveUiState(patch = {}) {
  const next = { ...loadUiState(), ...patch };
  localStorage.setItem(UI_STATE_KEY, JSON.stringify(next));
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  localStorage.setItem(VAULT_KEY, JSON.stringify(vault));
  if (typeof upgradeAllocations !== "undefined") localStorage.setItem(UPGRADE_ALLOCATIONS_KEY, JSON.stringify(upgradeAllocations));
}

function fmt(num) { return Number(num || 0).toLocaleString(); }

function activateTab(tabName, persist = true) {
  const btn = document.querySelector(`.tab[data-tab="${tabName}"]`) || document.querySelector('.tab[data-tab="dashboard"]');
  if (!btn) return;
  document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
  btn.classList.add("active");
  const panel = document.getElementById(`${btn.dataset.tab}Tab`);
  if (panel) panel.classList.add("active");
  if (persist) saveUiState({ activeTab: btn.dataset.tab });
}

function renderTabs() {
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => activateTab(btn.dataset.tab));
  });
  activateTab(loadUiState().activeTab || "upgrade", false);
}


function getAllocatedUpgradeUseForMaterial(materialId) {
  if (typeof upgradeAllocations === "undefined") return { total: 0, vault: 0, available: 0 };
  const out = { total: 0, vault: 0, available: 0 };
  Object.values(upgradeAllocations || {}).forEach(factionAlloc => {
    Object.values(factionAlloc || {}).forEach(nodeAlloc => {
      const entry = nodeAlloc?.[materialId];
      if (!entry) return;
      out.vault += Number(entry.vault || 0);
      out.available += Number(entry.available || 0);
      out.total += Number(entry.vault || 0) + Number(entry.available || 0);
    });
  });
  return out;
}

function getUpgradeNeedForMaterial(item) {
  return getAllocatedUpgradeUseForMaterial(item.id).total;
}

function getDisplayedLeft(item) {
  return Number(state[item.id]?.left || 0);
}

function renderSummary() {
  const totalStart = materials.reduce((sum, item) => sum + state[item.id].start, 0);
  const totalLeft = materials.reduce((sum, item) => sum + getDisplayedLeft(item), 0);
  document.getElementById("materialCount").textContent = fmt(materials.length);
  document.getElementById("startingTotal").textContent = fmt(totalStart);
  document.getElementById("leftTotal").textContent = fmt(totalLeft);
  const netEl = document.getElementById("netTotal");
  if (netEl) netEl.textContent = fmt(materials.reduce((sum, item) => sum + state[item.id].used - state[item.id].returned, 0));
}

function renderTotalsTable() {
  const groups = CATEGORIES.map(category => materials.filter(item => item.category === category));
  const maxRows = Math.max(...groups.map(group => group.length));
  const thead = document.createElement("thead");
  const header = document.createElement("tr");
  CATEGORIES.forEach(category => {
    const rarity = document.createElement("th");
    rarity.className = rarityClass[category];
    rarity.colSpan = 2;
    rarity.textContent = category;
    header.append(rarity);
  });
  thead.appendChild(header);

  const tbody = document.createElement("tbody");
  for (let row = 0; row < maxRows; row++) {
    const tr = document.createElement("tr");
    groups.forEach(group => {
      const item = group[row];
      const matCell = document.createElement("td");
      const amountCell = document.createElement("td");
      if (item) {
        matCell.textContent = item.name;
        matCell.className = "material";
        const upgradeNeed = getUpgradeNeedForMaterial(item);
        const shownLeft = getDisplayedLeft(item);
        amountCell.textContent = fmt(shownLeft);
        const alloc = getAllocatedUpgradeUseForMaterial(item.id);
        const inVault = Number(vault[item.id] || 0);
        amountCell.className = `amount ${shownLeft === 0 ? "upgrade-adjusted" : ""} ${shownLeft < 0 ? "negative-total" : ""}`;
        if (upgradeNeed > 0 || inVault > 0) amountCell.title = `Totals left: ${fmt(shownLeft)} | In Vault: ${fmt(inVault)} | Spent by selected upgrades: ${fmt(upgradeNeed)} (${fmt(alloc.vault)} from vault, ${fmt(alloc.available)} from totals left)`;
      } else {
        matCell.className = "empty";
        amountCell.className = "empty";
        matCell.textContent = "-";
        amountCell.textContent = "-";
      }
      tr.append(matCell, amountCell);
    });
    tbody.appendChild(tr);
  }
  totalsTable.replaceChildren(thead, tbody);
}

function renderEntryDropdowns() {
  raritySelect.replaceChildren(...CATEGORIES.map(category => new Option(category, category)));
  raritySelect.addEventListener("change", () => {
    renderMaterialSelect();
    renderSelectedReadout();
  });
  materialSelect.addEventListener("change", renderSelectedReadout);
  renderMaterialSelect();
}

function renderMaterialSelect() {
  const category = raritySelect.value || CATEGORIES[0];
  const options = materials
    .filter(item => item.category === category)
    .map(item => new Option(item.name, item.id));
  materialSelect.replaceChildren(...options);
}

function renderSelectedReadout() {
  const item = byId[materialSelect.value];
  if (!item) {
    selectedReadout.textContent = "Choose a material.";
    return;
  }
  const record = state[item.id];
  const upgradeNeed = getUpgradeNeedForMaterial(item);
  const dashboardLeft = getDisplayedLeft(item);
  const alloc = getAllocatedUpgradeUseForMaterial(item.id);
  selectedReadout.innerHTML = `<strong>${item.name}</strong> (${item.category}) — Starting: <strong>${fmt(record.start)}</strong>, Totals Left: <strong>${fmt(dashboardLeft)}</strong>, In Vault: <strong>${fmt(vault[item.id] || 0)}</strong>${upgradeNeed > 0 ? `, Selected Upgrades Spent: <strong>${fmt(upgradeNeed)}</strong> (${fmt(alloc.vault)} from vault, ${fmt(alloc.available)} from totals left)` : ""}`;
}

function renderRarityDropdowns() {
  rarityDropdowns.innerHTML = "";
  CATEGORIES.forEach(category => {
    const details = document.createElement("details");
    details.dataset.category = category;
    details.open = category === "Grey" || category === "Green";
    const summary = document.createElement("summary");
    summary.textContent = `${category} Materials`;
    const list = document.createElement("div");
    list.className = "dropdown-list";
    materials.filter(item => item.category === category).forEach(item => {
      const pill = document.createElement("button");
      pill.className = `material-pill secondary ${rarityClass[category]}`;
      pill.dataset.category = category;
      pill.type = "button";
      // These dropdown cards stay locked to the original workbook/default totals.
      // Upgrade tracking and manual entries update the main TOTALS LEFT table, not this reference list.
      pill.innerHTML = `<span>${item.name}</span><span>${fmt(item.start)}</span>`;
      pill.title = `${item.category} material — default workbook total: ${fmt(item.start)}`;
      pill.addEventListener("click", () => {
        raritySelect.value = category;
        renderMaterialSelect();
        materialSelect.value = item.id;
        renderSelectedReadout();
        amountInput.focus();
      });
      list.appendChild(pill);
    });
    details.append(summary, list);
    rarityDropdowns.appendChild(details);
  });
}


function renderVaultList() {
  if (!vaultList) return;
  const entries = materials
    .filter(item => Number(vault[item.id] || 0) > 0)
    .map(item => ({ item, amount: Number(vault[item.id] || 0) }));
  if (!entries.length) {
    vaultList.innerHTML = `<div class="empty-vault">Vault is empty. Add materials here to reserve them for upgrades.</div>`;
    return;
  }
  vaultList.innerHTML = `<div class="vault-title">Currently In Vault</div>` + entries.map(({ item, amount }) =>
    `<button type="button" class="vault-pill ${rarityClass[item.category]}" data-id="${item.id}"><span>${item.name}</span><strong>${fmt(amount)}</strong></button>`
  ).join("");
  vaultList.querySelectorAll(".vault-pill").forEach(btn => {
    btn.addEventListener("click", () => {
      const item = byId[btn.dataset.id];
      if (!item) return;
      raritySelect.value = item.category;
      renderMaterialSelect();
      materialSelect.value = item.id;
      renderSelectedReadout();
      amountInput.focus();
    });
  });
}

function applyTransaction(kind) {
  const item = byId[materialSelect.value];
  const amount = Number(amountInput.value);
  if (!item || !Number.isFinite(amount) || amount <= 0) {
    alert("Choose a material and enter an amount above 0.");
    return;
  }
  const record = state[item.id];
  if (kind === "used") {
    if (amount > record.left) {
      alert(`You only have ${fmt(record.left)} ${item.name} in TOTALS LEFT to move into the vault.`);
      return;
    }
    pushUndoSnapshot();
    vault[item.id] = Number(vault[item.id] || 0) + amount;
    record.left -= amount;
    history.unshift({
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      materialId: item.id,
      material: item.name,
      category: item.category,
      kind: "vault_added",
      amount,
      leftAfter: record.left,
      vaultAfter: vault[item.id],
      timestamp: new Date().toISOString()
    });
  } else {
    if (amount > Number(vault[item.id] || 0)) {
      alert(`Only ${fmt(vault[item.id] || 0)} ${item.name} is currently in the vault.`);
      return;
    }
    pushUndoSnapshot();
    vault[item.id] = Number(vault[item.id] || 0) - amount;
    record.left += amount;
    history.unshift({
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      materialId: item.id,
      material: item.name,
      category: item.category,
      kind: "vault_removed",
      amount,
      leftAfter: record.left,
      vaultAfter: vault[item.id],
      timestamp: new Date().toISOString()
    });
  }
  save();
  amountInput.value = "";
  renderAll();
}

function renderHistory() {
  if (!historyList) return;
  if (!history.length) {
    historyList.innerHTML = `<div class="empty-history">No changes yet.</div>`;
    return;
  }
  historyList.innerHTML = history.slice(0, 100).map(entry => {
    const time = new Date(entry.timestamp).toLocaleString();
    const meta = {
      returned: { sign: "+", label: "added back", suffix: `→ left ${fmt(entry.leftAfter)}` },
      used: { sign: "-", label: "used", suffix: `→ left ${fmt(entry.leftAfter)}` },
      vault_added: { sign: "→", label: "moved into vault", suffix: `vault ${fmt(entry.vaultAfter)} • left ${fmt(entry.leftAfter)}` },
      vault_removed: { sign: "←", label: "removed from vault", suffix: `vault ${fmt(entry.vaultAfter)} • left ${fmt(entry.leftAfter)}` }
    }[entry.kind] || { sign: "", label: entry.kind, suffix: `left ${fmt(entry.leftAfter)}` };
    return `<div class="history-item ${entry.kind}">
      <div class="time">${time}</div>
      <div><strong>${entry.material}</strong> <span class="muted">${entry.category}</span> — ${meta.label}</div>
      <div class="change">${meta.sign}${fmt(entry.amount)} ${meta.suffix}</div>
    </div>`;
  }).join("");
}

let upgradeTrackerReady = false;

function renderAll() {
  renderSummary();
  renderTotalsTable();
  renderMaterialSelect();
  renderSelectedReadout();
  renderVaultList();
  renderRarityDropdowns();
  renderHistory();
  if (upgradeTrackerReady && typeof renderDashboardUpgradeNeeded === "function") renderDashboardUpgradeNeeded();
}

function exportSave() {
  const blob = new Blob([JSON.stringify({ state, history, vault, upgrades: (typeof upgradeState !== "undefined" ? upgradeState : undefined), upgradeAllocations: (typeof upgradeAllocations !== "undefined" ? upgradeAllocations : undefined) }, null, 2)], { type: "application/json" });
  downloadBlob(blob, "marathon-godsheet-save.json");
}

function exportCsv() {
  const rows = [["Rarity", "Material", "Starting", "Totals Left", "In Vault", "Selected Upgrade Use", "Upgrade Use From Vault", "Upgrade Use From Totals Left"]];
  materials.forEach(item => {
    const r = state[item.id];
    const alloc = getAllocatedUpgradeUseForMaterial(item.id);
    rows.push([item.category, item.name, r.start, getDisplayedLeft(item), vault[item.id] || 0, alloc.total, alloc.vault, alloc.available]);
  });
  const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
  downloadBlob(new Blob([csv], { type: "text/csv" }), "marathon-godsheet-materials.csv");
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function importSave(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!imported.state) throw new Error("Missing state");
      state = defaultState();
      materials.forEach(item => {
        if (imported.state[item.id]) state[item.id] = imported.state[item.id];
      });
      history = Array.isArray(imported.history) ? imported.history : [];
      vault = defaultVaultState();
      if (imported.vault && typeof imported.vault === "object") materials.forEach(item => { vault[item.id] = Math.max(0, Number(imported.vault[item.id] || 0)); });
      if (imported.upgrades && typeof upgradeState !== "undefined") {
        upgradeState = defaultUpgradeState();
        FACTIONS.forEach(faction => {
          faction.nodes.forEach(node => {
            const savedTier = Number(imported.upgrades?.[faction.id]?.[node.id]);
            if (Number.isFinite(savedTier)) {
              upgradeState[faction.id][node.id] = Math.max(0, Math.min(node.maxTier, savedTier));
            }
          });
        });
        saveUpgradeState();
        if (typeof upgradeAllocations !== "undefined") {
          upgradeAllocations = defaultUpgradeAllocations();
          if (imported.upgradeAllocations && typeof imported.upgradeAllocations === "object") {
            FACTIONS.forEach(faction => faction.nodes.forEach(node => {
              upgradeAllocations[faction.id][node.id] = imported.upgradeAllocations?.[faction.id]?.[node.id] || {};
            }));
          }
          migrateSelectedUpgradesIntoAllocations();
          saveUpgradeAllocations();
        }
        renderUpgradeTracker();
      }
      save();
      renderAll();
    } catch {
      alert("That save file could not be imported.");
    }
  };
  reader.readAsText(file);
}

function bindButtons() {
  document.getElementById("useBtn").addEventListener("click", () => applyTransaction("used"));
  document.getElementById("addBackBtn").addEventListener("click", () => applyTransaction("returned"));
  const exportSaveBtn = document.getElementById("exportSaveBtn");
  if (exportSaveBtn) exportSaveBtn.addEventListener("click", exportSave);
  const exportCsvBtn = document.getElementById("exportCsvBtn");
  if (exportCsvBtn) exportCsvBtn.addEventListener("click", exportCsv);
  const importSaveInput = document.getElementById("importSave");
  if (importSaveInput) importSaveInput.addEventListener("change", event => {
    const file = event.target.files[0];
    if (file) importSave(file);
    event.target.value = "";
  });
  document.getElementById("resetBtn").addEventListener("click", () => {
    if (!confirm("Reset all material totals and history?")) return;
    pushUndoSnapshot();
    state = defaultState();
    history = [];
    vault = defaultVaultState();
    if (typeof upgradeState !== "undefined") {
      upgradeState = defaultUpgradeState();
      saveUpgradeState();
    }
    if (typeof upgradeAllocations !== "undefined") {
      upgradeAllocations = defaultUpgradeAllocations();
      saveUpgradeAllocations();
    }
    save();
    if (upgradeTrackerReady) renderUpgradeTracker();
    renderAll();
  });
  amountInput.addEventListener("keydown", event => {
    if (event.key === "Enter") applyTransaction("used");
  });
}

renderTabs();
renderEntryDropdowns();
bindButtons();
renderAll();


// ------------------------------
// Upgrade Tracking - Faction Trees
// ------------------------------
const UPGRADE_STORAGE_KEY = "marathon-godsheet-v33-upgrades";
const FACTIONS = [
  {
    "id": "cyberacme",
    "name": "Cyberacme",
    "image": "assets/cyberacme-tree.png",
    "color": "#9cf000",
    "rgb": "156, 240, 0",
    "nodes": [
      {
        "id": "cyberacme-expansion",
        "name": "Expansion",
        "x": 30.15,
        "y": 7.05,
        "w": 10.25,
        "h": 14.65,
        "maxTier": 5,
        "costs": []
      },
      {
        "id": "cyberacme-informant",
        "name": "Informant.exe",
        "x": 43.35,
        "y": 10.05,
        "w": 6.05,
        "h": 9.1,
        "maxTier": 2,
        "costs": []
      },
      {
        "id": "cyberacme-credit-limit",
        "name": "Credit Limit",
        "x": 53.65,
        "y": 9.0,
        "w": 8.15,
        "h": 11.25,
        "maxTier": 5,
        "costs": []
      },
      {
        "id": "cyberacme-sponsorship",
        "name": "Sponsorship / Sponsored Kit [Cyberacme]",
        "x": 86.1,
        "y": 7.7,
        "w": 9.25,
        "h": 13.05,
        "maxTier": 2,
        "costs": [],
        "tierLabels": {
          "1": "Sponsorship",
          "2": "Sponsorship+"
        }
      },
      {
        "id": "cyberacme-carrier-barter",
        "name": "Carrier Barter",
        "x": 32.4,
        "y": 26.0,
        "w": 6.0,
        "h": 9.15,
        "maxTier": 1,
        "costs": [
          {
            "tier": 1,
            "material": "Biomass",
            "amount": 7
          },
          {
            "tier": 1,
            "material": "Gunmetal",
            "amount": 3
          }
        ]
      },
      {
        "id": "cyberacme-carrier-plus-barter",
        "name": "Carrier+ Barter",
        "x": 43.6,
        "y": 26.0,
        "w": 6.05,
        "h": 9.15,
        "maxTier": 1,
        "costs": [
          {
            "tier": 1,
            "material": "Diodes",
            "amount": 14
          },
          {
            "tier": 1,
            "material": "Biomass",
            "amount": 6
          }
        ]
      },
      {
        "id": "cyberacme-max-looter-barter",
        "name": "Max Looter Barter",
        "x": 54.45,
        "y": 26.05,
        "w": 6.15,
        "h": 9.25,
        "maxTier": 1,
        "costs": [
          {
            "tier": 1,
            "material": "Lead",
            "amount": 56
          },
          {
            "tier": 1,
            "material": "Gunmetal",
            "amount": 24
          }
        ]
      },
      {
        "id": "cyberacme-carrier",
        "name": "Carrier",
        "x": 30.95,
        "y": 39.55,
        "w": 9.0,
        "h": 13.35,
        "maxTier": 1,
        "costs": [
          {
            "tier": 1,
            "material": "Gel",
            "amount": 11
          },
          {
            "tier": 1,
            "material": "Diodes",
            "amount": 4
          }
        ]
      },
      {
        "id": "cyberacme-carrier-plus",
        "name": "Carrier+",
        "x": 42.3,
        "y": 39.55,
        "w": 9.05,
        "h": 13.35,
        "maxTier": 1,
        "costs": [
          {
            "tier": 1,
            "material": "Diodes",
            "amount": 21
          },
          {
            "tier": 1,
            "material": "Biomass",
            "amount": 9
          }
        ]
      },
      {
        "id": "cyberacme-vip-1",
        "name": "VIP Node 1",
        "x": 64.15,
        "y": 24.35,
        "w": 8.8,
        "h": 12.5,
        "maxTier": 1,
        "costs": [],
        "isVip": true,
        "tierLabels": {
          "1": "VIP 1"
        }
      },
      {
        "id": "cyberacme-vip-2",
        "name": "VIP Node 2",
        "x": 75.55,
        "y": 40.25,
        "w": 8.8,
        "h": 12.5,
        "maxTier": 1,
        "costs": [],
        "isVip": true,
        "tierLabels": {
          "1": "VIP 2"
        }
      },
      {
        "id": "cyberacme-locksmith-keymaker",
        "name": "Locksmith / Keymaker",
        "x": 30.35,
        "y": 57.15,
        "w": 8.35,
        "h": 10.45,
        "maxTier": 3,
        "costs": [
          {
            "tier": 2,
            "material": "Diodes",
            "amount": 14
          },
          {
            "tier": 2,
            "material": "Gel",
            "amount": 6
          },
          {
            "tier": 3,
            "material": "Gel",
            "amount": 56
          },
          {
            "tier": 3,
            "material": "Diodes",
            "amount": 24
          }
        ],
        "tierLabels": {
          "1": "Locksmith",
          "2": "Keymaker",
          "3": "Keymaker+"
        }
      },
      {
        "id": "cyberacme-vip-3",
        "name": "VIP Node 3",
        "x": 43.0,
        "y": 57.35,
        "w": 6.15,
        "h": 9.5,
        "maxTier": 1,
        "costs": [],
        "isVip": true,
        "tierLabels": {
          "1": "VIP 3"
        }
      },
      {
        "id": "cyberacme-implant-stock",
        "name": "Implant Stock",
        "x": 53.65,
        "y": 57.25,
        "w": 6.45,
        "h": 9.55,
        "maxTier": 2,
        "costs": []
      },
      {
        "id": "cyberacme-pinata",
        "name": "Pinata",
        "x": 63.65,
        "y": 56.8,
        "w": 8.95,
        "h": 10.6,
        "maxTier": 2,
        "costs": [
          {
            "tier": 1,
            "material": "Biomass",
            "amount": 10
          },
          {
            "tier": 2,
            "material": "Gel",
            "amount": 21
          },
          {
            "tier": 2,
            "material": "Diodes",
            "amount": 9
          }
        ]
      },
      {
        "id": "cyberacme-petty-theft",
        "name": "Petty Theft",
        "x": 75.25,
        "y": 56.8,
        "w": 8.15,
        "h": 10.6,
        "maxTier": 2,
        "costs": [
          {
            "tier": 1,
            "material": "Biomass",
            "amount": 10
          },
          {
            "tier": 2,
            "material": "Gel",
            "amount": 21
          },
          {
            "tier": 2,
            "material": "Diodes",
            "amount": 9
          }
        ]
      },
      {
        "id": "cyberacme-lucky-looter",
        "name": "Lucky Looter",
        "x": 86.45,
        "y": 56.5,
        "w": 8.7,
        "h": 11.1,
        "maxTier": 1,
        "costs": [
          {
            "tier": 1,
            "material": "Gel",
            "amount": 21
          },
          {
            "tier": 1,
            "material": "Diodes",
            "amount": 9
          }
        ]
      }
    ]
  },
  {
    "id": "nucaloric",
    "name": "Nucaloric",
    "image": "assets/nucaloric-tree.png",
    "color": "#ff2a94",
    "rgb": "255, 42, 148",
    "nodes": [
      {
        "id": "nucaloric-safeguard",
        "name": "Safeguard",
        "x": 31.35,
        "y": 10.57,
        "w": 6.17,
        "h": 9.35,
        "maxTier": 3,
        "costs": [
          {
            "tier": 1,
            "material": "Biomass",
            "amount": 10
          }
        ]
      },
      {
        "id": "nucaloric-advanced-shields",
        "name": "Advanced Shields",
        "x": 40.85,
        "y": 8.54,
        "w": 8.99,
        "h": 14.23,
        "maxTier": 3,
        "costs": [
          {
            "tier": 1,
            "material": "Sparkleaf",
            "amount": 12
          },
          {
            "tier": 1,
            "material": "Reclaimed Biostripping",
            "amount": 4
          }
        ]
      },
      {
        "id": "nucaloric-shield-stock",
        "name": "Shield Stock",
        "x": 52.42,
        "y": 10.57,
        "w": 6.42,
        "h": 9.35,
        "maxTier": 1,
        "costs": [
          {
            "tier": 1,
            "material": "Tarax Seed",
            "amount": 3
          },
          {
            "tier": 1,
            "material": "Reclaimed Biostripping",
            "amount": 19
          }
        ]
      },
      {
        "id": "nucaloric-panacea-kit",
        "name": "Panacea Kit",
        "x": 62.95,
        "y": 8.54,
        "w": 8.99,
        "h": 14.23,
        "maxTier": 1,
        "costs": [
          {
            "tier": 1,
            "material": "Tarax Seed",
            "amount": 9
          },
          {
            "tier": 1,
            "material": "Neurochem Pack",
            "amount": 4
          }
        ]
      },
      {
        "id": "nucaloric-vip-1",
        "name": "VIP Node 1",
        "x": 74.25,
        "y": 8.54,
        "w": 8.99,
        "h": 14.23,
        "maxTier": 1,
        "isVip": true,
        "tierLabels": {
          "1": "VIP 1"
        },
        "costs": []
      },
      {
        "id": "nucaloric-sponsorship",
        "name": "Sponsorship [Nucaloric]",
        "x": 84.53,
        "y": 8.54,
        "w": 8.22,
        "h": 13.82,
        "maxTier": 2,
        "costs": []
      },
      {
        "id": "nucaloric-restore",
        "name": "Restore",
        "x": 31.35,
        "y": 28.46,
        "w": 6.42,
        "h": 9.35,
        "maxTier": 3,
        "costs": [
          {
            "tier": 1,
            "material": "Biomass",
            "amount": 10
          }
        ]
      },
      {
        "id": "nucaloric-advanced-patch",
        "name": "Advanced Patch",
        "x": 40.85,
        "y": 26.02,
        "w": 8.99,
        "h": 13.41,
        "maxTier": 3,
        "costs": [
          {
            "tier": 1,
            "material": "Reclaimed Biostripping",
            "amount": 11
          },
          {
            "tier": 1,
            "material": "Sparkleaf",
            "amount": 5
          }
        ]
      },
      {
        "id": "nucaloric-patch-stock",
        "name": "Patch Stock",
        "x": 52.67,
        "y": 28.46,
        "w": 6.42,
        "h": 9.35,
        "maxTier": 1,
        "costs": [
          {
            "tier": 1,
            "material": "Tarax Seed",
            "amount": 4
          },
          {
            "tier": 1,
            "material": "Dermachem Pack",
            "amount": 17
          }
        ]
      },
      {
        "id": "nucaloric-self-revive",
        "name": "Self-Revive",
        "x": 62.69,
        "y": 26.02,
        "w": 8.99,
        "h": 13.41,
        "maxTier": 1,
        "costs": [
          {
            "tier": 1,
            "material": "Biolens Seed",
            "amount": 1
          },
          {
            "tier": 1,
            "material": "Neurochem Pack",
            "amount": 15
          }
        ]
      },
      {
        "id": "nucaloric-mercy-kit",
        "name": "Mercy Kit",
        "x": 74.77,
        "y": 28.46,
        "w": 6.17,
        "h": 9.35,
        "maxTier": 1,
        "costs": [
          {
            "tier": 1,
            "material": "Biomass",
            "amount": 17
          }
        ]
      },
      {
        "id": "nucaloric-shielded-armored-barter",
        "name": "Shielded / Armored Barter",
        "x": 84.79,
        "y": 26.02,
        "w": 8.22,
        "h": 14.23,
        "maxTier": 2,
        "tierLabels": {
          "1": "Shielded Barter",
          "2": "Armored Barter"
        },
        "costs": [
          {
            "tier": 1,
            "material": "Reclaimed Biostripping",
            "amount": 10
          },
          {
            "tier": 1,
            "material": "Sparkleaf",
            "amount": 4
          },
          {
            "tier": 2,
            "material": "Tarax Seed",
            "amount": 12
          },
          {
            "tier": 2,
            "material": "Neurochem Pack",
            "amount": 5
          }
        ]
      },
      {
        "id": "nucaloric-advanced-mch-os",
        "name": "Advanced MCH / Advanced OS",
        "x": 85.3,
        "y": 45.12,
        "w": 6.68,
        "h": 10.57,
        "maxTier": 2,
        "tierLabels": {
          "1": "Advanced MCH",
          "2": "Advanced OS"
        },
        "costs": [
          {
            "tier": 1,
            "material": "Biomass",
            "amount": 13
          },
          {
            "tier": 2,
            "material": "Biomass",
            "amount": 15
          }
        ]
      },
      {
        "id": "nucaloric-implant-stock",
        "name": "Implant Stock",
        "x": 31.35,
        "y": 45.53,
        "w": 6.42,
        "h": 10.16,
        "maxTier": 2,
        "costs": [
          {
            "tier": 1,
            "material": "Biomass",
            "amount": 22
          }
        ]
      },
      {
        "id": "nucaloric-second-wind",
        "name": "Second Wind",
        "x": 41.11,
        "y": 45.12,
        "w": 8.99,
        "h": 10.16,
        "maxTier": 4,
        "tierLabels": {
          "1": "Second Wind",
          "2": "Second Wind+",
          "3": "VIP 1",
          "4": "VIP 2"
        },
        "costs": [
          {
            "tier": 1,
            "material": "Biomass",
            "amount": 12
          },
          {
            "tier": 2,
            "material": "Sparkleaf",
            "amount": 29
          },
          {
            "tier": 2,
            "material": "Reclaimed Biostripping",
            "amount": 10
          },
          {
            "tier": 3,
            "vip": true
          },
          {
            "tier": 4,
            "vip": true
          }
        ]
      },
      {
        "id": "nucaloric-back-in-action",
        "name": "Back in Action",
        "x": 52.42,
        "y": 45.12,
        "w": 6.68,
        "h": 10.16,
        "maxTier": 4,
        "tierLabels": {
          "1": "Back in Action",
          "2": "Back in Action+",
          "3": "VIP 1",
          "4": "VIP 2"
        },
        "costs": [
          {
            "tier": 1,
            "material": "Biomass",
            "amount": 13
          },
          {
            "tier": 2,
            "material": "Tarax Seed",
            "amount": 3
          },
          {
            "tier": 2,
            "material": "Reclaimed Biostripping",
            "amount": 14
          },
          {
            "tier": 3,
            "vip": true
          },
          {
            "tier": 4,
            "vip": true
          }
        ]
      },
      {
        "id": "nucaloric-neural-stabilizer",
        "name": "Neural Stabilizer",
        "x": 62.95,
        "y": 45.12,
        "w": 6.94,
        "h": 10.16,
        "maxTier": 4,
        "tierLabels": {
          "1": "Neural Stabilizer",
          "2": "Neural Stabilizer+",
          "3": "VIP 1",
          "4": "VIP 2"
        },
        "costs": [
          {
            "tier": 1,
            "material": "Biomass",
            "amount": 15
          },
          {
            "tier": 2,
            "material": "Tarax Seed",
            "amount": 10
          },
          {
            "tier": 2,
            "material": "Neurochem Pack",
            "amount": 5
          },
          {
            "tier": 3,
            "vip": true
          },
          {
            "tier": 4,
            "vip": true
          }
        ]
      },
      {
        "id": "nucaloric-shielded-armored",
        "name": "Shielded / Armored",
        "x": 74.61,
        "y": 45.12,
        "w": 6.17,
        "h": 10.16,
        "maxTier": 2,
        "tierLabels": {
          "1": "Shielded",
          "2": "Armored"
        },
        "costs": [
          {
            "tier": 1,
            "material": "Sparkleaf",
            "amount": 17
          },
          {
            "tier": 1,
            "material": "Reclaimed Biostripping",
            "amount": 6
          },
          {
            "tier": 2,
            "material": "Biolens Seed",
            "amount": 1
          },
          {
            "tier": 2,
            "material": "Neurochem Pack",
            "amount": 15
          }
        ]
      },
      {
        "id": "nucaloric-evasive-maneuvers",
        "name": "Evasive Maneuvers",
        "x": 40.45,
        "y": 58.85,
        "w": 9.05,
        "h": 16.1,
        "maxTier": 3,
        "tierLabels": {
          "2": "VIP 1",
          "3": "VIP 2"
        },
        "costs": [
          {
            "tier": 1,
            "material": "Strerilized Biostripping",
            "amount": 9
          },
          {
            "tier": 1,
            "material": "Neurochem Pack",
            "amount": 6
          },
          {
            "tier": 2,
            "vip": true
          },
          {
            "tier": 3,
            "vip": true
          }
        ]
      },
      {
        "id": "nucaloric-escape-artist",
        "name": "Escape Artist",
        "x": 51.65,
        "y": 58.85,
        "w": 9.05,
        "h": 16.1,
        "maxTier": 3,
        "tierLabels": {
          "2": "VIP 1",
          "3": "VIP 2"
        },
        "costs": [
          {
            "tier": 1,
            "material": "Strerilized Biostripping",
            "amount": 10
          },
          {
            "tier": 1,
            "material": "Neurochem Pack",
            "amount": 8
          },
          {
            "tier": 2,
            "vip": true
          },
          {
            "tier": 3,
            "vip": true
          }
        ]
      },
      {
        "id": "nucaloric-counterintel",
        "name": "Counterintel",
        "x": 62.75,
        "y": 58.85,
        "w": 9.05,
        "h": 16.1,
        "maxTier": 3,
        "tierLabels": {
          "2": "VIP 1",
          "3": "VIP 2"
        },
        "costs": [
          {
            "tier": 1,
            "material": "Nueral Insulation",
            "amount": 1
          },
          {
            "tier": 1,
            "material": "Strerilized Biostripping",
            "amount": 18
          },
          {
            "tier": 2,
            "vip": true
          },
          {
            "tier": 3,
            "vip": true
          }
        ]
      },
      {
        "id": "nucaloric-anti-virus-packs",
        "name": "Anti-Virus Packs",
        "x": 74.85,
        "y": 64.9,
        "w": 6.45,
        "h": 10.35,
        "maxTier": 1,
        "costs": [
          {
            "tier": 1,
            "material": "Sparkleaf",
            "amount": 12
          },
          {
            "tier": 1,
            "material": "Reclaimed Biostripping",
            "amount": 4
          }
        ]
      },
      {
        "id": "nucaloric-signal-jammer",
        "name": "Signal Jammer",
        "x": 86.2,
        "y": 64.9,
        "w": 6.75,
        "h": 10.35,
        "maxTier": 1,
        "costs": [
          {
            "tier": 1,
            "material": "Reclaimed Biostripping",
            "amount": 12
          },
          {
            "tier": 1,
            "material": "Sparkleaf",
            "amount": 7
          }
        ]
      }
    ]
  },
  {
    "id": "traxus",
    "name": "Traxus",
    "image": "assets/traxus-tree.png",
    "color": "#ff8500",
    "rgb": "255, 133, 0",
    "nodes": [
      {
        "id": "traxus-overrun",
        "name": "Overrun",
        "x": 31.7,
        "y": 10.5,
        "w": 6.25,
        "h": 10.0,
        "maxTier": 1,
        "costs": [
          {
            "tier": 1,
            "material": "Unstable Gunmetal",
            "amount": 10
          }
        ]
      },
      {
        "id": "traxus-retaliator",
        "name": "Retaliator",
        "x": 42.65,
        "y": 10.5,
        "w": 6.25,
        "h": 10.0,
        "maxTier": 1,
        "costs": [
          {
            "tier": 1,
            "material": "Unstable Gunmetal",
            "amount": 17
          }
        ]
      },
      {
        "id": "traxus-v75-scar",
        "name": "V75 SCAR",
        "x": 53.65,
        "y": 10.5,
        "w": 6.25,
        "h": 10.0,
        "maxTier": 1,
        "costs": [
          {
            "tier": 1,
            "material": "Plasma Filament",
            "amount": 12
          },
          {
            "tier": 1,
            "material": "Deimosite Rods",
            "amount": 6
          }
        ]
      },
      {
        "id": "traxus-kkv-9sd",
        "name": "KKV-9SD",
        "x": 64.65,
        "y": 10.5,
        "w": 6.25,
        "h": 10.0,
        "maxTier": 1,
        "costs": [
          {
            "tier": 1,
            "material": "Plasma Filament",
            "amount": 23
          },
          {
            "tier": 1,
            "material": "Deimosite Rods",
            "amount": 11
          }
        ]
      },
      {
        "id": "traxus-vip-1",
        "name": "VIP Node 1",
        "x": 75.8,
        "y": 10.2,
        "w": 8.1,
        "h": 11.6,
        "maxTier": 1,
        "isVip": true,
        "tierLabels": {
          "1": "VIP 1"
        },
        "costs": []
      },
      {
        "id": "traxus-vip-2",
        "name": "VIP Node 2",
        "x": 86.9,
        "y": 10.2,
        "w": 7.6,
        "h": 11.6,
        "maxTier": 1,
        "isVip": true,
        "tierLabels": {
          "1": "VIP 2"
        },
        "costs": []
      },
      {
        "id": "traxus-vip-3",
        "name": "VIP Node 3",
        "x": 31.7,
        "y": 28.7,
        "w": 6.3,
        "h": 10.5,
        "maxTier": 1,
        "isVip": true,
        "tierLabels": {
          "1": "VIP 3"
        },
        "costs": []
      },
      {
        "id": "traxus-enhanced-chips",
        "name": "Enhanced Chips",
        "x": 53.65,
        "y": 28.7,
        "w": 6.4,
        "h": 10.5,
        "maxTier": 1,
        "costs": [
          {
            "tier": 1,
            "material": "Unstable Gunmetal",
            "amount": 13
          }
        ]
      },
      {
        "id": "traxus-deluxe-chips",
        "name": "Deluxe Chips",
        "x": 42.65,
        "y": 28.7,
        "w": 6.4,
        "h": 10.5,
        "maxTier": 1,
        "costs": [
          {
            "tier": 1,
            "material": "Anomalous Wire",
            "amount": 5
          },
          {
            "tier": 1,
            "material": "Deimosite Rods",
            "amount": 13
          }
        ]
      },
      {
        "id": "traxus-sponsorship",
        "name": "Sponsorship [Traxus]",
        "x": 85.2,
        "y": 25.3,
        "w": 9.4,
        "h": 15.8,
        "maxTier": 2,
        "costs": []
      },
      {
        "id": "traxus-vip-4",
        "name": "VIP Node 4",
        "x": 31.7,
        "y": 46.3,
        "w": 6.3,
        "h": 10.5,
        "maxTier": 1,
        "isVip": true,
        "tierLabels": {
          "1": "VIP 4"
        },
        "costs": []
      },
      {
        "id": "traxus-enhanced-mags",
        "name": "Enhanced Mags",
        "x": 53.65,
        "y": 46.0,
        "w": 7.0,
        "h": 10.7,
        "maxTier": 1,
        "costs": [
          {
            "tier": 1,
            "material": "Unstable Gunmetal",
            "amount": 10
          }
        ]
      },
      {
        "id": "traxus-deluxe-mags",
        "name": "Deluxe Mags",
        "x": 42.5,
        "y": 46.0,
        "w": 6.5,
        "h": 10.7,
        "maxTier": 1,
        "costs": [
          {
            "tier": 1,
            "material": "Tachyon Filament",
            "amount": 4
          },
          {
            "tier": 1,
            "material": "Deimosite Rods",
            "amount": 9
          }
        ]
      },
      {
        "id": "traxus-enhanced-muzzles",
        "name": "Enhanced Muzzles",
        "x": 64.65,
        "y": 46.0,
        "w": 6.5,
        "h": 10.7,
        "maxTier": 1,
        "costs": [
          {
            "tier": 1,
            "material": "Unstable Gunmetal",
            "amount": 20
          }
        ]
      },
      {
        "id": "traxus-deluxe-muzzles",
        "name": "Deluxe Muzzles",
        "x": 75.7,
        "y": 46.0,
        "w": 6.5,
        "h": 10.7,
        "maxTier": 1,
        "costs": [
          {
            "tier": 1,
            "material": "Tachyon Filament",
            "amount": 8
          },
          {
            "tier": 1,
            "material": "Cetinite Rods",
            "amount": 3
          }
        ]
      },
      {
        "id": "traxus-vip-5",
        "name": "VIP Node 5",
        "x": 86.9,
        "y": 46.3,
        "w": 7.6,
        "h": 10.5,
        "maxTier": 1,
        "isVip": true,
        "tierLabels": {
          "1": "VIP 5"
        },
        "costs": []
      },
      {
        "id": "traxus-vip-6",
        "name": "VIP Node 6",
        "x": 31.7,
        "y": 63.8,
        "w": 6.3,
        "h": 10.3,
        "maxTier": 1,
        "isVip": true,
        "tierLabels": {
          "1": "VIP 6"
        },
        "costs": []
      },
      {
        "id": "traxus-enhanced-optics",
        "name": "Enhanced Optics",
        "x": 53.65,
        "y": 63.6,
        "w": 7.0,
        "h": 10.5,
        "maxTier": 1,
        "costs": [
          {
            "tier": 1,
            "material": "Unstable Gunmetal",
            "amount": 29
          }
        ]
      },
      {
        "id": "traxus-deluxe-optics",
        "name": "Deluxe Optics",
        "x": 42.5,
        "y": 63.6,
        "w": 6.5,
        "h": 10.5,
        "maxTier": 1,
        "costs": [
          {
            "tier": 1,
            "material": "Anomalous Wire",
            "amount": 10
          },
          {
            "tier": 1,
            "material": "Cetinite Rods",
            "amount": 3
          }
        ]
      },
      {
        "id": "traxus-enhanced-specialty-mods",
        "name": "Enhanced Specialty Mods",
        "x": 64.65,
        "y": 63.6,
        "w": 6.5,
        "h": 10.5,
        "maxTier": 1,
        "costs": [
          {
            "tier": 1,
            "material": "Altered Wire",
            "amount": 16
          },
          {
            "tier": 1,
            "material": "Deimosite Rods",
            "amount": 7
          }
        ]
      },
      {
        "id": "traxus-deluxe-specialty-mods",
        "name": "Deluxe Specialty Mods",
        "x": 75.7,
        "y": 63.6,
        "w": 6.5,
        "h": 10.5,
        "maxTier": 1,
        "costs": [
          {
            "tier": 1,
            "material": "Predictive Framework",
            "amount": 1
          },
          {
            "tier": 1,
            "material": "Ballistic Turbine",
            "amount": 1
          }
        ]
      },
      {
        "id": "traxus-vip-7",
        "name": "VIP Node 7",
        "x": 86.9,
        "y": 63.8,
        "w": 7.6,
        "h": 10.3,
        "maxTier": 1,
        "isVip": true,
        "tierLabels": {
          "1": "VIP 7"
        },
        "costs": []
      }
    ]
  },
  {
    "id": "mida",
    "name": "Mida",
    "image": "assets/mida-tree.png",
    "color": "#d178ff",
    "rgb": "209, 120, 255",
    "nodes": [
      {
        "id": "mida-hot-potato",
        "name": "Hot Potato",
        "x": 32.35,
        "y": 9.75,
        "w": 6.45,
        "h": 10.15,
        "maxTier": 1,
        "costs": [
          {"tier": 1, "material": "Unstable Lead", "amount": 10}
        ]
      },
      {
        "id": "mida-explosives",
        "name": "Explosives",
        "x": 43.05,
        "y": 9.95,
        "w": 7.05,
        "h": 9.85,
        "maxTier": 1,
        "costs": [
          {"tier": 1, "material": "Dynamic Compounds", "amount": 16},
          {"tier": 1, "material": "Surveillance Lens", "amount": 4}
        ]
      },
      {
        "id": "mida-lights-out",
        "name": "Lights Out",
        "x": 53.7,
        "y": 9.25,
        "w": 8.85,
        "h": 14.55,
        "maxTier": 1,
        "costs": [
          {"tier": 1, "material": "Thoughtwave Lens", "amount": 3},
          {"tier": 1, "material": "Dynamic Compounds", "amount": 14}
        ]
      },
      {
        "id": "mida-equipment",
        "name": "Equipment",
        "x": 65.45,
        "y": 10.2,
        "w": 6.85,
        "h": 10.6,
        "maxTier": 2,
        "tierLabels": {"1": "Equipment", "2": "Equipment+"},
        "costs": [
          {"tier": 1, "material": "Surveillance Lens", "amount": 17},
          {"tier": 1, "material": "Dynamic Compounds", "amount": 6},
          {"tier": 2, "material": "Thoughtwave Lens", "amount": 4},
          {"tier": 2, "material": "Dynamic Compounds", "amount": 17}
        ]
      },
      {
        "id": "mida-sponsorship",
        "name": "Sponsorship [Mida]",
        "x": 86.25,
        "y": 8.65,
        "w": 8.95,
        "h": 13.95,
        "maxTier": 2,
        "tierLabels": {"1": "Sponsorship", "2": "Sponsorship+"},
        "costs": []
      },
      {
        "id": "mida-bullseye",
        "name": "Bullseye",
        "x": 32.45,
        "y": 26.3,
        "w": 6.3,
        "h": 11.75,
        "maxTier": 1,
        "costs": [
          {"tier": 1, "material": "Unstable Lead", "amount": 20}
        ]
      },
      {
        "id": "mida-chemist",
        "name": "Chemist",
        "x": 31.05,
        "y": 42.95,
        "w": 9.25,
        "h": 13.95,
        "maxTier": 1,
        "costs": [
          {"tier": 1, "material": "Volatile Compunds", "amount": 29},
          {"tier": 1, "material": "Surveillance Lens", "amount": 4}
        ]
      },
      {
        "id": "mida-eyes-open",
        "name": "Eyes Open",
        "x": 43.8,
        "y": 45.45,
        "w": 6.25,
        "h": 9.75,
        "maxTier": 1,
        "costs": [
          {"tier": 1, "material": "Unstable Lead", "amount": 17}
        ]
      },
      {
        "id": "mida-implant-stock",
        "name": "Implant Stock",
        "x": 54.55,
        "y": 27.25,
        "w": 6.7,
        "h": 10.55,
        "maxTier": 2,
        "tierLabels": {"1": "Implant Stock", "2": "Implant Stock+"},
        "costs": [
          {"tier": 1, "material": "Unstable Lead", "amount": 28},
          {"tier": 2, "material": "Volatile Compunds", "amount": 3},
          {"tier": 2, "material": "Surveillance Lens", "amount": 23}
        ]
      },
      {
        "id": "mida-explosive-resistance",
        "name": "Explosive Resistance",
        "x": 65.55,
        "y": 27.15,
        "w": 8.45,
        "h": 10.65,
        "maxTier": 4,
        "tierLabels": {"1": "Explosive Resistance", "2": "Explosive Resistance+", "3": "VIP 1", "4": "VIP 2"},
        "costs": [
          {"tier": 1, "material": "Unstable Lead", "amount": 12},
          {"tier": 2, "material": "Surveillance Lens", "amount": 22},
          {"tier": 2, "material": "Dynamic Compounds", "amount": 8},
          {"tier": 3, "vip": true},
          {"tier": 4, "vip": true}
        ]
      },
      {
        "id": "mida-ballistic-resistance",
        "name": "Ballistic Resistance",
        "x": 76.9,
        "y": 27.15,
        "w": 8.45,
        "h": 10.65,
        "maxTier": 4,
        "tierLabels": {"1": "Ballistic Resistance", "2": "Ballistic Resistance+", "3": "VIP 1", "4": "VIP 2"},
        "costs": [
          {"tier": 1, "material": "Unstable Lead", "amount": 13},
          {"tier": 2, "material": "Dynamic Compounds", "amount": 23},
          {"tier": 2, "material": "Surveillance Lens", "amount": 12},
          {"tier": 3, "vip": true},
          {"tier": 4, "vip": true}
        ]
      },
      {
        "id": "mida-volt-resistance",
        "name": "Volt Resistance",
        "x": 87.65,
        "y": 27.15,
        "w": 6.9,
        "h": 10.65,
        "maxTier": 4,
        "tierLabels": {"1": "Volt Resistance", "2": "Volt Resistance+", "3": "VIP 1", "4": "VIP 2"},
        "costs": [
          {"tier": 1, "material": "Unstable Lead", "amount": 15},
          {"tier": 2, "material": "Thoughtwave Lens", "amount": 3},
          {"tier": 2, "material": "Dynamic Compounds", "amount": 19},
          {"tier": 3, "vip": true},
          {"tier": 4, "vip": true}
        ]
      },
      {
        "id": "mida-divebomb",
        "name": "Divebomb",
        "x": 65.45,
        "y": 44.85,
        "w": 8.45,
        "h": 13.7,
        "maxTier": 3,
        "tierLabels": {"1": "Divebomb", "2": "VIP 1", "3": "VIP 2"},
        "costs": [
          {"tier": 1, "material": "Thoughtwave Lens", "amount": 12},
          {"tier": 1, "material": "Volatile Compunds", "amount": 5},
          {"tier": 2, "vip": true},
          {"tier": 3, "vip": true}
        ]
      },
      {
        "id": "mida-impact-ping",
        "name": "Impact Ping",
        "x": 76.9,
        "y": 44.85,
        "w": 8.45,
        "h": 13.7,
        "maxTier": 3,
        "tierLabels": {"1": "Impact Ping", "2": "VIP 1", "3": "VIP 2"},
        "costs": [
          {"tier": 1, "material": "Volatile Compunds", "amount": 10},
          {"tier": 1, "material": "Thoughtwave Lens", "amount": 8},
          {"tier": 2, "vip": true},
          {"tier": 3, "vip": true}
        ]
      },
      {
        "id": "mida-covert-recovery",
        "name": "Covert Recovery",
        "x": 87.65,
        "y": 44.85,
        "w": 6.9,
        "h": 13.7,
        "maxTier": 3,
        "tierLabels": {"1": "Covert Recovery", "2": "VIP 1", "3": "VIP 2"},
        "costs": [
          {"tier": 1, "material": "Biolens Seed", "amount": 1},
          {"tier": 1, "material": "Volatile Compunds", "amount": 15},
          {"tier": 2, "vip": true},
          {"tier": 3, "vip": true}
        ]
      },
      {
        "id": "mida-equipment-stock",
        "name": "Equipment Stock",
        "x": 32.35,
        "y": 61.45,
        "w": 6.3,
        "h": 9.85,
        "maxTier": 1,
        "costs": [
          {"tier": 1, "material": "Volatile Compunds", "amount": 6},
          {"tier": 1, "material": "Thoughtwave Lens", "amount": 5}
        ]
      },
      {
        "id": "mida-vip-1",
        "name": "VIP Node 1",
        "x": 42.9,
        "y": 61.2,
        "w": 6.25,
        "h": 10.2,
        "maxTier": 1,
        "isVip": true,
        "tierLabels": {"1": "VIP 1"},
        "costs": []
      },
      {
        "id": "mida-spare-rounds",
        "name": "Spare Rounds",
        "x": 54.65,
        "y": 61.6,
        "w": 6.85,
        "h": 10.1,
        "maxTier": 2,
        "tierLabels": {"1": "Spare Rounds", "2": "Spare Rounds+"},
        "costs": [
          {"tier": 1, "material": "Unstable Lead", "amount": 10},
          {"tier": 2, "material": "Surveillance Lens", "amount": 22},
          {"tier": 2, "material": "Dynamic Compounds", "amount": 8}
        ]
      },
      {
        "id": "mida-sensor-case",
        "name": "Sensor Case / Grenade Case",
        "x": 64.25,
        "y": 60.45,
        "w": 9.35,
        "h": 13.95,
        "maxTier": 3,
        "tierLabels": {"1": "Sensor Case", "2": "Grenade Case", "3": "VIP 1"},
        "costs": [
          {"tier": 1, "material": "Unstable Lead", "amount": 26},
          {"tier": 2, "material": "Ballistic Turbine", "amount": 1},
          {"tier": 2, "material": "Thoughtwave Lens", "amount": 18},
          {"tier": 3, "vip": true}
        ]
      },
      {
        "id": "mida-cardio-barter",
        "name": "Cardio Barter",
        "x": 77.65,
        "y": 62.95,
        "w": 6.45,
        "h": 9.8,
        "maxTier": 1,
        "costs": [
          {"tier": 1, "material": "Unstable Lead", "amount": 22}
        ]
      },
      {
        "id": "mida-cardio-kick",
        "name": "Cardio Kick",
        "x": 87.65,
        "y": 62.95,
        "w": 6.45,
        "h": 9.8,
        "maxTier": 1,
        "costs": [
          {"tier": 1, "material": "Dynamic Compounds", "amount": 21},
          {"tier": 1, "material": "Surveillance Lens", "amount": 5}
        ]
      }
    ]
  },
  {
    "id": "arachne",
    "name": "Arachne",
    "image": "assets/arachne-tree.png",
    "color": "#ff1717",
    "rgb": "255, 23, 23",
    "nodes": [
      {
        "id": "arachne-twin-tap-exchange",
        "name": "Twin Tap Exchange",
        "x": 30.1,
        "y": 7.85,
        "w": 8.65,
        "h": 12.8,
        "maxTier": 1,
        "costs": [
          {
            "tier": 1,
            "material": "Unstable Gel",
            "amount": 10
          }
        ]
      },
      {
        "id": "arachne-mpps-railgun",
        "name": "MPPS Railgun",
        "x": 41.0,
        "y": 8.45,
        "w": 8.65,
        "h": 11.8,
        "maxTier": 1,
        "costs": [
          {
            "tier": 1,
            "material": "Unstable Gel",
            "amount": 20
          }
        ]
      },
      {
        "id": "arachne-weapons",
        "name": "Weapons",
        "x": 53.0,
        "y": 9.35,
        "w": 6.15,
        "h": 8.75,
        "maxTier": 1,
        "costs": [
          {
            "tier": 1,
            "material": "Unstable Gel",
            "amount": 20
          }
        ]
      },
      {
        "id": "arachne-upped-arsenal",
        "name": "Upped Arsenal+",
        "x": 63.75,
        "y": 8.7,
        "w": 6.75,
        "h": 10.25,
        "maxTier": 3,
        "costs": [
          {
            "tier": 1,
            "material": "Drone Node",
            "amount": 20
          },
          {
            "tier": 1,
            "material": "Drone Resin",
            "amount": 6
          },
          {
            "tier": 2,
            "material": "Biomata Node",
            "amount": 6
          },
          {
            "tier": 2,
            "material": "Drone Resin",
            "amount": 24
          },
          {
            "tier": 3,
            "material": "Enzyme Replicator",
            "amount": 1
          },
          {
            "tier": 3,
            "material": "Biomata Resin",
            "amount": 15
          }
        ],
        "tierLabels": {
          "1": "Upped Arsenal",
          "2": "Upped Arsenal+",
          "3": "Upped Arsenal++"
        }
      },
      {
        "id": "arachne-deployables",
        "name": "Deployables",
        "x": 74.55,
        "y": 9.8,
        "w": 5.8,
        "h": 9.0,
        "maxTier": 1,
        "costs": [
          {
            "tier": 1,
            "material": "Biomata Resin",
            "amount": 3
          },
          {
            "tier": 1,
            "material": "Drone Node",
            "amount": 23
          }
        ]
      },
      {
        "id": "arachne-sponsorship",
        "name": "Sponsorship+ [Arachne]",
        "x": 84.05,
        "y": 7.8,
        "w": 9.15,
        "h": 13.4,
        "maxTier": 2,
        "costs": [],
        "tierLabels": {
          "1": "Sponsorship",
          "2": "Sponsorship+"
        }
      },
      {
        "id": "arachne-precision-mods",
        "name": "Precision Mods+",
        "x": 31.25,
        "y": 27.5,
        "w": 6.05,
        "h": 9.1,
        "maxTier": 3,
        "costs": [
          {
            "tier": 1,
            "material": "Unstable Gel",
            "amount": 10
          },
          {
            "tier": 2,
            "material": "Biomata Resin",
            "amount": 4
          },
          {
            "tier": 2,
            "material": "Drone Node",
            "amount": 29
          },
          {
            "tier": 3,
            "material": "Biomata Resin",
            "amount": 8
          },
          {
            "tier": 3,
            "material": "Biomata Node",
            "amount": 6
          }
        ],
        "tierLabels": {
          "1": "Precision Mods",
          "2": "Precision Mods+",
          "3": "Precision Mods++"
        }
      },
      {
        "id": "arachne-railgun-mods",
        "name": "Railgun Mods+",
        "x": 42.25,
        "y": 27.7,
        "w": 6.05,
        "h": 9.1,
        "maxTier": 3,
        "costs": [
          {
            "tier": 1,
            "material": "Unstable Gel",
            "amount": 17
          },
          {
            "tier": 2,
            "material": "Biomata Node",
            "amount": 6
          },
          {
            "tier": 2,
            "material": "Drone Resin",
            "amount": 24
          },
          {
            "tier": 3,
            "material": "Biomata Node",
            "amount": 10
          },
          {
            "tier": 3,
            "material": "Biomata Resin",
            "amount": 5
          }
        ],
        "tierLabels": {
          "1": "Railgun Mods",
          "2": "Railgun Mods+",
          "3": "Railgun Mods++"
        }
      },
      {
        "id": "arachne-bolstered-arms",
        "name": "Bolstered Arms+",
        "x": 53.05,
        "y": 27.7,
        "w": 6.05,
        "h": 9.1,
        "maxTier": 2,
        "costs": [
          {
            "tier": 1,
            "material": "Unstable Gel",
            "amount": 29
          },
          {
            "tier": 2,
            "material": "Biomata Node",
            "amount": 3
          },
          {
            "tier": 2,
            "material": "Drone Resin",
            "amount": 14
          }
        ],
        "tierLabels": {
          "1": "Bolstered Arms",
          "2": "Bolstered Arms+"
        }
      },
      {
        "id": "arachne-vip-star-1",
        "name": "VIP Node 1",
        "x": 62.65,
        "y": 25.7,
        "w": 8.9,
        "h": 12.7,
        "maxTier": 1,
        "isVip": true,
        "tierLabels": {
          "1": "VIP 1"
        },
        "costs": []
      },
      {
        "id": "arachne-frost-mine",
        "name": "Frost Mine",
        "x": 73.45,
        "y": 25.9,
        "w": 8.55,
        "h": 13.2,
        "maxTier": 1,
        "costs": [
          {
            "tier": 1,
            "material": "Unstable Gel",
            "amount": 22
          }
        ]
      },
      {
        "id": "arachne-got-em",
        "name": "Got Em",
        "x": 84.35,
        "y": 26.05,
        "w": 8.65,
        "h": 13.0,
        "maxTier": 1,
        "costs": [
          {
            "tier": 1,
            "material": "Drone Node",
            "amount": 12
          },
          {
            "tier": 1,
            "material": "Drone Resin",
            "amount": 4
          }
        ]
      },
      {
        "id": "arachne-mod-stock",
        "name": "Mod Stock+",
        "x": 31.25,
        "y": 44.9,
        "w": 6.05,
        "h": 9.2,
        "maxTier": 2,
        "costs": [
          {
            "tier": 1,
            "material": "Unstable Gel",
            "amount": 26
          },
          {
            "tier": 2,
            "material": "Drone Resin",
            "amount": 15
          },
          {
            "tier": 2,
            "material": "Drone Node",
            "amount": 9
          }
        ],
        "tierLabels": {
          "1": "Mod Stock",
          "2": "Mod Stock+"
        }
      },
      {
        "id": "arachne-implant-stock",
        "name": "Implant Stock",
        "x": 53.05,
        "y": 44.9,
        "w": 6.25,
        "h": 9.4,
        "maxTier": 2,
        "costs": [
          {
            "tier": 1,
            "material": "Unstable Gel",
            "amount": 26
          },
          {
            "tier": 2,
            "material": "Biomata Resin",
            "amount": 3
          },
          {
            "tier": 2,
            "material": "Drone Node",
            "amount": 23
          }
        ],
        "tierLabels": {
          "1": "Implant Stock",
          "2": "Implant Stock+"
        }
      },
      {
        "id": "arachne-edge-runner",
        "name": "Edge//Runner",
        "x": 64.05,
        "y": 44.2,
        "w": 8.65,
        "h": 10.3,
        "maxTier": 4,
        "costs": [
          {
            "tier": 1,
            "material": "Unstable Gel",
            "amount": 12
          },
          {
            "tier": 2,
            "material": "Drone Node",
            "amount": 29
          },
          {
            "tier": 2,
            "material": "Drone Resin",
            "amount": 10
          },
          {
            "tier": 3,
            "vip": true
          },
          {
            "tier": 4,
            "vip": true
          }
        ],
        "tierLabels": {
          "1": "Edge//Runner",
          "2": "Edge//Runner+",
          "3": "VIP 1",
          "4": "VIP 2"
        }
      },
      {
        "id": "arachne-parting-gift",
        "name": "Parting Gift",
        "x": 75.55,
        "y": 44.9,
        "w": 6.35,
        "h": 9.5,
        "maxTier": 1,
        "costs": [
          {
            "tier": 1,
            "material": "Unstable Gel",
            "amount": 13
          }
        ]
      },
      {
        "id": "arachne-tox-injectors",
        "name": "Tox Injectors",
        "x": 86.55,
        "y": 44.9,
        "w": 6.35,
        "h": 9.5,
        "maxTier": 2,
        "costs": [
          {
            "tier": 1,
            "material": "Unstable Gel",
            "amount": 15
          },
          {
            "tier": 2,
            "material": "Biomata Node",
            "amount": 3
          },
          {
            "tier": 2,
            "material": "Drone Resin",
            "amount": 19
          }
        ],
        "tierLabels": {
          "1": "Tox Injectors",
          "2": "Tox Injectors+"
        }
      },
      {
        "id": "arachne-weapon-mods",
        "name": "Weapon Mods+",
        "x": 31.25,
        "y": 61.95,
        "w": 6.05,
        "h": 9.2,
        "maxTier": 3,
        "costs": [
          {
            "tier": 1,
            "material": "Drone Resin",
            "amount": 11
          },
          {
            "tier": 1,
            "material": "Drone Node",
            "amount": 5
          },
          {
            "tier": 2,
            "material": "Biomata Resin",
            "amount": 3
          },
          {
            "tier": 2,
            "material": "Drone Node",
            "amount": 32
          },
          {
            "tier": 3,
            "material": "Reflex Coil",
            "amount": 1
          },
          {
            "tier": 3,
            "material": "Biomata Node",
            "amount": 18
          }
        ],
        "tierLabels": {
          "1": "Weapon Mods",
          "2": "Weapon Mods+",
          "3": "Weapon Mods++"
        }
      },
      {
        "id": "arachne-fight-club",
        "name": "Fight Club",
        "x": 62.1,
        "y": 60.8,
        "w": 9.05,
        "h": 13.4,
        "maxTier": 1,
        "costs": [
          {
            "tier": 1,
            "material": "Biomata Resin",
            "amount": 9
          },
          {
            "tier": 1,
            "material": "Biomata Node",
            "amount": 6
          }
        ]
      },
      {
        "id": "arachne-frenzy",
        "name": "Frenzy",
        "x": 73.45,
        "y": 60.9,
        "w": 9.0,
        "h": 13.3,
        "maxTier": 1,
        "costs": [
          {
            "tier": 1,
            "material": "Biomata Resin",
            "amount": 10
          },
          {
            "tier": 1,
            "material": "Biomata Node",
            "amount": 8
          }
        ]
      },
      {
        "id": "arachne-immune-response",
        "name": "Immune Response",
        "x": 84.35,
        "y": 60.9,
        "w": 9.0,
        "h": 13.3,
        "maxTier": 1,
        "costs": [
          {
            "tier": 1,
            "material": "Reflex Coil",
            "amount": 1
          },
          {
            "tier": 1,
            "material": "Biomata Node",
            "amount": 18
          }
        ]
      }
    ]
  },
  {
    "id": "sekiguchi",
    "name": "Sekiguchi",
    "image": "assets/sekiguchi-tree.png",
    "color": "#86ffd1",
    "rgb": "134, 255, 209",
    "nodes": [
      {
        "id": "sekiguchi-energy-amp-barter",
        "name": "Energy Amp Barter",
        "x": 32.19,
        "y": 11.47,
        "w": 6.49,
        "h": 10.24,
        "maxTier": 1,
        "costs": [
          {
            "tier": 1,
            "material": "Unstable Diode",
            "amount": 22
          }
        ]
      },
      {
        "id": "sekiguchi-energy-amp",
        "name": "Energy Amp",
        "x": 43.35,
        "y": 9.83,
        "w": 9.35,
        "h": 13.92,
        "maxTier": 1,
        "costs": [
          {
            "tier": 1,
            "material": "Storage Drive",
            "amount": 23
          },
          {
            "tier": 1,
            "material": "Fractal Circuit",
            "amount": 12
          }
        ]
      },
      {
        "id": "sekiguchi-sponsorship",
        "name": "Sponsorship+ [Sekiguchi]",
        "x": 86.19,
        "y": 9.83,
        "w": 8.83,
        "h": 13.92,
        "maxTier": 2,
        "costs": [],
        "tierLabels": {
          "1": "Sponsorship",
          "2": "Sponsorship+"
        }
      },
      {
        "id": "sekiguchi-momentum",
        "name": "Momentum",
        "x": 32.19,
        "y": 29.07,
        "w": 6.75,
        "h": 11.06,
        "maxTier": 1,
        "costs": [
          {
            "tier": 1,
            "material": "Unstable Diode",
            "amount": 17
          }
        ]
      },
      {
        "id": "sekiguchi-overwatch",
        "name": "Overwatch",
        "x": 43.35,
        "y": 29.07,
        "w": 6.75,
        "h": 11.06,
        "maxTier": 1,
        "costs": [
          {
            "tier": 1,
            "material": "Unstable Diode",
            "amount": 17
          }
        ]
      },
      {
        "id": "sekiguchi-role-player",
        "name": "Role Player",
        "x": 54.52,
        "y": 29.07,
        "w": 6.75,
        "h": 11.06,
        "maxTier": 1,
        "costs": [
          {
            "tier": 1,
            "material": "Unstable Diode",
            "amount": 17
          }
        ]
      },
      {
        "id": "sekiguchi-cradle-efficiency",
        "name": "Cradle Efficiency+",
        "x": 75.8,
        "y": 26.62,
        "w": 9.61,
        "h": 15.15,
        "maxTier": 3,
        "costs": [
          {
            "tier": 1,
            "material": "Fractal Circuit",
            "amount": 19
          },
          {
            "tier": 1,
            "material": "Storage Drive",
            "amount": 4
          },
          {
            "tier": 2,
            "material": "Paradox Circuit",
            "amount": 4
          },
          {
            "tier": 2,
            "material": "Storage Drive",
            "amount": 17
          },
          {
            "tier": 3,
            "material": "Predictive Framework",
            "amount": 1
          },
          {
            "tier": 3,
            "material": "Paradox Circuit",
            "amount": 18
          }
        ],
        "tierLabels": {
          "1": "Cradle Efficiency",
          "2": "Cradle Efficiency+",
          "3": "Cradle Efficiency++"
        }
      },
      {
        "id": "sekiguchi-vip-1",
        "name": "VIP Node 1",
        "x": 87.49,
        "y": 29.07,
        "w": 6.75,
        "h": 10.65,
        "maxTier": 1,
        "isVip": true,
        "tierLabels": {
          "1": "VIP 1"
        },
        "costs": []
      },
      {
        "id": "sekiguchi-momentum-plus",
        "name": "Momentum+",
        "x": 32.19,
        "y": 45.86,
        "w": 6.75,
        "h": 11.06,
        "maxTier": 1,
        "costs": [
          {
            "tier": 1,
            "material": "Storage Drive",
            "amount": 15
          },
          {
            "tier": 1,
            "material": "Fractal Circuit",
            "amount": 9
          }
        ]
      },
      {
        "id": "sekiguchi-overwatch-plus",
        "name": "Overwatch+",
        "x": 43.35,
        "y": 45.86,
        "w": 6.75,
        "h": 11.06,
        "maxTier": 1,
        "costs": [
          {
            "tier": 1,
            "material": "Storage Drive",
            "amount": 15
          },
          {
            "tier": 1,
            "material": "Fractal Circuit",
            "amount": 9
          }
        ]
      },
      {
        "id": "sekiguchi-role-player-plus",
        "name": "Role Player+",
        "x": 54.52,
        "y": 45.86,
        "w": 6.75,
        "h": 11.06,
        "maxTier": 1,
        "costs": [
          {
            "tier": 1,
            "material": "Storage Drive",
            "amount": 15
          },
          {
            "tier": 1,
            "material": "Fractal Circuit",
            "amount": 9
          }
        ]
      },
      {
        "id": "sekiguchi-energy-reservoir",
        "name": "Energy Reservoir+",
        "x": 65.68,
        "y": 45.86,
        "w": 8.31,
        "h": 11.06,
        "maxTier": 2,
        "costs": [
          {
            "tier": 1,
            "material": "Unstable Diode",
            "amount": 16
          },
          {
            "tier": 2,
            "material": "Fractal Circuit",
            "amount": 4
          },
          {
            "tier": 2,
            "material": "Storage Drive",
            "amount": 6
          }
        ],
        "tierLabels": {
          "1": "Energy Reservoir",
          "2": "Energy Reservoir+"
        }
      },
      {
        "id": "sekiguchi-herd-immunity",
        "name": "Herd Immunity+",
        "x": 76.58,
        "y": 45.86,
        "w": 8.31,
        "h": 11.06,
        "maxTier": 2,
        "costs": [
          {
            "tier": 1,
            "material": "Unstable Diode",
            "amount": 8
          },
          {
            "tier": 2,
            "material": "Fractal Circuit",
            "amount": 7
          },
          {
            "tier": 2,
            "material": "Storage Drive",
            "amount": 9
          }
        ],
        "tierLabels": {
          "1": "Herd Immunity",
          "2": "Herd Immunity+"
        }
      },
      {
        "id": "sekiguchi-balancing-act",
        "name": "Balancing Act",
        "x": 87.49,
        "y": 45.86,
        "w": 6.75,
        "h": 11.06,
        "maxTier": 2,
        "costs": [
          {
            "tier": 1,
            "material": "Unstable Diode",
            "amount": 15
          },
          {
            "tier": 2,
            "material": "Paradox Circuit",
            "amount": 12
          },
          {
            "tier": 2,
            "material": "Storage Drive",
            "amount": 19
          }
        ],
        "tierLabels": {
          "1": "Balancing Act",
          "2": "Balancing Act+"
        }
      },
      {
        "id": "sekiguchi-vip-2",
        "name": "VIP Node 2",
        "x": 32.19,
        "y": 63.88,
        "w": 6.75,
        "h": 9.83,
        "maxTier": 1,
        "isVip": true,
        "tierLabels": {
          "1": "VIP 2"
        },
        "costs": []
      },
      {
        "id": "sekiguchi-vip-3",
        "name": "VIP Node 3",
        "x": 43.35,
        "y": 63.88,
        "w": 6.75,
        "h": 9.83,
        "maxTier": 1,
        "isVip": true,
        "tierLabels": {
          "1": "VIP 3"
        },
        "costs": []
      },
      {
        "id": "sekiguchi-vip-4",
        "name": "VIP Node 4",
        "x": 54.52,
        "y": 63.88,
        "w": 6.75,
        "h": 9.83,
        "maxTier": 1,
        "isVip": true,
        "tierLabels": {
          "1": "VIP 4"
        },
        "costs": []
      },
      {
        "id": "sekiguchi-checkmate",
        "name": "Checkmate",
        "x": 65.68,
        "y": 63.47,
        "w": 8.31,
        "h": 12.29,
        "maxTier": 1,
        "costs": [
          {
            "tier": 1,
            "material": "Paradox Circuit",
            "amount": 7
          },
          {
            "tier": 1,
            "material": "Storage Drive",
            "amount": 24
          }
        ]
      },
      {
        "id": "sekiguchi-freeloader",
        "name": "Freeloader",
        "x": 76.58,
        "y": 63.47,
        "w": 8.31,
        "h": 12.29,
        "maxTier": 3,
        "costs": [
          {
            "tier": 1,
            "material": "Amygdala Drive",
            "amount": 7
          },
          {
            "tier": 1,
            "material": "Paradox Circuit",
            "amount": 5
          },
          {
            "tier": 2,
            "vip": true
          },
          {
            "tier": 3,
            "vip": true
          }
        ],
        "tierLabels": {
          "1": "Freeloader",
          "2": "VIP 1",
          "3": "VIP 2"
        }
      },
      {
        "id": "sekiguchi-the-first-law",
        "name": "The First Law",
        "x": 87.49,
        "y": 63.47,
        "w": 6.75,
        "h": 12.29,
        "maxTier": 1,
        "costs": [
          {
            "tier": 1,
            "material": "Nueral Insulation",
            "amount": 1
          },
          {
            "tier": 1,
            "material": "Amygdala Drive",
            "amount": 15
          }
        ]
      }
    ]
  }
];

upgradeState = loadUpgradeState();
upgradeAllocations = loadUpgradeAllocations();
migrateSelectedUpgradesIntoAllocations();
let activeFactionId = (FACTIONS.some(f => f.id === loadUiState().activeFactionId) ? loadUiState().activeFactionId : "cyberacme");
let activeNodeId = null;

function defaultUpgradeState() {
  const next = {};
  FACTIONS.forEach(faction => {
    next[faction.id] = {};
    faction.nodes.forEach(node => {
      next[faction.id][node.id] = 0;
    });
  });
  return next;
}

function loadUpgradeState() {
  const defaults = defaultUpgradeState();
  try {
    const saved = JSON.parse(localStorage.getItem(UPGRADE_STORAGE_KEY));
    if (saved && typeof saved === "object") {
      FACTIONS.forEach(faction => {
        faction.nodes.forEach(node => {
          const savedTier = Number(saved?.[faction.id]?.[node.id]);
          if (Number.isFinite(savedTier)) {
            defaults[faction.id][node.id] = Math.max(0, Math.min(node.maxTier, savedTier));
          }
        });
      });
    }
  } catch {}
  return defaults;
}

function saveUpgradeState() {
  localStorage.setItem(UPGRADE_STORAGE_KEY, JSON.stringify(upgradeState));
}

function defaultUpgradeAllocations() {
  const next = {};
  FACTIONS.forEach(faction => {
    next[faction.id] = {};
    faction.nodes.forEach(node => { next[faction.id][node.id] = {}; });
  });
  return next;
}

function loadUpgradeAllocations() {
  const defaults = defaultUpgradeAllocations();
  try {
    const saved = JSON.parse(localStorage.getItem(UPGRADE_ALLOCATIONS_KEY));
    if (saved && typeof saved === "object") {
      FACTIONS.forEach(faction => {
        faction.nodes.forEach(node => {
          const savedNode = saved?.[faction.id]?.[node.id];
          if (savedNode && typeof savedNode === "object") defaults[faction.id][node.id] = savedNode;
        });
      });
    }
  } catch {}
  return defaults;
}

function saveUpgradeAllocations() {
  localStorage.setItem(UPGRADE_ALLOCATIONS_KEY, JSON.stringify(upgradeAllocations));
}

function selectedCostsGroupedByMaterial(node, tier) {
  const grouped = new Map();
  getSelectedCostsForNode(node, tier).forEach(cost => {
    const material = findMaterialRecordForRequirement(cost.material);
    if (!material) return;
    const existing = grouped.get(material.id) || { materialId: material.id, materialName: material.name, amount: 0 };
    existing.amount += Number(cost.amount || 0);
    grouped.set(material.id, existing);
  });
  return Array.from(grouped.values());
}

function revertNodeAllocation(factionId, nodeId) {
  const nodeAlloc = upgradeAllocations?.[factionId]?.[nodeId] || {};
  Object.entries(nodeAlloc).forEach(([materialId, entry]) => {
    if (!state[materialId]) return;
    const fromVault = Number(entry.vault || 0);
    const fromAvailable = Number(entry.available || 0);
    vault[materialId] = Number(vault[materialId] || 0) + fromVault;
    state[materialId].left += fromAvailable;
  });
  if (upgradeAllocations?.[factionId]) upgradeAllocations[factionId][nodeId] = {};
}

function applyNodeAllocation(faction, node, tier) {
  if (!upgradeAllocations[faction.id]) upgradeAllocations[faction.id] = {};
  const allocation = {};
  selectedCostsGroupedByMaterial(node, tier).forEach(cost => {
    const fromVault = Math.min(Number(vault[cost.materialId] || 0), cost.amount);
    const fromAvailable = cost.amount - fromVault;
    vault[cost.materialId] = Number(vault[cost.materialId] || 0) - fromVault;
    state[cost.materialId].left -= fromAvailable;
    allocation[cost.materialId] = {
      material: cost.materialName,
      vault: fromVault,
      available: fromAvailable
    };
  });
  upgradeAllocations[faction.id][node.id] = allocation;
}

function setNodeTierWithMaterialEffects(faction, node, newTier) {
  revertNodeAllocation(faction.id, node.id);
  upgradeState[faction.id][node.id] = Math.max(0, Math.min(node.maxTier, Number(newTier) || 0));
  applyNodeAllocation(faction, node, upgradeState[faction.id][node.id]);
  saveUpgradeState();
  saveUpgradeAllocations();
  save();
}

function hasAnyUpgradeAllocation() {
  return Object.values(upgradeAllocations || {}).some(factionAlloc =>
    Object.values(factionAlloc || {}).some(nodeAlloc => Object.keys(nodeAlloc || {}).length > 0)
  );
}

function hasAnySelectedUpgradeTier() {
  return FACTIONS.some(faction => faction.nodes.some(node => (upgradeState?.[faction.id]?.[node.id] || 0) > 0));
}

function migrateSelectedUpgradesIntoAllocations() {
  if (hasAnyUpgradeAllocation() || !hasAnySelectedUpgradeTier()) return;
  FACTIONS.forEach(faction => {
    faction.nodes.forEach(node => {
      const tier = upgradeState?.[faction.id]?.[node.id] || 0;
      if (tier > 0) applyNodeAllocation(faction, node, tier);
    });
  });
  save();
}


function getActiveFaction() {
  return FACTIONS.find(faction => faction.id === activeFactionId) || FACTIONS[0];
}

function tierLabel(tier, nodeOrMaxTier) {
  const node = typeof nodeOrMaxTier === "object" ? nodeOrMaxTier : null;
  if (tier === 0) return "Not started";
  const cost = node?.costs?.find(entry => Number(entry.tier) === Number(tier));
  if (node?.isVip) return `VIP ${tier}`;
  if (cost?.vip) {
    const vipTiers = [...new Set((node.costs || [])
      .filter(entry => entry.vip)
      .map(entry => Number(entry.tier) || 0)
      .filter(Boolean))]
      .sort((a, b) => a - b);
    const vipIndex = Math.max(1, vipTiers.indexOf(Number(tier)) + 1);
    return `VIP ${vipIndex}`;
  }
  return `Tier ${tier}`;
}

function renderFactionList() {
  const holder = document.getElementById("factionList");
  if (!holder) return;
  holder.innerHTML = `<div class="faction-button-grid" aria-label="Faction selection"></div>`;
  const grid = holder.querySelector(".faction-button-grid");
  FACTIONS.forEach(faction => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `faction-button ${faction.id === activeFactionId ? "active" : ""}`;
    btn.textContent = faction.name;
    btn.style.setProperty("--faction-color", faction.color);
    btn.style.setProperty("--faction-rgb", faction.rgb);
    btn.addEventListener("click", () => {
      activeFactionId = faction.id;
      saveUiState({ activeFactionId });
      renderUpgradeTracker();
    });
    grid.appendChild(btn);
  });
}

function renderTreeNodes() {
  const layer = document.getElementById("treeNodeLayer");
  const title = document.getElementById("activeFactionTitle");
  const image = document.getElementById("treeImage");
  const stats = document.querySelector(".tree-stats");
  if (!layer || !title || !image) return;

  const faction = getActiveFaction();
  title.textContent = faction.name;
  title.style.color = faction.color;
  if (stats) stats.style.color = faction.color;
  image.src = faction.image;
  image.alt = `${faction.name} upgrade tree screenshot`;
  layer.innerHTML = "";

  faction.nodes.forEach(node => {
    const currentTier = upgradeState[faction.id][node.id] || 0;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tree-node ${currentTier > 0 ? "started" : ""} ${currentTier >= node.maxTier ? "maxed" : ""}`;
    button.style.left = `${node.x}%`;
    button.style.top = `${node.y}%`;
    button.style.width = `${node.w}%`;
    button.style.height = `${node.h}%`;
    button.style.setProperty("--node-color", faction.color);
    button.style.setProperty("--node-rgb", faction.rgb);
    if (node.isVip) button.classList.add("vip-node");
    button.setAttribute("aria-label", `${node.name}, ${tierLabel(currentTier, node)}`);
    const label = currentTier > 0 ? tierLabel(currentTier, node).replace("Tier ", "T") : "+";
    const notches = Array.from({ length: Math.max(1, node.maxTier) }, (_, index) => {
      const notchTier = index + 1;
      const isFilled = currentTier >= notchTier;
      const isVipTier = node.isVip || (node.costs || []).some(cost => cost.vip && Number(cost.tier) === notchTier);
      return `<i class="${isFilled ? "filled" : ""} ${isVipTier ? "vip-notch" : ""}" aria-hidden="true"></i>`;
    }).join("");
    button.innerHTML = `<span class="node-tier-label">${label}</span><div class="node-progress-bar">${notches}</div>`;
    button.title = node.name;
    button.addEventListener("click", event => {
      event.preventDefault();
      changeNodeTierByStep(node.id, 1);
    });
    button.addEventListener("contextmenu", event => {
      event.preventDefault();
      changeNodeTierByStep(node.id, -1);
    });
    layer.appendChild(button);
  });
}

function changeNodeTierByStep(nodeId, step) {
  const faction = getActiveFaction();
  const node = faction.nodes.find(n => n.id === nodeId);
  if (!node) return;
  const currentTier = upgradeState[faction.id][node.id] || 0;
  let nextTier;
  if (step > 0) {
    nextTier = currentTier >= node.maxTier ? 0 : currentTier + 1;
  } else {
    nextTier = Math.max(0, currentTier - 1);
  }
  if (nextTier === currentTier) return;
  pushUndoSnapshot();
  setNodeTierWithMaterialEffects(faction, node, nextTier);
  renderUpgradeTracker();
  renderAll();
}


function openTierDialog(nodeId) {
  const dialog = document.getElementById("tierDialog");
  const select = document.getElementById("tierSelect");
  const name = document.getElementById("dialogNodeName");
  const hint = document.getElementById("dialogNodeHint");
  if (!dialog || !select || !name || !hint) return;

  const faction = getActiveFaction();
  const node = faction.nodes.find(n => n.id === nodeId);
  if (!node) return;

  activeNodeId = nodeId;
  name.textContent = `${faction.name} - ${node.name}`;
  hint.textContent = node.isVip
    ? `This is a VIP node. VIP material requirements are not available yet, so it will save progress but will not count toward the materials needed total.`
    : `Choose the tier you currently have for this upgrade. Known material costs will update the TOTALS LEFT table automatically. Credits are ignored.`;
  select.innerHTML = "";
  for (let tier = 0; tier <= node.maxTier; tier++) {
    select.appendChild(new Option(tierLabel(tier, node), String(tier)));
  }
  select.value = String(upgradeState[faction.id][node.id] || 0);
  renderTierCostPreview();

  if (typeof dialog.showModal === "function") dialog.showModal();
  else alert("Your browser does not support the popup dialog. Try Chrome, Edge, or Firefox.");
}

function renderTierCostPreview() {
  const preview = document.getElementById("tierCostPreview");
  const select = document.getElementById("tierSelect");
  if (!preview || !select || !activeNodeId) return;
  const faction = getActiveFaction();
  const node = faction.nodes.find(n => n.id === activeNodeId);
  const tier = Number(select.value) || 0;

  if (!node || !node.costs.length) {
    if (node?.isVip) {
      preview.innerHTML = `<strong>VIP node — not counted yet.</strong><span>This saves as ${tierLabel(tier, node)}, but VIP material requirements are unknown and will not be added to the Materials Needed total.</span>`;
    } else {
      preview.innerHTML = `<strong>No material cost data for this node.</strong><span>This node will save as ${tierLabel(tier, node || 0)}. Credits are ignored.</span>`;
    }
    return;
  }

  const remainingCosts = getSelectedCostsForNode(node, tier);
  if (!remainingCosts.length) {
    preview.innerHTML = `<strong>No selected material cost for this node.</strong><span>Either this selected tier has no known material requirement, or it is VIP-only.</span>`;
    return;
  }
  preview.innerHTML = `<strong>Selected tier material cost</strong>` + remainingCosts.map(cost => `<div><span>${tierLabel(cost.tier, node)} — ${cost.material}</span><strong>${fmt(cost.amount)}</strong></div>`).join("");
}

function saveTierFromDialog(event) {
  event.preventDefault();
  if (!activeNodeId) return;
  const faction = getActiveFaction();
  const node = faction.nodes.find(n => n.id === activeNodeId);
  const select = document.getElementById("tierSelect");
  const dialog = document.getElementById("tierDialog");
  if (!node || !select || !dialog) return;

  const nextTier = Number(select.value) || 0;
  if ((upgradeState[faction.id][node.id] || 0) !== nextTier) pushUndoSnapshot();
  setNodeTierWithMaterialEffects(faction, node, nextTier);
  renderUpgradeTracker();
  renderAll();
  dialog.close();
}

function getRemainingCostsForNode(node, currentTier) {
  if (node?.isVip) return [];
  return (node.costs || []).filter(cost => !cost.vip && Number(cost.tier) > currentTier);
}

function getSelectedCostsForNode(node, currentTier) {
  if (node?.isVip) return [];
  return (node.costs || []).filter(cost => !cost.vip && Number(cost.tier) <= currentTier);
}


function normalizeMaterialName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/^unstable\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findMaterialRecordForRequirement(requirementName) {
  const normalized = normalizeMaterialName(requirementName);
  if (!normalized) return null;
  return materials.find(item => {
    const itemName = normalizeMaterialName(item.name);
    return itemName === normalized || itemName === `${normalized}s` || `${itemName}s` === normalized;
  }) || null;
}

function getAllSelectedUpgradeMaterials(factionFilterId = null) {
  const used = new Map();
  FACTIONS.forEach(faction => {
    if (factionFilterId && faction.id !== factionFilterId) return;
    faction.nodes.forEach(node => {
      const currentTier = upgradeState?.[faction.id]?.[node.id] || 0;
      getSelectedCostsForNode(node, currentTier).forEach(cost => {
        const key = cost.material;
        const existing = used.get(key) || { material: cost.material, amount: 0, factions: new Set() };
        existing.amount += Number(cost.amount || 0);
        existing.factions.add(faction.name);
        used.set(key, existing);
      });
    });
  });
  return Array.from(used.values()).sort((a, b) => a.material.localeCompare(b.material));
}

// Backward-compatible alias for older render code paths.
function getAllRemainingUpgradeMaterials() {
  return getAllSelectedUpgradeMaterials();
}

function renderDashboardUpgradeNeeded() {
  const table = document.getElementById("dashboardNeededTable");
  if (!table || typeof FACTIONS === "undefined" || typeof upgradeState === "undefined") return;
  const needed = getAllRemainingUpgradeMaterials();

  const thead = document.createElement("thead");
  const head = document.createElement("tr");
  ["Material", "Needed", "Total Left", "Still Short", "Source"].forEach(label => {
    const th = document.createElement("th");
    th.textContent = label;
    head.appendChild(th);
  });
  thead.appendChild(head);

  const tbody = document.createElement("tbody");
  if (!needed.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.className = "empty-needed";
    td.textContent = "No selected upgrade materials yet. All six faction costs are connected; credits and VIP nodes are ignored.";
    tr.appendChild(td);
    tbody.appendChild(tr);
  } else {
    needed.forEach(entry => {
      const material = findMaterialRecordForRequirement(entry.material);
      const left = material ? Number(state[material.id]?.left || 0) : 0;
      const shortage = Math.max(0, entry.amount - left);
      const tr = document.createElement("tr");

      const materialTd = document.createElement("td");
      materialTd.className = "material-needed-name";
      materialTd.textContent = entry.material;

      const neededTd = document.createElement("td");
      neededTd.className = "amount";
      neededTd.textContent = fmt(entry.amount);

      const leftTd = document.createElement("td");
      leftTd.className = "amount";
      leftTd.textContent = material ? fmt(left) : "Not in totals";

      const shortTd = document.createElement("td");
      shortTd.className = shortage > 0 ? "shortage" : "covered";
      shortTd.textContent = shortage > 0 ? fmt(shortage) : "Covered";

      const sourceTd = document.createElement("td");
      sourceTd.className = "needed-source-note";
      sourceTd.textContent = Array.from(entry.factions).join(", ");

      tr.append(materialTd, neededTd, leftTd, shortTd, sourceTd);
      tbody.appendChild(tr);
    });
  }

  table.replaceChildren(thead, tbody);
}

function renderUpgradeNeededList() {
  const list = document.getElementById("upgradeNeededList");
  if (!list) return;
  const faction = getActiveFaction();
  const needed = new Map();

  faction.nodes.forEach(node => {
    const currentTier = upgradeState[faction.id][node.id] || 0;
    getSelectedCostsForNode(node, currentTier).forEach(cost => {
      needed.set(cost.material, (needed.get(cost.material) || 0) + Number(cost.amount || 0));
    });
  });

  if (!needed.size) {
    list.innerHTML = `<div class="empty-needed">No selected known material costs for this faction. VIP nodes and credits are ignored.</div>`;
    return;
  }

  list.innerHTML = Array.from(needed.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([material, amount]) => `<div><span>${material}</span><strong>${fmt(amount)}</strong></div>`)
    .join("");
}

function renderUpgradeProgress() {
  const text = document.getElementById("upgradeProgressText");
  if (!text) return;
  const faction = getActiveFaction();
  const normalNodes = faction.nodes.filter(node => !node.isVip);
  const vipNodes = faction.nodes.filter(node => node.isVip).length;
  const started = normalNodes.filter(node => (upgradeState[faction.id][node.id] || 0) > 0).length;
  const maxed = normalNodes.filter(node => (upgradeState[faction.id][node.id] || 0) >= node.maxTier).length;
  text.textContent = `${started} / ${normalNodes.length} non-VIP nodes started • ${maxed} maxed${vipNodes ? ` • ${vipNodes} VIP ignored` : ""}`;
}

function renderUpgradeTracker() {
  renderFactionList();
  renderTreeNodes();
  renderUpgradeNeededList();
  renderUpgradeProgress();
  renderDashboardUpgradeNeeded();
}

function setActiveFactionToMax() {
  const faction = getActiveFaction();
  if (!confirm(`Set every known non-VIP ${faction.name} node to max normal tier? VIP-only material requirements are still ignored.`)) return;
  pushUndoSnapshot();
  faction.nodes.forEach(node => {
    if (node.isVip) return;
    const highestKnownCostTier = Math.max(0, ...(node.costs || []).filter(cost => !cost.vip).map(cost => Number(cost.tier) || 0));
    const vipTierNumbers = (node.costs || []).filter(cost => cost.vip).map(cost => Number(cost.tier) || 0).filter(Boolean);
    const firstVipTier = vipTierNumbers.length ? Math.min(...vipTierNumbers) : null;
    let targetTier = node.maxTier;
    if (firstVipTier !== null) targetTier = Math.min(targetTier, firstVipTier - 1);
    if (highestKnownCostTier > 0) targetTier = Math.max(targetTier, highestKnownCostTier);
    targetTier = Math.max(0, Math.min(node.maxTier, targetTier));
    setNodeTierWithMaterialEffects(faction, node, targetTier);
  });
  renderUpgradeTracker();
  renderAll();
}

function bindUpgradeTracker() {
  const form = document.getElementById("tierForm");
  const select = document.getElementById("tierSelect");
  const reset = document.getElementById("resetUpgradeBtn");
  const resetAll = document.getElementById("resetAllFactionsBtn");
  const undoBtn = document.getElementById("undoBtn");
  const maxBtn = document.getElementById("maxUpgradeBtn");
  if (form) form.addEventListener("submit", saveTierFromDialog);
  if (select) select.addEventListener("change", renderTierCostPreview);
  if (maxBtn) maxBtn.addEventListener("click", setActiveFactionToMax);
  if (undoBtn) undoBtn.addEventListener("click", undoLastAction);
  if (reset) reset.addEventListener("click", () => {
    const faction = getActiveFaction();
    if (!confirm(`Reset ${faction.name} upgrade node tiers only?`)) return;
    pushUndoSnapshot();
    faction.nodes.forEach(node => {
      revertNodeAllocation(faction.id, node.id);
      upgradeState[faction.id][node.id] = 0;
    });
    saveUpgradeState();
    saveUpgradeAllocations();
    save();
    renderUpgradeTracker();
    renderAll();
  });
  if (resetAll) resetAll.addEventListener("click", () => {
    if (!confirm("Reset upgrade tiers for every faction?")) return;
    pushUndoSnapshot();
    FACTIONS.forEach(faction => {
      faction.nodes.forEach(node => {
        revertNodeAllocation(faction.id, node.id);
        upgradeState[faction.id][node.id] = 0;
      });
    });
    saveUpgradeState();
    saveUpgradeAllocations();
    save();
    renderUpgradeTracker();
    renderAll();
  });
  updateUndoButton();
}

upgradeTrackerReady = true;
bindUpgradeTracker();
renderUpgradeTracker();

window.addEventListener("beforeunload", () => saveUiState({ scrollY: window.scrollY }));
setTimeout(() => {
  const y = Number(loadUiState().scrollY || 0);
  if (y > 0) window.scrollTo(0, y);
}, 80);
