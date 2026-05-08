import React, { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { Ico } from "./Ico";
import { api } from "../lib/api";
import { text1, text2, text3, accent, danger, success, glass } from "../theme";
import { motion, AnimatePresence } from "motion/react";

interface Props {
  onResult: (result: any) => void;
  onCancel: () => void;
}

export function AIScribe({ onResult, onCancel }: Props) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<any>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
        await processAudio(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      toast.error("Could not access microphone. Please check permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
      // Stop all tracks to release microphone
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const processAudio = async (blob: Blob) => {
    setIsProcessing(true);
    try {
      const result = await api.ai.processConsultation(blob);
      onResult(result);
    } catch (err) {
      console.error("Error processing AI consultation:", err);
      toast.error("Error processing consultation with AI.");
      setIsProcessing(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div style={{ 
      padding: 32, 
      background: "rgba(255,255,255,0.02)", 
      border: `1px dashed ${glass.border}`, 
      borderRadius: 20,
      textAlign: "center"
    }}>
      <AnimatePresence mode="wait">
        {!isRecording && !isProcessing ? (
          <motion.div 
            key="start"
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
          >
            <div style={{ 
              width: 64, 
              height: 64, 
              borderRadius: "50%", 
              background: "rgba(255,255,255,0.05)", 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center", 
              margin: "0 auto 24px",
              border: `1px solid ${glass.border}`
            }}>
              <Ico name="Mic" size={32} color={accent} />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: text1, marginBottom: 8 }}>Smart Scribe (AI Scribe)</h3>
            <p style={{ fontSize: 14, color: text2, marginBottom: 24, maxWidth: 400, margin: "0 auto 24px" }}>
              Record the conversation with the patient. The AI will automatically transcribe and extract the reason, evolution, vital signs, and diagnosis.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button 
                onClick={onCancel}
                style={{ padding: "10px 20px", borderRadius: 10, background: "none", border: `1px solid ${glass.border}`, color: text3, fontWeight: 600, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button 
                onClick={startRecording}
                style={{ 
                  padding: "12px 28px", 
                  borderRadius: 12, 
                  background: "#fff", 
                  color: "#000", 
                  fontWeight: 800, 
                  border: "none", 
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  boxShadow: "0 4px 15px rgba(0,0,0,0.3)",
                  transition: "all 0.2s"
                }}
                onMouseEnter={e => e.currentTarget.style.transform = "scale(1.05)"}
                onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
              >
                <Ico name="Play" size={18} color="#000" /> Start Recording
              </button>
            </div>
          </motion.div>
        ) : isRecording ? (
          <motion.div 
            key="recording"
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
          >
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", justifyContent: "center", gap: 4, marginBottom: 16 }}>
                {[1,2,3,4,5].map(i => (
                  <motion.div 
                    key={i}
                    animate={{ height: [10, 30, 10] }}
                    transition={{ repeat: Infinity, duration: 0.5, delay: i * 0.1 }}
                    style={{ width: 4, background: danger, borderRadius: 2 }}
                  />
                ))}
              </div>
              <p style={{ fontSize: 32, fontWeight: 700, color: text1, fontFamily: "monospace" }}>{formatTime(recordingTime)}</p>
              <p style={{ fontSize: 14, color: danger, fontWeight: 600 }}>Recording Consultation...</p>
            </div>
            <button 
              onClick={stopRecording}
              style={{ 
                padding: "12px 32px", 
                borderRadius: 12, 
                background: danger, 
                color: "#fff", 
                fontWeight: 700, 
                border: "none", 
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                margin: "0 auto"
              }}
            >
              <Ico name="Square" size={16} /> Stop and Analyze
            </button>
          </motion.div>
        ) : (
          <motion.div 
            key="processing"
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
          >
            <div style={{ marginBottom: 24 }}>
              <div style={{ 
                width: 64, 
                height: 64, 
                borderRadius: 20, 
                background: "rgba(255,255,255,0.05)", 
                display: "flex", 
                alignItems: "center", 
                justifyContent: "center", 
                margin: "0 auto 24px",
                border: `1px solid ${glass.border}`,
                animation: "pulse 2s infinite"
              }}>
                <Ico name="Sparkles" size={32} color={accent} />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: text1, marginBottom: 8 }}>AI Analyzing Consultation</h3>
              <p style={{ fontSize: 14, color: text2 }}>Transcribing audio and extracting clinical data...</p>
            </div>
            <div style={{ width: "100%", maxWidth: 300, height: 4, background: "rgba(255,255,255,0.05)", borderRadius: 2, margin: "0 auto", overflow: "hidden" }}>
              <motion.div 
                animate={{ x: [-300, 300] }}
                transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                style={{ width: "50%", height: "100%", background: accent }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      <style>{`
        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.1); opacity: 0.7; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
