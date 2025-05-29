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
  getDocContent,
  getSessions,
} from "./api"; // Assuming api.js exists and is functional

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
  const DEEPGRAM_API_KEY = "946ed125b417c1e33c8f228daf6d7cc1ad8730a1"; // Consider securing this key
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
    // TODO: Replace alert with a custom modal/message box
    setAuthMessage("User not verified. Please enter the OTP sent to your email.");
    setShowOtp(true);
  };

  const handleLogin = async () => {
    const res = await loginUser(email, password);
    if (res.userId) {
      setUserId(res.userId);
      setAuthMessage("Login successful!");
      console.log("User ID:", res.userId);
      // setShowOtp(false); // No need to explicitly hide OTP if login is successful
    } else {
      setAuthMessage(res.message);
    }
  };

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
      mediaRecorder.start(250); // Send data every 250ms
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

  // Effect to set the tab video source
  useEffect(() => {
    if (tabStream && tabVideoRef.current) {
      tabVideoRef.current.srcObject = tabStream;
    }
  }, [tabStream]);

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
    // Create session only if there's a logged-in user and some transcript
    if (userId && (leftTranscript.trim()|| rightTranscript.trim())) {
      const meetTranscript = "My discussions \n"+leftTranscript.trim() + "\n Others discussion"+ rightTranscript.trim();
      const res = await createSession(userId, meetTranscript);
      console.log("Session created:", res);
      if (res.session) {
        setSessionSummary(res.session.summary);
      }
    }
  };

const askLLM = async (question) => {
  try {
    let documentContext = '';
    
    // Get most recent document
    if (userId) {
      const docsResponse = await getDocs(userId);
      const documents = docsResponse.docs || [];
      
      if (documents.length > 0) {
        const mostRecentDoc = documents[documents.length - 1];
        
        // Get document content via backend API
        const contentResponse = await getDocContent(userId, mostRecentDoc._id);
        
        if (contentResponse.content) {
          documentContext = `You are the person described in this document. Answer all questions in first person as if you are speaking about your own experiences, skills, and background. Always use "I have", "I worked", "my experience", etc. Never refer to yourself in third person. Based on your document content: ${contentResponse.content}\n\nWhen answering questions, speak as yourself about your own experiences and qualifications.\n\n`;
        }
      }
    }
    
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer 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`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: documentContext + question }],
        temperature: 0.7,
        max_tokens: 150,
      }),
    });
    
    const data = await response.json();
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
    // TODO: Replace alert with a custom modal/message box
    alert(res.message);
    // Refresh documents after upload
    handleLoadDocs();
  };

  const handleLoadDocs = async () => {
    if (!userId) return;
    const res = await getDocs(userId);
    setDocs(res.docs || []);
  };

  // Handle updating a document.
  const handleUpdateDoc = async (docId) => {
    if (!userId || !updateFile) return;
    const res = await updateDoc(userId, docId, updateFile);
    // TODO: Replace alert with a custom modal/message box
    alert(res.message);
    // Clear the updateFile state and refresh document list.
    setUpdateFile(null);
    setDocToUpdate(null);
    handleLoadDocs();
  };

  // Handle deletion of a document.
  const handleDeleteDoc = async (docId) => {
    if (!userId) return;
    const res = await deleteDoc(userId, docId);
    // TODO: Replace alert with a custom modal/message box
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
      <div className="flex flex-col items-center justify-center h-screen bg-gradient-to-br from-blue-400 to-purple-500 font-sans">
        <div className="bg-white bg-opacity-95 rounded-lg p-8 w-11/12 max-w-md shadow-xl text-center">
          <h1 className="mb-3 text-3xl font-bold text-gray-800">Welcome</h1>
          <p className="mb-6 text-gray-600">
            Please Register or Login to continue
          </p>
          <div className="mb-4">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-3 mb-3 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-3 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div className="flex gap-2 mb-4">
            <button
              onClick={handleRegister}
              className="flex-1 p-3 rounded-md border-none bg-green-500 text-white cursor-pointer hover:bg-green-600 transition duration-300 ease-in-out shadow-md"
            >
              Register
            </button>
            <button
              onClick={handleLogin}
              className="flex-1 p-3 rounded-md border-none bg-blue-500 text-white cursor-pointer hover:bg-blue-600 transition duration-300 ease-in-out shadow-md"
            >
              Login
            </button>
          </div>
          {authMessage && (
            <p className="mt-4 text-red-500 font-medium">{authMessage}</p>
          )}
        </div>
      </div>
    );
  }

  if (!userId && showOtp) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gradient-to-br from-blue-400 to-purple-500 font-sans">
        <div className="bg-white bg-opacity-95 rounded-lg p-8 w-11/12 max-w-md shadow-xl text-center">
          <h1 className="mb-3 text-3xl font-bold text-gray-800">
            OTP Verification
          </h1>
          <p className="mb-6 text-gray-600">
            Please enter the OTP sent to your email
          </p>
          <input
            type="text"
            placeholder="Enter OTP"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            className="w-full p-3 mb-4 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button
            onClick={handleVerifyOtp}
            className="w-full p-3 rounded-md border-none bg-orange-500 text-white cursor-pointer hover:bg-orange-600 transition duration-300 ease-in-out shadow-md"
          >
            Verify OTP
          </button>
          {authMessage && (
            <p className="mt-4 text-red-500 font-medium">{authMessage}</p>
          )}
        </div>
      </div>
    );
  }

  // ===== Main App (when user is logged in) =====
  return (
    <div className="min-h-screen py-8 font-sans bg-gradient-to-r from-teal-100 to-lime-100">
      <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-xl">
    <h1 className="text-4xl font-extrabold text-center mb-8 bg-gradient-to-r from-teal-200 to-lime-100 bg-clip-text text-transparent font-serif">Think Less</h1>

        {/* ---------- Display the Captured Tab Video ---------- */}
        {tabStream && (
          <div className="text-center mb-8">
            <video ref={tabVideoRef} autoPlay playsInline muted className="max-w-full rounded-lg shadow-md border border-gray-200"></video>
          </div>
        )}

        {/* ---------- Transcription Section ---------- */}
        <div className="flex flex-col md:flex-row gap-6 mb-8 p-6 border border-gray-200 rounded-lg shadow-sm bg-white">
          <div className="flex-1">
            <h2 className="text-2xl font-mono mb-4 text-gray-700">Your Audio</h2>
            <div className="min-h-[150px] p-4 bg-blue-50 rounded-md border border-blue-200 text-gray-800 leading-relaxed overflow-auto font-mono">
              {leftTranscript || "Start recording to see your audio transcript here..."}
            </div>
          </div>
          <div className="hidden md:block w-px bg-gray-300 mx-4"></div> {/* Vertical divider for desktop */}
          <div className="flex-1">
            <h2 className="text-2xl font-mono mb-4 text-gray-700">Tab Audio</h2>
            <div className="min-h-[150px] p-4 bg-green-50 rounded-md border border-green-200 text-gray-800 leading-relaxed overflow-auto font-mono">
              {rightTranscript || "Start recording to see tab audio transcript here..."}
            </div>
          </div>
        </div>

        <div className="mb-8 p-6 border border-gray-200 rounded-lg shadow-sm bg-white">
          <h2 className="text-2xl font-mono mb-4 text-gray-700">Detected Q&A</h2>
          {qaPairs.length === 0 && (
            <p className="text-gray-500 italic">No questions detected yet.</p>
          )}
          <div className="space-y-4">
            {qaPairs.map((pair, index) => (
              <div key={index} className="p-4 border border-gray-200 rounded-md bg-gray-50 shadow-sm font-mono">
                <p className="text-gray-800 mb-1">
                  <strong className="text-blue-600">Q:</strong> {pair.question}
                </p>
                <p className="text-gray-500">
                  <span className="text-green-600">A:</span> {pair.answer}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="text-center mb-8">
          {!isRecording ? (
            <button onClick={startRecording} className="px-8 py-3 bg-green-600 text-white font-bold rounded-full shadow-lg hover:bg-green-700 transition duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-green-300">
              Start Recording
            </button>
          ) : (
            <button onClick={stopRecording} className="px-8 py-3 bg-red-600 text-white font-bold rounded-full shadow-lg hover:bg-red-700 transition duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-red-300">
              Stop Recording
            </button>
          )}
        </div>

        <hr className="my-10 border-t-2 border-gray-300" />

        {/* ---------- Document Upload Section ---------- */}
        <div className="p-6 border border-gray-200 rounded-lg shadow-sm bg-white mb-8">
          <h2 className="text-2xl font-semibold mb-4 text-gray-700">Document Upload</h2>
          <div className="flex flex-col sm:flex-row items-center gap-4 mb-4">
            <input
              type="file"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500
                         file:mr-4 file:py-2 file:px-4
                         file:rounded-full file:border-0
                         file:text-sm file:font-semibold
                         file:bg-blue-50 file:text-blue-700
                         hover:file:bg-blue-100"
            />
            <button onClick={handleUploadDoc} className="px-6 py-2 bg-sky-500 text-white font-semibold rounded-md shadow-md hover:bg-sky-600 transition duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-sky-300">
              Upload Document
            </button>
          </div>
          <div className="mb-4">
            <button onClick={handleLoadDocs} className="px-6 py-2 bg-indigo-600 text-white font-semibold rounded-md shadow-md hover:bg-indigo-700 transition duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-300">
              Load My Documents
            </button>
          </div>
          {docs.length > 0 && (
            <ul className="mt-4 space-y-3">
              {docs.map((doc) => (
                <li key={doc._id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 bg-gray-50 rounded-md border border-gray-200 shadow-sm">
                  <span className="font-medium text-gray-800 mb-2 sm:mb-0">{doc.originalName}</span>
                  <div className="flex gap-2 items-center">
                    {/* View button: Opens the file in a new tab */}
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noreferrer"
                      className="p-2 text-gray-600 hover:text-blue-500 transition-colors duration-200"
                      title="View"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                        <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                      </svg>
                    </a>
                    {/* Replace button: Triggers the update UI */}
                    <button
                      onClick={() => {
                        setDocToUpdate(doc._id);
                        setUpdateFile(null);
                      }}
                      className="p-2 text-gray-600 hover:text-yellow-500 transition-colors duration-200"
                      title="Replace"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005 7.101V9a1 1 0 01-2 0V3a1 1 0 011-1zm1 13a1 1 0 01-1-1v-2.101a7.002 7.002 0 0111.601-2.566 1 1 0 11-1.885-.666A5.002 5.002 0 0015 12.899V11a1 1 0 012 0v6a1 1 0 01-1 1h-6a1 1 0 01-1-1z" clipRule="evenodd" />
                      </svg>
                    </button>
                    {/* Delete button: Calls the delete API */}
                    <button
                      onClick={() => handleDeleteDoc(doc._id)}
                      className="p-2 text-gray-600 hover:text-red-500 transition-colors duration-200"
                      title="Delete"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm6 0a1 1 0 11-2 0v6a1 1 0 112 0V8z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                  {/* If this document is selected for update, show file input and confirm button */}
                  {docToUpdate === doc._id && (
                    <div className="mt-3 sm:mt-0 sm:ml-4 flex items-center gap-2 w-full sm:w-auto">
                      <input
                        type="file"
                        onChange={(e) => setUpdateFile(e.target.files[0])}
                        className="block w-full text-sm text-gray-500
                                   file:mr-4 file:py-1 file:px-2
                                   file:rounded-full file:border-0
                                   file:text-sm file:font-semibold
                                   file:bg-gray-100 file:text-gray-700
                                   hover:file:bg-gray-200"
                      />
                      <button
                        onClick={() => handleUpdateDoc(doc._id)}
                        className="px-3 py-1 bg-green-600 text-white rounded-md cursor-pointer text-sm hover:bg-green-700 transition duration-200"
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

        <hr className="my-10 border-t-2 border-gray-300" />

        {/* ---------- Session Summarization Section ---------- */}
        <div className="p-6 border border-gray-200 rounded-lg shadow-sm bg-white">
          <h2 className="text-2xl font-semibold mb-4 text-gray-700">Session Summarization</h2>
          {sessionSummary && (
            <div className="p-4 bg-lime-50 border border-lime-200 rounded-md mb-6 shadow-sm">
              <h3 className="text-lg font-semibold mb-2 text-lime-700">Session Summary:</h3>
              <p className="text-gray-700 leading-relaxed">{sessionSummary}</p>
            </div>
          )}
          <div className="mb-4">
            <button onClick={handleLoadSessions} className="px-6 py-2 bg-indigo-600 text-white font-semibold rounded-md shadow-md hover:bg-indigo-700 transition duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-300">
              Load My Sessions
            </button>
          </div>
          {sessions.length > 0 && (
            <ul className="mt-4 space-y-4">
              {sessions.map((session) => (
                <li key={session._id} className="p-4 bg-gray-50 rounded-md shadow-sm border border-gray-200">
                  <p className="mb-1 text-gray-800">
                    <strong className="text-blue-600">Summary:</strong> {session.summary}
                  </p>
                  <p className="text-gray-600 italic">
                    <span className="text-green-600">Transcript:</span> {session.meetTranscript}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;
