import React, { useState } from 'react';
import { FileText, Sparkles, ChevronLeft, Upload, Music, X, ChevronDown, ChevronUp, Plus, Wand2, Settings2, CheckCircle, Trash2 } from 'lucide-react';
import { Track } from '../types';
import { formatFileSize } from '../utils/fileUtils';

interface ConfigurationStepProps {
  tracks: Track[];
  onUpdateLyrics: (id: string, lyrics: string) => void;
  onUploadLrc: (id: string, content: string | undefined) => void;
  onBulkUploadLrc: (updates: { id: string; content: string }[]) => void;
  onRemoveTrack: (id: string) => void;
  onGenerateAll: () => void;
  onBack: () => void;
  onAddMoreFiles: (files: File[]) => void;
  onToggleIsolation: (id: string) => void;
  maxLineLength: number;
  setMaxLineLength: (val: number) => void;
  isHardLimit: boolean;
  setIsHardLimit: (val: boolean) => void;
}

export const ConfigurationStep: React.FC<ConfigurationStepProps> = ({ 
  tracks, 
  onUpdateLyrics, 
  onUploadLrc,
  onBulkUploadLrc,
  onRemoveTrack, 
  onGenerateAll, 
  onBack,
  onAddMoreFiles,
  onToggleIsolation,
  maxLineLength,
  setMaxLineLength,
  isHardLimit,
  setIsHardLimit
}) => {
  const [expandedTrackId, setExpandedTrackId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedTrackId(expandedTrackId === id ? null : id);
  };

  const handleTextFileUpload = (e: React.ChangeEvent<HTMLInputElement>, trackId: string) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        let text = e.target?.result;
        if (typeof text === 'string') {
          // If it's an LRC file, strip the timestamps to provide clean reference text
          if (file.name.toLowerCase().endsWith('.lrc')) {
            text = text.replace(/\[\d{2}:\d{2}\.\d{2,3}\]/g, '').trim();
          }
          onUpdateLyrics(trackId, text);
        }
      };
      reader.readAsText(file);
    }
    e.target.value = ''; // reset
  };

  const handleFinalLrcUpload = (e: React.ChangeEvent<HTMLInputElement>, trackId: string) => {
    const file = e.target.files?.[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result;
            if (typeof text === 'string') {
                onUploadLrc(trackId, text);
                // Collapse the track view on successful upload to indicate "Done"
                if (expandedTrackId === trackId) {
                    setExpandedTrackId(null);
                }
            }
        };
        reader.readAsText(file);
    }
    e.target.value = ''; // reset
  };

  const handleBulkLrcUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);
    const updates: { id: string; content: string }[] = [];
    let processedCount = 0;

    fileList.forEach(file => {
        const reader = new FileReader();
        reader.onload = (ev) => {
            const content = ev.target?.result as string;
            // 1. Filename Matching
            const lrcName = file.name.replace(/\.[^/.]+$/, "").toLowerCase().trim();
            
            // Extract metadata from LRC content for advanced matching (Case Insensitive)
            const titleMatch = content.match(/\[ti:(.*?)\]/i);
            const artistMatch = content.match(/\[ar:(.*?)\]/i);
            const lrcTitle = titleMatch ? titleMatch[1].trim().toLowerCase() : null;
            const lrcArtist = artistMatch ? artistMatch[1].trim().toLowerCase() : null;

            // Find track with matching name OR matching metadata
            const track = tracks.find(t => {
                const trackName = t.file.name.replace(/\.[^/.]+$/, "").toLowerCase().trim();
                
                // Exact filename match
                if (trackName === lrcName) return true;
                
                // Fuzzy/Metadata match logic:
                // If LRC has a title, check if track filename contains that title
                if (lrcTitle && lrcTitle.length > 3 && trackName.includes(lrcTitle)) return true;

                // If LRC has artist, check if track filename starts with artist
                if (lrcArtist && lrcArtist.length > 3 && trackName.startsWith(lrcArtist)) return true;

                return false;
            });

            if (track) {
                updates.push({ id: track.id, content });
            }

            processedCount++;
            if (processedCount === fileList.length) {
                if (updates.length > 0) {
                    onBulkUploadLrc(updates);
                    // Close any expanded tracks that were updated
                    const updatedIds = new Set(updates.map(u => u.id));
                    if (expandedTrackId && updatedIds.has(expandedTrackId)) {
                        setExpandedTrackId(null);
                    }
                    alert(`Matched ${updates.length} LRC files to your audio tracks.`);
                } else {
                    alert("No matching tracks found for uploaded LRC files. Tried matching by filename, title [ti], and artist [ar].");
                }
            }
        };
        reader.readAsText(file);
    });
    e.target.value = '';
  };

  const handleAddAudio = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
        const validFiles: File[] = [];
        const files = Array.from(e.target.files) as File[];
        
        for (const file of files) {
            if (file.type.startsWith('audio/') && file.size <= 15 * 1024 * 1024) {
                validFiles.push(file);
            } else {
                alert(`Skipped ${file.name}: Must be audio and under 15MB.`);
            }
        }

        if (validFiles.length > 0) {
            onAddMoreFiles(validFiles);
        }
        // Reset input
        e.target.value = '';
    }
  };

  const pendingTracksCount = tracks.filter(t => t.status !== 'COMPLETED').length;

  return (
    <div className="w-full max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-8 duration-500">
      <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 md:p-8 backdrop-blur-sm shadow-xl">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
            <div>
                <h2 className="text-2xl font-bold text-white">Setup Generation</h2>
                <p className="text-slate-400 text-sm mt-1">Review {tracks.length} file{tracks.length !== 1 ? 's' : ''} and add optional reference lyrics.</p>
            </div>
            <div className="text-xs font-mono text-indigo-400 bg-indigo-950/30 px-3 py-1 rounded-full border border-indigo-500/20">
                CONFIGURATION
            </div>
        </div>

        {/* Global Generation Settings */}
        <div className="mb-6 bg-slate-900/40 border border-slate-700/50 rounded-xl p-4">
             <div className="flex items-center gap-2 mb-3 text-slate-300 font-medium text-sm">
                <Settings2 className="w-4 h-4 text-indigo-400" />
                Global Generation Settings
             </div>
             <div className="flex flex-wrap items-center gap-6">
                <div className="flex items-center gap-3">
                    <label htmlFor="maxLineLength" className="text-xs text-slate-400">Target Line Length:</label>
                    <div className="flex items-center bg-slate-800 rounded-lg border border-slate-700">
                        <button 
                            onClick={() => setMaxLineLength(Math.max(10, maxLineLength - 5))}
                            className="px-2 py-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded-l-lg transition-colors"
                        >
                            -
                        </button>
                        <input
                            id="maxLineLength"
                            type="number"
                            value={maxLineLength}
                            onChange={(e) => setMaxLineLength(Math.max(10, parseInt(e.target.value) || 0))}
                            className="w-12 bg-transparent text-center text-sm text-white focus:outline-none py-1"
                        />
                         <button 
                            onClick={() => setMaxLineLength(maxLineLength + 5)}
                            className="px-2 py-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded-r-lg transition-colors"
                        >
                            +
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        id="hardLimit"
                        checked={isHardLimit}
                        onChange={(e) => setIsHardLimit(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-indigo-600 focus:ring-indigo-500"
                    />
                    <label htmlFor="hardLimit" className="text-xs text-slate-400 cursor-pointer select-none">
                        Strict limit (Force break lines)
                    </label>
                </div>
             </div>
             <p className="text-[10px] text-slate-500 mt-2">
                 {isHardLimit 
                    ? `AI will strictly force lines to be under ${maxLineLength} chars.`
                    : `AI will try to keep lines around ${maxLineLength} chars, but may go over to preserve phrasing.`
                 }
             </p>
        </div>

        <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Tracks ({tracks.length})</h3>
            
            <div className="flex items-center gap-3">
                <div className="relative">
                    <input 
                        type="file" 
                        id="bulk-lrc" 
                        multiple 
                        accept=".lrc" 
                        className="hidden" 
                        onChange={handleBulkLrcUpload} 
                    />
                    <button
                        onClick={() => document.getElementById('bulk-lrc')?.click()}
                        className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors px-2 py-1 hover:bg-slate-800 rounded-lg"
                        title="Match uploaded .lrc files to audio files by name"
                    >
                        <Upload className="w-3.5 h-3.5" /> Bulk Match LRCs
                    </button>
                </div>

                <div className="relative">
                    <input
                        type="file"
                        id="add-more-audio"
                        multiple
                        accept="audio/*"
                        className="hidden"
                        onChange={handleAddAudio}
                    />
                    <button 
                        onClick={() => document.getElementById('add-more-audio')?.click()}
                        className="text-xs text-indigo-400 flex items-center gap-1 hover:text-indigo-300 transition-colors px-2 py-1 hover:bg-slate-800 rounded-lg"
                    >
                        <Plus className="w-3.5 h-3.5" /> Add Audio
                    </button>
                </div>
            </div>
        </div>

        {/* Track List - Scrollable */}
        <div className="space-y-3 mb-8 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
            {tracks.map((track) => {
                const isSkippingAi = !!(track.lrcContent && track.lrcContent.trim().length > 0);
                const isCompleted = track.status === 'COMPLETED';
                return (
                    <div key={track.id} className="bg-slate-900/50 border border-slate-700/50 rounded-xl overflow-hidden transition-all">
                        {/* Track Row Header */}
                        <div className="p-4 flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 
                                ${isCompleted || isSkippingAi ? 'bg-green-500/20 text-green-400' : 'bg-indigo-600/20 text-indigo-400'}`}>
                                {isCompleted || isSkippingAi ? <CheckCircle className="w-5 h-5" /> : <Music className="w-5 h-5" />}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-white font-medium truncate">{track.file.name}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <p className="text-slate-400 text-xs">{formatFileSize(track.file.size)}</p>
                                    {!(isCompleted || isSkippingAi) && (
                                        <>
                                            <div className="h-1 w-1 rounded-full bg-slate-600"></div>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onToggleIsolation(track.id); }}
                                                className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border transition-colors
                                                    ${track.useIsolation 
                                                        ? 'bg-purple-500/20 border-purple-500/40 text-purple-300' 
                                                        : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300'}
                                                `}
                                                title="Isolates vocals by reducing background music frequencies"
                                            >
                                                <Wand2 className="w-3 h-3" />
                                                {track.useIsolation ? 'Vocal Isolation ON' : 'Vocal Isolation OFF'}
                                            </button>
                                        </>
                                    )}
                                    {(isCompleted || isSkippingAi) && (
                                         <span className="text-[10px] bg-green-500/10 text-green-300 px-2 py-0.5 rounded-full border border-green-500/20">
                                            {isCompleted && !isSkippingAi ? 'Processed' : 'LRC Provided'}
                                         </span>
                                    )}
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={() => toggleExpand(track.id)}
                                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5
                                        ${isCompleted || isSkippingAi
                                            ? 'bg-green-500/10 border-green-500/20 text-green-400 hover:bg-green-500/20' 
                                            : track.originalLyrics 
                                                ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-300'
                                                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'}
                                    `}
                                >
                                    {isCompleted || isSkippingAi ? <CheckCircle className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                                    {isCompleted ? 'Done' : isSkippingAi ? 'Ready' : (track.originalLyrics ? 'Ref Added' : 'Add Lyrics')}
                                    {expandedTrackId === track.id ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
                                </button>
                                <button 
                                    onClick={() => onRemoveTrack(track.id)}
                                    className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Expandable Lyrics Area */}
                        {expandedTrackId === track.id && (
                            <div className="px-4 pb-4 animate-in slide-in-from-top-2">
                                {isCompleted || isSkippingAi ? (
                                    <div className="bg-green-500/5 rounded-lg border border-green-500/20 p-4 flex flex-col items-center text-center">
                                        <CheckCircle className="w-8 h-8 text-green-400 mb-2" />
                                        <h4 className="text-green-300 font-medium text-sm">{isCompleted ? 'Generation Complete' : 'LRC File Loaded'}</h4>
                                        <p className="text-slate-400 text-xs mt-1 mb-4 max-w-sm">
                                            {isCompleted 
                                                ? 'This track has been successfully processed.' 
                                                : 'AI generation will be skipped. This track is ready for export or manual editing.'}
                                        </p>
                                        <button 
                                            onClick={() => onUploadLrc(track.id, undefined)}
                                            className="text-xs text-slate-400 hover:text-white flex items-center gap-1 hover:bg-slate-800 px-3 py-2 rounded-lg transition-colors"
                                        >
                                            <Trash2 className="w-3 h-3" /> {isCompleted ? 'Clear Result (Re-Generate)' : 'Remove LRC file (Enable AI)'}
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        <div className="bg-slate-950/50 rounded-lg border border-slate-800 p-3">
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="text-xs font-semibold text-slate-400">Reference Lyrics (Optional)</span>
                                                <div className="relative">
                                                    <input
                                                        type="file"
                                                        id={`lyrics-upload-${track.id}`}
                                                        accept=".txt,.lrc"
                                                        className="hidden"
                                                        onChange={(e) => handleTextFileUpload(e, track.id)}
                                                    />
                                                    <button 
                                                        onClick={() => document.getElementById(`lyrics-upload-${track.id}`)?.click()}
                                                        className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                                                    >
                                                        <Upload className="w-3 h-3" /> Import Ref (Strips Times)
                                                    </button>
                                                </div>
                                            </div>
                                            <textarea
                                                value={track.originalLyrics}
                                                onChange={(e) => onUpdateLyrics(track.id, e.target.value)}
                                                placeholder="Paste lyrics here to help the AI..."
                                                className="w-full h-32 bg-slate-900 border border-slate-700 rounded-md p-3 text-xs text-slate-300 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono resize-none"
                                            />
                                        </div>

                                        <div className="flex items-center gap-3">
                                            <div className="h-px bg-slate-800 flex-1"></div>
                                            <span className="text-[10px] text-slate-600 font-medium uppercase">OR</span>
                                            <div className="h-px bg-slate-800 flex-1"></div>
                                        </div>

                                        <div className="flex justify-center">
                                            <div className="relative">
                                                 <input
                                                    type="file"
                                                    id={`final-lrc-upload-${track.id}`}
                                                    accept=".lrc"
                                                    className="hidden"
                                                    onChange={(e) => handleFinalLrcUpload(e, track.id)}
                                                />
                                                <button 
                                                    onClick={() => document.getElementById(`final-lrc-upload-${track.id}`)?.click()}
                                                    className="text-xs bg-slate-800 text-slate-400 hover:text-white px-4 py-2 rounded-lg border border-slate-700 hover:border-slate-600 transition-all flex items-center gap-2"
                                                >
                                                    <Upload className="w-3 h-3" />
                                                    Upload Existing LRC (Skip AI Generation)
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>

        {/* Actions */}
        <div className="flex flex-col-reverse md:flex-row gap-3">
            <button 
                onClick={onBack}
                className="flex-1 px-6 py-3 rounded-xl font-medium text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
            >
                <Trash2 className="w-4 h-4" />
                Clear All
            </button>
            <button 
                onClick={onGenerateAll}
                className="flex-[2] bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-lg shadow-indigo-900/20 flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={tracks.length === 0}
            >
                <Sparkles className="w-5 h-5 group-hover:animate-pulse" />
                {pendingTracksCount === 0 
                    ? `View Results (${tracks.length})` 
                    : `Generate / Process ${pendingTracksCount} File${pendingTracksCount !== 1 ? 's' : ''}`
                }
            </button>
        </div>

      </div>
    </div>
  );
};
