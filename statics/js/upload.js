// upload.js
import { db, auth } from "./firebase.js";
import { getSelectedLocation } from "./map.js";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  getStorage,
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";
import { collection, addDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// DOM elements
const fileInput = document.getElementById("fileInput");
const uploadLabel = document.querySelector(".file-upload-label");
const submitBtn = document.getElementById("submitBtn");
const streetInput = document.getElementById("streetName");
const latInput = document.getElementById("latitude");
const lngInput = document.getElementById("longitude");

// Firebase storage
const storage = getStorage();

// ------------------- Auth Check -------------------
auth.onAuthStateChanged((user) => {
  if (!user) {
    alert("❌ يجب تسجيل الدخول للرفع");
    submitBtn.disabled = true;
  } else {
    submitBtn.disabled = false;
  }
});

// ------------------- Drag & Drop -------------------
uploadLabel.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadLabel.style.backgroundColor = "#e0f7f1";
});

uploadLabel.addEventListener("dragleave", (e) => {
  e.preventDefault();
  uploadLabel.style.backgroundColor = "#f1f1f1";
});

uploadLabel.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadLabel.style.backgroundColor = "#f1f1f1";
  if (e.dataTransfer.files.length) {
    const file = e.dataTransfer.files[0];
    if (file.type.startsWith("image/")) {
      fileInput.files = e.dataTransfer.files;
      updateFileName(file.name);
    } else {
      alert("❌ عذراً، يُسمح برفع الصور فقط");
    }
  }
});

// Show selected file name
fileInput.addEventListener("change", () => {
  if (fileInput.files.length) {
    const file = fileInput.files[0];
    if (file.type.startsWith("image/")) {
      updateFileName(file.name);
    } else {
      alert("❌ عذراً، يُسمح برفع الصور فقط");
      fileInput.value = ""; // Reset
      updateFileName("اسحب الملف هنا");
    }
  }
});

function updateFileName(name) {
  const p = document.getElementById("fileNameDisplay");
  if (p) p.textContent = `ملف مختار: ${name}`;
}

// ------------------- Submit Handler -------------------
submitBtn.addEventListener("click", async () => {
  const file = fileInput.files[0];

  const mapLocation = getSelectedLocation();

const manualStreet = streetInput.value.trim();

// ✅ Always build clean street_name
const streetName = manualStreet || [
  mapLocation?.street,
  mapLocation?.neighborhood,
  mapLocation?.city
]
  .filter(Boolean)
  .join("، ");
  const latValue = latInput.value;
  const lngValue = lngInput.value;

  const user = auth.currentUser;

  // ------------------- Validation -------------------
  if (!user) return alert("❌ يجب تسجيل الدخول");
  if (!file) return alert("❌ اختر صورة أولاً");
  if (!file.type.startsWith("image/")) return alert("❌ عذراً، يُسمح برفع الصور فقط");

  const latitude = latValue ? parseFloat(latValue) : mapLocation?.lat;
  const longitude = lngValue ? parseFloat(lngValue) : mapLocation?.lng;

  if (latitude == null || longitude == null) {
    return alert("❌ اختر الموقع أو أدخل الإحداثيات");
  }

  try {
    submitBtn.disabled = true;
    submitBtn.textContent = "⏳ جاري الرفع...";

    // ------------------- Upload to Storage -------------------
    const fileName = `${Date.now()}_${file.name}`;
    const storageRef = ref(storage, `reports/${fileName}`);
    await uploadBytes(storageRef, file);
    const imageURL = await getDownloadURL(storageRef);

    // ------------------- Save to Firestore -------------------
    await addDoc(collection(db, "reports"), {
      image_url: imageURL,
      latitude,
      longitude,
      street_name: streetName || "غير معروف",
      created_at: new Date(),
      created_by: user.uid,

      // AI fields (future use)
      damage_type: null,
      severity: null,
      prediction: null,

      // workflow
      status: "pending",
      assigned_to: null,
      assigned_at: null,
      completion_date: null,
      completion_image: null,
    });

    alert("✅ تم رفع البلاغ بنجاح");

    // ------------------- Reset form -------------------
    fileInput.value = "";
    streetInput.value = "";
    latInput.value = "";
    lngInput.value = "";
    updateFileName("اسحب الملف هنا");

  } catch (error) {
    console.error("Upload Error:", error);
    alert("❌ حدث خطأ أثناء رفع البلاغ");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "إرسال البلاغ";
  }
});