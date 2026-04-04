import { db } from "./firebase.js"; // Firestore instance
import { getSelectedLocation } from "./map.js";

import { ref, uploadBytes, getDownloadURL, getStorage } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";
import { collection, addDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// DOM
const fileInput = document.getElementById("inputGroupFile02");

// Initialize Storage
const storage = getStorage(); // <-- important

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  const location = getSelectedLocation();

  if (!file) {
    alert("اختر صورة أولاً");
    return;
  }

  if (!location) {
    alert("اختر الموقع من الخريطة");
    return;
  }

  try {
    const storageRef = ref(storage, "reports/" + Date.now() + "_" + file.name);
    await uploadBytes(storageRef, file);

    const imageURL = await getDownloadURL(storageRef);

    await addDoc(collection(db, "reports"), {
      image_url: imageURL,
      latitude: location.lat,
      longitude: location.lng,
      created_at_string: new Date().toISOString().split("T")[0],
      status: "pending",
      severity: "low"
    });

    alert("✅ تم رفع البلاغ بنجاح");
    fileInput.value = ""; // reset input
  } catch (error) {
    console.error(error);
    alert("❌ حدث خطأ أثناء الرفع");
  }
});