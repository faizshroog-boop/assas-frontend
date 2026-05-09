/* =================================================== IMPORTS =================================================== */
import { db, auth } from "./firebase.js";
import {
  collection,
  onSnapshot,
  deleteDoc,
  doc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { addActivity, showToast } from "./utils.js";

/* =================================================== CONSTANTS =================================================== */
const statusTranslation = {
  completed: "مكتمل",
  in_progress: "قيد التنفيذ",
  pending: "غير مكتمل",
};

const severityTranslation = {
  high: "عالية",
  Red: "عالية",
  red: "عالية",
  medium: "متوسطة",
  Orange: "متوسطة",
  orange: "متوسطة",
  low: "منخفضة",
  Yellow: "منخفضة"
};

const damageTypeTranslation = {
  pothole: "حفرة",
  crack: "تشقق",
  water: "تجمع مياه",
  normal: "سليم"
};

/* =================================================== STATE/VARIABLES =================================================== */
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
const reportDetailsCard = document.getElementById("reportDetailsCard");
const btnAll = document.getElementById("btnAll");
const btnMine = document.getElementById("btnMine");

let currentView = "all";
let usersMap = {};
let allReports = [];
let filteredReports = [];
let currentPage = 1;
const itemsPerPage = 8;

/* =================================================== HELPERS/UTILS =================================================== */
const formatDate = (date) => {
  if (!date) return "-";
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${year}-${month}-${day}`;
};

const getCurrentUserId = () => {
  try {
    const storedUser = JSON.parse(localStorage.getItem("user"));
    return (
      storedUser?.uid ||
      storedUser?.firebase_uid ||
      storedUser?.user_id ||
      storedUser?.id ||
      auth.currentUser?.uid ||
      null
    );
  }
  catch (error) {
    return auth.currentUser?.uid || null;
  }
};

const showConfirmModal = (title, text) => {
  return new Promise((resolve) => {
    const modal = document.getElementById("customModal");
    document.getElementById("modalTitle").innerText = title;
    document.getElementById("modalText").innerText = text;
    const confirmBtn = document.getElementById("confirmBtn");
    const cancelBtn = document.getElementById("cancelBtn");
    modal.classList.remove("hidden");
    const cleanUp = () => {
      modal.classList.add("hidden");
      confirmBtn.onclick = null;
      cancelBtn.onclick = null;
    };
    confirmBtn.onclick = () => {
      cleanUp();
      resolve(true);
    };
    cancelBtn.onclick = () => {
      cleanUp();
      resolve(false);
    };
  });
};

/* =================================================== MAIN LOGIC =================================================== */
const applyFiltersAndSearch = () => {
  const searchVal = searchInput.value.trim().toLowerCase();
  const severityVal = filterSeverity.value;
  const locationVal = filterLocation.value;
  const statusVal = filterStatus.value;
  const damageTypeVal = filterDamageType.value;
  const currentUserId = getCurrentUserId();
  const dateFromVal = filterDateFrom.value ? new Date(filterDateFrom.value) : null;
  
  if (dateFromVal) dateFromVal.setHours(0, 0, 0, 0);
  
  const dateToVal = filterDateTo.value ? new Date(filterDateTo.value) : null;
  if (dateToVal) dateToVal.setHours(23, 59, 59, 999);

  filteredReports = allReports.filter((report) => {
    let match = true;
    if (currentView === "mine" && report.created_by !== currentUserId) match = false;

    if (searchVal) {
      const street = report.street_name ? report.street_name.toLowerCase() : "";
      if (!report.id.includes(searchVal) && !street.includes(searchVal)) match = false;
    }
    if (severityVal && report.severity !== severityVal) match = false;
    if (statusVal && report.status !== statusVal) match = false;
    if (locationVal && (!report.street_name || !report.street_name.includes(locationVal))) match = false;
    if (damageTypeVal && report.damage_type !== damageTypeVal) match = false;
    if (dateFromVal && report.created_at && new Date(report.created_at.toDate ? report.created_at.toDate() : report.created_at) < dateFromVal) match = false;
    if (dateToVal && report.created_at && new Date(report.created_at.toDate ? report.created_at.toDate() : report.created_at) > dateToVal) match = false;
    return match;
  });

  currentPage = 1;
  renderTablePaginated();
};

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
    const assignedDate = report.assigned_at ? new Date(report.assigned_at.toDate ? report.assigned_at.toDate() : report.assigned_at) : null;
    const completionDate = report.completion_date ? new Date(report.completion_date.toDate ? report.completion_date.toDate() : report.completion_date) : null;
    const completedClass = report.status === "completed" ? "row-completed" : "";

    tableBody.insertAdjacentHTML(
      "beforeend",
      `<tr data-id="${report.id}" class="${completedClass}" style="cursor: pointer;">
        <td class="actions-col">
          <button class="action-btn delete-btn" title="حذف البلاغ">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
        <td class="actions-col">
          ${report.status === "pending" ? `
            <div class="assign-dropdown">
              <button class="action-btn assign-toggle-btn">
                <i class="fa-solid fa-user-plus"></i>
              </button>
              <div class="assign-menu hidden">
                ${Object.entries(usersMap)
                  .filter(([id, user]) => user.role === "engineer")
                  .map(([id, user]) => `
                    <div class="assign-item" data-user="${id}" data-report="${report.id}">
                      ${user.name}
                    </div>
                  `).join("")}
              </div>
            </div>
          ` : ""}
          ${report.status === "in_progress" ? `
            <button class="action-btn complete-btn" title="إنهاء البلاغ">
              <i class="fa-solid fa-check"></i>
            </button>
          ` : ""}
          ${report.status === "completed" ? `
            <button class="action-btn revert-btn" title="إرجاع إلى قيد المراجعة">
              <i class="fa-solid fa-rotate-left"></i>
            </button>
          ` : ""}
        </td>
        <td class="focus-col">#${report.id.substring(0, 5)}</td>
        <td>${statusTranslation[report.status] || "-"}</td>
        <td>${report.street_name || "غير محدد"}</td>
        <td>${formatDate(createdDate)}</td>
        <td>${formatDate(assignedDate)}</td>
        <td>${formatDate(completionDate)}</td>
      </tr>`
    );
  });

  pageInfo.innerText = `صفحة ${currentPage} من ${totalPages}`;
  prevPageBtn.disabled = currentPage === 1;
  nextPageBtn.disabled = currentPage === totalPages;
};

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
    <div class="details-info">
      <div class="details-info-header">
        <h3>رقم البلاغ: #${report.id.substring(0, 5)}...</h3>
      </div>
      <div class="info-grid">
        <div class="info-item"><i class="fa-solid fa-location-dot"></i> <span>الموقع: ${report.street_name || "غير محدد"}</span></div>
        <div class="info-item"><i class="fa-solid fa-user"></i> <span>الموظف: ${usersMap[report.created_by]?.name || "-"}</span></div>
        <div class="info-item"><i class="fa-solid fa-helmet-safety"></i> <span>المهندس: ${usersMap[report.assigned_to]?.name || "-"}</span></div>
        <div class="info-item"><i class="fa-solid fa-wrench"></i> <span>الضرر: ${damageTypeTranslation[report.damage_type] || report.damage_type || "-"}</span></div>
        <div class="info-item"><i class="fa-solid fa-triangle-exclamation"></i> <span>الخطورة: ${severityTranslation[report.severity] || "-"}</span></div>
        <div class="info-item"><i class="fa-solid fa-brain"></i> <span>التنبؤ: ${report.prediction || report.prediction_note || "-"}</span></div>
      </div>
    </div>
    ${imageHTML}
  `;
};

const deleteReport = async (id) => {
  const confirmed = await showConfirmModal(
    "حذف البلاغ؟",
    "سيتم حذف البلاغ نهائيًا من النظام"
  );
  if (!confirmed) return;
  try {
    await deleteDoc(doc(db, "reports", id));
     await addActivity(
      `تم حذف البلاغ #${id.substring(0,5)}`,
      "delete",
      { reportId: id }
    );
    showToast("تم حذف البلاغ", "delete");
    if (reportDetailsCard.innerHTML.includes(id.substring(0, 5))) {
      reportDetailsCard.classList.add("hidden");
    }
  } catch (err) {
    showToast("حدث خطأ أثناء عملية الحذف", "error");
  }
};

const completeReport = async (id) => {
  try {
    const report = allReports.find((item) => item.id === id);
    const engineerId = report?.assigned_to || null;
    const engineerName = usersMap[engineerId]?.name || "المهندس";

    await updateDoc(doc(db, "reports", id), {
      status: "completed",
      completion_date: serverTimestamp()
    });
     await addActivity(
      `تم إكمال البلاغ #${id.substring(0,5)} بواسطة المهندس ${engineerName}`,
      "complete",
      {
        reportId: id,
        targetUserId: engineerId,
      }
    );
    showToast("تم تغير حالة البلاغ إلى 'مكتمل'", "complete");
  } catch (err) {
    showToast("فشل في عملية إكمال البلاغ", "error");
  }
};

/* =================================================== EVENT LISTENERS =================================================== */
btnAll?.addEventListener("click", () => {
  currentView = "all";
  btnAll.classList.add("active");
  btnMine?.classList.remove("active");
  applyFiltersAndSearch();
});

btnMine?.addEventListener("click", () => {
  currentView = "mine";
  btnMine.classList.add("active");
  btnAll?.classList.remove("active");
  applyFiltersAndSearch();
});

[
  searchInput,
  filterSeverity,
  filterLocation,
  filterStatus,
  filterDamageType,
  filterDateFrom,
  filterDateTo,
].forEach((el) => {
  el.addEventListener("input", applyFiltersAndSearch);
  el.addEventListener("change", applyFiltersAndSearch);
});

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
  currentView = "all";
  btnAll?.classList.add("active");
  btnMine?.classList.remove("active");
  applyFiltersAndSearch();
});

tableBody.addEventListener("click", async (e) => {
  const row = e.target.closest("tr");
  if (!row) return;

  const reportId = row.dataset.id;

  if (e.target.closest(".delete-btn")) {
    await deleteReport(reportId);
    return;
  }

  if (e.target.closest(".complete-btn")) {
    await completeReport(reportId);
    return;
  }

  if (e.target.closest(".revert-btn")) {
    const report = allReports.find((item) => item.id === reportId);
    const engineerId = report?.assigned_to || null;
    const engineerName = usersMap[engineerId]?.name || "المهندس";

    try {
      await updateDoc(doc(db, "reports", reportId), {
        status: "pending",
        assigned_to: null,
        assigned_at: null,
        completion_date: null,
        completed_at: null,
        completion_image: null
      });
      await addActivity(
  `تم إرجاع البلاغ #${reportId.substring(0,5)} إلى غير مكتمل بواسطة المهندس ${engineerName}`,
  "revert",
  {
    reportId,
    targetUserId: engineerId,
  }
);
      showToast("تم تغيير حالة البلاغ إلى 'غير مكتمل'", "revert");
    } catch (err) {
      showToast("فشل في عملية تغيير حالة البلاغ", "error");
    }
    return;
  }

  if (e.target.closest(".assign-item")) {
    const el = e.target.closest(".assign-item");
    const engineerName = el.textContent.trim();
    try {
      await updateDoc(doc(db, "reports", el.dataset.report), {
        assigned_to: el.dataset.user,
        assigned_at: serverTimestamp(),
        status: "in_progress"
      });
      await addActivity(
        `تم إسناد البلاغ #${el.dataset.report.substring(0, 5)} إلى ${engineerName}`,
        "assign",
        {
          reportId: el.dataset.report,
          targetUserId: el.dataset.user,
        }
      );
      showToast(`تم إسناد البلاغ للمهندس ${engineerName}`, "assign");
      el.closest(".assign-menu").classList.add("hidden");
    } catch (err) {
      showToast("فشل الإسناد", "error");
    }
    return;
  }

  if (e.target.closest(".assign-toggle-btn")) {
    const dropdown = e.target.closest(".assign-dropdown").querySelector(".assign-menu");
    document.querySelectorAll(".assign-menu").forEach(m => {
      if (m !== dropdown) m.classList.add("hidden");
    });
    dropdown.classList.toggle("hidden");
    return;
  }

  const report = allReports.find(r => r.id === reportId);
  if (report) renderDetails(report);
});

document.addEventListener("click", (e) => {
  if (!e.target.closest(".assign-dropdown")) {
    document.querySelectorAll(".assign-menu").forEach(m => {
      m.classList.add("hidden");
    });
  }
});

/* =================================================== INITIALIZATION =================================================== */
onSnapshot(collection(db, "users"), (snapshot) => {
  usersMap = {};
  snapshot.docs.forEach(docSnap => {
    const data = docSnap.data();
    usersMap[docSnap.id] = {
      name: data.name || "-",
      role: data.role || "user"
    };
  });
});

onSnapshot(collection(db, "reports"), (snapshot) => {
  allReports = snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
  applyFiltersAndSearch();
});
