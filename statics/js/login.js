import { auth } from "../js/firebase.js";
import { signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

/* Handle Login*/
window.handleLogin = async function (e) {
  e.preventDefault();

  const email = document.querySelector('[name="email"]').value;
  const password = document.querySelector('[name="password"]').value;

  try {
    // 1. محاولة تسجيل الدخول عبر Firebase
    const userCredential = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    const token = await userCredential.user.getIdToken();

    localStorage.setItem("token", token);
    
    // 2. التحقق من بيانات المستخدم عبر Flask
    const response = await fetch(
      "https://assas-backend-o9r8.onrender.com/profile",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error("فشل التحقق من المستخدم في السيرفر");
    }

    const data = await response.json();
    const currentPath = window.location.pathname; // الحصول على مسار الصفحة الحالية

    /* 3. 🔥 نظام الحماية المزدوج (Role & Path Validation) */

    if (data.role === "engineer") {
      // إذا كان مهندس ويحاول الدخول من صفحة الموظف
      if (currentPath.includes("emp_login")) {
        alert("هذا الحساب مسجل كمهندس. يرجى تسجيل الدخول من صفحة المهندسين.");
        await signOut(auth); // تسجيل خروج من فايربيس لإلغاء الجلسة
        return;
      }
      // إذا المسار صحيح، احفظ البيانات ووجهه للداشبورد
      localStorage.setItem("user", JSON.stringify(data));
      window.location.href = "../templates/eng_dashboard.html";

    } else if (data.role === "employee") {
      // إذا كان موظف ويحاول الدخول من صفحة المهندس
      if (currentPath.includes("eng_login")) {
        alert("هذا الحساب مسجل كموظف. يرجى تسجيل الدخول من صفحة الموظفين.");
        await signOut(auth);
        return;
      }
      // إذا المسار صحيح، احفظ البيانات ووجهه للداشبورد
      localStorage.setItem("user", JSON.stringify(data));
      window.location.href = "../templates/emp_dashboard.html";

    } else {
      alert("نوع المستخدم غير معروف في النظام");
      await signOut(auth);
    }

  } catch (error) {
    console.error("Login Error:", error);
    if (error.code === "auth/wrong-password" || error.code === "auth/user-not-found") {
      alert("البريد الإلكتروني أو كلمة المرور غير صحيحة");
    } else {
      alert("حدث خطأ أثناء تسجيل الدخول، يرجى المحاولة مرة أخرى");
    }
  }
};
