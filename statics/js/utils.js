/* =================================================== IMPORTS =================================================== */
import { db } from "./firebase.js";

import {
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

/* =================================================== ACTIVITY LOGGER =================================================== */
export async function addActivity(message, type = "general", details = {}) {

  try {

    await addDoc(collection(db, "activity_logs"), {

      message,
      type,
      ...details,
      createdAt: serverTimestamp()

    });

  }
  catch (error) {

    console.error("Activity Log Error:", error);

  }

}

/* =================================================== TOAST =================================================== */
export function showToast(message, action = "complete") {

  const container =
    document.getElementById("toastContainer") ||
    document.getElementById("toast-container") ||
    document.querySelector(".toast-container");
  if (!container) return;

  const icons = {

    complete: "fa-check",
    assign: "fa-user-plus",
    revert: "fa-rotate-left",
    delete: "fa-xmark",
    upload: "fa-cloud-arrow-up",
    error: "fa-triangle-exclamation",
    success: "fa-check-circle",
    info: "fa-circle-info",
    update: "fa-pen-to-square",

  };

  const toast =
    document.createElement("div");

  toast.className =
    `toast ${action}`;

  toast.innerHTML = `

    <i class="fa-solid ${icons[action] || "fa-bell"}"></i>

    <span>${message}</span>

  `;

  container.appendChild(toast);

  setTimeout(() => {

    toast.style.opacity = "0";

    toast.style.transform =
      "translateX(-10px)";

    setTimeout(() => {

      toast.remove();

    }, 300);

  }, 3000);

}
