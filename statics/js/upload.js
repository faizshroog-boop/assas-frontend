// upload.js
import { auth } from "./firebase.js"; // تأكدي أن المسار صحيح
import { getSelectedLocation } from "./map.js";
import { addActivity, showToast } from "./utils.js";
// DOM elements
const fileInput = document.getElementById("fileInput");
const uploadLabel = document.querySelector(".file-upload-label");
const submitBtn = document.getElementById("submitBtn");
const streetInput = document.getElementById("streetName");
const latInput = document.getElementById("latitude");
const lngInput = document.getElementById("longitude");

// ------------------- Auth Check -------------------
auth.onAuthStateChanged((user) => {
  if (!user) {
    alert("❌ يجب تسجيل الدخول للرفع");
    submitBtn.disabled = true;
  } else {
    submitBtn.disabled = false;
  }
});

// ------------------- UI Helpers -------------------
function updateFileName(name) {
  const p = document.getElementById("fileNameDisplay");
  if (p) p.textContent = `ملف مختار: ${name}`;
}

fileInput.addEventListener("change", () => {
  if (fileInput.files.length) {
    const file = fileInput.files[0];
    if (file.type.startsWith("image/")) {
      updateFileName(file.name);
    } else {
      alert("❌ عذراً، يُسمح برفع الصور فقط");
      fileInput.value = "";
    }
  }
});
// ------------------- Drag & Drop -------------------
uploadLabel.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadLabel.classList.add("dragging");
});

uploadLabel.addEventListener("dragleave", () => {
  uploadLabel.classList.remove("dragging");
});

uploadLabel.addEventListener("drop", (e) => {
  e.preventDefault();

  uploadLabel.classList.remove("dragging");

  const files = e.dataTransfer.files;

  if (!files.length) return;

  const file = files[0];

  // Allow only images
  if (!file.type.startsWith("image/")) {

    showToast(
      "❌ يُسمح برفع الصور فقط",
      "error"
    );

    return;
  }

  // Put dropped file into input
const dataTransfer = new DataTransfer();
dataTransfer.items.add(file);
fileInput.files = dataTransfer.files;

  updateFileName(file.name);

  showToast(
    "تم اختيار الصورة بنجاح",
    "success"
  );
});
// ------------------- Submit Handler -------------------
submitBtn.addEventListener("click", async () => {

  const file = fileInput.files[0];

  const mapLocation =
    getSelectedLocation();

  const manualStreet =
    streetInput.value.trim();

  const user =
    auth.currentUser;

  // 1. Validation
  if (!user) {

    showToast(
      "يجب تسجيل الدخول",
      "error"
    );

    return;

  }

  if (!file) {

    showToast(
      "اختر صورة أولاً",
      "error"
    );

    return;

  }

  const latitude =
    latInput.value
      ? parseFloat(latInput.value)
      : mapLocation?.lat;

  const longitude =
    lngInput.value
      ? parseFloat(lngInput.value)
      : mapLocation?.lng;

  if (latitude == null || longitude == null) {

    showToast(
      "اختر الموقع أو أدخل الإحداثيات",
      "error"
    );

    return;

  }

  try {

    submitBtn.disabled = true;

    submitBtn.textContent =
      "⏳ جاري التحليل والرفع...";

    // Prepare Form Data
    const formData = new FormData();

    formData.append("image", file);

    formData.append("latitude", latitude);

    formData.append("longitude", longitude);

    formData.append("created_by", user.uid);

    // API Call
    const response = await fetch(
      "https://assas-backend-o9r8.onrender.com/upload-image",
      {
        method: "POST",
        body: formData
      }
    );

    if (!response.ok) {

      throw new Error(
        `Server error: ${response.status}`
      );

    }

    const result =
      await response.json();

    if (result.success) {

      await addActivity(
        "تم رفع بلاغ جديد",
        "upload",
        { reportId: result.reportId || result.id || null }
      );

      showToast(
        "تم تحليل الصورة وحفظ البلاغ بنجاح",
        "upload"
      );

      console.log(
        "AI Result:",
        result.analysis
      );

      // Reset form
      fileInput.value = "";

      streetInput.value = "";

      latInput.value = "";

      lngInput.value = "";

      updateFileName(
        "اسحب الملف هنا"
      );

    }
    else {

      showToast(
        "خطأ من السيرفر",
        "error"
      );

    }

  }
  catch (error) {

    console.error(
      "Upload Error:",
      error
    );

    showToast(
      "فشل الاتصال بسيرفر الذكاء الاصطناعي",
      "error"
    );

  }
  finally {

    submitBtn.disabled = false;

    submitBtn.textContent =
      "إرسال البلاغ";

  }

});
