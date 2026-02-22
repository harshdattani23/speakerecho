/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, Square, AlertCircle, Loader2 } from 'lucide-react';
import Button from './Button';
import { connectToLiveTranscription } from '../services/geminiService';
import { RealTimeTranscription } from '../types';

interface RealTimeRecorderProps {
  onTranscriptionUpdate: (text: string) => void;
  onFinished: () => void;
}

const RealTimeRecorder: React.FC<RealTimeRecorderProps> = ({ onTranscriptionUpdate, onFinished }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string>("");

  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  const stopRecording = useCallback(async () => {
    setIsRecording(false);
    
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    
    if (audioContextRef.current) {
      await audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (sessionRef.current) {
      // Close session if possible, though the SDK might handle it
      sessionRef.current = null;
    }
    
    onFinished();
  }, [onFinished]);

  const startRecording = useCallback(async () => {
    setError(null);
    setIsConnecting(true);
    setTranscript("");

    try {
      const session = await connectToLiveTranscription(
        (message: RealTimeTranscription) => {
          setTranscript(prev => prev + " " + message.text);
          onTranscriptionUpdate(message.text);
        },
        (err: any) => {
          console.error("Live API Error:", err);
          setError("Connection lost. Please try again.");
          stopRecording();
        }
      );

      sessionRef.current = session;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = floatTo16BitPCM(inputData);
        
        // Convert to base64
        const uint8 = new Uint8Array(pcm16.buffer);
        let binary = '';
        for (let i = 0; i < uint8.length; i++) {
            binary += String.fromCharCode(uint8[i]);
        }
        const base64 = btoa(binary);
        
        if (sessionRef.current) {
            sessionRef.current.sendRealtimeInput({
              media: {
                data: base64,
                mimeType: 'audio/pcm;rate=16000'
              }
            });
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      setIsRecording(true);
      setIsConnecting(false);
    } catch (err) {
      console.error("Error starting real-time transcription:", err);
      setError("Could not start real-time transcription. Check microphone permissions.");
      setIsConnecting(false);
    }
  }, [onTranscriptionUpdate, stopRecording]);

  const floatTo16BitPCM = (input: Float32Array) => {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return output;
  };

  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, [stopRecording]);

  return (
    <div className="flex flex-col items-center justify-center p-8 bg-white dark:bg-slate-800 border-2 border-dashed border-indigo-100 dark:border-slate-700 rounded-2xl transition-colors duration-300">
      <div className={`relative flex items-center justify-center w-24 h-24 mb-6 rounded-full transition-all duration-300 ${isRecording ? 'bg-red-50 dark:bg-red-900/20' : 'bg-indigo-50 dark:bg-indigo-900/30'}`}>
        {isRecording && (
          <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-20 animate-ping"></span>
        )}
        {isRecording ? (
            <div className="text-red-500 dark:text-red-400">
                <Mic size={40} className="animate-pulse" />
            </div>
        ) : isConnecting ? (
            <div className="text-indigo-500 dark:text-indigo-400">
                <Loader2 size={40} className="animate-spin" />
            </div>
        ) : (
            <div className="text-indigo-500 dark:text-indigo-400">
                <Mic size={40} />
            </div>
        )}
      </div>

      <div className="text-center mb-6 w-full">
        {isRecording ? (
          <div className="w-full">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">Listening...</h3>
            <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-xl text-left min-h-[100px] max-h-[200px] overflow-y-auto border border-slate-100 dark:border-slate-700">
                <p className="text-slate-700 dark:text-slate-300 italic">
                    {transcript || "Speak now..."}
                </p>
            </div>
          </div>
        ) : (
          <div>
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Real-time Transcription</h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Transcribe as you speak using Gemini Live</p>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-4 py-2 rounded-lg mb-4 text-sm">
          <AlertCircle size={16} className="mr-2" />
          {error}
        </div>
      )}

      {!isRecording ? (
        <Button 
          onClick={startRecording} 
          isLoading={isConnecting}
          className="w-full max-w-xs"
        >
          Start Live Transcribe
        </Button>
      ) : (
        <Button 
          onClick={stopRecording} 
          variant="danger"
          icon={<Square size={16} fill="currentColor" />}
          className="w-full max-w-xs"
        >
          Stop & Finish
        </Button>
      )}
    </div>
  );
};

export default RealTimeRecorder;
