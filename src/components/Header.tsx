import React, { useEffect, useState } from 'react';
import { Music, Sparkles, Zap, Key, Settings, Check, X } from 'lucide-react';

export const Header: React.FC = () => {
  const [hasKey, setHasKey] = useState(false);
  const [isAiStudio, setIsAiStudio] = useState(true);
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [manualKey, setManualKey] = useState('');

  useEffect(() => {
    const checkEnv = async () => {
      const aistudio = (window as any).aistudio;
      // Check if we are in the AI Studio environment
      if (aistudio && typeof aistudio.hasSelectedApiKey === 'function') {
        try {
          const has = await aistudio.hasSelectedApiKey();
          setHasKey(has);
          setIsAiStudio(true);
        } catch (e) {
          console.warn("AI Studio key check failed, falling back to manual mode", e);
          setIsAiStudio(false);
        }
      } else {
        setIsAiStudio(false);
        // Check local storage for manual key
        const stored = localStorage.getItem('gemini_api_key');
        if (stored) {
            setHasKey(true);
            setManualKey(stored);
        }
      }
    };
    checkEnv();
  }, []);

  const handleAction = async () => {
    if (isAiStudio) {
      const aistudio = (window as any).aistudio;
      if (aistudio) {
        try {
          await aistudio.openSelectKey();
          const has = await aistudio.hasSelectedApiKey();
          setHasKey(has);
        } catch (e) {
          console.error("AI Studio key selection failed", e);
        }
      }
    } else {
      setShowKeyInput(!showKeyInput);
    }
  };

  const saveManualKey = () => {
    if (manualKey.trim()) {
        localStorage.setItem('gemini_api_key', manualKey.trim());
        setHasKey(true);
        setShowKeyInput(false);
    } else {
        localStorage.removeItem('gemini_api_key');
        setHasKey(false);
    }
  };

  return (
    <header className="w-full py-6 px-4 md:px-8 flex items-center justify-between border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="flex items-center gap-3">
        <div className="bg-indigo-600 p-2 rounded-lg shadow-lg shadow-indigo-500/20">
          <Music className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">
            LRC <span className="text-indigo-400">GenAI</span>
          </h1>
          <p className="text-xs text-slate-400 font-medium">Powered by Gemini 2.5 Flash</p>
        </div>
      </div>
      
      <div className="flex items-center gap-4 relative">
        {showKeyInput && !isAiStudio && (
            <div className="absolute top-12 right-0 bg-slate-800 border border-slate-700 p-3 rounded-xl shadow-2xl w-72 z-50 animate-in fade-in slide-in-from-top-2">
                <label className="block text-xs text-slate-400 mb-1">Enter your Gemini API Key</label>
                <div className="flex gap-2">
                    <input 
                        type="password" 
                        value={manualKey}
                        onChange={(e) => setManualKey(e.target.value)}
                        placeholder="AIza..."
                        className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    />
                    <button 
                        onClick={saveManualKey}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white p-1.5 rounded-lg transition-colors"
                    >
                        <Check className="w-4 h-4" />
                    </button>
                    <button 
                        onClick={() => setShowKeyInput(false)}
                        className="bg-slate-700 hover:bg-slate-600 text-slate-300 p-1.5 rounded-lg transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <p className="text-[10px] text-slate-500 mt-2">
                    Key is stored locally in your browser.
                    <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline ml-1">Get key</a>
                </p>
            </div>
        )}

        <button 
            onClick={handleAction}
            className={`flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-lg transition-all shadow-lg 
            ${!hasKey 
                ? 'bg-white text-slate-900 hover:bg-slate-100 shadow-indigo-900/10' 
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'}`}
        >
            {!hasKey ? (
                <>
                    <Zap className="w-3.5 h-3.5 text-indigo-600 fill-indigo-600" />
                    <span>{isAiStudio ? 'Login with Google' : 'Set API Key'}</span>
                </>
            ) : (
                <>
                    <Key className="w-3.5 h-3.5" />
                    <span>{isAiStudio ? 'API Key' : 'Change Key'}</span>
                </>
            )}
        </button>
      </div>
    </header>
  );
};
