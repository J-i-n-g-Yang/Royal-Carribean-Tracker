import React, { useState } from 'react';
import { pdfjs } from 'react-pdf';
import { Anchor, Moon, Sun, FileText, Calculator, TrendingUp, CalendarRange, DollarSign, History } from 'lucide-react';

import LinkGenerator       from './components/LinkGenerator';
import TripFinanceOS       from './components/TripFinanceOS';
import CasinoAnalytics     from './components/CasinoAnalytics';
import CasinoYearTracker   from './components/CasinoYearTracker';
import PriceChecker        from './components/PriceChecker';
import ScheduledHistory    from './components/ScheduledHistory';
import PdfPreviewModal     from './components/PdfPreviewModal';

// Set up pdfjs worker
pdfjs.GlobalWorkerOptions.workerSrc =
  `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

export default function App() {
  const [dark, setDark]           = useState(false);
  const [activeTab, setActiveTab] = useState('generator');

  // PDF preview state (lifted here so modal works across both tabs)
  const [previewUrl, setPreviewUrl]   = useState(null);
  const [numPages, setNumPages]       = useState(null);
  const [pageNumber, setPageNumber]   = useState(1);
  const [pdfError, setPdfError]       = useState(null);

  const d = (light, darkCls) => (dark ? darkCls : light);

  const openPreview = (url) => {
    setPreviewUrl(url);
    setPageNumber(1);
    setNumPages(null);
    setPdfError(null);
  };

  const closePreview = () => {
    setPreviewUrl(null);
    setPageNumber(1);
    setNumPages(null);
    setPdfError(null);
  };

  const TABS = [
    { id: 'generator',  label: 'PDF Generator',    icon: FileText       },
    { id: 'finance',    label: 'Trip Finance OS',   icon: Calculator     },
    { id: 'analytics',  label: 'Casino Analytics',  icon: TrendingUp     },
    { id: 'casinoyear', label: 'Casino Year',        icon: CalendarRange  },
    { id: 'pricecheck', label: 'Price Checker',      icon: DollarSign     },
    { id: 'history',    label: 'Run History',        icon: History        },
  ];

  return (
    <div className={`min-h-screen transition-colors duration-300 p-4 lg:p-6 ${d('bg-gradient-to-br from-blue-50 to-indigo-100', 'bg-gray-950')}`}>
      <div className={`max-w-7xl mx-auto rounded-2xl shadow-xl p-6 lg:p-8 transition-colors duration-300 ${d('bg-white', 'bg-gray-900')}`}>

        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <Anchor className={`w-8 h-8 ${d('text-blue-600', 'text-blue-400')}`} />
            <h1 className={`text-xl font-bold leading-tight ${d('text-gray-800', 'text-white')}`}>
              Royal Caribbean Casino Royale
              <br />
              <span className={`text-sm font-semibold ${d('text-blue-600', 'text-blue-400')}`}>
                Cruise Tools Dashboard
              </span>
            </h1>
          </div>
          <button onClick={() => setDark(!dark)}
            className={`p-2 rounded-full transition-colors ${d('bg-gray-100 hover:bg-gray-200 text-gray-700', 'bg-gray-700 hover:bg-gray-600 text-yellow-300')}`}>
            {dark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>

        {/* Tab Navigation */}
        <div className={`flex flex-wrap gap-1 p-1 rounded-xl mb-6 ${d('bg-gray-100', 'bg-gray-800')}`}>
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-semibold transition-all flex-1 min-w-[120px] ${
                activeTab === id
                  ? d('bg-white text-blue-700 shadow-sm', 'bg-gray-700 text-blue-300')
                  : d('text-gray-500 hover:text-gray-700', 'text-gray-500 hover:text-gray-300')
              }`}>
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'generator'  && <LinkGenerator dark={dark} onPreview={openPreview} />}
        {activeTab === 'finance'    && <TripFinanceOS dark={dark} />}
        {activeTab === 'analytics'  && <CasinoAnalytics dark={dark} />}
        {activeTab === 'casinoyear' && <CasinoYearTracker dark={dark} />}
        {activeTab === 'pricecheck' && <PriceChecker dark={dark} />}
        {activeTab === 'history'    && <ScheduledHistory dark={dark} />}

        {/* PDF Preview Modal — outside tab so it works from anywhere */}
        <PdfPreviewModal
          previewUrl={previewUrl}
          numPages={numPages}
          pageNumber={pageNumber}
          pdfError={pdfError}
          dark={dark}
          onClose={closePreview}
          onLoadSuccess={({ numPages: n }) => { setNumPages(n); setPdfError(null); }}
          onLoadError={(err) => { console.error(err); setPdfError('Failed to load PDF. The server may be blocking access.'); }}
          onPrevPage={() => setPageNumber((p) => Math.max(p - 1, 1))}
          onNextPage={() => setPageNumber((p) => Math.min(p + 1, numPages || 1))}
        />
      </div>
    </div>
  );
}
