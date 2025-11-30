const STOP_CONFIG = [
  {
    codes: [
      "30009567", // Spaklerweg Centraal (53/54)
      "30009518", // Spaklerweg Centraal (51)
    ],
    label: "Richting Centraal",
    elementId: "rows-30009567",
  },
  {
    codes: [
      "30009566", // Spaklerweg Gein/Gaasperplas (53/54)
      "30009519", // Spaklerweg Gein (51)
    ],
    label: "Richting Gein / Gaasperplas",
    elementId: "rows-30009566",
  },
];

let timer;
const API_BASE = computeApiBase();
const REFRESH_INTERVAL_MS = 60_000;
const LINE_COLORS = {
  "51": "#F2922C",
  "53": "#E20224",
  "54": "#FFEE00",
};

function computeApiBase() {
  const queryBase = new URLSearchParams(window.location.search).get("api");
  if (queryBase) return queryBase.replace(/\/+$/, "");
  if (window.OVAPI_BASE) return window.OVAPI_BASE.replace(/\/+$/, "");
  // Browsers block mixed content; when served over https use same-protocol proxy or try https host
  if (window.location.protocol === "https:") return "https://v0.ovapi.nl";
  return "http://v0.ovapi.nl";
}

async function fetchDeparturesForCode(stopCode) {
  const url = `${API_BASE}/tpc/${stopCode}`;
  const response = await fetch(url, { mode: "cors" });
  if (!response.ok) throw new Error(`API ${response.status}`);
  const payload = await response.json();
  const stopNode = payload[stopCode];
  if (!stopNode) throw new Error("No stop found");

  const passes = Object.values(stopNode.Passes || {});
  return passes
    .filter((p) => p.TransportType === "METRO")
    .map((p) => ({
      line: p.LinePublicNumber,
      destination: normalizeDestination(p.DestinationName50),
      departure: new Date(p.ExpectedDepartureTime),
      raw: p,
    }))
    .sort((a, b) => a.departure - b.departure);
}

async function fetchDeparturesForConfig(config) {
  const codes = config.codes || [config.code];
  const chunks = await Promise.all(codes.map((c) => fetchDeparturesForCode(c)));
  return chunks.flat().sort((a, b) => a.departure - b.departure);
}

function normalizeDestination(text = "") {
  return text.replace(/\\s+/g, " ").trim();
}

function formatMinutes(target) {
  const now = Date.now();
  const diff = Math.max(0, target.getTime() - now);
  const mins = Math.round(diff / 60000);
  if (mins <= 0) return "Now";
  if (mins === 1) return "1 min";
  if (mins < 20) return `${mins} min`;
  const hours = target.getHours().toString().padStart(2, "0");
  const minutes = target.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function renderRows(elementId, departures) {
  const table = document.getElementById(elementId);
  if (!table) return;
  const host = table.tBodies[0] || table;
  host.innerHTML = "";

  const limited = departures.slice(0, 8);
  if (!limited.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td align="left" style="padding:8px 10px;width:70px;background:#dcdfe1;color:#0f1012;font-weight:bold;font-size:18px;">—</td>
      <td align="left" style="padding:8px 10px;font-size:19px;">No departures available</td>
      <td align="right" style="padding:8px 10px;font-size:19px;"></td>
    `;
    host.appendChild(tr);
    return;
  }

  limited.forEach((dep, idx) => {
    const tr = document.createElement("tr");
    const bg = idx % 2 === 0 ? "#f6f7f8" : "#e9ecef";
    tr.style.background = bg;

    const lineBg = LINE_COLORS[dep.line] || "#dcdfe1";
    const lineColor = dep.line === "53" ? "#fff" : "#0f1012";
    const lineTd = document.createElement("td");
    lineTd.textContent = `M${dep.line}`;
    lineTd.setAttribute(
      "style",
      `padding:8px 8px 8px 8px;width:55px;background:${lineBg};color:${lineColor};font-weight:800;font-size:18px;`
    );

    const destTd = document.createElement("td");
    destTd.textContent = dep.destination;
    destTd.setAttribute(
      "style",
      "padding:8px 10px;font-size:19px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"
    );

    const minTd = document.createElement("td");
    minTd.textContent = formatMinutes(dep.departure);
    minTd.setAttribute(
      "style",
      "padding:8px 8px 8px 10px;font-size:19px;font-variant-numeric:tabular-nums;text-align:right;width:80px;min-width:76px;"
    );

    tr.appendChild(lineTd);
    tr.appendChild(destTd);
    tr.appendChild(minTd);
    host.appendChild(tr);
  });
}

async function refreshAll() {
  clearTimeout(timer);
  try {
    const boards = STOP_CONFIG;
    const data = await Promise.all(
      boards.map((stop) => fetchDeparturesForConfig(stop))
    );
    data.forEach((departures, idx) => {
      renderRows(STOP_CONFIG[idx].elementId, departures);
    });
    setLastUpdated(new Date());
    setRefreshStatus("");
  } catch (err) {
    console.error(err);
    setRefreshStatus("Connection failed");
  } finally {
    scheduleNextRefresh();
  }
}

function scheduleNextRefresh() {
  const now = Date.now();
  const nextMinute = Math.ceil((now + 1) / REFRESH_INTERVAL_MS) * REFRESH_INTERVAL_MS;
  const delay = Math.max(5_000, nextMinute - now); // at least 5s buffer
  timer = setTimeout(refreshAll, delay);
}

function setLastUpdated(date) {
  const el = document.getElementById("last-updated");
  if (!el) return;
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  el.textContent = `Updated ${hours}:${minutes}`;
}

function setRefreshStatus(text) {
  const el = document.getElementById("refresh-status");
  if (!el) return;
  el.textContent = text;
}

window.addEventListener("DOMContentLoaded", () => {
  refreshAll();
});
