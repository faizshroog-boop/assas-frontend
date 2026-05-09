
/* =================================================== IMPORTS =================================================== */
import { db, auth } from "./firebase.js";
import { collection, onSnapshot, updateDoc, doc, serverTimestamp, query, orderBy, deleteDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { addActivity } from "./utils.js";

/* =================================================== CONSTANTS =================================================== */
const statusTranslation = {
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
const itemsPerPage = 8;

/* =================================================== STATE/VARIABLES =================================================== */
let allReports = [];
let filteredReports = [];
let markersMap = {};
let usersMap = {};
let activePopup = null;
let currentPage = 1;
let completedChart = null;
let inProgressChart = null;
let totalChart = null;
let assignedChart = null;
const tableBody = document.getElementById("tableBody");
const searchInput = document.getElementById("searchInput");
const filterSeverity = document.getElementById("filterSeverity");
const filterLocation = document.getElementById("filterLocation");
const filterDamageType = document.getElementById("filterDamageType");
const filterDateFrom = document.getElementById("filterDateFrom");
const filterDateTo = document.getElementById("filterDateTo");
const resetFiltersBtn = document.getElementById("resetFiltersBtn");
const prevPageBtn = document.getElementById("prevPageBtn");
const nextPageBtn = document.getElementById("nextPageBtn");

/* =================================================== HELPERS/UTILS =================================================== */
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
const getColor = (report) => {
  const sev = String(report.severity || "").toLowerCase();
  if (sev === "high" || sev === "red" || sev === "عالية") return "red";
  if (sev === "medium" || sev === "orange" || sev === "متوسطة") return "orange";
  if (sev === "low" || sev === "yellow" || sev === "منخفضة") return "yellow";
  return "green";
};
function normalizeSeverity(val) {
  if (!val) return "";
  val = String(val).toLowerCase();
  if (["high", "red", "عالية"].includes(val)) return "high";
  if (["medium", "orange", "متوسطة"].includes(val)) return "medium";
  if (["low", "yellow", "منخفضة"].includes(val)) return "low";
  if (["green", "طبيعي"].includes(val)) return "green";
  return val;
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
function showToast(message, type = "assign") {
  const container = document.querySelector(".toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.classList.add("toast", type);
  const iconMap = {
    assign: "fa-user-plus",
    error: "fa-triangle-exclamation",
  };
  toast.innerHTML = `<i class="fa-solid ${iconMap[type] || "fa-info"}"></i><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

/* =================================================== MAIN LOGIC =================================================== */
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
    if (panes?.floatPane) panes.floatPane.appendChild(this.containerDiv);
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
    if (this.containerDiv.parentElement) this.containerDiv.parentElement.removeChild(this.containerDiv);
  }
}
function buildPopupContent(report) {
  if (!report) return "";
  const employeeName = usersMap[report.created_by] || "-";
  const safeId = report.id ? report.id.substring(0, 5) : "-";
  return `
    <div style="position:relative;width:min(90vw,320px);max-height:80vh;overflow-y:auto;padding:20px;font-family:Cairo;text-align:right;background:white;border-top:6px solid ${getColor(report)};border-radius:14px;box-shadow:0 15px 35px rgba(0,0,0,0.25);">
      <button id="closePopupBtn" style="position:absolute;top:10px;left:10px;border:none;background:#eee;width:30px;height:30px;border-radius:50%;cursor:pointer;">✕</button>
      ${report.image_url ? `<img src="${report.image_url}" style="width:100%;height:180px;object-fit:cover;border-radius:10px;margin-bottom:10px;" onerror="this.style.display='none'" />` : ""}
      <h4 style="margin:8px 0; color:#0c5742; font-size:18px">#${safeId}</h4>
      <p style="margin:5px 0;">👤 <b>الموظف:</b> ${employeeName}</p>
      <p style="margin:5px 0;">🚦 <b>الحالة:</b> ${statusTranslation[report.status] || "-"}</p>
      <hr style="margin:10px 0; opacity:0.2;" />
      <p style="margin:5px 0;">📍 <b>الموقع:</b> ${report.street_name || "-"}</p>
      <p style="margin:5px 0;">⚠️ <b>الخطورة :</b> ${severityTranslation[report.severity] || "-"}</p>
      <p style="margin:5px 0;">🤖 <b>التنبؤ :</b> ${report.prediction_note || report.prediction || "لا يوجد تحليل"}</p>
    </div>
  `;
}
function renderMapMarkers() {
  const gMap = getMap();
  if (typeof google === "undefined" || !gMap) return;
  const currentIds = new Set(allReports.map((r) => r.id));
  Object.keys(markersMap).forEach((id) => {
    if (!currentIds.has(id)) {
      markersMap[id].marker.setMap(null);
      delete markersMap[id];
    }
  });
  allReports.forEach((report) => {
    if (!report.latitude || !report.longitude) return;
    if (!markersMap[report.id]) {
      const color = getColor(report);
      const position = new google.maps.LatLng(parseFloat(report.latitude), parseFloat(report.longitude));
      const marker = new google.maps.Marker({
        position,
        icon: { url: `https://maps.google.com/mapfiles/ms/icons/${color}-dot.png` },
      });
      marker.setMap(null);
      marker.addListener("click", () => {
        if (activePopup) activePopup.setMap(null);
        activePopup = new CustomPopup(position, buildPopupContent(report));
        activePopup.setMap(gMap);
      });
      markersMap[report.id] = { marker, position, popupContent: buildPopupContent(report) };
    } else {
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
        <td class="focus-col" style="cursor: pointer;">#${safeId}</td>
        <td>${formatDate(createdDate)}</td>
        <td>${report.street_name || "غير محدد"}</td>
        <td>${damageTypeTranslation[report.damage_type] || report.damage_type || "-"}</td>
        <td><span class="status-dot tooltip ${color}"></span></td>
        <td>${report.prediction_note || report.prediction || "لا يوجد تحليل"}</td>
      </tr>
    `;
  }).join("");
  tableBody.insertAdjacentHTML("beforeend", rowsHtml);
}
function applyFiltersAndSearchCore() {
  const searchVal = (searchInput?.value || "").trim().toLowerCase();
  const severityVal = filterSeverity?.value;
  const locationVal = filterLocation?.value;
  const damageVal = filterDamageType?.value;
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
  filteredReports = [];
  const mapVisibleIds = new Set();
  let firstMatch = null;
  allReports.forEach((report) => {
    let matches = true;
    if (report.status !== "pending") return;
    if (searchVal) {
      const idMatch = report.id?.toLowerCase().includes(searchVal);
      const streetMatch = report.street_name?.toLowerCase().includes(searchVal);
      if (!idMatch && !streetMatch) matches = false;
    }
    if (severityVal) {
      if (normalizeSeverity(report.severity) !== severityVal) matches = false;
    }
    if (damageVal) {
      const reportDamage = String(report.damage_type || "").toLowerCase().trim();
      if (reportDamage !== damageVal.toLowerCase()) matches = false;
    }
    if (locationVal && !String(report.street_name || "").toLowerCase().includes(locationVal.toLowerCase())) matches = false;
    const reportDate = parseFirestoreDate(report.created_at || report.created_at_string);
    if (reportDate) {
      if (dateFromVal && reportDate < dateFromVal) matches = false;
      if (dateToVal && reportDate > dateToVal) matches = false;
    }
    if (matches) {
      filteredReports.push(report);
      mapVisibleIds.add(report.id);
      if (!firstMatch) firstMatch = report.id;
    }
  });
  const gMap = getMap();
  Object.entries(markersMap).forEach(([id, obj]) => {
    const isVisible = mapVisibleIds.has(id);
    obj.marker.setMap(isVisible ? gMap : null);
  });
  currentPage = 1;
  renderTablePaginated();
  if (firstMatch && searchVal && typeof window.focusMarker === "function") {
    window.focusMarker(firstMatch);
  }
}
const applyFiltersAndSearch = debounce(applyFiltersAndSearchCore, 300);
function createChart(id, color) {
  const canvas = document.getElementById(id);
  if (!canvas || typeof window.Chart === "undefined") return null;
  const ctx = canvas.getContext("2d");
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
          display: (context) => context.dataIndex === 0,
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
function updateChartDataSafe(chart, value, total) {
  if (chart && chart.data?.datasets?.length) {
    const percentage = total === 0 ? 0 : (value / total) * 100;
    const remainder = 100 - percentage;
    chart.data.datasets[0].data = [percentage, remainder];
    chart.update();
  }
}
function updateChartsTotals(reports) {
  const currentUserId = auth.currentUser?.uid;
  if (!currentUserId) return;
  let counts = { pending: 0, assignedToMe: 0, completed: 0, inProgress: 0 };
  reports.forEach((r) => {
    if (r.status === "pending") counts.pending++;
    if (r.assigned_to === currentUserId) {
      counts.assignedToMe++;
      if (r.status === "completed") counts.completed++;
      if (r.status === "in_progress") counts.inProgress++;
    }
  });
  updateChartDataSafe(totalChart, counts.pending, reports.length);
  updateChartDataSafe(assignedChart, counts.assignedToMe, reports.length);
  updateChartDataSafe(completedChart, counts.completed, counts.assignedToMe);
  updateChartDataSafe(inProgressChart, counts.inProgress, counts.assignedToMe);
}
window.focusMarker = function (id) {
  const item = markersMap[id];
  const gMap = getMap();
  if (!item || !gMap) return;
  gMap.setZoom(15);
  gMap.panTo(item.position);
  if (activePopup) activePopup.setMap(null);
  activePopup = new CustomPopup(item.position, item.popupContent);
  activePopup.setMap(gMap);
};
window.assignReport = async function(id) {
  const user = auth.currentUser;
  if (!user) {
    alert("يجب تسجيل الدخول أولاً");
    return;
  }
  const report = allReports.find((r) => r.id === id);
  if (!report) return;
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
    const engineerName = usersMap[user.uid] || user.displayName || user.email || "المهندس";
    await addActivity(
      `تم إسناد البلاغ #${id.substring(0, 5)} إلى المهندس ${engineerName}`,
      "assign",
      {
        reportId: id,
        targetUserId: user.uid,
      }
    );
    showToast("تم إسناد البلاغ لك بنجاح", "assign");
  } catch (err) {
    showToast("فشل في إسناد البلاغ, الرجاء المحاولة مجدداً", "error");
  }
};

/* =================================================== EVENT LISTENERS =================================================== */
function bindEvents() {
  const filterInputs = [searchInput, filterSeverity, filterDamageType, filterLocation, filterDateFrom, filterDateTo];
  filterInputs.forEach((el) => {
    if (el) el.addEventListener("input", applyFiltersAndSearch);
  });
  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener("click", () => {
      filterInputs.forEach((el) => {
        if (el) el.value = "";
      });
      currentPage = 1;
      applyFiltersAndSearchCore();
    });
  }
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
  tableBody?.addEventListener("click", (e) => {
    const row = e.target.closest("tr");
    if (!row) return;
    const id = row.getAttribute("data-id");
    if (!id) return;
    if (e.target.closest(".assign-btn")) {
      window.assignReport(id);
      return;
    }
    if (e.target.closest(".focus-col") && typeof window.focusMarker === "function") {
      window.focusMarker(id);
    }
  });
}

/* =================================================== INITIALIZATION =================================================== */
function initDataListeners() {
  let isAuthReady = false;
  onAuthStateChanged(auth, (user) => {
    const wasReady = isAuthReady;
    isAuthReady = true;
    updateChartsTotals(filteredReports);
    if (!wasReady && allReports.length > 0) {
      applyFiltersAndSearchCore();
    }
  });
  onSnapshot(collection(db, "users"), (snapshot) => {
    usersMap = {};
    snapshot.docs.forEach((docSnap) => {
      usersMap[docSnap.id] = docSnap.data().name || "-";
    });
    if (allReports.length > 0 && isAuthReady) {
      renderMapMarkers();
      renderTablePaginated();
    }
  });
  onSnapshot(collection(db, "reports"), (snapshot) => {
    allReports = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));
    if (isAuthReady) {
      updateChartsTotals(allReports);
      renderMapMarkers();
      applyFiltersAndSearchCore();
    }
  });
}
function initNotifications() {
  const notificationBtn = document.getElementById("notificationBtn");
  const notificationPanel = document.getElementById("notificationPanel");
  const notificationList = document.getElementById("notificationList");
  const notificationCount = document.getElementById("notificationCount");

  if (!notificationBtn || !notificationPanel || !notificationList || !notificationCount) return;

  const icons = {
    complete: "fa-check",
    success: "fa-check",
    upload: "fa-cloud-arrow-up",
    assign: "fa-user-plus",
    revert: "fa-rotate-left",
    delete: "fa-trash",
    error: "fa-triangle-exclamation",
    update: "fa-pen-to-square",
    general: "fa-bell",
  };
  const allowedTypes = new Set(Object.keys(icons));
  const readNotificationStoragePrefix = "assasEngineerReadNotificationIds";
  const notificationLifetimeMs = 7 * 24 * 60 * 60 * 1000;
  let currentNotificationIds = [];
  let currentUserId = null;
  let assignedReportIds = new Set();
  let assignedReportShortIds = new Set();
  let activityDocs = [];
  let reportDocs = [];

  const getReadNotificationStorageKey = () =>
    `${readNotificationStoragePrefix}:${currentUserId || "guest"}`;

  const getReadNotificationIds = () => {
    try {
      return new Set(JSON.parse(localStorage.getItem(getReadNotificationStorageKey())) || []);
    }
    catch (error) {
      return new Set();
    }
  };

  const saveReadNotificationIds = (ids) => {
    localStorage.setItem(getReadNotificationStorageKey(), JSON.stringify([...ids]));
  };

  const getNotificationDate = (timestamp) => {
    if (!timestamp) return null;
    if (typeof timestamp.toDate === "function") return timestamp.toDate();
    const date = new Date(timestamp);
    return isNaN(date.getTime()) ? null : date;
  };

  const isExpiredNotification = (data) => {
    const createdAt = getNotificationDate(data.createdAt);
    return createdAt && Date.now() - createdAt.getTime() > notificationLifetimeMs;
  };

  const removeExpiredNotification = (id) => {
    deleteDoc(doc(db, "activity_logs", id)).catch((error) => {
      console.error("Notification cleanup error:", error);
    });
  };

  const updateNotificationBadge = () => {
    const readIds = getReadNotificationIds();
    const unreadCount = currentNotificationIds.filter((id) => !readIds.has(id)).length;

    notificationCount.textContent = unreadCount;
    notificationCount.classList.toggle("hidden", unreadCount === 0);
    notificationBtn.classList.toggle("has-unread", unreadCount > 0);
  };

  const markNotificationsAsRead = () => {
    const readIds = getReadNotificationIds();

    currentNotificationIds.forEach((id) => readIds.add(id));
    saveReadNotificationIds(readIds);
    updateNotificationBadge();
  };

  const getShortReportId = (data) => {
    if (data.reportId) return String(data.reportId).substring(0, 5);
    const match = String(data.message || "").match(/#([A-Za-z0-9]{5,})/);
    return match ? match[1].substring(0, 5) : "";
  };

  const isEngineerNotification = (data) => {
    const shortReportId = getShortReportId(data);

    return (
      data.targetUserId === currentUserId ||
      assignedReportIds.has(data.reportId) ||
      assignedReportShortIds.has(shortReportId)
    );
  };

  const getEngineerMessage = (data) => {
    const reportId = getShortReportId(data);
    const displayId = reportId ? `#${reportId}` : "";

    switch (data.type) {
      case "assign":
        return `تم إسناد البلاغ ${displayId} إليك`;
      case "update":
        return `تم تحديث البلاغ ${displayId} الذي تعمل عليه`;
      case "complete":
        return `تم إكمال البلاغ ${displayId} الذي تعمل عليه`;
      case "revert":
        return `تم إرجاع البلاغ ${displayId} إلى غير مكتمل`;
      case "delete":
        return `تم حذف البلاغ ${displayId}`;
      default:
        return data.message || "";
    }
  };

  const refreshAssignedReports = () => {
    const currentAssignedReportIds = new Set();
    const currentAssignedShortIds = new Set();

    reportDocs.forEach((docSnap) => {
      const report = docSnap.data();

      if (report.assigned_to === currentUserId) {
        currentAssignedReportIds.add(docSnap.id);
        currentAssignedShortIds.add(docSnap.id.substring(0, 5));
      }
    });

    assignedReportIds = currentAssignedReportIds;
    assignedReportShortIds = currentAssignedShortIds;
  };

  const renderNotifications = () => {
    if (!currentUserId) return;

    const freshDocs = [];

    activityDocs.forEach((docSnap) => {
      const data = docSnap.data();

      if (isExpiredNotification(data)) {
        removeExpiredNotification(docSnap.id);
        return;
      }

      if (isEngineerNotification(data)) {
        freshDocs.push(docSnap);
      }
    });

    currentNotificationIds = freshDocs.map((docSnap) => docSnap.id);

    const readIds = getReadNotificationIds();
    const freshIdSet = new Set(currentNotificationIds);

    [...readIds].forEach((id) => {
      if (!freshIdSet.has(id)) readIds.delete(id);
    });
    saveReadNotificationIds(readIds);

    notificationList.innerHTML = "";
    updateNotificationBadge();

    if (freshDocs.length === 0) {
      const empty = document.createElement("div");
      empty.className = "notification-empty";
      empty.textContent = "لا توجد إشعارات خاصة ببلاغاتك حالياً";
      notificationList.appendChild(empty);
      return;
    }

    freshDocs.forEach((docSnap) => {
      const data = docSnap.data();
      const type = allowedTypes.has(data.type) ? data.type : "general";
      const isUnread = !readIds.has(docSnap.id);
      const item = document.createElement("div");
      item.className = `notification-item ${type}${isUnread ? " unread" : ""}`;

      const icon = document.createElement("div");
      icon.className = "notification-icon";
      icon.innerHTML = `<i class="fa-solid ${icons[type]}"></i>`;

      const content = document.createElement("div");
      const title = document.createElement("div");
      title.className = "notification-title";
      title.textContent = getEngineerMessage(data);

      const time = document.createElement("div");
      time.className = "notification-time";
      time.textContent = formatNotificationTime(data.createdAt);

      content.appendChild(title);
      content.appendChild(time);
      item.appendChild(icon);
      item.appendChild(content);
      notificationList.appendChild(item);
    });
  };

  notificationBtn.addEventListener("click", () => {
    notificationPanel.classList.toggle("hidden");

    if (!notificationPanel.classList.contains("hidden")) {
      markNotificationsAsRead();
    }
  });

  onAuthStateChanged(auth, (user) => {
    currentUserId = user?.uid || null;
    refreshAssignedReports();
    renderNotifications();
  });

  onSnapshot(collection(db, "reports"), (snapshot) => {
    reportDocs = snapshot.docs;
    refreshAssignedReports();
    renderNotifications();
  });

  const activityQuery = query(
    collection(db, "activity_logs"),
    orderBy("createdAt", "desc")
  );

  onSnapshot(activityQuery, (snapshot) => {
    activityDocs = snapshot.docs;
    renderNotifications();
  });
}
function formatNotificationTime(timestamp) {
  if (!timestamp) return "";
  return timestamp.toDate().toLocaleString("ar-SA");
}
function initCharts() {
  completedChart = createChart("completedChart", "#2ecc71");
  inProgressChart = createChart("inProgressChart", "#f39c12");
  totalChart = createChart("totalChart", "#9b59b6");
  assignedChart = createChart("assignedChart", "#3498db");
}
function initApp() {
  initCharts();
  bindEvents();
  initDataListeners();
  initNotifications();
}
initApp();
