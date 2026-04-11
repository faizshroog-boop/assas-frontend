/* ===================================================
   1. Imports
=================================================== */
import { db } from "./firebase.js";
import {
  collection,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

/* ===================================================
   2. State & Variables
=================================================== */
let allReports = [];
let filteredReports = [];
let markersMap = {};
let usersMap = {};
let activePopup = null;

// Pagination state
let currentPage = 1;
const itemsPerPage = 10;

// Chart instances
let highChart = null, mediumChart = null, lowChart = null, completedChart = null;

// DOM Elements: Main
const tableBody = document.getElementById("tableBody");
const searchInput = document.getElementById("searchInput");

// DOM Elements: Filters
const filterSeverity = document.getElementById("filterSeverity");
const filterLocation = document.getElementById("filterLocation");
const filterStatus = document.getElementById("filterStatus");
const filterId = document.getElementById("filterId");
const filterDateFrom = document.getElementById("filterDateFrom");
const filterDateTo = document.getElementById("filterDateTo");
const resetFiltersBtn = document.getElementById("resetFiltersBtn");

// DOM Elements: Pagination
const prevPageBtn = document.getElementById("prevPageBtn");
const nextPageBtn = document.getElementById("nextPageBtn");
const pageInfo = document.getElementById("pageInfo");

/* ===================================================
   3. Constants & Translations
=================================================== */
const statusTranslation = {
  completed: "مكتمل",
  in_progress: "قيد التنفيذ",
  pending: "غير مكتمل"
};

const severityTranslation = {
  high: "عالية",
  medium: "متوسطة",
  low: "منخفضة"
};

/* ===================================================
   4. Helpers
=================================================== */
/**
 * Safely parse date from Firestore or string format.
 */
function parseFirestoreDate(field) {
  if (!field) return null;
  if (typeof field.toDate === "function") return field.toDate();
  return new Date(field);
}

/**
 * Formats a Date object to YYYY-MM-DD.
 */
function formatDate(date) {
  if (!date) return "-";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns marker dot color code based on severity/status.
 */
function getColor(report) {
  if (report.status === "completed") return "green";
  if (report.severity === "high") return "red";
  if (report.severity === "medium") return "orange";
  if (report.severity === "low") return "yellow";
  return "green"; // Fallback
}

/**
 * Debounces a function execution.
 */
function debounce(func, delay = 300) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), delay);
  };
}

/**
 * Provides safe access to the global map object.
 */
function getMap() {
  return typeof map !== "undefined" ? map : window.map;
}

/* ===================================================
   5. Chart Rendering & Logic
=================================================== */
function createChart(id, color) {
  const canvas = document.getElementById(id);
  if (!canvas) return null; // Safe check if canvas exists
  
  const ctx = canvas.getContext("2d");
  // Assuming Chart comes from global scope/CDN
  return new window.Chart(ctx, {
    type: "doughnut",
    data: {
      datasets: [{
        data: [0, 100],
        backgroundColor: [color, "#eeeeee"],
        borderWidth: 0,
        cutout: "75%",
      }],
    },
    options: {
      responsive: false,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
        datalabels: {
          display: (ctx) => ctx.dataIndex === 0,
          color: "#000",
          font: { size: 22, weight: "bold" },
          anchor: "center",
          align: "center",
          formatter: (value) => Math.round(value) + "%",
        },
      },
    },
    plugins: [{
      id: "centerText",
      beforeDraw(chart) {
        const { ctx } = chart;
        const meta = chart.getDatasetMeta(0);
        if (!meta.data.length) return;

        const centerX = meta.data[0].x;
        const centerY = meta.data[0].y;
        const value = chart.data.datasets[0].data[0] || 0;
        const text = Math.round(value) + "%";

        ctx.save();
        ctx.font = `bold ${chart.height / 4.5}px Cairo`;
        ctx.fillStyle = "#000";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, centerX, centerY);
        ctx.restore();
      },
    }],
  });
}

function initCharts() {
  if (typeof window.Chart !== "undefined") {
    highChart = createChart("highChart", "#e74c3c");
    mediumChart = createChart("mediumChart", "#f39c12");
    lowChart = createChart("lowChart", "#f1c40f");
    completedChart = createChart("completedChart", "#2ecc71");
  }
}

function updateChartDataSafe(chartInstance, count, total) {
  if (!chartInstance || !chartInstance.data || !chartInstance.data.datasets.length) return;
  const percent = total > 0 ? (count / total) * 100 : 0;
  chartInstance.data.datasets[0].data = [percent, 100 - percent];
  chartInstance.update();
}

/**
 * Dynamically re-evaluates statistics over currently visible (or main) dataset.
 */
function updateChartsTotals(reports) {
  let counts = { high: 0, medium: 0, low: 0, completed: 0 };
  let total = reports.length;

  reports.forEach((r) => {
    if (r.severity === "high") counts.high++;
    if (r.severity === "medium") counts.medium++;
    if (r.severity === "low") counts.low++;
    if (r.status === "completed") counts.completed++;
  });

  updateChartDataSafe(highChart, counts.high, total);
  updateChartDataSafe(mediumChart, counts.medium, total);
  updateChartDataSafe(lowChart, counts.low, total);
  updateChartDataSafe(completedChart, counts.completed, total);
}

/* ===================================================
   6. Custom Map Popup logic
=================================================== */
class CustomPopup extends google.maps.OverlayView {
  constructor(position, content) {
    super();
    this.position = position;
    this.containerDiv = document.createElement("div");
    this.containerDiv.innerHTML = content;
    this.containerDiv.style.position = "absolute";
    this.containerDiv.style.transform = "translate(-50%, -100%)";
    this.containerDiv.style.zIndex = "1000";
    this.hasCloseEvent = false;
  }

  onAdd() {
    const panes = this.getPanes();
    if (panes && panes.floatPane) {
      panes.floatPane.appendChild(this.containerDiv);
    }
    const closeBtn = this.containerDiv.querySelector("#closePopupBtn");
    if (closeBtn && !this.hasCloseEvent) {
      closeBtn.addEventListener("click", () => {
        this.setMap(null);
        activePopup = null;
      });
      this.hasCloseEvent = true;
    }
  }

  draw() {
    const projection = this.getProjection();
    if (!projection) return;
    const point = projection.fromLatLngToDivPixel(this.position);
    if (point) {
      this.containerDiv.style.left = point.x + "px";
      this.containerDiv.style.top = point.y + "px";
    }
  }

  onRemove() {
    if (this.containerDiv.parentElement) {
      this.containerDiv.parentElement.removeChild(this.containerDiv);
    }
  }
}

function buildPopupContent(report) {
  const createdDate = parseFirestoreDate(report.created_at || report.created_at_string);
  const completedDate = parseFirestoreDate(report.completed_at);
  const employeeName = usersMap[report.created_by] || "-";

  return `
    <div style="position:relative; width:min(90vw,320px); max-height:80vh; overflow-y:auto; padding:20px; font-family:Cairo; text-align:right; background:white; border-radius:14px; box-shadow:0 15px 35px rgba(0,0,0,0.25);">
      <button id="closePopupBtn" style="position:absolute; top:10px; left:10px; border:none; background:#eee; width:30px; height:30px; border-radius:50%; cursor:pointer;">✕</button>
      <h4 style="margin:8px 0; color:#0c5742; font-size:18px">#${report.id.substring(0, 5)}</h4>
      ${report.image_url ? `<img src="${report.image_url}" style="width:100%;height:180px;object-fit:cover;border-radius:10px;margin-bottom:10px;" onerror="this.style.display='none'" />` : ""}
      <div style="height:6px; border-radius:10px; margin-bottom:10px; background:${getColor(report)};"></div>
      <p style="margin:5px 0;">👤 <b>الموظف:</b> ${employeeName}</p>
      <p style="margin:5px 0;">📅 <b>تاريخ الإنشاء:</b> ${formatDate(createdDate)}</p>
      <p style="margin:5px 0;">📍 <b>الموقع:</b> ${report.street_name || "-"}</p>
      <p style="margin:5px 0;">🚦 <b>الحالة:</b> ${statusTranslation[report.status] || "-"}</p>
      <p style="margin:5px 0;">🤖 <b>التنبؤ :</b> ${severityTranslation[report.prediction] || "-"}</p>
      <p style="margin:5px 0;">✅ <b>تاريخ الإكتمال:</b> ${formatDate(completedDate)}</p>
    </div>
  `;
}

/* ===================================================
   7. Map Markers & UI Rendering
=================================================== */
/**
 * Safely create or update base markers from the global dataset without tearing it down.
 */
function renderMapMarkers() {
  const gMap = getMap();
  if (typeof google === "undefined" || !gMap) return;

  const currentIds = new Set(allReports.map((r) => r.id));

  // Purge any stale markers not in our data anymore
  Object.keys(markersMap).forEach((id) => {
    if (!currentIds.has(id)) {
      markersMap[id].marker.setMap(null);
      delete markersMap[id];
    }
  });

  // Iteratively create or update context for the remaining set
  allReports.forEach((report) => {
    if (!report.latitude || !report.longitude) return;

    if (!markersMap[report.id]) {
      // New marker creation
      const color = getColor(report);
      const position = new google.maps.LatLng(
        parseFloat(report.latitude),
        parseFloat(report.longitude)
      );

      const marker = new google.maps.Marker({
        position,
        icon: { url: `https://maps.google.com/mapfiles/ms/icons/${color}-dot.png` },
      });

      // Default hidden until evaluated by filter loop
      marker.setMap(null); 
      
      const popupContent = buildPopupContent(report);

      marker.addListener("click", () => {
        if (activePopup) activePopup.setMap(null);
        activePopup = new CustomPopup(position, buildPopupContent(report));
        activePopup.setMap(gMap);
      });

      markersMap[report.id] = { marker, position, popupContent };
    } else {
      // We exist! Re-evaluate popup details in case data mutated
      markersMap[report.id].popupContent = buildPopupContent(report);
      // We also update map marker color in case logic/status mutated
      const newColor = getColor(report);
      markersMap[report.id].marker.setIcon({ url: `https://maps.google.com/mapfiles/ms/icons/${newColor}-dot.png`});
    }
  });
}

function renderTablePaginated() {
  if (!tableBody) return;
  tableBody.innerHTML = "";

  const totalItems = filteredReports.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;

  // Clamp pagination boundaries safely
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const pageData = filteredReports.slice(startIndex, endIndex);

  pageData.forEach((report) => {
    const color = getColor(report);
    const createdDate = parseFirestoreDate(report.created_at || report.created_at_string);
    const employeeName = usersMap[report.created_by] || "-";

    tableBody.insertAdjacentHTML(
      "beforeend",
      `
      <tr data-id="${report.id}">
      <td class="focus-col">
            #${report.id.substring(0, 5)}
      </td>
        <td>${formatDate(createdDate)}</td>
        <td><span>${employeeName}</span></td>
        <td>${report.street_name || "غير محدد"}</td>
        <td>${report.damage_type || "-"}</td>
          <td>
          <span class="status-dot tooltip ${color}"></span>
          ${severityTranslation[report.severity] || "-"}
        </td>
        <td>
        ${severityTranslation[report.prediction] || "-"}
        </td>
      </tr> `
    );
  });

  // Push UI constraints visually
  if (pageInfo) pageInfo.innerText = `صفحة ${currentPage} من ${totalPages}`;
  if (prevPageBtn) prevPageBtn.disabled = currentPage === 1;
  if (nextPageBtn) nextPageBtn.disabled = currentPage === totalPages || totalPages === 0;
}

/* ===================================================
   8. Filters Logic
=================================================== */
function applyFiltersAndSearchCore() {
  const searchVal = (searchInput?.value || "").trim().toLowerCase();
  const severityVal = filterSeverity?.value || "";
  const locationVal = filterLocation?.value || "";
  const statusVal = filterStatus?.value || "";
  const idVal = (filterId?.value || "").trim();

  let dateFromVal = null;
  if (filterDateFrom?.value) {
    dateFromVal = new Date(filterDateFrom.value);
    dateFromVal.setHours(0, 0, 0, 0);
  }

  let dateToVal = null;
  if (filterDateTo?.value) {
    dateToVal = new Date(filterDateTo.value);
    dateToVal.setHours(23, 59, 59, 999);
  }

  let firstMatch = null;

  filteredReports = allReports.filter((report) => {
    // 1. Global Search
    if (searchVal) {
      const rowIdMatch = report.id.toLowerCase().includes(searchVal);
      const rowStreetMatch = report.street_name?.toLowerCase().includes(searchVal);
      if (!rowIdMatch && !rowStreetMatch) return false;
    }

    // 2. Specific Drops
    if (severityVal && report.severity !== severityVal) return false;
    if (statusVal && report.status !== statusVal) return false;
    if (locationVal && !report.street_name?.includes(locationVal)) return false;
    if (idVal && !report.id.includes(idVal)) return false;

    // 3. Date Frame
    const reportDate = parseFirestoreDate(report.created_at || report.created_at_string);
    if (reportDate) {
      if (dateFromVal && reportDate < dateFromVal) return false;
      if (dateToVal && reportDate > dateToVal) return false;
    }

    // Capture map pan focus logic
    if (!firstMatch && (searchVal || idVal)) {
      firstMatch = report.id;
    }

    return true;
  });

  const gMap = getMap();

  // Apply visibilities
  const filteredIds = new Set(filteredReports.map((r) => r.id));
  Object.entries(markersMap).forEach(([id, obj]) => {
    const isVisible = filteredIds.has(id);
    // Render only if state actually mismatches current bound
    const shouldBeSetTo = isVisible ? gMap : null;
    if (obj.marker.getMap() !== shouldBeSetTo) {
      obj.marker.setMap(shouldBeSetTo);
    }
  });

  // Recompute charts to mirror only our CURRENT perspective (filtered set)
  updateChartsTotals(filteredReports);

  if (firstMatch && typeof window.focusMarker === "function") {
    // Don't auto-focus if search is empty to prevent snapping map randomly
    if (searchVal || idVal) {
        window.focusMarker(firstMatch);
    }
  }

  currentPage = 1;
  renderTablePaginated();
}

/** 
 * Debounced wrapper to prevent thrashing DOM/Map memory when typing rapidly. 
 */
const applyFiltersAndSearch = debounce(applyFiltersAndSearchCore, 300);

/* ===================================================
   9. Firebase Listeners Initialization
=================================================== */
function initDataListeners() {
  // 1. Users Lookup Table
  onSnapshot(collection(db, "users"), (snapshot) => {
    usersMap = {};
    snapshot.docs.forEach((docSnap) => {
      const data = docSnap.data();
      usersMap[docSnap.id] = data.name || "-";
    });
    // Dynamically re-render logic if reports exist and cross-origin resolved
    if (allReports.length > 0) {
      renderMapMarkers();
      applyFiltersAndSearchCore(); 
    }
  });

  // 2. Main Reports Table
  onSnapshot(collection(db, "reports"), (snapshot) => {
    const rawReports = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));

    // Identify if the app logic is explicitly engineer routing
    const isEngineerPage = window.location.pathname.includes("eng_dashboard");

    if (isEngineerPage) {
      // Engineer perspective only works on uncompleted pending items
      allReports = rawReports.filter((report) => report.status === "pending");
    } else {
      allReports = rawReports;
    }

    // Refresh context efficiently without memory bloat
    renderMapMarkers();
    
    // Natively run the bound logic
    applyFiltersAndSearchCore(); 
  });
}

/* ===================================================
   10. Bootstrapping & Event Attachments
=================================================== */
// Ensure foundational UI systems operate
initCharts();
initDataListeners();

// DOM Events (Filter Bindings)
[
  searchInput,
  filterSeverity,
  filterLocation,
  filterStatus,
  filterId,
  filterDateFrom,
  filterDateTo,
].forEach((el) => {
  if (el) el.addEventListener("input", applyFiltersAndSearch);
});

// DOM Events (Reset Filters)
if (resetFiltersBtn) {
  resetFiltersBtn.addEventListener("click", () => {
    if (filterSeverity) filterSeverity.value = "";
    if (filterLocation) filterLocation.value = "";
    if (filterStatus) filterStatus.value = "";
    if (filterId) filterId.value = "";
    if (filterDateFrom) filterDateFrom.value = "";
    if (filterDateTo) filterDateTo.value = "";
    if (searchInput) searchInput.value = "";
    
    applyFiltersAndSearchCore(); // Force instant re-render bypass debounce
  });
}

// DOM Events (Pagination Bindings)
if (prevPageBtn) {
  prevPageBtn.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      renderTablePaginated();
    }
  });
}

if (nextPageBtn) {
  nextPageBtn.addEventListener("click", () => {
    const totalPages = Math.ceil(filteredReports.length / itemsPerPage);
    if (currentPage < totalPages) {
      currentPage++;
      renderTablePaginated();
    }
  });
}

// DOM Events (Delegated Event Listeners for Table Interactions)
tableBody?.addEventListener("click", (e) => {
  const row = e.target.closest("tr");
  if (!row) return;

  const id = row.getAttribute("data-id");
  if (!id) return;

  if (e.target.closest(".focus-col")) {
    if (typeof window.focusMarker === "function") {
      window.focusMarker(id);
    }
  }
});

/* ===================================================
   11. Public Window Scope Functions
=================================================== */
window.focusMarker = function (id) {
  const item = markersMap[id];
  const gMap = getMap();
  if (!item || !gMap) return;

  gMap.setZoom(15);
  gMap.panTo(item.position);

  if (activePopup) {
    activePopup.setMap(null);
  }

  // Ensure we render the freshest popup contents
  activePopup = new CustomPopup(item.position, item.popupContent);
  activePopup.setMap(gMap);
};