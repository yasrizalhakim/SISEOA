// src/services/firebase.js
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getDatabase } from 'firebase/database';

// Your web app's Firebase configuration
// Replace these with your actual Firebase project details
const firebaseConfig = {
  apiKey: "*******",
  authDomain: "******",
  databaseURL: "*******",
  projectId: "*******",
  storageBucket: "*********",
  messagingSenderId: "*********",
  appId: "********",
  measurementId: "*******"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const firestore = getFirestore(app);
export const database = getDatabase(app);

export default app;
