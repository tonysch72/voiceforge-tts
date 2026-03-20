import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, User as FirebaseUser, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, onSnapshot, updateDoc, increment } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

console.log("Firebase: Initializing app with config:", firebaseConfig.projectId);

let app;
try {
  app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  console.log("Firebase: App initialized successfully.");
} catch (error) {
  console.error("Firebase: App initialization failed:", error);
  throw error;
}

export const auth = getAuth(app);
// Set persistence to local to be more resilient in iframes
setPersistence(auth, browserLocalPersistence)
  .then(() => console.log("Firebase: Auth persistence set to local."))
  .catch((err) => console.error("Firebase: Auth persistence error:", err));

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();

export interface UserProfile {
  uid: string;
  email: string;
  role: 'admin' | 'user';
  plan: string;
  generations_used: number;
  generation_limit: number;
  stripe_customer_id?: string;
  subscription_status?: string;
  last_reset?: string;
}

export const signIn = () => signInWithPopup(auth, googleProvider);
export const signOut = () => auth.signOut();
