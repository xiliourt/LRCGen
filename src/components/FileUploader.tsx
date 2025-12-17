
import React, { useCallback, useState } from 'react';
import { UploadCloud, Music, AlertCircle, Files } from 'lucide-react';

interface FileUploaderProps {
  onFilesSelected: (files: File[]) => void;
  isProcessing: boolean;
}

export const FileUploader: React.FC<FileUploaderProps> = ({ onFilesSelected, isProcessing }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!isProcessing) setIsDragging(true);
  }, [isProcessing]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const validateAndProcessFiles = (fileList: FileList | File[]) => {
    setError(null);
    const validFiles: File[] = [];
    const files = Array.from(fileList);
    
    for (const file of files) {
        // Check type
        if (!file.type.startsWith('audio/')) {
          setError('Some files were skipped. Please upload valid audio files only.');
          continue;
        }
        // Check size (Limit to 15MB for browser-based base64 handling safety)
        if (file.size > 15 * 1024 * 1024) {
          setError(`File "${file.name}" is too large (Max 15MB).`);
          continue;
        }
        validFiles.push(file);
    }

    if (validFiles.length > 0) {
      onFilesSelected(validFiles);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isProcessing) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndProcessFiles(e.dataTransfer.files);
    }
  }, [isProcessing, onFilesSelected]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndProcessFiles(e.target.files);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div
        className={`relative group cursor-pointer rounded-2xl border-2 border-dashed transition-all duration-300 ease-out
          ${isDragging 
            ? 'border-indigo-500 bg-indigo-500/10 scale-[1.02]' 
            : 'border-slate-700 bg-slate-800/50 hover:border-slate-500 hover:bg-slate-800'}
          ${isProcessing ? 'opacity-50 pointer-events-none' : ''}
        `}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => document.getElementById('audio-upload')?.click()}
      >
        <input
          type="file"
          id="audio-upload"
          className="hidden"
          accept="audio/*"
          multiple
          onChange={handleFileInput}
          disabled={isProcessing}
        />

        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
          <div className={`p-4 rounded-full bg-slate-800 mb-4 transition-transform duration-300 group-hover:scale-110 shadow-lg
            ${isDragging ? 'bg-indigo-500/20 text-indigo-400' : 'text-slate-400'}
          `}>
            {isDragging ? <UploadCloud className="w-10 h-10" /> : <Files className="w-10 h-10" />}
          </div>
          
          <h3 className="text-xl font-semibold text-white mb-2">
            {isDragging ? 'Drop audio files here' : 'Upload Audio Files'}
          </h3>
          
          <p className="text-slate-400 text-sm max-w-xs mx-auto leading-relaxed mb-6">
            Drag and drop your songs (MP3, WAV, AAC) or click to browse. 
            <br /><span className="text-slate-500 text-xs">(Max 15MB per file)</span>
          </p>

          <button className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-lg font-medium text-sm transition-colors shadow-lg shadow-indigo-900/20">
            Select Files
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-3 text-red-400 animate-in fade-in slide-in-from-top-2">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}
    </div>
  );
};
