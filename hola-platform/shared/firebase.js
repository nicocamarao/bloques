import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

export const firebaseConfig = {
  apiKey: "AIzaSyDE3YreYTQrzYkLWY_E-QH_gm-kxVjwU1Y",
  authDomain: "backend-nico-6f5db.firebaseapp.com",
  databaseURL: "https://backend-nico-6f5db-default-rtdb.firebaseio.com",
  projectId: "backend-nico-6f5db",
  storageBucket: "backend-nico-6f5db.firebasestorage.app",
  messagingSenderId: "654175276624",
  appId: "1:654175276624:web:b3bc36cd0ef315da9e8b55"
};

export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
