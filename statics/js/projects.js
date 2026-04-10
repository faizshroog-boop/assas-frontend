/* ===================================================
   1. Imports
=================================================== */
import { db } from "./firebase.js";
import { collection, onSnapshot, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

/* ===================================================
   2. Global State & Variables
=================================================== */
let usersMap = {}; // key: user id, value: user name
let allReports = [];      // All fetched reports
let filteredReports = []; // Currently filtered items
let currentPage = 1;
const itemsPerPage = 10;

/* ===================================================
   3. DOM Elements
=================================================== */
const tableBody = document.getElementById("tableBody");
const searchInput = document.getElementById("searchInput");

// Filter DOM Elements
const filterSeverity = document.getElementById("filterSeverity");
const filterLocation = document.getElementById("filterLocation");
const filterStatus = document.getElementById("filterStatus");
const filterId = document.getElementById("filterId");
const filterDateFrom = document.getElementById("filterDateFrom");
const filterDateTo = document.getElementById("filterDateTo");
const resetFiltersBtn = document.getElementById("resetFiltersBtn");

// Pagination DOM Elements
const prevPageBtn = document.getElementById("prevPageBtn");
const nextPageBtn = document.getElementById("nextPageBtn");
const pageInfo = document.getElementById("pageInfo");

// Details Card
const reportDetailsCard = document.getElementById("reportDetailsCard");

/* ===================================================
   4. Constants / Translations
=================================================== */
const statusTranslation = {
  completed: "مكتمل",
  in_progress: "قيد التنفيذ",
  pending: "غير مكتمل",
};

const severityTranslation = {
  high: "عالية",
  medium: "متوسطة",
  low: "منخفضة",
};

/* ===================================================
   5. Utility Functions
=================================================== */
const getColor = (report) => {
  if (report.status === "completed") return "green";
  if (report.severity === "high") return "red";
  if (report.severity === "medium") return "orange";
  if (report.severity === "low") return "yellow";
  return "green";
};

const formatDate = (date) => {
  if (!date) return "-";
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${year}-${month}-${day}`;
};



onSnapshot(collection(db, "users"), (snapshot) => {
  usersMap = {};
  snapshot.docs.forEach(docSnap => {
    const data = docSnap.data();
    usersMap[docSnap.id] = data.name || "-";
  });
});
/* ===================================================
   6. Firestore Listener
=================================================== */
onSnapshot(collection(db, "reports"), (snapshot) => {
  allReports = snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
  applyFiltersAndSearch();
});

/* ===================================================
   7. Table Rendering & Pagination
=================================================== */
const renderTablePaginated = () => {
  tableBody.innerHTML = "";

  const totalItems = filteredReports.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;

  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const pageData = filteredReports.slice(startIndex, endIndex);

  pageData.forEach((report) => {
    const createdDate = report.created_at ? new Date(report.created_at.toDate ? report.created_at.toDate() : report.created_at) : null;
    const completedDate = report.completed_at ? new Date(report.completed_at.toDate ? report.completed_at.toDate() : report.completed_at) : null;
    const assignedDate = report.assigned_at ? new Date(report.assigned_at.toDate ? report.assigned_at.toDate() : report.assigned_at) : null;

    tableBody.insertAdjacentHTML(
      "beforeend",
      `<tr data-id="${report.id}" style="cursor: pointer;">
        <td>
          <button class="action-btn delete-btn">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
        <td class="focus-col">#${report.id.substring(0, 5)}</td>
        <td>${statusTranslation[report.status] || "-"}</td>
        <td>${report.street_name || "غير محدد"}</td>
        <td>${formatDate(createdDate)}</td>
        <td>${formatDate(completedDate)}</td>
        <td>${formatDate(assignedDate)}</td>
        <td>
          <span class="status-dot ${getColor(report)}"></span>
          ${severityTranslation[report.severity] || "-"}
        </td>
      </tr>`
    );
  });

  pageInfo.innerText = `صفحة ${currentPage} من ${totalPages}`;
  prevPageBtn.disabled = currentPage === 1;
  nextPageBtn.disabled = currentPage === totalPages;
};

/* ===================================================
   8. Filtering
=================================================== */
const applyFiltersAndSearch = () => {
  const searchVal = searchInput.value.trim().toLowerCase();
  const severityVal = filterSeverity.value;
  const locationVal = filterLocation.value;
  const statusVal = filterStatus.value;
  const idVal = filterId.value.trim();

  const dateFromVal = filterDateFrom.value ? new Date(filterDateFrom.value) : null;
  if (dateFromVal) dateFromVal.setHours(0, 0, 0, 0);

  const dateToVal = filterDateTo.value ? new Date(filterDateTo.value) : null;
  if (dateToVal) dateToVal.setHours(23, 59, 59, 999);

  filteredReports = allReports.filter((report) => {
    let match = true;

    if (searchVal) {
      const street = report.street_name ? report.street_name.toLowerCase() : "";
      if (!report.id.includes(searchVal) && !street.includes(searchVal)) match = false;
    }
    if (severityVal && report.severity !== severityVal) match = false;
    if (statusVal && report.status !== statusVal) match = false;
    if (locationVal && (!report.street_name || !report.street_name.includes(locationVal))) match = false;
    if (idVal && !report.id.includes(idVal)) match = false;

    if (dateFromVal && report.created_at && new Date(report.created_at.toDate ? report.created_at.toDate() : report.created_at) < dateFromVal) match = false;
    if (dateToVal && report.created_at && new Date(report.created_at.toDate ? report.created_at.toDate() : report.created_at) > dateToVal) match = false;

    return match;
  });

  currentPage = 1;
  renderTablePaginated();
};

/* ===================================================
   9. Details Card Rendering
=================================================== */
const renderDetails = (report) => {
  if (!report) return;

  const isCompleted = report.status === "completed";
  const canFlip = isCompleted && report.completion_image;

  const placeholderImg = '../statics/img/placeholder.png';
  const frontImageSrc = report.image_url || placeholderImg;
  const backImageSrc = report.completion_image || placeholderImg;

  const imageHTML = canFlip
    ? `
    <div class="details-image flip-container" onclick="this.classList.toggle('flip')">
      <div class="details-inner">
        <div class="details-front">
          <img src="${frontImageSrc}" alt="Original" onerror="this.src='${placeholderImg}'" />
        </div>
        <div class="details-back">
          <img src="${backImageSrc}" alt="Completed" onerror="this.src='${placeholderImg}'" />
        </div>
      </div>
    </div>`
    : `
    <div class="details-image">
      <div class="details-inner">
        <div class="details-front">
          <img src="${frontImageSrc}" alt="Report Image" onerror="this.src='${placeholderImg}'" />
        </div>
      </div>
    </div>`;

  reportDetailsCard.className = `report-details ${report.status}`;
  reportDetailsCard.classList.remove("hidden");

  reportDetailsCard.innerHTML = `
    <!-- RTL Layout: First element goes to the right, second to the left -->
    <div class="details-info">
      <div class="details-info-header">
        <h3>رقم البلاغ: #${report.id.substring(0, 5)}...</h3>
      </div>
      <div class="info-grid">
        <div class="info-item"><i class="fa-solid fa-location-dot"></i> <span>الموقع: ${report.street_name || "غير محدد"}</span></div>
        <div class="info-item"><i class="fa-solid fa-user"></i> <span>الموظف: ${usersMap[report.created_by] || "-"}</span></div>
        <div class="info-item"><i class="fa-solid fa-helmet-safety"></i> <span>المهندس: ${usersMap[report.assigned_to] || "-"}</span></div>
        <div class="info-item"><i class="fa-solid fa-wrench"></i> <span>نوع الضرر: ${report.damage_type || "-"}</span></div>
        <div class="info-item"><i class="fa-solid fa-brain"></i> <span>التوقع: ${report.prediction || "-"}</span></div>
        <div class="info-item"><i class="fa-solid fa-triangle-exclamation"></i> <span>الخطورة: ${severityTranslation[report.severity] || "-"}</span></div>
      </div>
    </div>

    ${imageHTML}
  `;
};

/* ===================================================
   10. Event Listeners
=================================================== */
[
  searchInput,
  filterSeverity,
  filterLocation,
  filterStatus,
  filterId,
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
  filterId.value = "";
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

  // Delete button logic
  if (e.target.closest(".delete-btn")) {
    deleteReport(id);
    return;
  }

  // Show details logic
  const report = allReports.find(r => r.id === id);
  renderDetails(report);
});

/* ===================================================
   11. Delete Report
=================================================== */
const deleteReport = async (id) => {
  if (!confirm("هل أنت متأكد من حذف البلاغ؟")) return;
  try {
    await deleteDoc(doc(db, "reports", id));
    // Details card should be hidden if the current report details is deleted
    // if the deleted report was the one shown (we can check by id or just hide)
    if (reportDetailsCard.innerHTML.includes(id.substring(0, 5))) {
      reportDetailsCard.classList.add("hidden");
    }
  } catch (err) {
    console.error("Error deleting report: ", err);
  }
};
