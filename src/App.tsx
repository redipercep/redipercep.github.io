
// src/App.tsx

import React from 'react';
import {HashRouter as Router, Routes, Route} from 'react-router-dom';
import Home from './pages/Home';
import MemoPage from './pages/MemoPage';

function App() {
  return (
      <Router basename="/">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/memo" element={<MemoPage />} />
        </Routes>
      </Router>
  );
}

export default App;
