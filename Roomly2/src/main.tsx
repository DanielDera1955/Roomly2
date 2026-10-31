import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerApp } from './notify';
import { PriceListPage } from './components/PriceListPage';

// A supplier's private price list link (?prices=<token>) opens only that page
const priceToken = new URLSearchParams(window.location.search).get('prices');

if (!priceToken) {
  // Makes Roomly installable on phones and lets it show notifications
  registerApp();
}

createRoot(document.getElementById('root')!).render(priceToken ? <PriceListPage token={priceToken} /> : <App />);
