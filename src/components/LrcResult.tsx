import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Download, Play, Pause, ListMusic, Plus, Minus, Type, Upload, Edit2, User, Disc } from 'lucide-react';
import { LrcData, TrackMetadata } from '../types';
import { downloadLrcFile } from '../utils/fileUtils';

interface LrcResultProps {
  lrcData: LrcData;
  audioSrc: string;
  onUpdate?: (content: string, metadata?: TrackMetadata) => void;
}

interface LrcLine {
  id: string;
  seconds: number;
  text: string;
}

const parseLrc = (lrc: string): LrcLine[] => {
  const lines = lrc.split('\n');
  const result: LrcLine[] = [];
  lines.forEach((line, index) => {
    // Basic timestamp match
    const match = line.match(/^\[(\d{2}):(\d{2}\.\d{2,3})\](.*)/);
    if (match) {
      const min = parseInt(match[1]);
      const sec = parseFloat(match[2]);
      const text = match[3].trim();
      result.push({
        id: `line-${index}`,
        seconds: min * 60 + sec,
        text
      });
    }
  });
  return result.sort((a, b) => a.seconds - b.seconds);
};

const stringifyLrc = (lines: LrcLine[], metadata?: { title?: string, artist?: string }): string => {
  let output = '';
  
  if (metadata) {
      if (metadata.title) output += `[ti:${metadata.title}]\n`;
      if (metadata.artist) output += `[ar:${metadata.artist}]\n`;
  }
  
  output += lines.map(line => {
    const min = Math.floor(line.seconds / 60);
    const sec = (line.seconds % 60);
    const secStr = sec.toFixed(2).padStart(5, '0');
    const minStr = min.toString().padStart(2, '0');
    return `[${minStr}:${secStr}] ${line.text}`;
  }).join('\n');
  
  return output;
};

// Extract metadata from raw LRC content (Case insensitive)
const extractMetadata = (content: string) => {
    const titleMatch = content.match(/\[ti:(.*?)\]/i);
    const artistMatch = content.match(/\[ar:(.*?)\]/i);
    return {
        title: titleMatch ? titleMatch[1].trim() : '',
        artist: artistMatch ? artistMatch[1].trim() : ''
    };
};

export const LrcResult: React.FC<LrcResultProps> = ({ lrcData, audioSrc, onUpdate }) => {
  const [content, setContent] = useState(lrcData.content);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [viewMode, setViewMode] = useState<'visual' | 'raw'>('visual');
  
  // Metadata state logic
  // Priority 1: Extracted LRC metadata
  // Priority 2: Metadata passed from file (ID3/Filename)
  const initialExtracted = extractMetadata(lrcData.content);
  const [title, setTitle] = useState(initialExtracted.title || lrcData.metadata?.title || '');
  const [artist, setArtist] = useState(initialExtracted.artist || lrcData.metadata?.artist || '');

  const audioRef = useRef<HTMLAudioElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);

  // Sync back to parent whenever content/metadata changes
  useEffect(() => {
    if (onUpdate) {
        onUpdate(content, { title, artist });
    }
  }, [content, title, artist, onUpdate]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const onEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', onEnded);
    };
  }, [audioSrc]);

  // Derived state for visual editor
  const parsedLines = useMemo(() => parseLrc(content), [content]);
  
  const activeIndex = useMemo(() => {
    let active = -1;
    for (let i = 0; i < parsedLines.length; i++) {
        if (currentTime >= parsedLines[i].seconds) {
            active = i;
        } else {
            break; 
        }
    }
    return active;
  }, [currentTime, parsedLines]);

  // Auto-scroll
  useEffect(() => {
    if (viewMode === 'visual' && activeLineRef.current) {
        activeLineRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeIndex, viewMode]);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const playAtTime = (seconds: number) => {
    if (audioRef.current) {
        audioRef.current.currentTime = seconds;
        audioRef.current.play();
        setIsPlaying(true);
    }
  };

  const adjustTimestamp = (index: number, delta: number) => {
    const newLines = [...parsedLines];
    newLines[index].seconds = Math.max(0, newLines[index].seconds + delta);
    setContent(stringifyLrc(newLines, { title, artist }));
  };

  const updateLineText = (index: number, newText: string) => {
    const newLines = [...parsedLines];
    newLines[index].text = newText;
    setContent(stringifyLrc(newLines, { title, artist }));
  };

  const handleDownload = () => {
    downloadLrcFile(lrcData.originalFileName, content);
  };

  const handleLrcImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result;
            if (typeof text === 'string') {
                setContent(text);
                const extracted = extractMetadata(text);
                if (extracted.title) setTitle(extracted.title);
                if (extracted.artist) setArtist(extracted.artist);
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    }
  };

  const formatTimeDisplay = (time: number) => {
    if (isNaN(time)) return "00:00.00";
    const min = Math.floor(time / 60);
    const sec = Math.floor(time % 60);
    const ms = Math.floor((time % 1) * 100);
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const autoResizeTextarea = (e: React.FormEvent<HTMLTextAreaElement>) => {
    e.currentTarget.style.height = 'auto';
    e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;
  };

  return (
    <div className="w-full animate-in fade-in duration-300">
      {/* Audio Player Bar */}
      <div className="bg-slate-800/80 backdrop-blur border border-slate-700 rounded-2xl p-4 flex items-center gap-4 sticky top-[80px] z-40 shadow-xl mb-6">
        <button 
          onClick={togglePlay}
          className="bg-indigo-600 hover:bg-indigo-500 text-white p-3 rounded-full transition-colors flex-shrink-0 shadow-lg shadow-indigo-900/30"
        >
          {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-1" />}
        </button>
        
        <div className="flex-1">
           <div className="flex justify-between text-xs text-slate-400 mb-1 font-mono">
             <span>{formatTimeDisplay(currentTime)}</span>
             <span>{formatTimeDisplay(duration)}</span>
           </div>
           <input 
             type="range" 
             min={0} 
             max={duration || 100} 
             value={currentTime}
             onChange={(e) => {
                const val = Number(e.target.value);
                if (audioRef.current) audioRef.current.currentTime = val;
                setCurrentTime(val);
             }}
             className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
           />
        </div>
        
        <audio ref={audioRef} src={audioSrc} className="hidden" />
      </div>

      <div className="flex flex-col xl:flex-row gap-6 items-start">
        {/* Editor Block */}
        <div className="flex-1 w-full bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden flex flex-col">
            
            {/* Header: Metadata & Toolbar */}
            <div className="bg-slate-800 p-4 border-b border-slate-800 space-y-4">
                {/* Metadata Inputs */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Disc className="h-4 w-4 text-slate-500" />
                        </div>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Song Title"
                            className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg pl-10 pr-3 py-2 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 focus:outline-none placeholder:text-slate-600"
                        />
                    </div>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <User className="h-4 w-4 text-slate-500" />
                        </div>
                        <input
                            type="text"
                            value={artist}
                            onChange={(e) => setArtist(e.target.value)}
                            placeholder="Artist Name"
                            className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg pl-10 pr-3 py-2 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 focus:outline-none placeholder:text-slate-600"
                        />
                    </div>
                </div>

                {/* Toolbar */}
                <div className="flex justify-between items-center pt-2">
                    <span className="text-xs font-medium text-slate-400 flex items-center gap-2">
                        LRC EDITOR
                        {viewMode === 'visual' && <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded border border-indigo-500/20">VISUAL</span>}
                        {viewMode === 'raw' && <span className="text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded border border-slate-600">RAW TEXT</span>}
                    </span>
                    
                    <div className="flex bg-slate-900 rounded-lg p-0.5 border border-slate-700">
                        <button 
                            onClick={() => setViewMode('visual')}
                            className={`p-1.5 rounded-md transition-all ${viewMode === 'visual' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                            title="Visual Editor (Retiming)"
                        >
                            <ListMusic className="w-3.5 h-3.5" />
                        </button>
                        <button 
                            onClick={() => setViewMode('raw')}
                            className={`p-1.5 rounded-md transition-all ${viewMode === 'raw' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                            title="Raw Text Editor"
                        >
                            <Type className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Scrollable Editor Content - No fixed Max Height */}
            <div className="relative bg-slate-900/50 min-h-[500px]">
                  {viewMode === 'raw' ? (
                    <textarea 
                        ref={textareaRef}
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        className="w-full h-full min-h-[500px] bg-slate-900 p-4 text-slate-300 font-mono text-sm leading-relaxed resize-y focus:outline-none focus:ring-0"
                        spellCheck={false}
                    />
                  ) : (
                    <div className="p-2 space-y-1 pb-12">
                        {parsedLines.length === 0 && (
                            <div className="h-64 flex flex-col items-center justify-center text-slate-500 text-sm">
                                <p>No valid LRC data found.</p>
                                <button onClick={() => setViewMode('raw')} className="text-indigo-400 mt-2 hover:underline">Switch to raw editor</button>
                            </div>
                        )}
                        {parsedLines.map((line, idx) => {
                            const isActive = idx === activeIndex;
                            return (
                                <div 
                                    key={idx}
                                    ref={isActive ? activeLineRef : null}
                                    className={`group flex items-start gap-2 p-2 rounded-lg border transition-all duration-200
                                        ${isActive 
                                            ? 'bg-indigo-900/20 border-indigo-500/30 shadow-sm' 
                                            : 'bg-transparent border-transparent hover:bg-slate-800/50 hover:border-slate-700/50'}
                                    `}
                                >
                                    {/* Play Line Button */}
                                    <button 
                                        onClick={() => playAtTime(line.seconds)}
                                        className={`mt-2 p-1.5 rounded-full transition-colors flex-shrink-0
                                            ${isActive 
                                                ? 'bg-indigo-600 text-white' 
                                                : 'bg-slate-800 text-slate-400 group-hover:bg-indigo-600 group-hover:text-white'}
                                        `}
                                        title="Play from this line"
                                    >
                                        <Play className="w-3 h-3 fill-current" />
                                    </button>

                                    {/* Timestamp Controls */}
                                    <div className="mt-1.5 flex items-center gap-1 mx-1 bg-slate-900/50 rounded-lg p-1 border border-slate-800 flex-shrink-0">
                                        <button 
                                            onClick={() => adjustTimestamp(idx, -0.1)}
                                            className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-indigo-400 transition-colors"
                                            title="Earlier (-0.10s)"
                                        >
                                            <Minus className="w-3 h-3" />
                                        </button>
                                        
                                        <span className={`font-mono text-xs w-[4.5rem] text-center select-none ${isActive ? 'text-indigo-300 font-bold' : 'text-slate-400'}`}>
                                            {formatTimeDisplay(line.seconds)}
                                        </span>

                                        <button 
                                            onClick={() => adjustTimestamp(idx, 0.1)}
                                            className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-indigo-400 transition-colors"
                                            title="Later (+0.10s)"
                                        >
                                            <Plus className="w-3 h-3" />
                                        </button>
                                    </div>

                                    {/* Text Input */}
                                    <textarea 
                                        value={line.text}
                                        onChange={(e) => updateLineText(idx, e.target.value)}
                                        onInput={autoResizeTextarea}
                                        rows={1}
                                        className={`flex-1 bg-slate-900/30 border rounded-md px-3 py-1.5 text-sm focus:outline-none resize-none overflow-hidden min-h-[2.5rem] leading-relaxed transition-all
                                            ${isActive 
                                                ? 'text-white font-medium border-indigo-500/50 bg-indigo-900/20 focus:border-indigo-400 focus:bg-indigo-900/30' 
                                                : 'text-slate-300 border-slate-700/50 hover:border-slate-600 focus:border-indigo-500/50 focus:bg-slate-900/60'}
                                        `}
                                    />
                                </div>
                            );
                        })}
                    </div>
                  )}
            </div>
        </div>

        {/* Sidebar Actions */}
        <div className="w-full xl:w-56 flex flex-col gap-3 sticky top-32">
             <button 
                onClick={handleDownload}
                className="w-full bg-white hover:bg-slate-100 text-slate-900 py-3 px-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-white/5"
            >
                <Download className="w-4 h-4" />
                Download .LRC
            </button>
            <button 
                onClick={() => {
                    const blob = new Blob([content], {type: 'text/plain'});
                    const url = URL.createObjectURL(blob);
                    window.open(url, '_blank');
                }}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 py-3 px-4 rounded-xl font-medium transition-all flex items-center justify-center gap-2 border border-slate-700"
            >
                <Edit2 className="w-4 h-4" />
                Open Raw Text
            </button>
            
            <div className="relative w-full">
                <input
                    type="file"
                    id="lrc-import-result"
                    accept=".lrc,.txt"
                    className="hidden"
                    onChange={handleLrcImport}
                />
                <button 
                    onClick={() => document.getElementById('lrc-import-result')?.click()}
                    className="w-full text-xs text-indigo-400 hover:text-indigo-300 py-3 px-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2 hover:bg-slate-800 border border-transparent hover:border-slate-700/50"
                >
                    <Upload className="w-3 h-3" />
                    Import Replacement .LRC
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};
