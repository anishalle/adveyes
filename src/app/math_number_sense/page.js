"use client"

import React, { useState, useMemo, useRef } from "react"

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function generateComparisonNumber(problem) {
  const product = problem.a * problem.b;
  
  const strategies = [
    () => {
      const variance = product * 0.2;
      return randInt(Math.max(1, Math.floor(product - variance)), Math.floor(product + variance));
    },
    () => {
      const roundTo = randInt(1, 3) === 1 ? 10 : 25;
      const base = Math.round(product / roundTo) * roundTo;
      return base + (randInt(0, 1) ? roundTo : -roundTo);
    },
    () => {
      const maxReasonable = Math.max(100, product * 3);
      return randInt(10, maxReasonable);
    }
  ];
  
  const strategy = strategies[randInt(0, strategies.length - 1)];
  let comparisonNumber = strategy();
  
  while (Math.abs(comparisonNumber - product) < 5 || comparisonNumber < 10) {
    comparisonNumber = strategy();
  }
  
  return Math.max(10, comparisonNumber);
}

function generateProblemSet(count = 3) {
  const problems = [];
  
  for (let i = 0; i < count; i++) {
    const typeRoll = randInt(1, 3);
    let a, b, type;
    
    if (typeRoll === 1) {
      a = randInt(1, 9);
      b = randInt(1, 9);
      type = "1 digit × 1 digit";
    } else if (typeRoll === 2) {
      const oneDigit = randInt(1, 9);
      const twoDigit = randInt(10, 99);
      if (Math.random() < 0.5) {
        a = oneDigit;
        b = twoDigit;
      } else {
        a = twoDigit;
        b = oneDigit;
      }
      type = "1 digit × 2 digit";
    } else {
      a = randInt(10, 99);
      b = randInt(10, 99);
      type = "2 digit × 2 digit";
    }
    
    const product = a * b;
    const comparisonNumber = generateComparisonNumber({ a, b, product });
    
    problems.push({
      a,
      b,
      type,
      description: `${a} × ${b}`,
      product: product,
      comparisonNumber: comparisonNumber,
      isLargerThanComparison: product > comparisonNumber
    });
  }
  
  return problems;
}

export default function MathNumberSense() {
  const [problems, setProblems] = useState(null)
  const [currentProblemIndex, setCurrentProblemIndex] = useState(0)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [testCompleted, setTestCompleted] = useState(false)
  const [uploadSuccess, setUploadSuccess] = useState(false)
  const [uploading, setUploading] = useState(false)
  const mediaRecorderRef = useRef(null)
  const audioContextRef = useRef(null)
  const audioBuffersRef = useRef([])
  const timerRef = useRef(null)

  React.useEffect(() => {
    if (!problems) {
      setProblems(generateProblemSet(3))
    }
  }, [problems])

  if (!problems) {
    return <div style={{ padding: "2rem", textAlign: "center", fontSize: "1.2rem" }}>Loading...</div>
  }

  const currentProblem = problems ? problems[currentProblemIndex] : null

  if (!currentProblem) {
    return <div style={{ padding: "2rem", textAlign: "center", fontSize: "1.2rem" }}>Loading...</div>
  }

  const startRecording = async () => {
    try {
      // Initialize audio context once
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });
      
      mediaRecorderRef.current = new MediaRecorder(stream);
      const audioChunks = [];
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        const arrayBuffer = await blob.arrayBuffer();
        const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
        
        // Store the decoded audio buffer
        audioBuffersRef.current.push(audioBuffer);
        
        setIsRecording(false);
        clearInterval(timerRef.current);
        stream.getTracks().forEach(track => track.stop());
        
        // Auto-advance to next problem
        setTimeout(() => {
          if (currentProblemIndex < problems.length - 1) {
            setCurrentProblemIndex(currentProblemIndex + 1);
            setRecordingTime(0);
          } else {
            setTestCompleted(true);
          }
        }, 500);
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (error) {
      console.error("Error accessing microphone:", error)
      alert("Could not access microphone. Please check permissions.")
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
  }

  const combineAudioBuffers = () => {
    if (audioBuffersRef.current.length === 0) return null;

    const audioContext = audioContextRef.current;
    let totalLength = 0;

    // Calculate total length
    for (const buffer of audioBuffersRef.current) {
      totalLength += buffer.length;
    }

    // Create combined buffer
    const combinedBuffer = audioContext.createBuffer(
      1,
      totalLength,
      audioBuffersRef.current[0].sampleRate
    );
    const combinedData = combinedBuffer.getChannelData(0);

    // Copy each buffer's data directly
    let offset = 0;
    for (const buffer of audioBuffersRef.current) {
      const sourceData = buffer.getChannelData(0);
      for (let i = 0; i < sourceData.length; i++) {
        combinedData[offset + i] = sourceData[i];
      }
      offset += buffer.length;
    }

    return combinedBuffer;
  };

  const audioBufferToWav = (audioBuffer) => {
    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const format = 1;
    const bitDepth = 16;

    const bytesPerSample = bitDepth / 8;
    const blockAlign = numberOfChannels * bytesPerSample;

    const channelData = [];
    for (let i = 0; i < numberOfChannels; i++) {
      channelData.push(audioBuffer.getChannelData(i));
    }

    const length = channelData[0].length;
    const interleaved = new Float32Array(length * numberOfChannels);
    let offset = 0;
    
    // Copy data with minimal processing
    for (let i = 0; i < length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        interleaved[offset++] = channelData[channel][i];
      }
    }

    const dataLength = interleaved.length * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);

    const writeString = (off, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(off + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, 'data');
    view.setUint32(40, dataLength, true);

    // Convert to 16-bit PCM with proper scaling
    let writeOffset = 44;
    const maxInt = 32767;
    const minInt = -32768;
    
    for (let i = 0; i < interleaved.length; i++) {
      let s = interleaved[i];
      s = s < 0 ? s * 0x8000 : s * 0x7FFF;
      s = Math.max(minInt, Math.min(maxInt, s));
      view.setInt16(writeOffset, s, true);
      writeOffset += 2;
    }

    return new Blob([buffer], { type: 'audio/wav' });
  };

  const handleDownload = async () => {
    if (audioBuffersRef.current.length === 0) {
      alert('No recordings available');
      return;
    }

    setUploading(true);

    try {
      const combinedBuffer = combineAudioBuffers();
      const wavBlob = audioBufferToWav(combinedBuffer);
      
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      const filename = `math_number_sense_${dateStr}.wav`;

      const url = URL.createObjectURL(wavBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 100);

      setUploadSuccess(true);
    } catch (error) {
      console.error('Error downloading:', error);
      alert('Error downloading recordings. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const resetTest = () => {
    const newProblems = generateProblemSet(3);
    setProblems(newProblems);
    setCurrentProblemIndex(0);
    audioBuffersRef.current = [];
    setTestCompleted(false);
    setUploadSuccess(false);
    setRecordingTime(0);
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const containerStyle = {
    fontFamily: "Inter, Roboto, system-ui, -apple-system, 'Segoe UI', Arial",
    padding: "2rem",
    maxWidth: 600,
    margin: "2rem auto",
    textAlign: "center",
    backgroundColor: "#ffffff",
    borderRadius: "16px",
    boxShadow: "0 4px 6px rgba(0, 0, 0, 0.07)",
  }

  const headerStyle = {
    fontSize: "1.5rem",
    fontWeight: 700,
    marginBottom: "2rem",
    color: "#0066cc",
    letterSpacing: "-0.5px"
  }

  const problemStyle = {
    fontSize: "3rem",
    fontWeight: 700,
    margin: "2rem 0",
    padding: "2rem",
    backgroundColor: "#f0f7ff",
    borderRadius: "12px",
    border: "2px solid #0066cc",
    color: "#0066cc"
  }

  const comparisonStyle = {
    fontSize: "1.3rem",
    margin: "1.5rem 0",
    padding: "1.5rem",
    backgroundColor: "#fff3cd",
    borderRadius: "10px",
    border: "2px solid #ffc107",
    color: "#856404",
    fontWeight: 600
  }

  const btnStyle = {
    padding: "0.75rem 1.5rem",
    margin: "0.5rem",
    fontSize: "1rem",
    borderRadius: "8px",
    border: "none",
    background: "#0066cc",
    color: "white",
    cursor: "pointer",
    transition: "all 0.2s",
    fontWeight: 600,
    boxShadow: "0 2px 4px rgba(0, 102, 204, 0.2)"
  }

  const secondaryBtnStyle = {
    ...btnStyle,
    background: "#e8f0ff",
    color: "#0066cc",
    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.05)"
  }

  const recordBtnStyle = {
    width: "140px",
    height: "140px",
    borderRadius: "50%",
    border: "none",
    background: isRecording 
      ? "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)" 
      : "linear-gradient(135deg, #28a745 0%, #20c997 100%)",
    color: "white",
    cursor: "pointer",
    fontSize: "0.9rem",
    fontWeight: 700,
    boxShadow: "0 4px 15px rgba(0, 0, 0, 0.2)",
    transition: "transform 0.2s"
  }

  const progressStyle = {
    margin: "1.5rem 0 2rem 0",
    fontSize: "0.95rem",
    color: "#666",
    fontWeight: 600
  }

  const timerStyle = {
    fontSize: "2rem",
    fontWeight: 700,
    color: "#0066cc",
    margin: "1rem 0",
    fontVariantNumeric: "tabular-nums"
  }

  if (testCompleted) {
    return (
      <div style={containerStyle}>
        <div style={headerStyle}>
          Test Completed!
        </div>
        <div style={{ fontSize: "4rem", marginBottom: "1rem", color: uploadSuccess ? "#28a745" : "#0066cc" }}>
          ✓
        </div>
        <div style={{ fontSize: "1.3rem", margin: "1.5rem 0", fontWeight: 600, color: uploadSuccess ? "#28a745" : "#2d3748" }}>
          {uploadSuccess ? 'Download Complete!' : 'All Recordings Ready'}
        </div>
        <div style={{ margin: "1rem 0", color: "#666", fontSize: "1rem" }}>
          {audioBuffersRef.current.length} out of {problems.length} problems recorded
        </div>
        
        {!uploadSuccess && (
          <button 
            onClick={handleDownload}
            disabled={uploading}
            style={{
              ...btnStyle,
              background: uploading ? "#a0aec0" : "#28a745",
              cursor: uploading ? "not-allowed" : "pointer",
              marginBottom: "1rem",
              padding: "1rem 2.5rem",
              fontSize: "1.05rem"
            }}
          >
            {uploading ? 'Processing...' : 'Download Combined Audio'}
          </button>
        )}

        {uploadSuccess && (
          <p style={{ color: "#28a745", marginBottom: "1.5rem", fontSize: "0.95rem" }}>
            Recording downloaded successfully
          </p>
        )}

        <button 
          onClick={resetTest}
          style={{
            ...secondaryBtnStyle,
            display: "block",
            margin: "0 auto"
          }}
        >
          Start New Test
        </button>
      </div>
    )
  }

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        MATH & NUMBER SENSE
      </div>

      <div style={progressStyle}>
        Problem {currentProblemIndex + 1} of {problems.length}
      </div>

      <div style={problemStyle} aria-live="polite">
        {currentProblem.description}
      </div>

      <div style={{...problemStyle, fontSize: "1.1rem"}}>
        Type: {currentProblem.type}
      </div>

      <div style={comparisonStyle}>
        Is it larger than: <strong>{currentProblem.comparisonNumber}</strong>?
      </div>

      <div style={timerStyle}>
        {formatTime(recordingTime)}
      </div>

      <div style={{ margin: "2rem 0" }}>
        <button 
          style={secondaryBtnStyle} 
          onClick={() => {
            if (currentProblemIndex > 0) {
              setCurrentProblemIndex(currentProblemIndex - 1);
              setRecordingTime(0);
            }
          }}
          disabled={currentProblemIndex === 0}
        >
          Previous
        </button>

        <button 
          style={secondaryBtnStyle} 
          onClick={() => {
            if (currentProblemIndex < problems.length - 1) {
              setCurrentProblemIndex(currentProblemIndex + 1);
              setRecordingTime(0);
            }
          }}
          disabled={currentProblemIndex === problems.length - 1}
        >
          Skip
        </button>
      </div>

      <div style={{ margin: "2rem 0" }}>
        <button 
          style={recordBtnStyle}
          onClick={isRecording ? stopRecording : startRecording}
          onMouseOver={(e) => {
            if (!isRecording) e.currentTarget.style.transform = 'scale(1.08)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          {isRecording ? 'STOP' : 'RECORD'}
        </button>
        
        {isRecording && (
          <div style={{ marginTop: "1rem", color: "#f5576c", fontWeight: 600 }}>
            🔴 Recording...
          </div>
        )}

        {audioBuffersRef.current.length > currentProblemIndex && (
          <div style={{ marginTop: "1rem", color: "#28a745", fontWeight: 600 }}>
            ✓ Recorded
          </div>
        )}
      </div>

      <div style={{ 
        marginTop: "2rem", 
        padding: "1.5rem",
        backgroundColor: "#f8f9ff",
        borderRadius: "10px",
        fontSize: "0.9rem",
        color: "#555",
        lineHeight: "1.6"
      }}>
        <strong style={{color: "#0066cc"}}>Instructions:</strong> State whether the solution is larger than the number shown. Press STOP to pause and move to the next problem. All recordings will be combined into one file at the end.
      </div>
    </div>
  )
}