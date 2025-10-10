'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';

export default function Screening() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingComplete, setRecordingComplete] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const mediaRecorderRef = useRef(null);
  const timerRef = useRef(null);
  const audioChunksRef = useRef([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 22050,
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });
      audioChunksRef.current = [];
      
      mediaRecorderRef.current = new MediaRecorder(stream);
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        console.log('Recording saved, blob size:', blob.size);
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (err) {
      console.error('Error accessing microphone:', err);
      alert('Could not access microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
      setRecordingComplete(true);
      clearInterval(timerRef.current);
    }
  };

  const handleSubmit = () => {
    if (!audioBlob) {
      alert('No recording available to download');
      return;
    }
    
    console.log('Downloading blob:', audioBlob);
    const url = URL.createObjectURL(audioBlob);
    const a = document.createElement('a');
    a.href = url;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    a.download = `adhd-screening-${timestamp}.webm`;
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  };

  const resetRecording = () => {
    setRecordingComplete(false);
    setRecordingTime(0);
    setAudioBlob(null);
    audioChunksRef.current = [];
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div style={{ 
      maxWidth: '600px', 
      margin: '0 auto', 
      padding: '2rem',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      background: '#fafafa'
    }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.8rem', marginBottom: '2rem', color: '#1a1a1a', fontWeight: '400' }}>
          Free Speech Portion
        </h1>

        <div style={{ 
          background: 'white', 
          padding: '2rem', 
          borderRadius: '16px',
          marginBottom: '2rem',
          border: '1px solid #e5e5e5'
        }}>
          <p style={{ 
            fontSize: '1.2rem', 
            lineHeight: '1.8', 
            color: '#404040',
            marginBottom: 0
          }}>
            Tell me about what you did last weekend or on your most recent holiday.
          </p>
        </div>

        {!recordingComplete ? (
          <>
            <div style={{ 
              fontSize: '3rem', 
              fontWeight: '300',
              color: isRecording ? '#ff6b6b' : '#a0a0a0',
              marginBottom: '2rem',
              fontVariantNumeric: 'tabular-nums'
            }}>
              {formatTime(recordingTime)}
            </div>

            <button
              onClick={isRecording ? stopRecording : startRecording}
              style={{
                width: '120px',
                height: '120px',
                borderRadius: '50%',
                border: isRecording ? '3px solid #ff6b6b' : '3px solid #6b9eff',
                background: 'white',
                color: isRecording ? '#ff6b6b' : '#6b9eff',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                transition: 'all 0.2s',
                marginBottom: '1rem'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'scale(1.05)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
              }}
            >
              {isRecording ? 'STOP' : 'RECORD'}
            </button>

            {isRecording && (
              <p style={{ 
                color: '#ff6b6b', 
                fontSize: '0.9rem',
                animation: 'pulse 2s ease-in-out infinite'
              }}>
                Recording in progress...
              </p>
            )}
          </>
        ) : (
          <div>
            <div style={{ 
              fontSize: '3rem',
              marginBottom: '2rem',
              color: '#10b981'
            }}>
              ✓
            </div>
            <p style={{ 
              fontSize: '1.2rem', 
              color: '#10b981',
              marginBottom: '1rem',
              fontWeight: '500'
            }}>
              Recording Complete
            </p>
            <p style={{ color: '#a0a0a0', marginBottom: '2rem', fontSize: '0.9rem' }}>
              Duration: {formatTime(recordingTime)}
            </p>
            
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginBottom: '1rem' }}>
              <button
                onClick={handleSubmit}
                style={{
                  padding: '0.75rem 2rem',
                  background: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  fontWeight: '600',
                  boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = '#059669';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = '#10b981';
                }}
              >
                Submit & Download
              </button>
            </div>
            
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button
                onClick={resetRecording}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: 'white',
                  color: '#6b9eff',
                  border: '2px solid #6b9eff',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: '500'
                }}
              >
                Record Again
              </button>
              <Link 
                href="/"
                style={{
                  padding: '0.75rem 1.5rem',
                  background: 'white',
                  color: '#a0a0a0',
                  border: '2px solid #e5e5e5',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  fontSize: '0.9rem',
                  fontWeight: '500',
                  display: 'inline-block'
                }}
              >
                Back to Home
              </Link>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}