import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

export const firebaseConfig = {
  apiKey: "AIzaSyBazRbpQJ3VA8EJhjXJ_M9X1W1OKzygqfw",
  authDomain: "pepeloco-b963b.firebaseapp.com",
  databaseURL: "https://pepeloco-b963b-default-rtdb.firebaseio.com",
  projectId: "pepeloco-b963b",
  storageBucket: "pepeloco-b963b.firebasestorage.app",
  messagingSenderId: "615563200220",
  appId: "1:615563200220:web:34c54414e61a684eac9619",
  measurementId: "G-3HZSWEXN1W"
};

export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
