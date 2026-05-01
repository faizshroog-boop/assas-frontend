import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";

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

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Firestore
const db = getFirestore(app, "road-damage-system-db");

// Initialize Auth
const auth = getAuth(app);

// Initialize Storage
const storage = getStorage(app);

export { db, auth, storage };