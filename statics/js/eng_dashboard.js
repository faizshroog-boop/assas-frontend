
/* ===================================================
   1. Imports
=================================================== */
import { db, auth } from "./firebase.js";

import {
  collection,
  onSnapshot,
  updateDoc,
  doc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

/* ===================================================
   2. State & Variables
=================================================== */
// Data State
let allReports = [];
let filteredReports = [];
let markersMap = {};
let usersMap = {};
let activePopup = null;

// Pagination State
let currentPage = 1;
const itemsPerPage = 10;

// Chart Instances
let completedChart = null;
let inProgressChart = null;
let totalChart = null;
let assignedChart = null;

/* ===================================================
   3. DOM Elements
=================================================== */
// Main Table & Search
const tableBody = document.getElementById("tableBody");
const searchInput = document.getElementById("searchInput");

// Filters
const filterSeverity = document.getElementById("filterSeverity");
const filterLocation = document.getElementById("filterLocation");
const filterId = document.getElementById("filterId");
const filterDateFrom = document.getElementById("filterDateFrom");
const filterDateTo = document.getElementById("filterDateTo");
const resetFiltersBtn = document.getElementById("resetFiltersBtn");

// Pagination
const prevPageBtn = document.getElementById("prevPageBtn");
const nextPageBtn = document.getElementById("nextPageBtn");
const pageInfo = document.getElementById("pageInfo");

/* ===================================================
   4. Constants & Translations
=================================================== */
const TRANSLATIONS = {
  status: {
    completed: "مكتمل",
    in_progress: "قيد التنفيذ",
    pending: "غير مكتمل"
  },
  severity: {
    high: "عالية",
    medium: "متوسطة",
    low: "منخفضة"
  }
};

/* ===================================================
   5. Helpers & Utilities
=================================================== */
function parseFirestoreDate(field) {
  if (!field) return null;
  if (typeof field.toDate === "function") return field.toDate();
  const date = new Date(field);
  return isNaN(date.getTime()) ? null : date;
}

function formatDate(date) {
  if (!date) return "-";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getColor(report) {
  if (!report) return "green";
  if (report.status === "completed") return "green";
  if (report.severity === "high") return "red";
  if (report.severity === "medium") return "orange";
  if (report.severity === "low") return "yellow";
  return "green"; 
}

function debounce(func, delay = 300) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), delay);
  };
}

function getMap() {
  return typeof map !== "undefined" ? map : (typeof window !== "undefined" ? window.map : null);
}

/* ===================================================
   6. Chart Logic
=================================================== */
function createChart(id, color) {
  const canvas = document.getElementById(id);
  if (!canvas || typeof window.Chart === "undefined") return null;

  const ctx = canvas.getContext("2d");
  return new window.Chart(ctx, {
    type: "doughnut",
    data: {
      datasets: [
        {
          data: [0, 100],
          backgroundColor: [color, "#eeeeee"],
          borderWidth: 0,
          cutout: "75%",
        },
      ],
    },
    options: {
      responsive: false,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
        datalabels: {
          display: (context) => context.dataIndex === 0,
          color: "#000",
          font: { size: 22, weight: "bold" },
          anchor: "center",
          align: "center",
          formatter: (value) => Math.round(value) + "%",
        },
      },
    },
    plugins: [
      {
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
      },
    ],
  });
}

function initCharts() {
  completedChart = createChart("completedChart", "#2ecc71");
  inProgressChart = createChart("inProgressChart", "#f39c12");
  totalChart = createChart("totalChart", "#9b59b6");
  assignedChart = createChart("assignedChart", "#3498db");
  
}

function updateChartDataSafe(chart, value, total) {
  if (chart && chart.data?.datasets?.length) {
    // Avoid division by zero issues or negative others
    const others = Math.max(0, total - value);
    if (total === 0) {
      chart.data.datasets[0].data = [0, 1]; // Shows 0%
    } else {
      chart.data.datasets[0].data = [value, others];
    }
    
    // Calculate percentage purely for the display plugin if needed
    // However, our data array sets the ratio which calculates doughnut segments
    // Wait, the plugin centerText renders the actual `data[0]` value...
    // Let's store the percentage in data[0] so the doughnut correctly scales to 100% total
    const percentage = total === 0 ? 0 : (value / total) * 100;
    const remainder = 100 - percentage;
    chart.data.datasets[0].data = [percentage, remainder];
    chart.update();
  }
}


/* ===================================================
   7. Map Popup Component
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
    if (panes?.floatPane) {
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
      this.containerDiv.style.left = `${point.x}px`;
      this.containerDiv.style.top = `${point.y}px`;
    }
  }

  onRemove() {
    if (this.containerDiv.parentElement) {
      this.containerDiv.parentElement.removeChild(this.containerDiv);
    }
  }
}

function buildPopupContent(report) {
  if (!report) return "";

  const createdDate = parseFirestoreDate(report.created_at || report.created_at_string);
  const completedDate = parseFirestoreDate(report.completed_at);
  const employeeName = usersMap[report.created_by] || "-";
  const safeId = report.id ? report.id.substring(0, 5) : "-";

  return `
    <div style="
    position:relative;
    width:min(90vw,320px); 
    max-height:80vh; 
    overflow-y:auto; 
    padding:20px; 
    font-family:Cairo; 
    text-align:right; 
    background:white;
    border-top:6px solid ${getColor(report)};
    border-radius:14px; 
    box-shadow:0 15px 35px rgba(0,0,0,0.25);">
      <button id="closePopupBtn" style="
      position:absolute; 
      top:10px; 
      left:10px; 
      border:none; 
      background:#eee; 
      width:30px; 
      height:30px; 
      border-radius:50%; 
      cursor:pointer;">✕</button>
      
      ${report.image_url ? `<img src="${report.image_url}" style="width:100%;height:180px;object-fit:cover;border-radius:10px;margin-bottom:10px;" onerror="this.style.display='none'" />` : ""}
      <h4 style="margin:8px 0; color:#0c5742; font-size:18px">#${safeId}</h4>
      <p style="margin:5px 0;">👤 <b>الموظف:</b> ${employeeName}</p>
      <p style="margin:5px 0;">📅 <b>تاريخ الإنشاء:</b> ${formatDate(createdDate)}</p>
      <p style="margin:5px 0;">📍 <b>الموقع:</b> ${report.street_name || "-"}</p>
      <p style="margin:5px 0;">🚦 <b>الحالة:</b> ${TRANSLATIONS.status[report.status] || "-"}</p>
      <p style="margin:5px 0;">🤖 <b>التنبؤ :</b> ${TRANSLATIONS.severity[report.prediction] || "-"}</p>
      <p style="margin:5px 0;">✅ <b>تاريخ الإكتمال:</b> ${formatDate(completedDate)}</p>
    </div>
  `;
}

/* ===================================================
   8. Map & Table Rendering
=================================================== */
function renderMapMarkers() {
  const gMap = getMap();
  if (typeof google === "undefined" || !gMap) return;

  const currentIds = new Set(allReports.map((r) => r.id));

  // Purge any stale markers no longer in dataset
  Object.keys(markersMap).forEach((id) => {
    if (!currentIds.has(id)) {
      markersMap[id].marker.setMap(null);
      delete markersMap[id];
    }
  });

  // Create or update markers
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

      marker.setMap(null); // Hidden by default, evaluated later

      marker.addListener("click", () => {
        if (activePopup) activePopup.setMap(null);
        activePopup = new CustomPopup(position, buildPopupContent(report));
        activePopup.setMap(gMap);
      });

      markersMap[report.id] = { marker, position, popupContent: buildPopupContent(report) };
    } else {
      // Re-evaluate popup & color in case data mutated
      markersMap[report.id].popupContent = buildPopupContent(report);
      const newColor = getColor(report);
      markersMap[report.id].marker.setIcon({ url: `https://maps.google.com/mapfiles/ms/icons/${newColor}-dot.png` });
    }
  });
}

function renderTablePaginated() {
  if (!tableBody) return;
  tableBody.innerHTML = "";

  const totalItems = filteredReports.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));

  // Clamp pagination boundaries safely
  currentPage = Math.min(Math.max(1, currentPage), totalPages);

  const startIndex = (currentPage - 1) * itemsPerPage;
  const pageData = filteredReports.slice(startIndex, startIndex + itemsPerPage);

  const rowsHtml = pageData.map((report) => {
    const color = getColor(report);
    const createdDate = parseFirestoreDate(report.created_at || report.created_at_string);
    const safeId = report.id ? report.id.substring(0, 5) : "-";

    return `
      <tr data-id="${report.id}" style="cursor: pointer;">
        <td>
          <button class="action-btn assign-btn" aria-label="إسناد التقرير">
            <i class="fa-solid fa-user-plus"></i>
          </button>
        </td>
        <td class="focus-col" style="cursor: pointer;">
          #${safeId}
        </td>
        <td>${formatDate(createdDate)}</td>
        <td>${report.street_name || "غير محدد"}</td>
        <td>${report.damage_type || "-"}</td>
        <td>
          <span class="status-dot tooltip ${color}"></span>
          ${TRANSLATIONS.severity[report.severity] || "-"}
        </td>
        <td>
          ${TRANSLATIONS.severity[report.prediction] || "-"}
        </td>
      </tr>
    `;
  }).join("");

  tableBody.insertAdjacentHTML("beforeend", rowsHtml);

}

/* ===================================================
   9. Filters Logic
=================================================== */
function applyFiltersAndSearchCore() {
  const searchVal = (searchInput?.value || "").trim().toLowerCase();
  const severityVal = filterSeverity?.value || "";
  const locationVal = filterLocation?.value || "";
  const idVal = (filterId?.value || "").trim().toLowerCase();

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
  filteredReports = [];
  const mapVisibleIds = new Set();

  allReports.forEach((report) => {
    let matches = true;

    // 1. Global Search
    if (searchVal) {
      const rowIdMatch = report.id?.toLowerCase().includes(searchVal);
      const rowStreetMatch = report.street_name?.toLowerCase().includes(searchVal);
      if (!rowIdMatch && !rowStreetMatch) matches = false;
    }

    // 2. Specific Field Filters
    if (matches && severityVal && report.severity !== severityVal) matches = false;
    if (matches && locationVal && !report.street_name?.includes(locationVal)) matches = false;
    if (matches && idVal && !report.id?.toLowerCase().includes(idVal)) matches = false;

    // 3. Date Range Frame
    if (matches) {
      const reportDate = parseFirestoreDate(report.created_at || report.created_at_string);
      if (reportDate) {
        if (dateFromVal && reportDate < dateFromVal) matches = false;
        if (dateToVal && reportDate > dateToVal) matches = false;
      }
    }

if (matches) {
  // الماب: يظهر كل الحالات
  mapVisibleIds.add(report.id);

  // الجدول: فقط غير مكتملة
  if (report.status === "pending") {
    filteredReports.push(report);
  }

  // الفوكس
  if (!firstMatch && (searchVal || idVal)) {
    firstMatch = report.id;
  }
}
  });

  const gMap = getMap();

  // Sync map markers visibility based on filters (for all statuses)
  Object.entries(markersMap).forEach(([id, obj]) => {
    const isVisible = mapVisibleIds.has(id);
    const targetMap = isVisible ? gMap : null;
    if (obj.marker.getMap() !== targetMap) {
      obj.marker.setMap(targetMap);
    }
  });

  // Don't auto-focus if search is empty to prevent snapping map randomly
  if (firstMatch && (searchVal || idVal) && typeof window.focusMarker === "function") {
    window.focusMarker(firstMatch);
  }

  // Reset to first page safely and render table
  currentPage = 1;
  renderTablePaginated();
}

/** 
 * Debounced wrapper to prevent thrashing DOM/Map memory when typing rapidly. 
 */
const applyFiltersAndSearch = debounce(applyFiltersAndSearchCore, 300);

function updateChartsTotals(reports) {
  const currentUserId = auth.currentUser?.uid;
  if (!currentUserId) return;

  let counts = {
    pending: 0,
    assignedToMe: 0,
    completed: 0,
    inProgress: 0
  };

  reports.forEach((r) => {
    // 1. كل البلاغات غير المكتملة (global)
    if (r.status === "pending") {
      counts.pending++;
    }

    // 2. البلاغات الخاصة بالمهندس
    if (r.assigned_to === currentUserId) {
      counts.assignedToMe++;

      if (r.status === "completed") counts.completed++;
      if (r.status === "in_progress") counts.inProgress++;
    }
  });

  // 🟢 تحديث الشارتات

  // pending (من كل البلاغات)
  updateChartDataSafe(totalChart, counts.pending, reports.length);

  // assigned to me (من كل البلاغات)
  updateChartDataSafe(assignedChart, counts.assignedToMe, reports.length);

  // completed (من بلاغاتي فقط)
  updateChartDataSafe(completedChart, counts.completed, counts.assignedToMe);

  // in progress (من بلاغاتي فقط)
  updateChartDataSafe(inProgressChart, counts.inProgress, counts.assignedToMe);
}


/* ===================================================
   10. Initialization & Listeners
=================================================== */
function initDataListeners() {
  let isAuthReady = false;

  // 1. Wait for auth first
  onAuthStateChanged(auth, (user) => {
    const wasReady = isAuthReady;
    isAuthReady = true;
    
    // Auth dictates our charts perspective
    updateChartsTotals(filteredReports);
    if (!wasReady && allReports.length > 0) {
      applyFiltersAndSearchCore();
    }
  });

  // 2. Users
  onSnapshot(
    collection(db, "users"),
    (snapshot) => {
      usersMap = {};
      snapshot.docs.forEach((docSnap) => {
        usersMap[docSnap.id] = docSnap.data().name || "-";
      });

      if (allReports.length > 0 && isAuthReady) {
        renderMapMarkers();
        renderTablePaginated();
      }
    },
    (err) => console.error("Error fetching users:", err)
  );

  // 3. Reports
  onSnapshot(
    collection(db, "reports"),
    (snapshot) => {
      allReports = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));

      // Only run map/filters AFTER auth is ready
      if (isAuthReady) {
        updateChartsTotals(allReports);
        renderMapMarkers();
        applyFiltersAndSearchCore();
      }
    },
    (err) => console.error("Error fetching reports:", err)
  );
}

function bindEvents() {
  const filterInputs = [
    searchInput,
    filterSeverity,
    filterLocation,
    filterId,
    filterDateFrom,
    filterDateTo,
  ];

  // Map input events for live filtering
  filterInputs.forEach((el) => {
    if (el) el.addEventListener("input", applyFiltersAndSearch);
  });

  // Reset Filters logic
  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener("click", () => {
      filterInputs.forEach((el) => {
        if (el) el.value = "";
      });
      applyFiltersAndSearchCore(); // Force instant bypass of debounce
    });
  }

  // Pagination navigation
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

  // Delegated Event Listeners for Table Interactions
  tableBody?.addEventListener("click", (e) => {
    const row = e.target.closest("tr");
    if (!row) return;

    const id = row.getAttribute("data-id");
    if (!id) return;

    if (e.target.closest(".assign-btn")) {
      assignReport(id);
      return;
    }

    if (e.target.closest(".focus-col") && typeof window.focusMarker === "function") {
      window.focusMarker(id);
    }
  });
}

function initApp() {
  initCharts();
  bindEvents();
  initDataListeners();
}

// Ensure foundational UI systems operate
initApp();

/* ===================================================
   11. Public Window API Scope
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

// Assign report to current engineer
window.assignReport = async function(id) {
  const user = auth.currentUser;

  if (!user) {
    alert("يجب تسجيل الدخول أولاً");
    return;
  }

  const report = allReports.find((r) => r.id === id);

  if (!report) return;

  // 🔒 Check if already assigned
  if (report.assigned_to) {
    alert("هذا البلاغ تم إسناده بالفعل");
    return;
  }

  try {
    const reportRef = doc(db, "reports", id);
    await updateDoc(reportRef, {
      assigned_to: user.uid,
      assigned_at: serverTimestamp(),
      status: "in_progress",
    });

    alert("تم إسناد البلاغ لك بنجاح");
  } catch (err) {
    console.error("Error assigning report:", err);
    alert("فشل في إسناد البلاغ, الرجاء المحاولة مجدداً");
  }
};

const assignReport = window.assignReport;