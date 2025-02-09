import React, { useState } from 'react';

// Replace with your public ngrok URL for the backend (e.g., "https://xxxx.ngrok.io")
const backendUrl = 'http://localhost:8000';

function App() {
  // Form state
  const [meetingPurpose, setMeetingPurpose] = useState('');
  const [meetingGoal, setMeetingGoal] = useState('');
  const [otherCommunications, setOtherCommunications] = useState('');
  const [meetingDuration, setMeetingDuration] = useState('');

  // App state
  const [agenda, setAgenda] = useState([]); // Each agenda item: { topic, discussed }
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [meeting,setMeeting]=useState([]);

  // Handler for the "Connect with the meeting window" button
  const handleConnect = async (e) => {
    e.preventDefault();
    // Concatenate form values to create a meeting description
    const meetingDescription = `${meetingPurpose} ${meetingGoal} ${otherCommunications} ${meetingDuration}`;
    setMeeting(meetingDescription);
    try {
      const res = await fetch(`${backendUrl}/generate-agenda`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meeting_description: meetingDescription })
      });
      const data = await res.json();
      if (data.agenda) {
        // Initialize each agenda topic with a discussed flag set to false
        const agendaItems = data.agenda.map(topic => ({ topic, discussed: false }));
        setAgenda(agendaItems);
        setIsConnected(true);
      }
    } catch (error) {
      console.error('Error generating agenda:', error);
    }
  };

  // Helper function to delay execution
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // Handler for the "Start Speaking" button
  const handleStartSpeaking = async () => {
    setIsSpeaking(true);
    try {
      // Send the previously returned agenda (as an array of topics) to the process-transcription API
      const agendaTopics = agenda.map(item => item.topic);
      const res = await fetch(`${backendUrl}/process-transcription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Passing the agenda array in the request body
        body: JSON.stringify({ agenda: agendaTopics , meeting_description: meeting})
      });
      const data = await res.json();
      if (data.discussed_topics) {
        // Start sequentially updating the agenda cards
        setLoading(true);
        // Assume the API returns the discussed topics in the order they should update
        const discussedReturned = data.discussed_topics;
        for (const topic of discussedReturned) {
          // Update the corresponding agenda item (turn its card green)
          setAgenda(prevAgenda =>
            prevAgenda.map(item =>
              item.topic === topic ? { ...item, discussed: true } : item
            )
          );
          // Wait for 2 seconds before updating the next topic
          await delay(2000);
        }
        setLoading(false);
      }
    } catch (error) {
      console.error('Error processing transcription:', error);
    }
  };

  return (
    <div style={{ position: 'relative', minHeight: '100vh', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
        <h1 style={{ textAlign: 'center', marginBottom: '30px' }}>Meeting Agenda Generator</h1>

        {/* Form Section */}
        {!isConnected && (
          <form onSubmit={handleConnect} style={{
            background: '#f9f9f9',
            padding: '30px',
            borderRadius: '10px',
            boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
            marginBottom: '30px'
          }}>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>
                Add meeting purpose:
              </label>
              <input
                type="text"
                value={meetingPurpose}
                onChange={(e) => setMeetingPurpose(e.target.value)}
                style={{ width: '100%', padding: '12px', borderRadius: '5px', border: '1px solid #ccc' }}
                required
              />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>
                Your goal of meeting / What do you want to achieve?:
              </label>
              <input
                type="text"
                value={meetingGoal}
                onChange={(e) => setMeetingGoal(e.target.value)}
                style={{ width: '100%', padding: '12px', borderRadius: '5px', border: '1px solid #ccc' }}
                required
              />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>
                Add any other relevant communications, correspondence, etc.:
              </label>
              <input
                type="text"
                value={otherCommunications}
                onChange={(e) => setOtherCommunications(e.target.value)}
                style={{ width: '100%', padding: '12px', borderRadius: '5px', border: '1px solid #ccc' }}
              />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>
                Duration of meeting:
              </label>
              <input
                type="text"
                value={meetingDuration}
                onChange={(e) => setMeetingDuration(e.target.value)}
                style={{ width: '100%', padding: '12px', borderRadius: '5px', border: '1px solid #ccc' }}
                required
              />
            </div>
            <div style={{ textAlign: 'center' }}>
              <button type="submit" style={{
                padding: '15px 30px',
                backgroundColor: '#007BFF',
                color: '#fff',
                border: 'none',
                borderRadius: '5px',
                fontSize: '18px'
              }}>
                Connect with the meeting window
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Agenda Cards Display Section */}
      {isConnected && (
        <div style={{ position: 'absolute', right: '20px', top: '100px', width: '260px' }}>
          <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>Meeting Agendas</h2>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '20px'
          }}>
            {agenda.map((item, index) => (
              <div key={index} style={{
                padding: '25px',
                backgroundColor: item.discussed ? '#90ee90' : '#d3d3d3',
                borderRadius: '10px',
                boxShadow: '0 4px 8px rgba(0,0,0,0.15)',
                textAlign: 'center',
                transition: 'background-color 0.5s ease'
              }}>
                <h3 style={{ margin: 0 }}>{item.topic}</h3>
              </div>
            ))}
          </div>
          {!isSpeaking && (
            <div style={{ textAlign: 'center', marginTop: '30px' }}>
              <button onClick={handleStartSpeaking} style={{
                padding: '15px 30px',
                backgroundColor: '#28a745',
                color: '#fff',
                border: 'none',
                borderRadius: '5px',
                fontSize: '18px'
              }}>
                Start Speaking
              </button>
            </div>
          )}
        </div>
      )}

      {/* Loading Indicator */}
      {loading && (
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: 'rgba(255,255,255,0.9)',
          padding: '40px',
          borderRadius: '10px',
          boxShadow: '0 4px 10px rgba(0,0,0,0.2)',
          zIndex: 9999,
          textAlign: 'center'
        }}>
          <div className="spinner" style={{
            border: '8px solid #f3f3f3',
            borderTop: '8px solid #3498db',
            borderRadius: '50%',
            width: '60px',
            height: '60px',
            animation: 'spin 2s linear infinite',
            margin: '0 auto'
          }} />
          <p style={{ marginTop: '20px', fontSize: '18px' }}>Processing...</p>
        </div>
      )}

      {/* Spinner CSS Keyframes */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default App;
