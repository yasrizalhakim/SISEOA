// src/services/firebase.js
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getDatabase } from 'firebase/database';

// Your web app's Firebase configuration
// Replace these with your actual Firebase project details
const firebaseConfig = {
  apiKey: "AIzaSyCg2kINGybYB0Nn55xGtmJBxBekIh0MFgA",
  authDomain: "siseoa1.firebaseapp.com",
  databaseURL: "https://siseoa1-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "siseoa1",
  storageBucket: "siseoa1.firebasestorage.app",
  messagingSenderId: "166548898974",
  appId: "1:166548898974:web:f6f3d36631cddac54e678f",
  measurementId: "G-5ENVPCLK00"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const firestore = getFirestore(app);
export const database = getDatabase(app);

export default app;