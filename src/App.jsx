import React, { useState, useEffect, useRef } from 'react';
import './App.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const PUB_TOPIC = import.meta.env.VITE_HARDWARE_TOPIC;

const OFF_KEYS = ["a", "b", "c", "d", "e", "f"];
const ON_KEYS = ["1", "2", "3", "4", "5", "6"];
const FAN_STATES = ["FTRP0000", "FTRP0001", "FTRP0010", "FTRP0011", "FTRP0100"];
const FAN_LABELS = ["Power Off", "Silent", "Normal", "Boost", "Turbo"];

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('kameha_token'));
  const [password, setPassword] = useState('');
  const [deviceStates, setDeviceStates] = useState(new Array(6).fill(false));
  const [fanValue, setFanValue] = useState(0);
  const [boardStatus, setBoardStatus] = useState('offline');
  const abortControllerRef = useRef(null);

  // --- THE LONG POLLING ENGINE ---
  useEffect(() => {
    if (!isAuthenticated) return;

    let isMounted = true;

    const listenForUpdates = async () => {
      // Create an abort controller so we can cancel the request on logout/unmount
      abortControllerRef.current = new AbortController();

      try {
        const res = await fetch(`${API_BASE_URL}/latest-updates`, {
          signal: abortControllerRef.current.signal
        });
        const data = await res.json();
        
        if (!isMounted) return;

        // Update UI immediately with the payload
        setBoardStatus(data.status);
        if (data.updates && data.updates.length > 0) {
          setDeviceStates(prev => {
            const newState = [...prev];
            data.updates.forEach(msg => {
              const onIdx = ON_KEYS.indexOf(msg);
              const offIdx = OFF_KEYS.indexOf(msg);
              if (onIdx !== -1) newState[onIdx] = true;
              if (offIdx !== -1) newState[offIdx] = false;
            });
            return newState;
          });

          const fanMsg = [...data.updates].reverse().find(m => m.startsWith("FTRP"));
          if (fanMsg) {
            const fIdx = FAN_STATES.indexOf(fanMsg);
            if (fIdx !== -1) setFanValue(fIdx);
          }
        }

        // RECURSIVE CALL: Re-open the pipe immediately for the next message
        listenForUpdates();

      } catch (err) {
        if (isMounted && err.name !== 'AbortError') {
          console.log("Reconnecting in 3s...");
          setTimeout(listenForUpdates, 3000); // Wait 3s on error to prevent CPU spike
        }
      }
    };

    // Initial load: Probe hardware and start the listener
    sendSecureCommand(PUB_TOPIC, "0");
    listenForUpdates();

    return () => {
      isMounted = false;
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [isAuthenticated]);

  // --- API ACTIONS ---
  const sendSecureCommand = async (topic, message) => {
    const token = localStorage.getItem('kameha_token');
    try {
      await fetch(`${API_BASE_URL}/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ topic, message })
      });
    } catch (err) { console.error("Command failed"); }
  };

  const login = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (data.token) {
        localStorage.setItem('kameha_token', data.token);
        setIsAuthenticated(true);
      }
    } catch (err) { alert("Auth Server Offline"); }
  };

  const logout = () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    localStorage.removeItem('kameha_token');
    setIsAuthenticated(false);
  };

  const handleToggle = (i) => {
    const newState = !deviceStates[i];
    // Optimistic Update for zero-lag feel
    setDeviceStates(prev => { const n = [...prev]; n[i] = newState; return n; });
    sendSecureCommand(PUB_TOPIC, newState ? ON_KEYS[i] : OFF_KEYS[i]);
  };

  if (!isAuthenticated) {
    return (
      <div className="app-viewport">
        <div className="glass-shell login-panel">
          <h1 className="main-logo">KAMEHA</h1>
          <form onSubmit={login} className="login-form">
            <input 
              type="password" placeholder="MASTER PASS" 
              className="m-btn login-input"
              value={password} onChange={(e) => setPassword(e.target.value)}
            />
            <button type="submit" className="m-btn login-submit">ACCESS</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-viewport">
      <div className="glass-shell">
        <header className="header-section">
          <div className="logo-row" onClick={logout} style={{cursor: 'pointer'}}>
            <div className={`status-pill ${boardStatus}`}></div>
            <h1 className="main-logo">KAMEHA</h1>
          </div>
        </header>

        <section className="fan-panel">
          <div className="fan-meta">
            <span>Airflow Intensity</span>
            <span className="fan-mode">{FAN_LABELS[fanValue]}</span>
          </div>
          <div className="slider-wrapper">
            <div className="fan-dots">
              {[0, 1, 2, 3, 4].map(d => <div key={d} className={`dot ${fanValue >= d ? 'active' : ''}`} />)}
            </div>
            <input 
              type="range" min="0" max="4" step="1" value={fanValue} 
              onChange={(e) => {
                const v = parseInt(e.target.value);
                setFanValue(v);
                sendSecureCommand(PUB_TOPIC, FAN_STATES[v]);
              }}
              className="dot-slider"
            />
          </div>
        </section>

        <div className={`grid-container ${boardStatus}`}>
          {deviceStates.map((isOn, i) => (
            <button key={i} className={`tile ${isOn ? 'on' : ''}`} onClick={() => handleToggle(i)}>
              <img 
                src={i === 3 ? '/fan-3.svg' : (isOn ? '/bright-light-bulb-svgrepo-com.svg' : '/light-bulb-svgrepo-com.svg')} 
                className={i === 3 && isOn ? 'spin' : ''} 
                alt="icon" 
              />
              <div className="tile-info">
                <span className="t-name">{i === 3 ? "Main Fan" : `Light 0${i + 1}`}</span>
                <span className="t-status">{isOn ? 'ACTIVE' : 'IDLE'}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;