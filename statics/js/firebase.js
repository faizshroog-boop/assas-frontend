 import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

 
 /* ===================================================
         Firebase Configuration
      =================================================== */
      const firebaseConfig = {
        apiKey: "AIzaSyB-uPN8afr4qXu5JE1Iew0wR5WfK3YscwY",
        authDomain: "road-damage-system.firebaseapp.com",
        projectId: "road-damage-system",
        storageBucket: "road-damage-system.firebasestorage.app",
        messagingSenderId: "511495875698",
        appId: "1:511495875698:web:e9ff48686bfe346ae8e6eb",
      };

      // Initialize Firebase App and Firestore Database
      const app = initializeApp(firebaseConfig);
      const db = getFirestore(app, "road-damage-system-db");

      export { db };