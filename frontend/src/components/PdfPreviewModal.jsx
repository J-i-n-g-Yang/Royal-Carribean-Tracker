import React from 'react';
import { Document, Page } from 'react-pdf';
import { ExternalLink, ChevronLeft, ChevronRight, Loader } from 'lucide-react';
// pdfjs worker is configured once in App.js — no need to import it here.

export default function PdfPreviewModal({
  previewUrl,
  numPages,
  pageNumber,
  pdfError,
  dark,
  onClose,
  onLoadSuccess,
  onLoadError,
  onPrevPage,
  onNextPage,
}) {
  const d = (light, darkCls) => (dark ? darkCls : light);

  if (!previewUrl) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className={`relative w-full h-full max-w-6xl max-h-[90vh] rounded-lg overflow-hidden shadow-2xl flex flex-col ${d('bg-white', 'bg-gray-900')}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`flex items-center justify-between p-4 border-b shrink-0 ${d('bg-gray-50 border-gray-200', 'bg-gray-800 border-gray-700')}`}>
          <h3 className={`text-lg font-semibold ${d('text-gray-800', 'text-white')}`}>
            Certificate Preview
            {numPages && (
              <span className={`ml-3 text-sm font-normal ${d('text-gray-500', 'text-gray-400')}`}>
                Page {pageNumber} of {numPages}
              </span>
            )}
          </h3>
          <div className="flex items-center gap-2">
            {numPages && numPages > 1 && (
              <div className="flex items-center gap-1">
                <button onClick={onPrevPage} disabled={pageNumber <= 1}
                  className="p-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button onClick={onNextPage} disabled={pageNumber >= numPages}
                  className="p-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
            <button onClick={() => window.open(previewUrl, '_blank')}
              className="text-sm flex items-center gap-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
              <ExternalLink className="w-4 h-4" /> Open Full PDF
            </button>
            <button onClick={onClose}
              className={`text-2xl font-bold leading-none px-2 ${d('text-gray-500 hover:text-gray-700', 'text-gray-400 hover:text-gray-200')}`}>
              ×
            </button>
          </div>
        </div>

        {/* PDF Content */}
        <div className={`flex-1 overflow-auto flex items-center justify-center p-4 ${d('bg-gray-100', 'bg-gray-950')}`}>
          {pdfError ? (
            <div className="text-center">
              <p className={`text-lg mb-4 ${d('text-gray-700', 'text-gray-300')}`}>{pdfError}</p>
              <button onClick={() => window.open(previewUrl, '_blank')}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
                Open PDF in New Tab Instead
              </button>
            </div>
          ) : (
            <Document
              file={previewUrl}
              onLoadSuccess={onLoadSuccess}
              onLoadError={onLoadError}
              loading={
                <div className="flex flex-col items-center gap-3">
                  <Loader className="w-8 h-8 animate-spin text-blue-600" />
                  <p className={`text-sm ${d('text-gray-600', 'text-gray-400')}`}>Loading PDF...</p>
                </div>
              }
              options={{
                cMapUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/cmaps/',
                cMapPacked: true,
              }}
            >
              <Page
                pageNumber={pageNumber}
                renderTextLayer={true}
                renderAnnotationLayer={true}
                className="shadow-lg"
                width={Math.min(window.innerWidth * 0.8, 900)}
              />
            </Document>
          )}
        </div>
      </div>
    </div>
  );
}
