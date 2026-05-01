// loadSidebar.js
import { auth } from "../js/firebase.js";
import { signOut } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

async function initializeSidebar() {
    const container = document.getElementById('sidebar-container');
    if (!container) return;

    try {
        // 1. جلب قالب السايد بار
        const response = await fetch('sidebar.html');
        container.innerHTML = await response.text();

        // 2. جلب بيانات المستخدم
        const userData = JSON.parse(localStorage.getItem('user'));
        const role = userData ? userData.role : 'employee'; 

        const nav = document.getElementById('dynamic-nav');
        
        // 3. تعريف الروابط
        const menuItems = {
            employee: [
                { text: 'لوحة التحكم', icon: 'fa-chart-line', href: 'emp_dashboard.html' },
                { text: 'رفع بلاغ', icon: 'fa-camera', href: 'upload.html' }, 
                { text: 'المشاريع', icon: 'fa-folder-open', href: 'projects.html' },
                { text: 'الصفحة الشخصية', icon: 'fa-user', href: 'profile.html' }
            ],
            engineer: [
                { text: 'لوحة التحكم', icon: 'fa-gauge-high', href: 'eng_dashboard.html' },
                { text: 'مشاريعي', icon: 'fa-list-check', href: 'my_projects.html' },
                { text: 'تحديث البلاغ', icon: 'fa-pen-to-square', href: 'update.html' }, 
                { text: 'الصفحة الشخصية', icon: 'fa-user', href: 'profile.html' }
            ]
        };

        // 4. رسم الروابط
        const currentLinks = menuItems[role] || menuItems.employee;
        
        currentLinks.forEach(item => {
            const li = document.createElement('li');
            if (window.location.pathname.includes(item.href)) {
                li.className = 'active';
            }
            li.innerHTML = `<a href="${item.href}"><i class="fa-solid ${item.icon}"></i> ${item.text}</a>`;
            nav.appendChild(li);
        });

        // 5. تفعيل مستمع أحداث تسجيل الخروج
        setupLogoutListener();

    } catch (error) {
        console.error("خطأ في تحميل السايد بار:", error);
    }
}

/* --- دالة تسجيل الخروج المفصلة --- */
function setupLogoutListener() {
    // نقوم بإزالة أي مستمع سابق لتجنب التكرار ثم نضيف الجديد
    document.removeEventListener("click", handleLogoutClick); // خطوة اختيارية للتنظيف
    document.addEventListener("click", handleLogoutClick);
}

// دالة منفصلة للتعامل مع الضغطة
function handleLogoutClick(e) {
    const btn = e.target.closest(".logout-btn");
    if (btn) {
        e.preventDefault();
        console.log("جاري محاولة تسجيل الخروج...");

        // تأكدي أن auth و signOut تم استيرادهم في أعلى الملف
        signOut(auth).then(() => {
            localStorage.clear(); // مسح كل شيء لضمان النظافة
            console.log("تم تسجيل الخروج بنجاح");
            
            // 🔥 أهم نقطة: تأكدي من مسار index.html
            // إذا كنتِ في /templates/profile.html فالمسار ../index.html صحيح
            window.location.replace("index.html?logout=success"); 
        }).catch((error) => {
            console.error("خطأ Firebase:", error);
            alert("فشل تسجيل الخروج: " + error.message);
        });
    }
}

// تشغيل الدالة
document.addEventListener('DOMContentLoaded', initializeSidebar);
