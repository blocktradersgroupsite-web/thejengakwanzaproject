// JENGAKWANZA Firebase Cloud Backend Configuration
//
// HOW TO CONFIGURE FIREBASE:
// 1. Go to https://console.firebase.google.com/
// 2. Click "Add project" and name it (e.g. "jengakwanza-pos")
// 3. In the project dashboard, click the Web icon (</>) to create a Web App
// 4. Copy the "firebaseConfig" object values and paste them below, OR
//    paste them directly into the "Firebase Cloud Backend" section inside JENGAKWANZA Settings!
// 5. In Firebase Console, go to "Build" -> "Firestore Database" -> "Create database" (in production mode).

window.FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

// Check if saved in localStorage (overrides file config if user configured via Settings UI)
const savedFirebaseConfig = localStorage.getItem('jengakwanza_firebase_config');
if (savedFirebaseConfig) {
  try {
    const parsed = JSON.parse(savedFirebaseConfig);
    if (parsed && parsed.projectId) {
      window.FIREBASE_CONFIG = parsed;
    }
  } catch (e) {
    console.warn('Could not parse stored Firebase config:', e);
  }
}
