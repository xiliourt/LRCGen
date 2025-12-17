
// Utility to encode AudioBuffer to WAV format
const bufferToWav = (abuffer: AudioBuffer, len: number) => {
  let numOfChan = abuffer.numberOfChannels;
  let length = len * numOfChan * 2 + 44;
  let buffer = new ArrayBuffer(length);
  let view = new DataView(buffer);
  let channels = [];
  let i;
  let sample;
  let offset = 0;
  let pos = 0;

  // write WAVE header
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"

  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(abuffer.sampleRate);
  setUint32(abuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2); // block-align
  setUint16(16); // 16-bit (hardcoded in this example)

  setUint32(0x61746164); // "data" - chunk
  setUint32(length - pos - 4); // chunk length

  // write interleaved data
  for (i = 0; i < abuffer.numberOfChannels; i++)
    channels.push(abuffer.getChannelData(i));

  while (pos < len) {
    for (i = 0; i < numOfChan; i++) {
      // interleave channels
      sample = Math.max(-1, Math.min(1, channels[i][pos])); // clamp
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0; // scale to 16-bit signed int
      view.setInt16(44 + offset, sample, true);
      offset += 2;
    }
    pos++;
  }

  return new Blob([buffer], { type: "audio/wav" });

  function setUint16(data: number) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data: number) {
    view.setUint32(pos, data, true);
    pos += 4;
  }
};

export const isolateVocals = async (file: File): Promise<string> => {
  return new Promise(async (resolve, reject) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      // Create OfflineAudioContext to render the processed audio faster than real-time
      const offlineCtx = new OfflineAudioContext(
        1, // Mix down to Mono (Center Channel) for cleaner processing
        audioBuffer.length,
        audioBuffer.sampleRate
      );

      const source = offlineCtx.createBufferSource();
      source.buffer = audioBuffer;

      // 1. High-pass Filter (Remove Kick Drum / Bass)
      const highPass = offlineCtx.createBiquadFilter();
      highPass.type = "highpass";
      highPass.frequency.value = 250; // Cut everything below 250Hz

      // 2. Vocal Presence Boost (Boost ~3-4kHz where intelligibility lives)
      const peaking = offlineCtx.createBiquadFilter();
      peaking.type = "peaking";
      peaking.frequency.value = 3500;
      peaking.Q.value = 1.0;
      peaking.gain.value = 6; // +6dB boost

      // 3. Low-pass Filter (Remove Hiss / High Hats)
      const lowPass = offlineCtx.createBiquadFilter();
      lowPass.type = "lowpass";
      lowPass.frequency.value = 8000; // Cut above 8kHz

      // Chain connections
      // Note: We are mixing stereo down to mono implicitly by connecting to a 1-channel destination
      // This effectively sums L+R, boosting center-panned vocals.
      source.connect(highPass);
      highPass.connect(peaking);
      peaking.connect(lowPass);
      lowPass.connect(offlineCtx.destination);

      source.start();

      const renderedBuffer = await offlineCtx.startRendering();
      
      // Convert back to Blob -> Base64
      const wavBlob = bufferToWav(renderedBuffer, renderedBuffer.length);
      
      const reader = new FileReader();
      reader.readAsDataURL(wavBlob);
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          // Remove data URL prefix
          const base64String = reader.result.split(',')[1];
          resolve(base64String);
        } else {
          reject(new Error("Failed to encode processed audio"));
        }
      };
      reader.onerror = (e) => reject(e);

    } catch (error) {
      console.error("Vocal Isolation Error:", error);
      reject(error);
    }
  });
};
