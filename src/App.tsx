import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { FileUploader } from './components/FileUploader';
import { ProcessingState } from './components/ProcessingState';
import { ConfigurationStep } from './components/ConfigurationStep';
import { LrcResult } from './components/LrcResult';
import { fileToBase64, downloadAsZip, getTrackMetadata } from './utils/fileUtils';
import { isolateVocals } from './utils/audioProcessing';
import { generateLrcFromAudio } from './services/geminiService';
import { AppStatus, Track, TrackMetadata } from './types';
import { AlertTriangle, Music, CheckCircle2, ChevronRight, Plus, Download, RefreshCw, Trash2, Edit } from 'lucide-react';

const App: React.FC = () => {
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [tracks, setTracks] = useState<Track[]>([]);
  // processingIndex removed in favor of parallel processing status tracking
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Generation Settings
  const [maxLineLength, setMaxLineLength] = useState<number>(30);
  const [isHardLimit, setIsHardLimit] = useState<boolean>(false);

  // Counter to ensure uniqueness if Date.now() is identical
  const [idCounter, setIdCounter] = useState(0);

  const generateId = () => {
    // Increment counter to prevent collisions in same millisecond
    const count = idCounter + 1;
    setIdCounter(count);

    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // Robust fallback
    const array = new Uint32Array(1);
    let randomPart = "";
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
       crypto.getRandomValues(array);
       randomPart = array[0].toString(36);
    } else {
       randomPart = Math.random().toString(36).substring(2, 9);
    }
    return `${Date.now().toString(36)}-${count}-${randomPart}`;
  };

  const handleFilesSelect = async (files: File[]) => {
    try {
      setStatus(AppStatus.PROCESSING_AUDIO);
      setErrorMsg(null);
      
      const newTracks: Track[] = [];
      
      // Process files in parallel to get base64 and metadata
      await Promise.all(files.map(async (file) => {
        const base64 = await fileToBase64(file);
        const previewUrl = URL.createObjectURL(file);
        
        // Extract metadata using ID3 tags with filename fallback
        const metadata = await getTrackMetadata(file);
        
        newTracks.push({
          id: generateId(),
          file,
          base64,
          mimeType: file.type,
          previewUrl,
          originalLyrics: '',
          useIsolation: false, // Default to false, let user enable
          status: 'PENDING',
          metadata
        });
      }));

      setTracks(prev => [...prev, ...newTracks]);
      setStatus(AppStatus.CONFIGURATION);

    } catch (err: any) {
      setStatus(AppStatus.ERROR);
      console.error(err);
      setErrorMsg("An error occurred while preparing your files.");
    }
  };

  const handleUpdateLyrics = (id: string, lyrics: string) => {
    setTracks(prev => prev.map(t => t.id === id ? { ...t, originalLyrics: lyrics } : t));
  };

  const handleUploadLrc = (id: string, content: string | undefined) => {
    setTracks(prev => prev.map(t => t.id === id ? { 
        ...t, 
        lrcContent: content,
        status: content ? 'COMPLETED' : 'PENDING', // Reset status if LRC is removed
        error: undefined 
    } : t));
  };

  const handleBulkUploadLrc = (updates: { id: string; content: string }[]) => {
    setTracks(prev => {
        const newTracks = [...prev];
        updates.forEach(update => {
            const index = newTracks.findIndex(t => t.id === update.id);
            if (index !== -1) {
                newTracks[index] = { 
                    ...newTracks[index], 
                    lrcContent: update.content,
                    status: 'COMPLETED',
                    error: undefined
                };
            }
        });
        return newTracks;
    });
  };

  // Sync edits from the editor back to the global state so downloads work correctly
  const handleTrackContentChange = (id: string, newContent: string, newMetadata?: TrackMetadata) => {
    setTracks(prev => prev.map(t => t.id === id ? { 
        ...t, 
        lrcContent: newContent,
        metadata: newMetadata ? { ...t.metadata, ...newMetadata } : t.metadata 
    } : t));
  };

  const handleToggleIsolation = (id: string) => {
    setTracks(prev => prev.map(t => t.id === id ? { ...t, useIsolation: !t.useIsolation } : t));
  };

  const handleRemoveTrack = (id: string) => {
    setTracks(prev => {
        const newTracks = prev.filter(t => t.id !== id);
        // Revoke url to avoid leak
        const track = prev.find(t => t.id === id);
        if (track?.previewUrl) URL.revokeObjectURL(track.previewUrl);
        
        if (newTracks.length === 0) {
            setStatus(AppStatus.IDLE);
        }
        return newTracks;
    });
  };

  // Helper function to process a single track
  const processTrack = async (track: Track) => {
    // 1. Update status to ISOLATING or GENERATING
    setTracks(prev => prev.map(t => t.id === track.id ? { 
        ...t, 
        status: t.useIsolation ? 'ISOLATING' : 'GENERATING',
        error: undefined
    } : t));

    try {
        let finalBase64 = track.base64;
        let finalMimeType = track.mimeType;

        // Step 1: Vocal Isolation (If enabled)
        if (track.useIsolation) {
            console.log(`Isolating vocals for ${track.file.name}...`);
            const processedBase64 = await isolateVocals(track.file);
            finalBase64 = processedBase64;
            finalMimeType = 'audio/wav'; // Output of isolateVocals is always wav

            // Update status to GENERATING after isolation
            setTracks(prev => prev.map(t => t.id === track.id ? { ...t, status: 'GENERATING' } : t));
        }

        // Step 2: Generation
        const result = await generateLrcFromAudio(
            finalBase64, 
            finalMimeType, 
            track.originalLyrics,
            maxLineLength,
            isHardLimit
        );
        
        setTracks(prev => prev.map(t => t.id === track.id ? { 
            ...t, 
            status: 'COMPLETED', 
            lrcContent: result,
            error: undefined
        } : t));

    } catch (error: any) {
        console.error(`Error processing ${track.file.name}:`, error);
        setTracks(prev => prev.map(t => t.id === track.id ? { 
            ...t, 
            status: 'ERROR', 
            error: error.message || "Generation Failed" 
        } : t));
    }
  };

  const handleGenerateAll = async () => {
    const updatedTracks = [...tracks];
    
    // Filter pending tracks
    // Note: We also re-check lrcContent to skip manually uploaded ones if status wasn't set correctly
    const pendingTracks = updatedTracks.filter(t => t.status !== 'COMPLETED' && (!t.lrcContent || t.lrcContent.trim().length === 0));
    
    if (pendingTracks.length === 0) {
        setStatus(AppStatus.COMPLETED);
        if (!selectedTrackId && updatedTracks.length > 0) {
             setSelectedTrackId(updatedTracks[0].id);
        }
        return;
    }

    setStatus(AppStatus.GENERATING_LRC);

    // Concurrency Limit: Browsers often limit AudioContexts to ~6. To be safe, use 3 concurrent processors.
    const CONCURRENCY_LIMIT = 3;
    const queue = [...pendingTracks];
    
    const worker = async () => {
        while (queue.length > 0) {
            const track = queue.shift();
            if (track) {
                await processTrack(track);
            }
        }
    };

    // Start workers
    const workers = Array.from({ length: Math.min(CONCURRENCY_LIMIT, pendingTracks.length) }, () => worker());
    await Promise.all(workers);

    // Set selection to first completed track if available and nothing selected
    if (!selectedTrackId && tracks.length > 0) {
        // We just pick the first one in the list as a default
        setSelectedTrackId(tracks[0].id);
    }
    
    setStatus(AppStatus.COMPLETED);
  };

  const handleRetry = async (id: string) => {
    const track = tracks.find(t => t.id === id);
    if (!track) return;
    await processTrack(track);
  };

  const handleReset = () => {
    tracks.forEach(t => URL.revokeObjectURL(t.previewUrl));
    setTracks([]);
    setSelectedTrackId(null);
    setStatus(AppStatus.IDLE);
    setErrorMsg(null);
  };

  const handleModifyConfig = () => {
    setStatus(AppStatus.CONFIGURATION);
  };

  const handleDownloadAll = () => {
    const completedTracks = tracks.filter(t => t.status === 'COMPLETED' && t.lrcContent);
    if (completedTracks.length === 0) return;

    const filesToZip = completedTracks.map(t => ({
        filename: t.file.name,
        content: t.lrcContent!
    }));
    
    downloadAsZip(filesToZip);
  };

  // Helper for Result View
  const selectedTrack = tracks.find(t => t.id === selectedTrackId);
  
  // Calculate stats for processing view
  const processingCount = tracks.filter(t => t.status === 'GENERATING' || t.status === 'ISOLATING').length;
  const completedCount = tracks.filter(t => t.status === 'COMPLETED').length;
  const totalCount = tracks.length;
  const isAnyIsolating = tracks.some(t => t.status === 'ISOLATING');
  const isGlobalProcessing = status === AppStatus.GENERATING_LRC || status === AppStatus.ISOLATING_VOCALS;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-50 selection:bg-indigo-500/30">
      <Header />
      
      <main className="container mx-auto px-4 py-8 flex flex-col items-center min-h-[calc(100vh-80px)]">
        
        {/* Hero Section - Only show when idle */}
        {status === AppStatus.IDLE && (
          <div className="text-center mb-12 mt-8 space-y-4 animate-in fade-in slide-in-from-bottom-5 duration-700">
            <h2 className="text-4xl md:text-6xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 pb-2">
              Perfect Lyrics.<br/> Perfectly Synced.
            </h2>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto">
              Upload your songs and let Gemini's advanced multimodal AI listen, transcribe, 
              and timestamp your lyrics automatically in seconds.
            </p>
          </div>
        )}

        {/* Status: IDLE or PROCESSING AUDIO */}
        {(status === AppStatus.IDLE || status === AppStatus.PROCESSING_AUDIO) && (
          <FileUploader 
            onFilesSelected={handleFilesSelect} 
            isProcessing={status === AppStatus.PROCESSING_AUDIO} 
          />
        )}

        {/* Status: CONFIGURATION */}
        {status === AppStatus.CONFIGURATION && (
          <ConfigurationStep 
            tracks={tracks}
            onUpdateLyrics={handleUpdateLyrics}
            onUploadLrc={handleUploadLrc}
            onBulkUploadLrc={handleBulkUploadLrc}
            onRemoveTrack={handleRemoveTrack}
            onGenerateAll={handleGenerateAll}
            onBack={handleReset}
            onAddMoreFiles={handleFilesSelect}
            onToggleIsolation={handleToggleIsolation}
            maxLineLength={maxLineLength}
            setMaxLineLength={setMaxLineLength}
            isHardLimit={isHardLimit}
            setIsHardLimit={setIsHardLimit}
          />
        )}

        {/* Status: ISOLATING or GENERATING (PARALLEL) */}
        {isGlobalProcessing && (
          <ProcessingState 
            statusText={`Processing ${processingCount} file${processingCount !== 1 ? 's' : ''}...`}
            subText={`${completedCount} of ${totalCount} tracks completed. ${isAnyIsolating ? 'Applying audio isolation and ' : ''}analyzing streams concurrently.`}
            isIsolating={isAnyIsolating}
          />
        )}

        {/* Status: COMPLETED */}
        {status === AppStatus.COMPLETED && tracks.length > 0 && (
          <div className="w-full max-w-6xl flex flex-col md:flex-row gap-6 animate-in fade-in duration-500">
             
             {/* Sidebar List */}
             <div className="md:w-72 flex-shrink-0 space-y-3">
                <div className="flex items-center justify-between mb-2 px-1">
                    <h3 className="font-semibold text-slate-300">Your Tracks</h3>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={handleDownloadAll} 
                            className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors px-2 py-1 rounded hover:bg-slate-800"
                            title="Download all as ZIP"
                        >
                            <Download className="w-3.5 h-3.5" /> ZIP
                        </button>
                    </div>
                </div>
                
                <div className="space-y-2 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
                    {tracks.map(track => (
                        <button
                            key={track.id}
                            onClick={() => setSelectedTrackId(track.id)}
                            className={`w-full text-left p-3 rounded-xl border transition-all flex items-center gap-3
                                ${selectedTrackId === track.id 
                                    ? 'bg-indigo-600/10 border-indigo-500/50 ring-1 ring-indigo-500/50' 
                                    : 'bg-slate-800 border-slate-700 hover:bg-slate-700 hover:border-slate-600'}
                            `}
                        >
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0
                                ${track.status === 'COMPLETED' ? 'bg-green-500/20 text-green-400' : ''}
                                ${track.status === 'ERROR' ? 'bg-red-500/20 text-red-400' : ''}
                                ${(track.status === 'GENERATING' || track.status === 'ISOLATING') ? 'bg-amber-500/20 text-amber-400' : ''}
                                ${track.status === 'PENDING' ? 'bg-slate-700 text-slate-400' : ''}
                                ${selectedTrackId === track.id && track.status === 'COMPLETED' ? 'bg-indigo-500 text-white' : ''}
                            `}>
                                {track.status === 'COMPLETED' ? <CheckCircle2 className="w-4 h-4" /> : 
                                 track.status === 'ERROR' ? <AlertTriangle className="w-4 h-4" /> :
                                 (track.status === 'GENERATING' || track.status === 'ISOLATING') ? <RefreshCw className="w-4 h-4 animate-spin" /> :
                                 <Music className="w-4 h-4" />}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className={`text-sm font-medium truncate ${selectedTrackId === track.id ? 'text-white' : 'text-slate-300'}`}>
                                    {track.file.name}
                                </p>
                                <p className="text-[10px] text-slate-500 uppercase tracking-wider">{track.status}</p>
                            </div>
                            {selectedTrackId === track.id && <ChevronRight className="w-4 h-4 text-indigo-400" />}
                        </button>
                    ))}
                </div>

                <div className="pt-2 border-t border-slate-800 flex flex-col gap-2">
                    <button 
                        onClick={handleModifyConfig} 
                        className="w-full text-xs text-white bg-slate-800 hover:bg-slate-700 hover:text-white flex items-center justify-center gap-2 transition-colors py-3 rounded-xl font-medium border border-slate-700"
                    >
                        <Edit className="w-3.5 h-3.5" /> Add / Edit Files
                    </button>
                    <button 
                        onClick={handleReset} 
                        className="w-full text-xs text-slate-500 hover:text-red-400 flex items-center justify-center gap-2 transition-colors py-2"
                    >
                        <Trash2 className="w-3.5 h-3.5" /> Clear All & Restart
                    </button>
                </div>
             </div>

             {/* Main Editor Area */}
             <div className="flex-1 min-w-0">
                {selectedTrack ? (
                    selectedTrack.status === 'COMPLETED' && selectedTrack.lrcContent ? (
                        <LrcResult 
                            key={selectedTrack.id} // FORCE REMOUNT WHEN TRACK CHANGES
                            lrcData={{
                                originalFileName: selectedTrack.file.name,
                                content: selectedTrack.lrcContent,
                                metadata: selectedTrack.metadata
                            }} 
                            audioSrc={selectedTrack.previewUrl} 
                            onUpdate={(newContent, newMetadata) => 
                                handleTrackContentChange(selectedTrack.id, newContent, newMetadata)
                            }
                        />
                    ) : selectedTrack.status === 'ERROR' ? (
                        <div className="h-full min-h-[400px] bg-slate-800/50 border border-slate-700 rounded-2xl flex flex-col items-center justify-center text-center p-8">
                            <AlertTriangle className="w-12 h-12 text-red-400 mb-4" />
                            <h3 className="text-xl font-bold text-white mb-2">Generation Failed</h3>
                            <p className="text-slate-400 mb-6 max-w-sm">{selectedTrack.error}</p>
                            <button 
                                onClick={() => handleRetry(selectedTrack.id)}
                                className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
                            >
                                <RefreshCw className="w-4 h-4" /> Retry Track
                            </button>
                        </div>
                    ) : (selectedTrack.status === 'GENERATING' || selectedTrack.status === 'ISOLATING') ? (
                         <div className="h-full min-h-[400px] bg-slate-800/50 border border-slate-700 rounded-2xl flex flex-col items-center justify-center text-center p-8 animate-pulse">
                            <RefreshCw className="w-10 h-10 text-indigo-400 animate-spin mb-4" />
                            <h3 className="text-lg font-bold text-white mb-2">
                                {selectedTrack.status === 'ISOLATING' ? 'Isolating Vocals...' : 'Generating Lyrics...'}
                            </h3>
                            <p className="text-slate-500 text-sm">Please wait while Gemini processes your audio.</p>
                        </div>
                    ) : (
                         <div className="h-full min-h-[400px] bg-slate-800/50 border border-slate-700 rounded-2xl flex items-center justify-center text-slate-500">
                            Track is {selectedTrack.status.toLowerCase()}...
                         </div>
                    )
                ) : (
                    <div className="h-full min-h-[400px] bg-slate-800/50 border border-slate-700 rounded-2xl flex items-center justify-center text-slate-500">
                        No track selected
                    </div>
                )}
             </div>

          </div>
        )}

        {/* Status: GLOBAL ERROR */}
        {status === AppStatus.ERROR && (
          <div className="max-w-md w-full bg-red-950/30 border border-red-500/30 rounded-2xl p-8 text-center animate-in zoom-in duration-300">
            <div className="bg-red-500/20 p-4 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
               <AlertTriangle className="w-8 h-8 text-red-400" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Oops!</h3>
            <p className="text-red-200 mb-6 text-sm">{errorMsg}</p>
            <button 
                onClick={handleReset}
                className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
            >
                Try Again
            </button>
          </div>
        )}

      </main>
      
      {/* Footer */}
      <footer className="w-full py-6 text-center border-t border-slate-800 bg-slate-900/50 backdrop-blur-sm">
        <p className="text-slate-500 text-sm">
          Open Source Project. View source on{' '}
          <a 
            href="https://github.com/xiliourt/LRCGen/" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="text-purple-400 hover:text-purple-300 hover:underline transition-colors font-medium"
          >
            GitHub
          </a>
        </p>
      </footer>
    </div>
  );
};

export default App;
