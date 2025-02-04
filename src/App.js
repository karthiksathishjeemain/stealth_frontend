// src/App.js
import React, { useEffect, useRef, useState } from "react";
import {
  registerUser,
  verifyOtp,
  loginUser,
  uploadDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  createSession,
  getSessions,
} from "./api";

const App = () => {
  // ===== Authentication State =====
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [userId, setUserId] = useState(""); // Logged in user's id
  const [showOtp, setShowOtp] = useState(false); // Show OTP screen if not verified

  // ===== Transcription & Recording State =====
  const [leftTranscript, setLeftTranscript] = useState(""); // Microphone / Google Meet transcript
  const [rightTranscript, setRightTranscript] = useState(""); // Speaker (tab audio)
  const [qaPairs, setQAPairs] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorders, setMediaRecorders] = useState([]);

  const leftProcessedIndex = useRef(0);
  const rightProcessedIndex = useRef(0);
  const DEEPGRAM_API_KEY = "946ed125b417c1e33c8f228daf6d7cc1ad8730a1";
  const questionWords = ["who", "what", "where", "when", "why", "how"];

  // ===== Document Upload State =====
  const [selectedFile, setSelectedFile] = useState(null);
  const [docs, setDocs] = useState([]);
  // For updating docs: track which doc is being replaced and the new file.
  const [docToUpdate, setDocToUpdate] = useState(null);
  const [updateFile, setUpdateFile] = useState(null);

  // ===== Session Summarization State =====
  const [sessionSummary, setSessionSummary] = useState("");
  const [sessions, setSessions] = useState([]);

  // ===== For Displaying Tab Video =====
  const [tabStream, setTabStream] = useState(null);
  const tabVideoRef = useRef(null);

  // ===== Authentication Handlers =====
  const handleRegister = async () => {
    const res = await registerUser(email, password);
    setAuthMessage("User not verified. Please enter the OTP sent to your email.");
    setShowOtp(true);
  };

  const handleLogin = async () => {
    const res = await loginUser(email, password);
    if (res.userId) {
      setUserId(res.userId);
      setAuthMessage("Login successful!");
      // setShowOtp(false);
    } else {
      setAuthMessage(res.message);
      }
    }
  

  const handleVerifyOtp = async () => {
    const res = await verifyOtp(email, otp);
    setAuthMessage(res.message);
    if (res.message.toLowerCase().includes("success")) {
      setAuthMessage("User verified successfully. Please login to continue.");
      setShowOtp(false);
    }
  };

  // ===== Transcription / Question Handling =====
  useEffect(() => {
    const processNewText = (transcript, processedRef) => {
      const newText = transcript.slice(processedRef.current).trim();
      if (newText) {
        const firstWord = newText.split(" ")[0].toLowerCase();
        if (questionWords.includes(firstWord)) {
          handleAutoAnswer(newText);
        }
        processedRef.current = transcript.length;
      }
    };

    processNewText(leftTranscript, leftProcessedIndex);
    processNewText(rightTranscript, rightProcessedIndex);
  }, [leftTranscript, rightTranscript]);

  const handleAutoAnswer = async (question) => {
    console.log("Detected question:", question);
    const answer = await askLLM(question);
    setQAPairs((prev) => [...prev, { question, answer }]);
  };

  const captureStreams = async () => {
    try {
      const tabStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      setTabStream(tabStream);
      return { tabStream, micStream };
    } catch (error) {
      console.error("Error capturing streams:", error);
    }
  };

  const transcribeAudio = (stream, setTranscript) => {
    const mediaRecorder = new MediaRecorder(stream);
    const socket = new WebSocket("wss://api.deepgram.com/v1/listen", [
      "token",
      DEEPGRAM_API_KEY,
    ]);

    socket.onopen = () => {
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
          socket.send(event.data);
        }
      };
      mediaRecorder.start(250);
    };

    socket.onmessage = (message) => {
      const data = JSON.parse(message.data);
      if (data.is_final) {
        const transcript = data.channel.alternatives[0].transcript;
        setTranscript((prev) => prev + " " + transcript);
      }
    };

    socket.onclose = () => mediaRecorder.stop();
    setMediaRecorders((prev) => [...prev, mediaRecorder]);
  };
// Place this near your other useEffect hooks, at the top-level of your component
useEffect(() => {
  if (tabStream && tabVideoRef.current) {
    tabVideoRef.current.srcObject = tabStream;
  }
}, [tabStream]);

// And update startRecording as follows:
const startRecording = async () => {
  const streams = await captureStreams();
  if (streams?.tabStream && streams?.micStream) {
    transcribeAudio(streams.tabStream, setRightTranscript);
    transcribeAudio(streams.micStream, setLeftTranscript);
    setIsRecording(true);
  }
};

  const stopRecording = async () => {
    mediaRecorders.forEach((mr) => mr.stop());
    // Stop the tab (video) stream tracks as well
    if (tabStream) {
      tabStream.getTracks().forEach((track) => track.stop());
      setTabStream(null);
    }
    setIsRecording(false);
    setMediaRecorders([]);
    if (userId && leftTranscript.trim()) {
      const res = await createSession(userId, leftTranscript);
      if (res.session) {
        setSessionSummary(res.session.summary);
      }
    }
  };
  

  const askLLM = async (question) => {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer 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`,
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: [{ role: "user", content: question }],
          temperature: 0.7,
          max_tokens: 150,
        }),
      });
      const data = await response.json();
      console.log("LLM Response:", data);
      return data.choices[0].message.content.trim();
    } catch (error) {
      console.error("Error calling Groq API:", error);
      return "Error generating response.";
    }
  };

  // ===== Document Handlers =====
  const handleFileChange = (e) => {
    setSelectedFile(e.target.files[0]);
  };

  const handleUploadDoc = async () => {
    if (!userId || !selectedFile) return;
    const res = await uploadDoc(userId, selectedFile);
    alert(res.message);
  };

  const handleLoadDocs = async () => {
    if (!userId) return;
    const res = await getDocs(userId);
    setDocs(res.docs || []);
  };

  // New: Handle updating a document.
  // When user selects a new file for a given doc, call updateDoc.
  const handleUpdateDoc = async (docId) => {
    if (!userId || !updateFile) return;
    const res = await updateDoc(userId, docId, updateFile);
    alert(res.message);
    // Clear the updateFile state and refresh document list.
    setUpdateFile(null);
    setDocToUpdate(null);
    handleLoadDocs();
  };

  // New: Handle deletion of a document.
  const handleDeleteDoc = async (docId) => {
    if (!userId) return;
    const res = await deleteDoc(userId, docId);
    alert(res.message);
    handleLoadDocs();
  };

  // ===== Session Handlers =====
  const handleLoadSessions = async () => {
    if (!userId) return;
    const res = await getSessions(userId);
    setSessions(res.sessions || []);
  };

  // ===== Authentication UI =====
  if (!userId && !showOtp) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          background: "linear-gradient(135deg, #71b7e6, #9b59b6)",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.95)",
            borderRadius: "8px",
            padding: "30px",
            width: "90%",
            maxWidth: "400px",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
            textAlign: "center",
          }}
        >
          <h1 style={{ marginBottom: "10px", color: "#333" }}>Welcome</h1>
          <p style={{ marginBottom: "20px", color: "#555" }}>
            Please Register or Login to continue
          </p>
          <div style={{ marginBottom: "15px" }}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: "100%",
                padding: "10px",
                marginBottom: "10px",
                borderRadius: "4px",
                border: "1px solid #ccc",
              }}
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: "100%",
                padding: "10px",
                borderRadius: "4px",
                border: "1px solid #ccc",
              }}
            />
          </div>
          <div style={{ display: "flex", gap: "8px", marginBottom: "15px" }}>
            <button
              onClick={handleRegister}
              style={{
                flex: 1,
                padding: "10px",
                borderRadius: "4px",
                border: "none",
                backgroundColor: "#4CAF50",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              Register
            </button>
            <button
              onClick={handleLogin}
              style={{
                flex: 1,
                padding: "10px",
                borderRadius: "4px",
                border: "none",
                backgroundColor: "#2196F3",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              Login
            </button>
          </div>
          {authMessage && (
            <p style={{ marginTop: "10px", color: "#d9534f" }}>{authMessage}</p>
          )}
        </div>
      </div>
    );
  }

  if (!userId && showOtp) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          background: "linear-gradient(135deg, #71b7e6, #9b59b6)",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.95)",
            borderRadius: "8px",
            padding: "30px",
            width: "90%",
            maxWidth: "400px",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
            textAlign: "center",
          }}
        >
          <h1 style={{ marginBottom: "10px", color: "#333" }}>
            OTP Verification
          </h1>
          <p style={{ marginBottom: "20px", color: "#555" }}>
            Please enter the OTP sent to your email
          </p>
          <input
            type="text"
            placeholder="Enter OTP"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            style={{
              width: "100%",
              padding: "10px",
              marginBottom: "15px",
              borderRadius: "4px",
              border: "1px solid #ccc",
            }}
          />
          <button
            onClick={handleVerifyOtp}
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: "4px",
              border: "none",
              backgroundColor: "#FF5722",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Verify OTP
          </button>
          {authMessage && (
            <p style={{ marginTop: "10px", color: "#d9534f" }}>{authMessage}</p>
          )}
        </div>
      </div>
    );
  }

  // ===== Main App (when user is logged in) =====
  return (
    <div style={styles.mainContainer}>
      <h1 style={styles.mainHeader}>Real-Time Conversation Transcriber</h1>

      {/* ---------- Display the Captured Tab Video ---------- */}
      {tabStream && (
  <div style={styles.videoContainer}>
    <video ref={tabVideoRef} autoPlay playsInline muted style={styles.tabVideo}></video>
  </div>
)}  
      {/* ---------- Transcription Section ---------- */}
      <div style={styles.transcriptionContainer}>
        <div style={styles.transcriptionBox}>
          <h2>Your Questions (Microphone / Meet Transcript)</h2>
          <div style={styles.transcriptContent}>{leftTranscript}</div>
        </div>
        <div style={styles.divider}></div>
        <div style={styles.transcriptionBox}>
          <h2>Speaker Response (Tab Audio)</h2>
          <div style={styles.transcriptContent}>{rightTranscript}</div>
        </div>
      </div>

      <div style={styles.qaContainer}>
        <h2>Detected Q&A</h2>
        {qaPairs.map((pair, index) => (
          <div key={index} style={styles.qaCard}>
            <strong>Q: {pair.question}</strong>
            <br />
            <span>A: {pair.answer}</span>
          </div>
        ))}
      </div>

      <div style={styles.buttonContainer}>
        {!isRecording ? (
          <button onClick={startRecording} style={styles.recordButton}>
            Start Recording
          </button>
        ) : (
          <button onClick={stopRecording} style={styles.stopButton}>
            Stop Recording
          </button>
        )}
      </div>

      <hr style={styles.dividerHR} />

      {/* ---------- Document Upload Section ---------- */}
      <div style={styles.sectionContainer}>
        <h2>Document Upload</h2>
        <div style={styles.formGroup}>
          <input type="file" onChange={handleFileChange} style={styles.inputField} />
          <button onClick={handleUploadDoc} style={styles.uploadButton}>
            Upload Document
          </button>
        </div>
        <div style={styles.formGroup}>
          <button onClick={handleLoadDocs} style={styles.loadButton}>
            Load My Documents
          </button>
        </div>
        {docs.length > 0 && (
  <ul style={styles.docList}>
    {docs.map((doc) => (
      <li key={doc._id} style={styles.docItem}>
        <span>{doc.originalName}</span>
        <div style={styles.docButtonsContainer}>
          {/* View button: Opens the file in a new tab */}
          <a
            href={doc.url}
            target="_blank"
            rel="noreferrer"
            style={styles.docButton}
            title="View"
          >
            👁
          </a>
          {/* Replace button: Triggers the update UI */}
          <button
            onClick={() => {
              setDocToUpdate(doc._id);
              setUpdateFile(null);
            }}
            style={styles.docButton}
            title="Replace"
          >
            🔄
          </button>
          {/* Delete button: Calls the delete API */}
          <button
            onClick={() => handleDeleteDoc(doc._id)}
            style={styles.docButton}
            title="Delete"
          >
            🗑
          </button>
        </div>
        {/* If this document is selected for update, show file input and confirm button */}
        {docToUpdate === doc._id && (
          <div style={{ marginTop: "8px" }}>
            <input
              type="file"
              onChange={(e) => setUpdateFile(e.target.files[0])}
              style={{ marginRight: "8px" }}
            />
            <button
              onClick={() => handleUpdateDoc(doc._id)}
              style={{
                padding: "4px 8px",
                backgroundColor: "#28A745",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                color: "#fff",
                fontSize: "0.9em",
              }}
            >
              Confirm Update
            </button>
          </div>
        )}
      </li>
    ))}
  </ul>
)}
      </div>

      <hr style={styles.dividerHR} />

      {/* ---------- Session Summarization Section ---------- */}
      <div style={styles.sectionContainer}>
        <h2>Session Summarization</h2>
        {sessionSummary && (
          <div style={styles.summaryCard}>
            <h3>Session Summary:</h3>
            <p>{sessionSummary}</p>
          </div>
        )}
        <div style={styles.formGroup}>
          <button onClick={handleLoadSessions} style={styles.loadButton}>
            Load My Sessions
          </button>
        </div>
        {sessions.length > 0 && (
          <ul style={styles.sessionList}>
            {sessions.map((session) => (
              <li key={session._id} style={styles.sessionItem}>
                <strong>Summary:</strong> {session.summary}
                <br />
                <em>Transcript:</em> {session.meetTranscript}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

// ===== Inline Styles =====
const styles = {
  // Main Container
  mainContainer: {
    maxWidth: "900px",
    margin: "20px auto",
    padding: "20px",
    fontFamily: "Arial, sans-serif",
  },
  mainHeader: {
    textAlign: "center",
    marginBottom: "30px",
  },
  // Video Styles for Captured Tab
  videoContainer: {
    textAlign: "center",
    marginBottom: "20px",
  },
  tabVideo: {
    maxWidth: "100%",
    borderRadius: "8px",
    boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
  },
  // Transcription Styles
  transcriptionContainer: {
    display: "flex",
    gap: "20px",
    margin: "20px 0",
    border: "1px solid #ddd",
    borderRadius: "8px",
    padding: "15px",
  },
  transcriptionBox: {
    flex: 1,
  },
  transcriptContent: {
    minHeight: "150px",
    padding: "10px",
    backgroundColor: "#f0f8ff",
    borderRadius: "5px",
  },
  divider: {
    width: "1px",
    backgroundColor: "#ddd",
    margin: "0 10px",
  },
  qaContainer: {
    marginTop: "20px",
  },
  qaCard: {
    margin: "10px 0",
    padding: "10px",
    border: "1px solid #eee",
    borderRadius: "5px",
    backgroundColor: "#f8f9fa",
  },
  buttonContainer: {
    textAlign: "center",
    marginTop: "20px",
  },
  recordButton: {
    padding: "10px 20px",
    backgroundColor: "#4CAF50",
    color: "white",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
  },
  stopButton: {
    padding: "10px 20px",
    backgroundColor: "#f44336",
    color: "white",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
  },
  dividerHR: {
    margin: "30px 0",
  },
  // Document Upload Styles
  sectionContainer: {
    padding: "20px",
    border: "1px solid #ddd",
    borderRadius: "8px",
    boxShadow: "0px 2px 4px rgba(0,0,0,0.1)",
    marginBottom: "30px",
  },
  uploadButton: {
    padding: "10px 15px",
    backgroundColor: "#5bc0de",
    color: "white",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    marginLeft: "10px",
  },
  loadButton: {
    padding: "10px 15px",
    backgroundColor: "#337ab7",
    color: "white",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
  },
  // docList: {
  //   marginTop: "15px",
  //   listStyleType: "none",
  //   paddingLeft: "0",
  // },
  // docItem: {
  //   marginBottom: "8px",
  // },
  docLink: {
    color: "#337ab7",
    textDecoration: "none",
  },
  // Session Summarization Styles
  summaryCard: {
    padding: "15px",
    backgroundColor: "#dff0d8",
    border: "1px solid #d6e9c6",
    borderRadius: "4px",
    marginBottom: "15px",
  },
  sessionList: {
    listStyleType: "none",
    paddingLeft: "0",
  },
  sessionItem: {
    marginBottom: "15px",
    padding: "10px",
    backgroundColor: "#f7f7f7",
    borderRadius: "4px",
  },
  docList: {
    marginTop: "15px",
    listStyleType: "none",
    paddingLeft: "0",
  },
  docItem: {
    marginBottom: "8px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottom: "1px solid #eee",
    paddingBottom: "5px",
  },
  docButtonsContainer: {
    display: "flex",
    gap: "8px",
  },
  docButton: {
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: "1.2em",
  },
};

export default App;
