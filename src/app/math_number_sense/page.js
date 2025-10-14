"use client"

import React, { useState } from "react"

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function generateComparisonNumber(problem) {
  const product = problem.a * problem.b;
  
  // Generate a comparison number that's somewhat related to the problem
  // but not always the actual product
  const strategies = [
    // Strategy 1: Near the actual product (±20%)
    () => {
      const variance = product * 0.2;
      return randInt(Math.max(1, Math.floor(product - variance)), Math.floor(product + variance));
    },
    // Strategy 2: Round number near the product
    () => {
      const roundTo = randInt(1, 3) === 1 ? 10 : 25;
      const base = Math.round(product / roundTo) * roundTo;
      return base + (randInt(0, 1) ? roundTo : -roundTo);
    },
    // Strategy 3: Completely random but in reasonable range
    () => {
      const maxReasonable = Math.max(100, product * 3);
      return randInt(10, maxReasonable);
    }
  ];
  
  const strategy = strategies[randInt(0, strategies.length - 1)];
  let comparisonNumber = strategy();
  
  // Ensure the comparison number is not too close to the actual product
  // and is at least 10
  while (Math.abs(comparisonNumber - product) < 5 || comparisonNumber < 10) {
    comparisonNumber = strategy();
  }
  
  return Math.max(10, comparisonNumber);
}

function generateProblemSet(count = 15) {
  const problems = [];
  
  for (let i = 0; i < count; i++) {
    const typeRoll = randInt(1, 3);
    let a, b, type;
    
    if (typeRoll === 1) {
      // 1 digit × 1 digit
      a = randInt(1, 9);
      b = randInt(1, 9);
      type = "1 digit × 1 digit";
    } else if (typeRoll === 2) {
      // 1 digit × 2 digit (random order)
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
      // 2 digit × 2 digit
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
  const [problems, setProblems] = useState(() => generateProblemSet(15))
  const [currentProblemIndex, setCurrentProblemIndex] = useState(0)
  const [audioRecording, setAudioRecording] = useState(false)
  const [recordedAudio, setRecordedAudio] = useState({})
  const [testCompleted, setTestCompleted] = useState(false)
  const [mediaRecorder, setMediaRecorder] = useState(null)



  const currentProblem = problems[currentProblemIndex]

  function nextProblem() {
    if (currentProblemIndex < problems.length - 1) {
      setCurrentProblemIndex(currentProblemIndex + 1)
    } else {
      setTestCompleted(true)
    }
  }

  function prevProblem() {
    if (currentProblemIndex > 0) {
      setCurrentProblemIndex(currentProblemIndex - 1)
    }
  }

  function restartTest() {
    setProblems(generateProblemSet(15))
    setCurrentProblemIndex(0)
    setRecordedAudio({})
    setTestCompleted(false)
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      const audioChunks = []
      
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data)
        }
      }
      
      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' })
        const audioUrl = URL.createObjectURL(audioBlob)
        setRecordedAudio(prev => ({
          ...prev,
          [currentProblemIndex]: audioUrl
        }))
        setAudioRecording(false)
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop())
        
        // Auto-advance to next problem after recording
        setTimeout(() => {
          if (currentProblemIndex < problems.length - 1) {
            setCurrentProblemIndex(currentProblemIndex + 1)
          } else {
            setTestCompleted(true)
          }
        }, 1000)
      }
      
      recorder.start()
      setAudioRecording(true)
      setMediaRecorder(recorder)
    } catch (error) {
      console.error("Error accessing microphone:", error)
      alert("Could not access microphone. Please check permissions.")
    }
  }

  function stopRecording() {
    if (mediaRecorder && audioRecording) {
      mediaRecorder.stop()
      setMediaRecorder(null)
    }
  }

  const containerStyle = {
    fontFamily: "Inter, Roboto, system-ui, -apple-system, 'Segoe UI', Arial",
    padding: "2rem",
    maxWidth: 600,
    margin: "2rem auto",
    textAlign: "center",
  }

  const headerStyle = {
    fontSize: "1.5rem",
    fontWeight: 600,
    marginBottom: "1.5rem",
    color: "#1a1a1a"
  }

  const problemStyle = {
    fontSize: "2.5rem",
    fontWeight: 600,
    margin: "2rem 0",
    padding: "1.5rem",
    backgroundColor: "#f8f9fa",
    borderRadius: "8px",
    border: "1px solid #e9ecef"
  }

  const comparisonStyle = {
    fontSize: "1.25rem",
    margin: "1.5rem 0",
    padding: "1rem",
    backgroundColor: "#e7f3ff",
    borderRadius: "6px",
    border: "1px solid #b3d9ff"
  }

  const btnStyle = {
    padding: "0.75rem 1.5rem",
    margin: "0.5rem",
    fontSize: "1rem",
    borderRadius: "6px",
    border: "1px solid #007acc",
    background: "#007acc",
    color: "white",
    cursor: "pointer",
    transition: "all 0.2s"
  }

  const secondaryBtnStyle = {
    ...btnStyle,
    background: "white",
    color: "#007acc",
  }

  const recordBtnStyle = {
    ...btnStyle,
    background: audioRecording ? "#dc3545" : "#28a745",
    border: audioRecording ? "1px solid #dc3545" : "1px solid #28a745"
  }

  const completeBtnStyle = {
    ...btnStyle,
    background: "#28a745",
    border: "1px solid #28a745",
    fontSize: "1.1rem",
    padding: "1rem 2rem"
  }

  const progressStyle = {
    margin: "1rem 0",
    fontSize: "0.9rem",
    color: "#666"
  }

  if (testCompleted) {
    return (
      <div style={containerStyle}>
        <div style={headerStyle}>
          Test Completed!
        </div>
        <div style={{ fontSize: "1.2rem", margin: "2rem 0" }}>
          You have completed all 15 problems. Great job!
        </div>
        <div style={{ margin: "1rem 0", color: "#666" }}>
          Recorded {Object.keys(recordedAudio).length} out of 15 problems
        </div>
        <button style={completeBtnStyle} onClick={restartTest}>
          Start New Test
        </button>
      </div>
    )
  }

  if (!currentProblem) {
    return <div style={containerStyle}>Loading problems...</div>
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

      <div style={{ margin: "2rem 0" }}>
        <button 
          style={secondaryBtnStyle} 
          onClick={prevProblem}
          disabled={currentProblemIndex === 0}
        >
          Previous Problem
        </button>

        <button 
          style={secondaryBtnStyle} 
          onClick={nextProblem}
          disabled={currentProblemIndex === problems.length - 1}
        >
          Skip & Next Problem
        </button>
      </div>

      <div style={{ margin: "2rem 0" }}>
        <button 
          style={recordBtnStyle}
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
            <div style={{ fontSize: "0.8rem", color: "#28a745", marginTop: "0.25rem" }}>
              Audio saved as WEBM format
            </div>
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