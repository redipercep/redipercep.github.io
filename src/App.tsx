
// src/App.tsx

import React from 'react';
import {HashRouter as Router, Routes, Route} from 'react-router-dom';
import Home from './pages/Home';
import MemoPage from './pages/MemoPage';
import SettingsPage from './pages/SettingsPage';
import ImportsPage from './pages/ImportsPage';

function App() {
  return (
      <Router basename="/">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/memo" element={<MemoPage />} />
          <Route path="/memo/settings" element={<SettingsPage />} />
          <Route path="/memo/imports" element={<ImportsPage />} />
        </Routes>
      </Router>
  );
}

export default App;
