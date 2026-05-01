import { auth } from "../js/firebase.js";
import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

/* 1. التحقق من المستخدم وجلب البيانات */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "../templates/login.html";
    return;
  }

  // تحميل سريع من الكاش (Local Storage) أول ما تفتح الصفحة
  const cachedUser = localStorage.getItem('user');
  if (cachedUser) {
    fillProfileData(JSON.parse(cachedUser));
  }

  try {
    const token = await user.getIdToken();
    const response = await fetch("https://assas-backend-o9r8.onrender.com/profile", {
      headers: { Authorization: "Bearer " + token }
    });

    if (response.ok) {
      const data = await response.json();
      fillProfileData(data); // تحديث الصفحة بالبيانات الجديدة
      localStorage.setItem('user', JSON.stringify(data)); // حفظ لللمرة الجاية
    }
  } catch (error) {
    console.error("خطأ في جلب البيانات:", error);
  }
});

/* 2. دالة تعبئة البيانات (معدلة حسب الـ HTML حقك بالضبط) */
function fillProfileData(data) {
  if (!data) return;

  // الجزء العلوي (الاسم والـ ID والرتبة)
  document.getElementById("name").innerText = data.name || " ";
  document.getElementById("employee_id").innerText = data.employee_id || "ID-0000";
  document.getElementById("role").innerText = data.role === "employee" ? "موظف" : (data.role || "");

  // التواصل
  document.getElementById("phone").innerText = data.phone || "";
  document.getElementById("email").innerText = data.email || "";

  // --- معلومات العمل  ---
  
  // القسم: ياخذ من مفتاح department في السيرفر
  document.getElementById("department").innerText = data.department || "إدارة البلاغات";

  // الدور الوظيفي: هنا بنحط فيه "إدارة البلاغات" أو أي مسمى ثاني تبيه
  document.getElementById("role_display").innerText = data.role_display || "موظف ميداني";

  // حالة الحساب والتاريخ
  document.getElementById("status").innerText = data.status || "نشط";
  document.getElementById("joined_date").innerText = data.joined_date || "";

  // --- ملخص النشاط ---
  document.getElementById("total_reports").innerText = data.total_reports ?? 0;
  document.getElementById("reports_in_progress").innerText = data.reports_in_progress ?? 0;
  document.getElementById("completed_reports").innerText = data.completed_reports ?? 0;
  document.getElementById("last_activity").innerText = data.last_activity || "لا يوجد نشاط قريب";

  const taskLabel = document.getElementById("task_label");
  if (taskLabel) {
    // إذا كان المودل (الرتبة) موظف، يغير الكلمة لـ "المرفوعة"
    if (data.role === "employee") {
        taskLabel.innerText = "عدد البلاغات المرفوعة";
    } else {
        // إذا كان مهندس (أو أي رتبة ثانية) يخليها "المستلمة"
        taskLabel.innerText = "عدد البلاغات المستلمة";
    }
  }
}

/* 4. زر الرجوع */
window.goBack = function () {
  window.history.back();
};

// 1. تعريف العناصر
const imageInput = document.getElementById('imageInput');
const profileImg = document.getElementById('profile_img');
const saveBtn = document.getElementById('save_image_btn');

// 2. كود المعاينة (Preview) عند اختيار الملف
imageInput.addEventListener('change', function() {
    const file = this.files[0];
    if (file) {
        const reader = new FileReader();
        
        // عندما ينتهي المتصفح من قراءة الملف
        reader.onload = function(e) {
            // نغير رابط الصورة الموجودة في الصفحة للصورة الجديدة
            profileImg.src = e.target.result;
            // نُظهر زر الحفظ عشان المستخدم يضغط عليه للرفع
            saveBtn.style.display = 'block';
        };
        
        reader.readAsDataURL(file);
    }
});

// 3. كود الرفع الفعلي للسيرفر (عند ضغط زر حفظ الصورة)
saveBtn.addEventListener('click', async () => {
    const file = imageInput.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('profile_image', file);

    try {
        saveBtn.textContent = "⏳ جاري الرفع...";
        
        // جلب الـ Token (مهم جداً لأن الـ Backend يطلبه)
        const token = localStorage.getItem("token"); 

        const response = await fetch('https://assas-backend-o9r8.onrender.com/profile/update-profile-image', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            alert("✅ تم تحديث الصورة بنجاح");
            saveBtn.style.display = 'none'; // نخفي الزر بعد النجاح
        } else {
            alert("❌ فشل الرفع: " + result.error);
        }
    } catch (error) {
        console.error("Upload error:", error);
        alert("❌ حدث خطأ في الاتصال بالسيرفر");
    } finally {
        saveBtn.textContent = "حفظ الصورة";
    }
});