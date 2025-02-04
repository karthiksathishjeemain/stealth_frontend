import React, { useEffect, useRef, useState } from "react";


const App = () => {
  const [leftTranscript, setLeftTranscript] = useState(""); // Microphone (user)
  const [rightTranscript, setRightTranscript] = useState(""); // Speaker (tab audio)
  const [qaPairs, setQAPairs] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorders, setMediaRecorders] = useState([]);


 
 const leftProcessedIndex = useRef(0);
  const rightProcessedIndex = useRef(0);
  const DEEPGRAM_API_KEY = "946ed125b417c1e33c8f228daf6d7cc1ad8730a1";
  const questionWords = ["who", "what", "where", "when", "why", "how"];

 
  useEffect(() => {
    const processNewText = (transcript, processedRef, setTranscriptSide) => {

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


  const startRecording = async () => {
    const streams = await captureStreams();
    if (streams?.tabStream && streams?.micStream) {
      transcribeAudio(streams.tabStream, setRightTranscript); // Speaker (right)
      transcribeAudio(streams.micStream, setLeftTranscript); // Microphone (left)
      setIsRecording(true);
    }
  };


  const stopRecording = () => {
    mediaRecorders.forEach((mr) => mr.stop());
    setIsRecording(false);
    setMediaRecorders([]);
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
      console.log("Data is ",data);
      return data.choices[0].message.content.trim();
    } catch (error) {
      console.error("Error calling Groq API:", error);
      return "Error generating response.";
    }
  };
//  const dummy= async ()  =>{
//     console.log(await askLLM("What is the capital of France?"));
//   }
//   dummy();
// console.log("api key is", process.env.ee);
  // console.log(await askLLM("What is the capital of France?"));
  return (
    <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
      <h1>Real-Time Conversation Transcriber</h1>

     
      <div
        style={{
          display: "flex",
          gap: "20px",
          margin: "20px 0",
          border: "1px solid #ddd",
          borderRadius: "8px",
          padding: "15px",
        }}
      >
      
        <div style={{ flex: 1 }}>
          <h2>Your Questions (Microphone)</h2>
          <div
            style={{
              minHeight: "150px",
              padding: "10px",
              backgroundColor: "#f0f8ff",
              borderRadius: "5px",
            }}
          >
            {leftTranscript}
          </div>
        </div>

  
        <div
          style={{
            width: "1px",
            backgroundColor: "#ddd",
            margin: "0 10px",
          }}
        ></div>

    
        <div style={{ flex: 1 }}>
          <h2>Speaker Response (Tab Audio)</h2>
          <div
            style={{
              minHeight: "150px",
              padding: "10px",
              backgroundColor: "#fff0f5",
              borderRadius: "5px",
            }}
          >
            {rightTranscript}
          </div>
        </div>
      </div>


      <div style={{ marginTop: "20px" }}>
        <h2>Detected Q&A</h2>
        {qaPairs.map((pair, index) => (
          <div
            key={index}
            style={{
              margin: "10px 0",
              padding: "10px",
              border: "1px solid #eee",
              borderRadius: "5px",
              backgroundColor: "#f8f9fa",
            }}
          >
            <strong>Q: {pair.question}</strong>
            <br />
            <span>A: {pair.answer}</span>
          </div>
        ))}
      </div>

    
      <div style={{ marginTop: "20px" }}>
        {!isRecording ? (
          <button
            onClick={startRecording}
            style={{
              padding: "10px 20px",
              backgroundColor: "#4CAF50",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Start Recording
          </button>
        ) : (
          <button
            onClick={stopRecording}
            style={{
              padding: "10px 20px",
              backgroundColor: "#f44336",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Stop Recording
          </button>
        )}
      </div>
    </div>
  );
};

export default App;
