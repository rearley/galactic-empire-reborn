import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './styles.css';
import { App } from './App';
import { RequireAuth } from './routes/RequireAuth';
import { Landing } from './routes/Landing';
import { Login } from './routes/Login';
import { Register } from './routes/Register';
import { ChooseUsername } from './routes/ChooseUsername';
import { Stats } from './routes/Stats';
import { Guide, GuidePage } from './routes/Guide';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('No #root element found');

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/register/name" element={<ChooseUsername />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/guide" element={<Guide />} />
        <Route path="/guide/:slug" element={<GuidePage />} />
        <Route path="/play" element={<RequireAuth><App /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
