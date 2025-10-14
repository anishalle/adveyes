"use client"

import React, { useState, useCallback, useMemo } from "react"

// Memoized random number generator
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

// Pre-computed strategies for better performance
const comparisonStrategies = [
  // Strategy 1: Near the actual product (±20%)
  (product) => {
    const variance = product * 0.2;
    return randInt(Math.max(1, Math.floor(product - variance)), Math.floor(product + variance));
  },
  // Strategy 2: Round number near the product
  (product) => {
    const roundTo = randInt(1, 3) === 1 ? 10 : 25;
    const base = Math.round(product / roundTo) * roundTo;
    return base + (randInt(0, 1) ? roundTo : -roundTo);
  },
  // Strategy 3: Completely random but in reasonable range
  (product) => {
    const maxReasonable = Math.max(100, product * 3);
    return randInt(10, maxReasonable);
  }
];

function generateComparisonNumber(problem) {
  const product = problem.a * problem.b;
  
  const strategy = comparisonStrategies[randInt(0, comparisonStrategies.length - 1)];
  let comparisonNumber = strategy(product);
  
  // Ensure the comparison number is not too close to the actual product
  let attempts = 0;
  while (Math.abs(comparisonNumber - product) < 5 || comparisonNumber < 10) {
    comparisonNumber = strategy(product);
    attempts++;
    if (attempts > 10) break; // Prevent infinite loops
  }
  
  return Math.max(10, comparisonNumber);
}

// Pre-define problem types for better performance
const PROBLEM_TYPES = [
  { minA: 1, maxA: 9, minB: 1, maxB: 9, type: "1 digit × 1 digit" },
  { minA: 1, maxA: 9, minB: 10, maxB: 99, type: "1 digit × 2 digit" },
  { minA: 10, maxA: 99, minB: 1, maxB: 9, type: "2 digit × 1 digit" },
  { minA: 10, maxA: 99, minB: 10, maxB: 99, type: "2 digit × 2 digit" }
];

function generateProblemSet(count = 15) {
  const problems = new Array(count);
  
  for (let i = 0; i < count; i++) {
    const typeIndex = randInt(0, PROBLEM_TYPES.length - 1);
    const problemType = PROBLEM_TYPES[typeIndex];
    
    const a = randInt(problemType.minA, problemType.maxA);
    const b = randInt(problemType.minB, problemType.maxB);
    const product = a * b;
    const comparisonNumber = generateComparisonNumber({ a, b, product });
    
    problems[i] = {
      a,
      b,
      type: problemType.type,
      description: `${a} × ${b}`,
      product: product,
      comparisonNumber: comparisonNumber,
      isLargerThanComparison: product > comparisonNumber
    };
  }
  
  return problems;
}

// Audio utility functions
async function startRecordingAsync() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true
      } 
    });
    return stream;
  } catch (error) {
    console.error("Error accessing microphone:", error);
    throw new Error("Could not access microphone. Please check permissions.");
  }
}

function encodeWAV(samples, sampleRate = 16000) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  // WAV header
  const writeString = (offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  // Convert samples to 16-bit PCM
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }

  return buffer;
}

function downloadWAV(audioBuffer, filename) {
  const wavBuffer = encodeWAV(audioBuffer);
  const blob = new Blob([wavBuffer], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function MathNumberSense() {
  const [problems, setProblems] = useState(() => generateProblemSet(15))
  const [currentProblemIndex, setCurrentProblemIndex] = useState(0)
  const [audioRecording, setAudioRecording] = useState(false)
  const [recordedAudio, setRecordedAudio] = useState({})
  const [testCompleted, setTestCompleted] = useState(false)
  const [mediaRecorder, setMediaRecorder] = useState(null)
  const [audioContext, setAudioContext] = useState(null)

  const currentProblem = problems[currentProblemIndex]

  const nextProblem = useCallback(() => {
    if (currentProblemIndex < problems.length - 1) {
      setCurrentProblemIndex(currentProblemIndex + 1)
    } else {
      setTestCompleted(true)
    }
  }, [currentProblemIndex, problems.length])

  const prevProblem = useCallback(() => {
    if (currentProblemIndex > 0) {
      setCurrentProblemIndex(currentProblemIndex - 1)
    }
  }, [currentProblemIndex])

  const restartTest = useCallback(() => {
    setProblems(generateProblemSet(15))
    setCurrentProblemIndex(0)
    setRecordedAudio({})
    setTestCompleted(false)
  }, [])

  // Download all audio files as WAV when test is completed
  const downloadAllAudio = useCallback(async () => {
    if (Object.keys(recordedAudio).length === 0) {
      alert("No audio recordings available to download.");
      return;
    }

    try {
      // Initialize audio context if not already done
      const ctx = audioContext || new (window.AudioContext || window.webkitAudioContext)();
      if (!audioContext) setAudioContext(ctx);

      for (const [problemIndex, audioUrl] of Object.entries(recordedAudio)) {
        const response = await fetch(audioUrl);
        const arrayBuffer = await response.arrayBuffer();
        
        // Decode audio data
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        const channelData = audioBuffer.getChannelData(0);
        
        // Download as WAV
        const problem = problems[problemIndex];
        const filename = `problem-${parseInt(problemIndex) + 1}-${problem.description.replace(' × ', 'x')}.wav`;
        downloadWAV(channelData, filename);
      }
      
      alert(`Downloaded ${Object.keys(recordedAudio).length} WAV files successfully!`);
    } catch (error) {
      console.error("Error downloading audio files:", error);
      alert("Error downloading audio files. Please try again.");
    }
  }, [recordedAudio, problems, audioContext]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await startRecordingAsync();
      
      // Use MediaRecorder with WAV format if supported, fallback to webm
      const options = { 
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 128000
      };
      
      const recorder = new MediaRecorder(stream, options);
      const audioChunks = [];
      
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };
      
      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        setRecordedAudio(prev => ({
          ...prev,
          [currentProblemIndex]: audioUrl
        }));
        setAudioRecording(false);
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
        
        // Auto-advance to next problem after recording
        setTimeout(() => {
          if (currentProblemIndex < problems.length - 1) {
            setCurrentProblemIndex(currentProblemIndex + 1);
          } else {
            setTestCompleted(true);
          }
        }, 500); // Reduced delay for better UX
      };
      
      recorder.start();
      setAudioRecording(true);
      setMediaRecorder(recorder);
    } catch (error) {
      console.error("Error accessing microphone:", error);
      alert(error.message);
    }
  }, [currentProblemIndex, problems.length]);

  const stopRecording = useCallback(() => {
    if (mediaRecorder && audioRecording) {
      mediaRecorder.stop();
      setMediaRecorder(null);
    }
  }, [mediaRecorder, audioRecording]);

  // Memoized styles to prevent unnecessary re-renders
  const styles = useMemo(() => ({
    container: {
      fontFamily: "Inter, Roboto, system-ui, -apple-system, 'Segoe UI', Arial",
      padding: "2rem",
      maxWidth: 600,
      margin: "2rem auto",
      textAlign: "center",
    },
    header: {
      fontSize: "1.5rem",
      fontWeight: 600,
      marginBottom: "1.5rem",
      color: "#1a1a1a"
    },
    problem: {
      fontSize: "2.5rem",
      fontWeight: 600,
      margin: "2rem 0",
      padding: "1.5rem",
      backgroundColor: "#f8f9fa",
      borderRadius: "8px",
      border: "1px solid #e9ecef"
    },
    comparison: {
      fontSize: "1.25rem",
      margin: "1.5rem 0",
      padding: "1rem",
      backgroundColor: "#e7f3ff",
      borderRadius: "6px",
      border: "1px solid #b3d9ff"
    },
    btn: {
      padding: "0.75rem 1.5rem",
      margin: "0.5rem",
      fontSize: "1rem",
      borderRadius: "6px",
      border: "1px solid #007acc",
      background: "#007acc",
      color: "white",
      cursor: "pointer",
      transition: "all 0.2s"
    },
    secondaryBtn: {
      padding: "0.75rem 1.5rem",
      margin: "0.5rem",
      fontSize: "1rem",
      borderRadius: "6px",
      border: "1px solid #007acc",
      background: "white",
      color: "#007acc",
      cursor: "pointer",
      transition: "all 0.2s"
    },
    recordBtn: {
      padding: "0.75rem 1.5rem",
      margin: "0.5rem",
      fontSize: "1rem",
      borderRadius: "6px",
      border: "1px solid #28a745",
      background: "#28a745",
      color: "white",
      cursor: "pointer",
      transition: "all 0.2s"
    },
    recordingBtn: {
      padding: "0.75rem 1.5rem",
      margin: "0.5rem",
      fontSize: "1rem",
      borderRadius: "6px",
      border: "1px solid #dc3545",
      background: "#dc3545",
      color: "white",
      cursor: "pointer",
      transition: "all 0.2s"
    },
    completeBtn: {
      padding: "1rem 2rem",
      margin: "0.5rem",
      fontSize: "1.1rem",
      borderRadius: "6px",
      border: "1px solid #28a745",
      background: "#28a745",
      color: "white",
      cursor: "pointer",
      transition: "all 0.2s"
    },
    downloadBtn: {
      padding: "1rem 2rem",
      margin: "0.5rem",
      fontSize: "1.1rem",
      borderRadius: "6px",
      border: "1px solid #6f42c1",
      background: "#6f42c1",
      color: "white",
      cursor: "pointer",
      transition: "all 0.2s"
    },
    progress: {
      margin: "1rem 0",
      fontSize: "0.9rem",
      color: "#666"
    }
  }), []);

  if (testCompleted) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          Test Completed!
        </div>
        <div style={{ fontSize: "1.2rem", margin: "2rem 0" }}>
          You have completed all 15 problems. Great job!
        </div>
        <div style={{ margin: "1rem 0", color: "#666" }}>
          Recorded {Object.keys(recordedAudio).length} out of 15 problems
        </div>
        
        <div style={{ margin: "2rem 0" }}>
          <button style={styles.completeBtn} onClick={restartTest}>
            Start New Test
          </button>
          
          {Object.keys(recordedAudio).length > 0 && (
            <button style={styles.downloadBtn} onClick={downloadAllAudio}>
              Download All Audio as WAV ({Object.keys(recordedAudio).length} files)
            </button>
          )}
        </div>
      </div>
    )
  }

  if (!currentProblem) {
    return <div style={styles.container}>Loading problems...</div>
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        MATH & NUMBER SENSE
      </div>

      <div style={styles.progress}>
        Problem {currentProblemIndex + 1} of {problems.length}
      </div>

      <div style={styles.problem} aria-live="polite">
        {currentProblem.description}
      </div>

      <div style={{...styles.problem, fontSize: "1.1rem"}}>
        Type: {currentProblem.type}
      </div>

      <div style={styles.comparison}>
        Is it larger than: <strong>{currentProblem.comparisonNumber}</strong>?
      </div>

      <div style={{ margin: "2rem 0" }}>
        <button 
          style={styles.secondaryBtn} 
          onClick={prevProblem}
          disabled={currentProblemIndex === 0}
        >
          Previous Problem
        </button>

        <button 
          style={styles.secondaryBtn} 
          onClick={nextProblem}
          disabled={currentProblemIndex === problems.length - 1}
        >
          Skip & Next Problem
        </button>
      </div>

      <div style={{ margin: "2rem 0" }}>
        <button 
          style={audioRecording ? styles.recordingBtn : styles.recordBtn}
          onClick={audioRecording ? stopRecording : startRecording}
        >
          {audioRecording ? "Recording... Click to Stop" : "Record Your Answer"}
        </button>
        
        {recordedAudio[currentProblemIndex] && (
          <div style={{ marginTop: "1rem" }}>
            <div style={{ fontSize: "0.9rem", color: "#28a745", marginBottom: "0.5rem" }}>
              ✓ Recording saved - advancing to next problem...
            </div>
            <audio controls src={recordedAudio[currentProblemIndex]} style={{ marginTop: "0.5rem" }} />
          </div>
        )}
      </div>

      <div style={{ 
        marginTop: "2rem", 
        padding: "1rem",
        backgroundColor: "#f8f9fa",
        borderRadius: "6px",
        fontSize: "0.9rem",
        color: "#666"
      }}>
        <strong>Instructions:</strong> State whether the solution to the expression is larger than the number shown and explain your reasoning. After recording your answer, you will automatically advance to the next problem. Complete all 15 problems.
      </div>
    </div>
  )
}