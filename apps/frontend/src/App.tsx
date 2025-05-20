import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { Header } from './components/Header';
import CreateMarketPage from './pages/CreateMarketPage';
import OpenMarketsPage from './pages/OpenMarketsPage';

function HomePage() {
  return (
    <div className="text-center p-8">
      <h2 className="text-3xl font-semibold mb-4 text-sky-400">Welcome to P2P Betting</h2>
      <p className="text-slate-300">Create or take bets on various outcomes, secured by Reclaim Protocol proofs.</p>
      <p className="text-slate-400 mt-2">Use the navigation above to get started.</p>
      <img src="/lets-bet.gif" alt="Let's fkn bet on this" className="mx-auto mt-8 rounded-lg shadow-lg" style={{ maxWidth: '400px' }} />
    </div>
  );
}

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-slate-900 text-slate-100">
        <Header />
        <nav className="p-4 bg-slate-800 shadow-md">
          <ul className="flex justify-center space-x-6">
            <li><Link to="/" className="text-sky-400 hover:text-sky-300 transition-colors">Home</Link></li>
            <li><Link to="/create" className="text-sky-400 hover:text-sky-300 transition-colors">Create Market</Link></li>
            <li><Link to="/markets" className="text-sky-400 hover:text-sky-300 transition-colors">Open Markets</Link></li>
          </ul>
        </nav>
        <main className="p-4 md:p-8">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/create" element={<CreateMarketPage />} />
            <Route path="/markets" element={<OpenMarketsPage />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
