
import React, { useState } from 'react';
import { UrlInput } from './components/UrlInput';
import { TrackCard } from './components/TrackCard';
import { useTrackManager } from './hooks/useTrackManager';
import { DownloadIcon } from './components/Icons';

export const App: React.FC = () => {
    const [url, setUrl] = useState('');
    const { tracks, isFetchingMeta, error, addTrackByUrl, clearCompleted, removeTrack, retryTrack } = useTrackManager();

    const handleDownload = () => {
        if (!url.trim()) return;
        addTrackByUrl(url);
        setUrl('');
    };

    const activeTracks = tracks.filter(t => t.status === 'queued' || t.status === 'downloading');
    const completedTracks = tracks.filter(t => t.status === 'complete' || t.status === 'error');

    return (
        <div className="min-h-screen bg-[#090909] font-sans text-white selection:bg-brand-spotify selection:text-white pb-24">
            
            {/* Ambient Background */}
            <div className="fixed top-[-10%] left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-brand-spotify/20 blur-[120px] rounded-full pointer-events-none opacity-40 mix-blend-screen" />
            
            <div className="max-w-5xl mx-auto px-4 sm:px-6 relative z-10">
                
                {/* Header Section */}
                <header className="pt-24 pb-12 text-center flex flex-col items-center">
                    <div className="w-16 h-16 bg-gradient-to-tr from-brand-spotify to-green-300 rounded-2xl flex items-center justify-center shadow-lg shadow-brand-spotify/20 mb-6 rotate-3 hover:rotate-6 transition-transform duration-300">
                        <DownloadIcon className="w-8 h-8 text-black" />
                    </div>
                    <h1 className="text-5xl md:text-7xl font-black tracking-tighter mb-4 bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-gray-500">
                        JackTracker
                    </h1>
                    <p className="text-lg text-gray-400 max-w-lg mx-auto leading-relaxed font-medium">
                        Serverless NoSQL metadata extraction & downloader.
                    </p>
                </header>

                {/* Input Area */}
                <section className="mb-20">
                    <UrlInput 
                        url={url} 
                        setUrl={setUrl} 
                        onDownload={handleDownload} 
                        isLoading={isFetchingMeta} 
                    />
                    {error && (
                        <div className="mt-6 flex justify-center">
                            <div className="bg-red-500/10 border border-red-500/20 backdrop-blur text-red-400 px-4 py-2 rounded-lg text-sm font-semibold animate-in fade-in slide-in-from-top-2">
                                {error}
                            </div>
                        </div>
                    )}
                </section>

                {/* Main Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
                    
                    {/* Queue Column */}
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center justify-between pb-2 border-b border-gray-800">
                            <h2 className="text-lg font-bold flex items-center gap-2 text-gray-200">
                                <span className={`w-2 h-2 rounded-full ${activeTracks.length > 0 ? 'bg-brand-spotify animate-pulse' : 'bg-gray-600'}`}></span>
                                Active Queue
                            </h2>
                            <span className="text-xs font-mono text-gray-500 bg-gray-900 border border-gray-800 px-2 py-1 rounded-md">
                                {activeTracks.length} items
                            </span>
                        </div>
                        
                        <div className="flex flex-col gap-3 min-h-[100px]">
                            {isFetchingMeta && (
                                <div className="animate-pulse bg-gray-800/40 h-20 rounded-xl border border-gray-800/50 flex items-center justify-center">
                                    <span className="text-xs text-gray-500 font-medium">Analyzing URL...</span>
                                </div>
                            )}
                            
                            {activeTracks.length === 0 && !isFetchingMeta && (
                                <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-gray-800/50 rounded-2xl">
                                    <p className="text-gray-600 text-sm font-medium">Queue is empty</p>
                                </div>
                            )}

                            {activeTracks.map(track => (
                                <TrackCard key={track.id} track={track} />
                            ))}
                        </div>
                    </div>

                    {/* History Column */}
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center justify-between pb-2 border-b border-gray-800">
                             <h2 className="text-lg font-bold text-gray-200">History</h2>
                             {completedTracks.length > 0 && (
                                <button 
                                    onClick={clearCompleted}
                                    className="text-xs font-semibold text-gray-500 hover:text-white transition-colors bg-gray-900 hover:bg-gray-800 px-3 py-1 rounded-md border border-transparent hover:border-gray-700"
                                >
                                    Clear All
                                </button>
                             )}
                        </div>

                        <div className="flex flex-col gap-3">
                             {completedTracks.length === 0 && (
                                 <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-gray-800/50 rounded-2xl">
                                    <p className="text-gray-600 text-sm font-medium">No recent downloads</p>
                                 </div>
                            )}

                            <div className="flex flex-col gap-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                                {completedTracks.map(track => (
                                    <TrackCard 
                                        key={track.id} 
                                        track={track} 
                                        onRemove={removeTrack}
                                        onRetry={retryTrack}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
