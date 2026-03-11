import ReactDOM from 'react-dom/client';
import { Toaster } from 'sonner';
import App from './App';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <>
    <App />
    <Toaster
      theme="dark"
      position="bottom-left"
      toastOptions={{
        style: {
          background: '#1e293b',
          border: '1px solid #334155',
          color: '#e2e8f0',
        },
      }}
      richColors
      closeButton
    />
  </>,
);
