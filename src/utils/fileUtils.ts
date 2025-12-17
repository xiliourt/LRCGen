import JSZip from 'jszip';

/* Convert file to Base64 for upload */
export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const base64String = reader.result.split(',')[1];
        resolve(base64String);
      } else {
        reject(new Error('Failed to convert file to base64'));
      }
    };
    reader.onerror = (error) => reject(error);
  });
};

/* File header */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/* Get track metadata with strict priority: ID3 -> Filename Extracted -> Filename Title */
export const getTrackMetadata = async (file: File): Promise<{ title?: string; artist?: string }> => {
  let id3Title: string | undefined;
  let id3Artist: string | undefined;

  try {
    // Read first 128KB (ID3 header is usually at start, increased buffer to catch more tags)
    const chunk = file.slice(0, 128 * 1024); 
    const buffer = await chunk.arrayBuffer();
    const view = new DataView(buffer);

    // ID3 identifier check (first 3 bytes: "ID3")
    if (view.getUint8(0) === 0x49 && view.getUint8(1) === 0x44 && view.getUint8(2) === 0x33) {
        const version = view.getUint8(3);
        // ID3 size is synchsafe integer (7 bits per byte)
        let size = ((view.getUint8(6) & 0x7F) << 21) |
                   ((view.getUint8(7) & 0x7F) << 14) |
                   ((view.getUint8(8) & 0x7F) << 7) |
                   (view.getUint8(9) & 0x7F);
        
        // Limit scanning to buffer size or ID3 size
        const limit = Math.min(size + 10, buffer.byteLength);
        let offset = 10; // Header is 10 bytes
        
        while (offset < limit) {
            // Read Frame Header
            if (offset + 10 > limit) break;

            const id1 = view.getUint8(offset);
            const id2 = view.getUint8(offset + 1);
            const id3 = view.getUint8(offset + 2);
            const id4 = view.getUint8(offset + 3);

            // Padding (zeroes) usually signals end of tags
            if (id1 === 0) break;

            const frameId = String.fromCharCode(id1, id2, id3, id4);
            
            // Read Size (4 bytes)
            let frameSize = view.getUint32(offset + 4, false);
            if (version === 4 && (frameSize > size)) {
                 // For ID3v2.4 size is synchsafe
                 frameSize = ((view.getUint8(offset + 4) & 0x7F) << 21) |
                             ((view.getUint8(offset + 5) & 0x7F) << 14) |
                             ((view.getUint8(offset + 6) & 0x7F) << 7) |
                             (view.getUint8(offset + 7) & 0x7F);
            }

            // Skip Flags (2 bytes)
            offset += 10;

            if (offset + frameSize > limit) break;

            if (frameId === 'TIT2' || frameId === 'TPE1') {
                const encoding = view.getUint8(offset);
                const textBytes = new Uint8Array(buffer, offset + 1, frameSize - 1);
                
                let text = '';
                try {
                    // 0 = ISO-8859-1, 1 = UTF-16 BOM, 2 = UTF-16BE, 3 = UTF-8
                    const decoder = new TextDecoder(
                        encoding === 1 || encoding === 2 ? 'utf-16' : 'utf-8'
                    );
                    text = decoder.decode(textBytes).replace(/\0/g, '').trim();
                } catch (e) {
                    text = String.fromCharCode(...textBytes).replace(/\0/g, '').trim();
                }

                if (frameId === 'TIT2' && text.length > 0) id3Title = text;
                if (frameId === 'TPE1' && text.length > 0) id3Artist = text;
            }

            offset += frameSize;
        }
    }
  } catch (e) {
    console.warn("Native ID3 parsing failed, falling back to filename", e);
  }
  
  // Try extracting from filename
  const filenameMetadata = parseMetadataFromFilename(file.name);
  
  // Priority Merging: ID3 (if valid & not empty) > Filename Extracted > Filename Title
  
  const finalTitle = (id3Title && id3Title.trim().length > 0) 
      ? id3Title 
      : filenameMetadata.title;

  const finalArtist = (id3Artist && id3Artist.trim().length > 0) 
      ? id3Artist 
      : (filenameMetadata.artist || "Unknown");

  return { 
    title: finalTitle, 
    artist: finalArtist
  };
};

/* Guess artist/name by filename (fallback) */
const parseMetadataFromFilename = (filename: string): { title?: string; artist?: string } => {
  // Remove extension
  const name = filename.replace(/\.[^/.]+$/, "");
  
  // Common patterns: "Artist - Title", "Artist - Title (Remix)"
  const separator = " - ";
  if (name.includes(separator)) {
    const parts = name.split(separator);
    // Naive assumption: First part is Artist, second is Title, if more than 2 parts, join the rest as title
    if (parts.length >= 2) {
      return {
        artist: parts[0].trim(),
        title: parts.slice(1).join(separator).trim()
      };
    }
  }
  // Ultimate fallback: Use filename as title
  return { title: name };
};

/* Download a singlr LRC file from storage */
export const downloadLrcFile = (filename: string, content: string) => {
  const element = document.createElement('a');
  const file = new Blob([content], { type: 'text/plain' });
  element.href = URL.createObjectURL(file);
  // Ensure filename ends with .lrc
  const name = filename.replace(/\.[^/.]+$/, "") + ".lrc";
  element.download = name;
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
};

/* Download a zip of all LRC files */
export const downloadAsZip = async (files: { filename: string; content: string }[]) => {
  const zip = new JSZip();
  
  files.forEach(file => {
    const name = file.filename.replace(/\.[^/.]+$/, "") + ".lrc";
    zip.file(name, file.content);
  });

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  
  const element = document.createElement('a');
  element.href = url;
  element.download = "lrc_bundle.zip";
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
  
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
