/*global console, firebase*/
"use strict";

// Firebase configuration for Unoludo 2.0
// Uses Firebase compat SDK via CDN (no build step needed)

var firebaseConfig = {
    apiKey: "AIzaSyCrnPKuJajSIcRDBnH1V_sRICJZJs5K1E8",
    authDomain: "unoludo.firebaseapp.com",
    databaseURL: "https://unoludo-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "unoludo",
    storageBucket: "unoludo.firebasestorage.app",
    messagingSenderId: "150362259190",
    appId: "1:150362259190:web:71bd5afc0265da842bb6d7"
};

// Initialize Firebase (compat mode for CDN usage)
firebase.initializeApp(firebaseConfig);

// Database reference
var db = firebase.database();

// Lightweight identity for client-side multiplayer security rules.
var firebaseReady = firebase.auth().signInAnonymously().then(function () {
    return firebase.auth().currentUser;
}).catch(function (error) {
    console.error("Firebase anonymous sign-in failed:", error);
    throw error;
});

function getFirebaseUser() {
    return firebase.auth().currentUser;
}
