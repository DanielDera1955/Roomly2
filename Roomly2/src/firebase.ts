import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// Firebase web config (safe to be public; access is controlled by firestore.rules)
const firebaseConfig = {
  apiKey: 'AIzaSyB1XGR3elbWS3v83y1585ApeH8CpuWc_XM',
  authDomain: 'roomly-4eb3d.firebaseapp.com',
  projectId: 'roomly-4eb3d',
  storageBucket: 'roomly-4eb3d.firebasestorage.app',
  messagingSenderId: '973896583560',
  appId: '1:973896583560:web:b27638e63cef3f9b3f923d',
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
