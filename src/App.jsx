import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import './App.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://kameha.in:5000/api";
const PUB_TOPIC = import.meta.env.VITE_HARDWARE_TOPIC || 'Innsub4';
const SUB_TOPIC = import.meta.env.VITE_STATUS_TOPIC || 'otto6';

const OFF_KEYS = ["a", "b", "c", "d", "e", "f"];
const ON_KEYS = ["1", "2", "3", "4", "5", "6"];
const FAN_STATES = ["FTRP0000", "FTRP0001", "FTRP0010", "FTRP0011", "FTRP0100"];
const FAN_LABELS = ["Power Off", "Silent", "Normal", "Boost", "Turbo"];

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(Boolean(localStorage.getItem('kameha_token')));
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState(''); 
  const [deviceStates, setDeviceStates] = useState([false, false, false, false, false, false]);
  const [fanValue, setFanValue] = useState(0);
  const [boardStatus, setBoardStatus] = useState('offline');

  const baseUrl = import.meta.env.BASE_URL;

  const getSocketUrl = function(url) {
    return url.replace(/\/api\/?$/, '');
  };

  const logout = function(isExpired) {
    localStorage.removeItem('kameha_token');
    setIsAuthenticated(false);
    if (isExpired) {
      setErrorMsg('Session expired. Please login again.');
    }
  };

  const sendSecureCommand = async function(topic, message) {
    const token = localStorage.getItem('kameha_token');
    try {
      const res = await fetch(API_BASE_URL + '/command', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ topic: topic, message: message })
      });

      if (res.status === 401 || res.status === 403) {
        logout(true);
      }
    } catch (err) { 
      console.error("Command failed", err);
    }
  };

  const allOn = function() {
    for (let i = 0; i < ON_KEYS.length; i++) {
      sendSecureCommand(PUB_TOPIC, ON_KEYS[i]);
    }
    setDeviceStates([true, true, true, true, true, true]);
  };

  const allOff = function() {
    for (let i = 0; i < OFF_KEYS.length; i++) {
      sendSecureCommand(PUB_TOPIC, OFF_KEYS[i]);
    }
    setDeviceStates([false, false, false, false, false, false]);
  };

  useEffect(function() {
    if (!isAuthenticated) return;

    const socket = io(getSocketUrl(API_BASE_URL), {
      secure: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000
    });

    socket.on('connect', function() {
      socket.emit('join_board', SUB_TOPIC);
      sendSecureCommand(PUB_TOPIC, "0");
    });

    socket.on('board_update', function(data) {
      if (data.status) {
        setBoardStatus(data.status);
      }

      let msg = data.message || data;
      if (typeof msg === 'object' && msg !== null && msg.message) {
        msg = msg.message;
      }

      if (typeof msg === 'string') {
        // 1. Process Relay Key Commands ("1"-"6" -> ON, "a"-"f" -> OFF)
        const onIdx = ON_KEYS.indexOf(msg);
        const offIdx = OFF_KEYS.indexOf(msg);

        if (onIdx !== -1 || offIdx !== -1) {
          setDeviceStates(function(prev) {
            const newState = prev.slice();
            if (onIdx !== -1) newState[onIdx] = true;
            if (offIdx !== -1) newState[offIdx] = false;
            return newState;
          });
        }

        // 2. Process Fan Speed Slider Payload ("FTRP...") independently
        if (msg.indexOf("FTRP") === 0) {
          const fIdx = FAN_STATES.indexOf(msg);
          if (fIdx !== -1) {
            setFanValue(fIdx); // Updates only the slider position & label
          }
        }
      }
    });

    return function() {
      socket.disconnect();
    };
  }, [isAuthenticated]);

  const login = async function(e) {
    e.preventDefault();
    setErrorMsg('');
    try {
      const res = await fetch(API_BASE_URL + '/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          password: password,
          boardId: SUB_TOPIC 
        })
      });
      const data = await res.json();
      if (data.token) {
        localStorage.setItem('kameha_token', data.token);
        setIsAuthenticated(true);
      } else {
        setErrorMsg(data.error || 'Invalid Master Password');
      }
    } catch (err) { 
      setErrorMsg("Auth Server Offline"); 
    }
  };

  const handleToggle = function(i) {
    if (boardStatus === 'offline') return;
    const newState = !deviceStates[i];

    // Optimistically update device states
    setDeviceStates(function(prev) {
      const n = prev.slice();
      n[i] = newState;
      return n;
    });

    // Sends "4" for Main Fan ON and "d" for Main Fan OFF (independent of slider)
    sendSecureCommand(PUB_TOPIC, newState ? ON_KEYS[i] : OFF_KEYS[i]);
  };

  const renderLoginView = function() {
    return React.createElement('div', { className: 'app-viewport' },
      React.createElement('div', { className: 'glass-shell login-panel' },
        React.createElement('h1', { className: 'main-logo' }, 'KAMEHA'),
        errorMsg ? React.createElement('div', {
          style: {
            background: 'rgba(255, 77, 77, 0.15)',
            color: '#ff4d4d',
            padding: '10px',
            borderRadius: '8px',
            marginBottom: '15px',
            fontSize: '0.85rem',
            border: '1px solid rgba(255, 77, 77, 0.3)',
            textAlign: 'center',
            width: '100%'
          }
        }, errorMsg) : null,
        React.createElement('form', { onSubmit: login, className: 'login-form' },
          React.createElement('input', {
            type: 'password',
            placeholder: 'MASTER PASS',
            className: 'm-btn login-input',
            value: password,
            onChange: function(e) { setPassword(e.target.value); }
          }),
          React.createElement('button', { type: 'submit', className: 'm-btn login-submit' }, 'ACCESS')
        )
      )
    );
  };

  const renderDashboardView = function() {
    return React.createElement('div', { className: 'app-viewport' },
      React.createElement('div', { className: 'glass-shell' },
        React.createElement('header', { className: 'header-section' },
          React.createElement('div', { 
            className: 'logo-row', 
            onClick: function() { logout(false); }, 
            style: { cursor: 'pointer' } 
          },
            React.createElement('div', { className: 'status-pill ' + boardStatus }),
            React.createElement('h1', { className: 'main-logo' }, 'KAMEHA')
          )
        ),
        React.createElement('div', { className: 'master-controls', style: { display: 'flex', gap: '10px', marginBottom: '20px' } },
          React.createElement('button', {
            onClick: allOn,
            className: 'm-btn',
            style: { flex: 1, padding: '12px' },
            disabled: boardStatus === 'offline'
          }, 'ALL ON'),
          React.createElement('button', {
            onClick: allOff,
            className: 'm-btn',
            style: { flex: 1, padding: '12px' },
            disabled: boardStatus === 'offline'
          }, 'ALL OFF')
        ),
        React.createElement('section', { className: 'fan-panel' },
          React.createElement('div', { className: 'fan-meta' },
            React.createElement('span', null, 'Airflow Intensity'),
            React.createElement('span', { className: 'fan-mode' }, FAN_LABELS[fanValue])
          ),
          React.createElement('div', { className: 'slider-wrapper' },
            React.createElement('div', { className: 'fan-dots' },
              [0, 1, 2, 3, 4].map(function(d) {
                return React.createElement('div', {
                  key: d,
                  className: 'dot ' + (fanValue >= d ? 'active' : '')
                });
              })
            ),
            React.createElement('input', {
              type: 'range',
              min: '0',
              max: '4',
              step: '1',
              value: fanValue,
              disabled: boardStatus === 'offline',
              onChange: function(e) {
                const v = parseInt(e.target.value, 10);
                setFanValue(v);
                sendSecureCommand(PUB_TOPIC, FAN_STATES[v]);
              },
              className: 'dot-slider'
            })
          )
        ),
        React.createElement('div', { className: 'grid-container ' + boardStatus },
          deviceStates.map(function(isOn, i) {
            const isFan = i === 3;
            const iconName = isFan ? 'fan-3.svg' : (isOn ? 'bright-light-bulb-svgrepo-com.svg' : 'light-bulb-svgrepo-com.svg');
            const tileName = isFan ? 'Main Fan' : ('Light 0' + (i + 1));
            
            return React.createElement('button', {
              key: i,
              className: 'tile ' + (isOn ? 'on' : ''),
              onClick: function() { handleToggle(i); }
            },
              React.createElement('img', {
                src: baseUrl + iconName,
                className: isFan && isOn ? 'spin' : '',
                alt: 'icon'
              }),
              React.createElement('div', { className: 'tile-info' },
                React.createElement('span', { className: 't-name' }, tileName),
                React.createElement('span', { className: 't-status' }, isOn ? 'ACTIVE' : 'IDLE')
              )
            );
          })
        )
      )
    );
  };

  return isAuthenticated ? renderDashboardView() : renderLoginView();
}