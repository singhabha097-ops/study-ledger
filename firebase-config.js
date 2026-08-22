// 1. Go to https://console.firebase.google.com, create a project (free).
// 2. In the project, click the "</>" (web app) icon to register a web app.
// 3. Firebase will show you a config object — copy those values in below.
// 4. In the Firebase console, also turn on:
//      Build > Authentication > Sign-in method > Email/Password (enable it)
//      Build > Firestore Database > Create database (start in "test mode" for now)
// See README.md in this folder for the full step-by-step guide.

const firebaseConfig = {
  apiKey: "AIzaSyBXT4a1Pew_mMnJMhkNy5w1VeAAD1qO8f4",
  authDomain: "study-d9521.firebaseapp.com",
  projectId: "study-d9521",
  storageBucket: "study-d9521.firebasestorage.app",
  messagingSenderId: "497189244641",
  appId: "1:497189244641:web:03578eef0f02e5d13cf1a0"
};

// The teacher/admin account is a fixed login behind the scenes.
// After setting up Authentication above, go to the "Users" tab and
// click "Add user" with this exact email, and whatever password you want
// the teacher login to use:
const ADMIN_EMAIL = "admin@studyledger.local";
