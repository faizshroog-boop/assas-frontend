/* =================================================== IMPORTS =================================================== */
import { db, storage, auth } from "./firebase.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";
import { addActivity } from "./utils.js";

/* =================================================== CONSTANTS =================================================== */
const reportIdEl = document.getElementById("reportId");
const statusBadgeEl = document.getElementById("statusBadge");
const reportImageContainer = document.getElementById("reportImageContainer");
const completionImageEl = document.getElementById("completionImage");
const fileNameDisplay = document.getElementById("fileNameDisplay");
const notesEl = document.getElementById("notes");
const updateBtn = document.getElementById("updateBtn");
const smallUploadBtn = document.querySelector(".small-upload-btn");
const step1 = document.getElementById("step1");
const step2 = document.getElementById("step2");
const step3 = document.getElementById("step3");

/* =================================================== STATE/VARIABLES =================================================== */
const params = new URLSearchParams(window.location.search);
const reportId = params.get("id");
let loadedReport = null;

/* =================================================== HELPERS/UTILS =================================================== */
const showToast = (message, action = "complete") => {
  const container = document.getElementById("toastContainer");
  if (!container) return;
  const icons = {
    complete: "fa-check",
    error: "fa-triangle-exclamation"
  };
  const toast = document.createElement("div");
  toast.className = `toast ${action}`;
  toast.innerHTML = `
    <i class="fa-solid ${icons[action] || "fa-info"}"></i>
    <span>${message}</span>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(-10px)";
    setTimeout(() => toast.remove(), 300);
  }, 2000);
};

function updateStatusUI(status) {
  statusBadgeEl.classList.remove("completed", "progress", "pending");
  step1.classList.remove("active");
  step2.classList.remove("active");
  step3.classList.remove("active");
  step1.classList.add("active");
  step2.classList.add("active");
  switch (status) {
    case "completed":
      statusBadgeEl.textContent = "مكتمل";
      statusBadgeEl.classList.add("completed");
      step3.classList.add("active");
      break;
    case "pending":
      statusBadgeEl.textContent = "غير مكتمل";
      statusBadgeEl.classList.add("pending");
      break;
    case "in_progress":
      statusBadgeEl.textContent = "قيد التنفيذ";
      statusBadgeEl.classList.add("progress");
      break;
    default:
      statusBadgeEl.textContent = "غير معروف";
  }
}

function renderReportImage(imageUrl) {
  reportImageContainer.innerHTML = "";
  if (!imageUrl) {
    reportImageContainer.innerHTML = '<span class="placeholder-text">لا توجد صورة لهذا البلاغ</span>';
    return;
  }
  const img = document.createElement("img");
  img.src = imageUrl;
  img.alt = "صورة البلاغ";
  img.onerror = () => {
    reportImageContainer.innerHTML = '<span class="placeholder-text">تعذر تحميل الصورة</span>';
  };
  reportImageContainer.appendChild(img);
}

function lockForm() {
  updateBtn.disabled = true;
  completionImageEl.disabled = true;
  notesEl.disabled = true;
  if (smallUploadBtn) {
    smallUploadBtn.classList.add("disabled");
  }
  document.querySelectorAll('input[name="status"]').forEach((radio) => (radio.disabled = true));
}

async function getUserName(userId) {
  if (!userId) return "المهندس";

  try {
    const userSnap = await getDoc(doc(db, "users", userId));

    if (userSnap.exists()) {
      const user = userSnap.data();
      return user.name || user.displayName || user.email || "المهندس";
    }
  }
  catch (error) {
    console.error("User name lookup error:", error);
  }

  return auth.currentUser?.displayName || auth.currentUser?.email || "المهندس";
}

function getStatusActivity(status, displayId, engineerName) {
  switch (status) {
    case "in_progress":
      return {
        message: `تم إسناد البلاغ #${displayId} إلى المهندس ${engineerName}`,
        type: "assign",
      };
    case "completed":
      return {
        message: `تم إكمال البلاغ #${displayId} بواسطة المهندس ${engineerName}`,
        type: "complete",
      };
    case "pending":
      return {
        message: `تم إرجاع البلاغ #${displayId} إلى غير مكتمل بواسطة المهندس ${engineerName}`,
        type: "revert",
      };
    default:
      return {
        message: `تم تحديث البلاغ #${displayId} بواسطة المهندس ${engineerName}`,
        type: "update",
      };
  }
}

/* =================================================== MAIN LOGIC =================================================== */
async function loadReport() {
  if (!reportId) {
    reportIdEl.textContent = "لا يوجد رقم بلاغ";
    lockForm();
    return;
  }
  try {
    const docRef = doc(db, "reports", reportId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      reportIdEl.textContent = "البلاغ غير موجود";
      lockForm();
      return;
    }
    const report = snap.data();
    loadedReport = report;
    const displayId = reportId.substring(0, 5);
    reportIdEl.textContent = `#${displayId}`;
    notesEl.value = report.notes || "";
    renderReportImage(report.image_url || "");
    if (report.completion_image) {
      fileNameDisplay.textContent = "تم رفع صورة مسبقاً";
    }
    const currentStatus = report.status || "pending";
    updateStatusUI(currentStatus);
    if (currentStatus !== "in_progress") {
      lockForm();
      return;
    }
  } catch (error) {
    console.error("خطأ في تحميل البلاغ:", error);
    reportIdEl.textContent = "خطأ في تحميل البيانات";
    lockForm();
  }
}

/* =================================================== EVENT LISTENERS =================================================== */
completionImageEl.addEventListener("change", () => {
  const file = completionImageEl.files[0];
  fileNameDisplay.textContent = file ? file.name : "لم يتم اختيار ملف";
});

updateBtn.addEventListener("click", async () => {
  if (!reportId) {
    showToast("لا يوجد رقم بلاغ", "error");
    return;
  }
  const selectedStatus = document.querySelector('input[name="status"]:checked')?.value;
  const notes = notesEl.value.trim();
  const file = completionImageEl.files[0];
  if (!selectedStatus) {
    showToast("اختر الحالة", "error");
    return;
  }
  if (selectedStatus === "completed" && !file) {
    showToast("يجب رفع صورة الإصلاح عند اكتمال البلاغ", "error");
    return;
  }
  updateBtn.disabled = true;
  updateBtn.textContent = "جاري التحديث...";
  try {
    const docRef = doc(db, "reports", reportId);
    const currentReportSnap = await getDoc(docRef);
    const currentReport = currentReportSnap.exists() ? currentReportSnap.data() : loadedReport;
    const engineerId = currentReport?.assigned_to || auth.currentUser?.uid || null;
    const engineerName = await getUserName(engineerId);
    const displayId = reportId.substring(0, 5);
    const activity = getStatusActivity(selectedStatus, displayId, engineerName);
    const updateData = {
      status: selectedStatus,
      notes,
      completion_date: selectedStatus === "completed" ? new Date().toISOString() : null,
    };
    if (file) {
      const storageRef = ref(storage, `reports/${reportId}/completion_${Date.now()}_${file.name}`);
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      updateData.completion_image = downloadURL;
    }
    if (selectedStatus === "pending") {
      updateData.assigned_to = null;
      updateData.assigned_at = null;
    }
    await updateDoc(docRef, updateData);
    await addActivity(
      activity.message,
      activity.type,
      {
        reportId,
        targetUserId: engineerId,
      }
    );
    updateStatusUI(selectedStatus);
    if (selectedStatus !== "in_progress") {
      lockForm();
    }
    showToast("تم تحديث الحالة بنجاح", "complete");
  } catch (error) {
    console.error("خطأ في التحديث:", error);
    showToast("حدث خطأ أثناء التحديث", "error");
  } finally {
    updateBtn.disabled = false;
    updateBtn.textContent = "تحديث الحالة";
  }
  setTimeout(() => {
    window.location.href = "my_projects.html";
  }, 2500);
});

/* =================================================== INITIALIZATION =================================================== */
loadReport();
