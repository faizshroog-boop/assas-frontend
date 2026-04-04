      import { auth } from "../js/firebase.js";
      import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

      /* Handle Login */
      window.handleLogin = async function (e) {
        e.preventDefault();

        const email = document.querySelector('[name="email"]').value;
        const password = document.querySelector('[name="password"]').value;

        try {
          const userCredential = await signInWithEmailAndPassword(
            auth,
            email,
            password,
          );

          const token = await userCredential.user.getIdToken();

          /* Send token to Flask */
          const response = await fetch("http://127.0.0.1:5000/profile", {
            method: "GET",
            headers: {
              Authorization: "Bearer " + token,
            },
          });

          const data = await response.json();

          /* 🔥 Role-based redirect */
          if (data.role === "engineer") {
            window.location.href = "/engineer-dashboard";
          } else if (data.role === "employee") {
            window.location.href = "/employee-dashboard";
          } else {
            alert("نوع المستخدم غير معروف");
          }
        } catch (error) {
          alert("خطأ: " + error.message);
        }
      };

      /* ===================================================
   ⚠️ Firebase Login (انقله لصفحة تسجيل الدخول فقط)
   =================================================== */

// لا تشغل Firebase هنا إذا ما عندك فورم
// لكن هذا كود مصحح لو بتستخدمه لاحقاً
/*
export async function loginUser(email, password) {
  try {
    const { getAuth, signInWithEmailAndPassword } = await import("https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js");

    const auth = getAuth();

    const userCredential = await signInWithEmailAndPassword(auth, email, password);

    const token = await userCredential.user.getIdToken();

    const response = await fetch("http://127.0.0.1:5000/profile", {
      method: "GET",
      headers: {
        "Authorization": "Bearer " + token
      }
    });

    const data = await response.json();
    console.log("User Data:", data);

    return data;

  } catch (error) {
    console.error("Login Error:", error.message);
    throw error;
  }
}*/