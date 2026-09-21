import React, { useState, useEffect, useRef } from 'react';
import './App.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const PUB_TOPIC = import.meta.env.VITE_HARDWARE_TOPIC || 'innsub5';

// Updated command mappings per your specs
const ON_KEYS = ["1", "2", "5", "6", "7"];
const OFF_KEYS = ["a", "b", "e", "f", "g"];

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('kameha_token'));
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState(''); 
  const [deviceStates, setDeviceStates] = useState(new Array(5).fill(false));
  const [boardStatus, setBoardStatus] = useState('offline');
  const abortControllerRef = useRef(null);

  const baseUrl = import.meta.env.BASE_URL;

  const logout = (isExpired = false) => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    localStorage.removeItem('kameha_token');
    setIsAuthenticated(false);
    if (isExpired) {
      setErrorMsg('Session expired. Please login again.');
    }
  };

  const sendSecureCommand = async (topic, message) => {
    const token = localStorage.getItem('kameha_token');
    try {
      const res = await fetch(`${API_BASE_URL}/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ topic, message })
      });

      if (res.status === 401 || res.status === 403) {
        logout(true);
      }
      return true;
    } catch (err) { 
      console.error("Command failed"); 
      return false;
    }
  };

  const allOn = async () => {
    setDeviceStates(new Array(5).fill(true));
    for (const key of ON_KEYS) {
      await sendSecureCommand(PUB_TOPIC, key);
      await new Promise(resolve => setTimeout(resolve, 30));
    }
  };

  const allOff = async () => {
    setDeviceStates(new Array(5).fill(false));
    for (const key of OFF_KEYS) {
      await sendSecureCommand(PUB_TOPIC, key);
      await new Promise(resolve => setTimeout(resolve, 30));
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    let isMounted = true;

    const listenForUpdates = async () => {
      abortControllerRef.current = new AbortController();
      try {
        const res = await fetch(`${API_BASE_URL}/latest-updates?topic=${encodeURIComponent(PUB_TOPIC)}`, {
          signal: abortControllerRef.current.signal
        });

        if (res.status === 401 || res.status === 403) {
          logout(true);
          return;
        }

        const data = await res.json();
        if (!isMounted) return;

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
        }
        listenForUpdates();
      } catch (err) {
        if (isMounted && err.name !== 'AbortError') {
          setTimeout(listenForUpdates, 3000);
        }
      }
    };

    sendSecureCommand(PUB_TOPIC, "0");
    listenForUpdates();

    return () => {
      isMounted = false;
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [isAuthenticated]);

  const login = async (e) => {
    e.preventDefault();
    setErrorMsg('');
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
      } else {
        setErrorMsg('Invalid Master Password');
      }
    } catch (err) { setErrorMsg("Auth Server Offline"); }
  };

  const handleToggle = (i) => {
    const newState = !deviceStates[i];
    setDeviceStates(prev => { const n = [...prev]; n[i] = newState; return n; });
    sendSecureCommand(PUB_TOPIC, newState ? ON_KEYS[i] : OFF_KEYS[i]);
  };

  if (!isAuthenticated) {
    return (
      <div className="app-viewport">
        <div className="glass-shell login-panel">
          <h1 className="main-logo">KAMEHA</h1>
          {errorMsg && (
            <div style={{
              background: 'rgba(255, 77, 77, 0.15)',
              color: '#ff4d4d',
              padding: '10px',
              borderRadius: '8px',
              marginBottom: '15px',
              fontSize: '0.85rem',
              border: '1px solid rgba(255, 77, 77, 0.3)',
              textAlign: 'center',
              width: '100%'
            }}>
              {errorMsg}
            </div>
          )}
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
          <div className="logo-row" onClick={() => logout(false)} style={{cursor: 'pointer'}}>
            <div className={`status-pill ${boardStatus}`}></div>
            <h1 className="main-logo">KAMEHA</h1>
          </div>
        </header>

        <div className="master-controls" style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          <button onClick={allOn} className="m-btn" style={{ flex: 1, padding: '12px' }}>ALL ON</button>
          <button onClick={allOff} className="m-btn" style={{ flex: 1, padding: '12px' }}>ALL OFF</button>
        </div>

        <div className={`grid-container ${boardStatus}`}>
          {deviceStates.map((isOn, i) => (
            <button key={i} className={`tile ${isOn ? 'on' : ''}`} onClick={() => handleToggle(i)}>
              <img 
                src={`${baseUrl}${isOn ? 'bright-light-bulb-svgrepo-com.svg' : 'light-bulb-svgrepo-com.svg'}`} 
                alt="icon" 
              />
              <div className="tile-info">
                <span className="t-name">{`Light 0${i + 1}`}</span>
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