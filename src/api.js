// src/api.js

// const BASE_URL = "http://localhost:5000/api";

const BASE_URL = "https://stealth-backend-git-main-karthiks-projects-decb8394.vercel.app/api";
// --------------------
// Authentication APIs
// --------------------
export async function registerUser(email, password) {
  const res = await fetch(`${BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return res.json();
}

export async function verifyOtp(email, otp) {
  const res = await fetch(`${BASE_URL}/auth/verify-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, otp }),
  });
  return res.json();
}

export async function loginUser(email, password) {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return res.json();
}

// ---------------------
// Document Upload APIs
// ---------------------
export async function uploadDoc(userId, file) {
  const formData = new FormData();
  formData.append("document", file);
  formData.append("userId", userId);
  const res = await fetch(`${BASE_URL}/docs/upload`, {
    method: "POST",
    body: formData,
  });
  return res.json();
}

export async function getDocs(userId) {
  const res = await fetch(`${BASE_URL}/docs/get/${userId}`);
  console.log("Response from getDocs:", res);
  return res.json();
}

export async function getDocContent(userId, docId) {
  const res = await fetch(`${BASE_URL}/docs/content/${userId}/${docId}`);
  return res.json();
}

// ------------------------------
// Session Summarization APIs
// ------------------------------
export async function createSession(userId, meetTranscript) {
  const res = await fetch(`${BASE_URL}/session/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, meetTranscript }),
  });
  return res.json();
}

export async function getSessions(userId) {
  const res = await fetch(`${BASE_URL}/session/get/${userId}`);
  return res.json();
}
export async function updateDoc(userId, docId, file) {
    const formData = new FormData();
    formData.append("document", file);
    formData.append("userId", userId);
    formData.append("docId", docId);
    const res = await fetch(`${BASE_URL}/docs/update`, {
      method: "PUT",
      body: formData,
    });
    return res.json();
  }
  
  export async function deleteDoc(userId, docId) {
    const res = await fetch(`${BASE_URL}/docs/delete`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, docId }),
    });
    return res.json();
  }
  