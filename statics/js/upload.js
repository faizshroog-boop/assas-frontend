// upload.js
import { auth } from "./firebase.js"; // تأكدي أن المسار صحيح
import { getSelectedLocation } from "./map.js";

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

// ------------------- Submit Handler -------------------
submitBtn.addEventListener("click", async () => {
  const file = fileInput.files[0];
  const mapLocation = getSelectedLocation();
  const manualStreet = streetInput.value.trim();
  const user = auth.currentUser;

  // 1. Validation
  if (!user) return alert("❌ يجب تسجيل الدخول");
  if (!file) return alert("❌ اختر صورة أولاً");
  
  const latitude = latInput.value ? parseFloat(latInput.value) : mapLocation?.lat;
  const longitude = lngInput.value ? parseFloat(lngInput.value) : mapLocation?.lng;

  if (latitude == null || longitude == null) {
    return alert("❌ اختر الموقع أو أدخل الإحداثيات");
  }

  try {
    submitBtn.disabled = true;
    submitBtn.textContent = "⏳ جاري التحليل والرفع...";

    // 2. Prepare Data for Flask Server
    // بدلاً من الرفع المباشر لفايربيس، نرسلها لسيرفر البايثون
    const formData = new FormData();
    formData.append("image", file);
    formData.append("latitude", latitude);
    formData.append("longitude", longitude);
    // يمكنك إضافة UID المستخدم لكي يعرف الموديل من رفع البلاغ
    formData.append("created_by", user.uid); 

    // 3. Call Flask API
    const response = await fetch("https://assas-backend-o9r8.onrender.com/upload-image", {
      method: "POST",
      body: formData // يرسل كـ Multipart form-data
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    const result = await response.json();

    if (result.success) {
      alert("✅ تم تحليل الصورة وحفظ البلاغ بنجاح!");
      console.log("AI Result:", result.analysis);
      
      // Reset form
      fileInput.value = "";
      streetInput.value = "";
      latInput.value = "";
      lngInput.value = "";
      updateFileName("اسحب الملف هنا");
    } else {
      alert("❌ خطأ من السيرفر: " + result.error);
    }

  } catch (error) {
    console.error("Upload Error:", error);
    alert("❌ فشل الاتصال بسيرفر الذكاء الاصطناعي. تأكدي أن الشاشة السوداء (Flask) تعمل.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "إرسال البلاغ";
  }
});