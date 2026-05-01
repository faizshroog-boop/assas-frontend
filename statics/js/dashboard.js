
/* =================================================== IMPORTS =================================================== */
import { db } from "./firebase.js";
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

/* =================================================== CONSTANTS =================================================== */
const itemsPerPage = 8;
const statusTranslation = {
  completed: "مكتمل",
  in_progress: "قيد التنفيذ",
  pending: "غير مكتمل",
};
const severityTranslation = {
  high: "عالية",
  Red: "عالية",
  medium: "متوسطة",
  Orange: "متوسطة",
  low: "منخفضة",
  Yellow: "منخفضة",
  Green: "طبيعي",
};
const damageTypeTranslation = {
  pothole: "حفرة",
  crack: "تشقق",
  water: "تجمع مياه",
  normal: "سليم",
};

/* =================================================== STATE/VARIABLES =================================================== */
let allReports = [];
let filteredReports = [];
let markersMap = {};
let activePopup = null;
let usersMap = {};
let currentPage = 1;
let highChart, mediumChart, lowChart, completedChart;

const tableBody = document.getElementById("tableBody");
const searchInput = document.getElementById("searchInput");
const filterSeverity = document.getElementById("filterSeverity");
const filterLocation = document.getElementById("filterLocation");
const filterStatus = document.getElementById("filterStatus");
const filterDamageType = document.getElementById("filterDamageType");
const filterDateFrom = document.getElementById("filterDateFrom");
const filterDateTo = document.getElementById("filterDateTo");
const resetFiltersBtn = document.getElementById("resetFiltersBtn");
const prevPageBtn = document.getElementById("prevPageBtn");
const nextPageBtn = document.getElementById("nextPageBtn");
const pageInfo = document.getElementById("pageInfo");

/* =================================================== HELPERS/UTILS =================================================== */
const getColor = (report) => {
  const sev = String(report.severity || "").toLowerCase();
  if (sev === "high" || sev === "red" || sev === "عالية") return "red";
  if (sev === "medium" || sev === "orange" || sev === "متوسطة") return "orange";
  if (sev === "low" || sev === "yellow" || sev === "منخفضة") return "yellow";
  return "green";
};

function updateChartDataSafe(chartInstance, count, total) {
  if (!chartInstance) return;
  const percent = total ? (count / total) * 100 : 0;
  chartInstance.data.datasets[0].data = [percent, 100 - percent];
  chartInstance.update();
}

function formatDate(date) {
  if (!date) return "-";
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${year}-${month}-${day}`;
}

function createChart(id, color) {
  const ctx = document.getElementById(id).getContext("2d");
  return new Chart(ctx, {
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
          display: function (ctx) {
            return ctx.dataIndex === 0;
          },
          color: "#000",
          font: { size: 22, weight: "bold" },
          anchor: "center",
          align: "center",
          formatter: (value) => {
            return Math.round(value) + "%";
          },
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
          const value = chart.data.datasets[0].data[0];
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

class CustomPopup extends google.maps.OverlayView {
  constructor(position, content) {
    super();
    this.position = position;
    this.containerDiv = document.createElement("div");
    this.containerDiv.innerHTML = content;
    this.containerDiv.style.position = "absolute";
    this.containerDiv.style.transform = "translate(-50%, -100%)";
    this.containerDiv.style.zIndex = "1000";
  }

  onAdd() {
    const panes = this.getPanes();
    panes.floatPane.appendChild(this.containerDiv);
    const closeBtn = this.containerDiv.querySelector("#closePopupBtn");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        this.setMap(null);
        activePopup = null;
      });
    }
  }

  draw() {
    const projection = this.getProjection();
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

/* =================================================== MAIN LOGIC =================================================== */
window.focusMarker = function (id) {
  const item = markersMap[id];
  if (!item) return;

  map.setZoom(15);
  map.panTo(item.position);

  if (activePopup) activePopup.setMap(null);

  activePopup = new CustomPopup(item.position, item.popupContent);
  activePopup.setMap(map);
};

function renderAllReports() {
  filteredReports = [...allReports];
  currentPage = 1;

  Object.values(markersMap).forEach((obj) => {
    obj.marker.setMap(null);
  });
  markersMap = {};

  applyFiltersAndSearch();

  allReports.forEach((report) => {
    if (report.latitude && report.longitude && !markersMap[report.id]) {
      const color = getColor(report);
      const position = new google.maps.LatLng(
        parseFloat(report.latitude),
        parseFloat(report.longitude)
      );

      const createdDate = report.created_at?.toDate?.()
        ? report.created_at.toDate()
        : report.created_at_string
        ? new Date(report.created_at_string)
        : null;

      const assignedDate = report.assigned_at?.toDate?.()
        ? report.assigned_at.toDate()
        : report.assigned_at
        ? new Date(report.assigned_at)
        : null;

      const completedDate = report.completed_at?.toDate?.()
        ? report.completed_at.toDate()
        : report.completed_at
        ? new Date(report.completed_at)
        : null;

      const employeeName = usersMap[report.created_by || report.user_id] || "-";
      const engineerName = usersMap[report.assigned_to || report.engineer_id] || "-";

      const marker = new google.maps.Marker({
        position: position,
        map: map,
        icon: {
          url: `https://maps.google.com/mapfiles/ms/icons/${color}-dot.png`,
        },
      });

      const popupContent = `
<div style="position:relative; width:min(90vw,320px); max-height:80vh; overflow-y:auto; padding:20px; font-family:Cairo; text-align:right; background:white;border-top:6px solid ${getColor(report)}; border-radius:14px; box-shadow:0 15px 35px rgba(0,0,0,0.25);">
<button id="closePopupBtn" style="position:absolute; top:10px; left:10px; border:none; background:#eee; width:30px; height:30px; border-radius:50%; cursor:pointer;">✕</button>
<h4 style="margin:8px 0; color:#0c5742; font-size:18px">#${report.id.substring(0, 5)}</h4>
<p style="margin:5px 0;">👤 <b>الموظف:</b> ${employeeName}</p>
<p style="margin:5px 0;">🧑‍💼 <b>المهندس:</b> ${engineerName}</p>
<hr style="margin:10px 0; opacity:0.2;" />
<p style="margin:5px 0;">📅 <b>تاريخ الإنشاء:</b> ${formatDate(createdDate)}</p>
<p style="margin:5px 0;">📤 <b>تاريخ الإسناد:</b> ${formatDate(assignedDate)}</p>
<p style="margin:5px 0;">✅ <b>تاريخ الإكتمال:</b> ${formatDate(completedDate)}</p>
<hr style="margin:10px 0; opacity:0.2;" />
<p style="margin:5px 0;">📍 <b>الموقع:</b> ${report.street_name || "-"}</p>
<p style="margin:5px 0;">🚦 <b>الحالة:</b> ${statusTranslation[report.status] || "-"}</p>
</div>
`;
      marker.addListener("click", () => {
        if (activePopup) {
          activePopup.setMap(null);
        }
        activePopup = new CustomPopup(position, popupContent);
        activePopup.setMap(map);
      });

      markersMap[report.id] = { marker, position, popupContent };
    }
  });
}

function renderTablePaginated() {
  tableBody.innerHTML = "";

  const totalItems = filteredReports.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;

  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const pageData = filteredReports.slice(startIndex, endIndex);

  pageData.forEach((report) => {
    const color = getColor(report);
    const completedClass = report.status === "completed" ? "row-completed" : "";

    tableBody.insertAdjacentHTML(
      "beforeend",
      `
            <tr data-id="${report.id}" class="${completedClass}" style="cursor: pointer;">
              <td class="focus-col">
                #${report.id.substring(0, 5)}
              </td>
              <td>${statusTranslation[report.status] || "-"}</td>
              <td>${report.street_name || "غير محدد"}</td>
              <td>${damageTypeTranslation[report.damage_type] || report.damage_type || "-"}</td>
              <td>${report.prediction_note || report.prediction || "لا يوجد تحليل"}</td>
              <td>
                <span class="status-dot ${color}"></span>
              </td>
            </tr> `
    );
  });

  pageInfo.innerText = `صفحة ${currentPage} من ${totalPages}`;
  prevPageBtn.disabled = currentPage === 1;
  nextPageBtn.disabled = currentPage === totalPages;
}

function applyFiltersAndSearch() {
  const searchVal = searchInput.value.trim().toLowerCase();
  const severityVal = filterSeverity.value;
  const locationVal = filterLocation.value;
  const statusVal = filterStatus.value;
  const damageVal = filterDamageType.value;

  const dateFromVal = filterDateFrom.value ? new Date(filterDateFrom.value) : null;
  if (dateFromVal) dateFromVal.setHours(0, 0, 0, 0);

  const dateToVal = filterDateTo.value ? new Date(filterDateTo.value) : null;
  if (dateToVal) dateToVal.setHours(23, 59, 59, 999);

  filteredReports = [];
  let firstMatch = null;

  allReports.forEach((report) => {
    let isMatch = true;

    if (searchVal) {
      const idMatch = report.id?.includes(searchVal);
      const streetMatch = report.street_name?.toLowerCase().includes(searchVal);
      if (!idMatch && !streetMatch) isMatch = false;
    }

    if (severityVal && report.severity !== severityVal) isMatch = false;
    if (statusVal && report.status !== statusVal) isMatch = false;
    if (damageVal && report.damage_type !== damageVal) isMatch = false;

    if (locationVal && (!report.street_name || !report.street_name.includes(locationVal))) {
      isMatch = false;
    }

    if (report.created_at?.toDate) {
      const d = report.created_at.toDate();
      if (dateFromVal && d < dateFromVal) isMatch = false;
      if (dateToVal && d > dateToVal) isMatch = false;
    }

    if (isMatch) {
      filteredReports.push(report);
      if (!firstMatch && (searchVal || report.id)) {
        firstMatch = report.id;
      }
    }
  });

  Object.values(markersMap).forEach((obj) => obj.marker.setMap(null));

  filteredReports.forEach((report) => {
    if (markersMap[report.id]) {
      markersMap[report.id].marker.setMap(map);
    }
  });

  if (firstMatch) focusMarker(firstMatch);

  currentPage = 1;
  renderTablePaginated();
}

/* =================================================== EVENT LISTENERS =================================================== */
[
  searchInput,
  filterSeverity,
  filterLocation,
  filterStatus,
  filterDateFrom,
  filterDateTo,
].forEach((el) => el.addEventListener("input", applyFiltersAndSearch));

prevPageBtn.addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    renderTablePaginated();
  }
});

nextPageBtn.addEventListener("click", () => {
  const totalPages = Math.ceil(filteredReports.length / itemsPerPage);
  if (currentPage < totalPages) {
    currentPage++;
    renderTablePaginated();
  }
});

resetFiltersBtn.addEventListener("click", () => {
  filterSeverity.value = "";
  filterLocation.value = "";
  filterStatus.value = "";
  filterDamageType.value = "";
  filterDateFrom.value = "";
  filterDateTo.value = "";
  searchInput.value = "";

  applyFiltersAndSearch();
});

tableBody.addEventListener("click", (e) => {
  const row = e.target.closest("tr");
  if (!row) return;

  const id = row.getAttribute("data-id");
  if (!id) return;

  if (e.target.closest(".focus-col")) {
    window.focusMarker(id);
  }
});

/* =================================================== INITIALIZATION =================================================== */
highChart = createChart("highChart", "#e74c3c");
mediumChart = createChart("mediumChart", "#f39c12");
lowChart = createChart("lowChart", "#f1c40f");
completedChart = createChart("completedChart", "#2ecc71");

onSnapshot(collection(db, "reports"), (snapshot) => {
  allReports = snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));

  let totalReports = allReports.length;
  let counts = { high: 0, medium: 0, low: 0, completed: 0 };

  allReports.forEach((report) => {
    switch (report.severity) {
      case "high":
        counts.high++;
        break;
      case "medium":
        counts.medium++;
        break;
      case "low":
        counts.low++;
        break;
    }
    if (report.status === "completed") {
      counts.completed++;
    }
  });

  onSnapshot(collection(db, "users"), (snapshot) => {
    usersMap = {};

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      usersMap[docSnap.id] = data.name || data.fullName || data.displayName || "-";
    });

    if (allReports.length > 0) {
      renderAllReports();
    }
  });

  renderAllReports();

  updateChartDataSafe(highChart, counts.high, totalReports);
  updateChartDataSafe(mediumChart, counts.medium, totalReports);
  updateChartDataSafe(lowChart, counts.low, totalReports);
  updateChartDataSafe(completedChart, counts.completed, totalReports);

  applyFiltersAndSearch();
});
