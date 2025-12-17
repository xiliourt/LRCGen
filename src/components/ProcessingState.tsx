
import React from 'react';
import { Loader2, Waves, Wand2 } from 'lucide-react';

interface ProcessingStateProps {
  statusText?: string;
  subText?: string;
  isIsolating?: boolean;
}

export const ProcessingState: React.FC<ProcessingStateProps> = ({ 
    statusText = "AI is listening...", 
    subText = "Gemini is analyzing the audio frequencies and transcribing lyrics with millisecond precision.",
    isIsolating = false
}) => {
  return (
    <div className="w-full flex flex-col items-center justify-center py-20 animate-in fade-in zoom-in duration-500">
      <div className="relative mb-8">
        <div className={`absolute inset-0 blur-xl opacity-20 rounded-full animate-pulse ${isIsolating ? 'bg-purple-500' : 'bg-indigo-500'}`}></div>
        <div className="relative bg-slate-800 p-6 rounded-full border border-slate-700 shadow-xl">
            {isIsolating ? (
                 <Wand2 className="w-12 h-12 text-purple-400 animate-pulse" />
            ) : (
                 <Loader2 className="w-12 h-12 text-indigo-400 animate-spin" />
            )}
        </div>
      </div>
      
      <h3 className="text-2xl font-bold text-white mb-3 text-center">
        {statusText}
      </h3>
      
      <p className="text-slate-400 text-center max-w-md mx-auto mb-8">
        {subText}
      </p>

      <div className={`flex items-center gap-2 text-xs font-mono px-4 py-2 rounded-full border
        ${isIsolating 
            ? 'text-purple-300 bg-purple-950/30 border-purple-500/20' 
            : 'text-indigo-300 bg-indigo-950/30 border-indigo-500/20'
        }
      `}>
        <Waves className="w-4 h-4 animate-pulse" />
        <span>{isIsolating ? 'EXTRACTING VOCAL STEMS' : 'PROCESSING AUDIO STREAM'}</span>
      </div>
    </div>
  );
};
