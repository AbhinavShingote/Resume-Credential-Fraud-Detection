/**
 * React entry point.
 *
 * This file runs first, grabs the <div id="root"> from index.html,
 * and tells React to render the <App /> component inside it.
 *
 * BrowserRouter wraps the app so React Router can handle navigation
 * between pages (/login, /dashboard, /reports, etc.) without full reloads.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);