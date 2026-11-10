"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Video, VideoOff, ShieldAlert, Cpu } from "lucide-react"
import { apiClient } from "@/lib/api-client"

export interface DetectionFace {
  bbox: [number, number, number, number] // [x, y, w, h] in pixels
  bbox_normalized?: [number, number, number, number] // [norm_x, norm_y, norm_w, norm_h]
  student_id: string | number | null
  student_name: string | null
  score: number
  detection_score?: number
  recognized: boolean
  attendance_status?: string
}

export interface DetectionPayload {
  type?: string
  timestamp?: number
  faces: DetectionFace[]
  attendance_confirmed?: {
    student_id: string | number
    student_name: string
  }
}

export interface WebRTCStreamProps {
  maBuoiHoc: number
  onConnectionStateChange?: (state: string) => void
  onAttendanceMarked?: (student: { student_id: string | number; student_name: string }) => void
}

/**
 * Pure bounding box coordinate transformation and visual styling helper.
 * Exported for deterministic unit testing.
 */
export function computeBoundingBox(
  face: DetectionFace,
  canvasWidth: number,
  canvasHeight: number,
  isMirrored: boolean,
  frameWidth = 640,
  frameHeight = 480
): { boxX: number; boxY: number; boxW: number; boxH: number; color: string; label: string } {
  let norm_x: number, norm_y: number, norm_w: number, norm_h: number

  if (face.bbox_normalized && face.bbox_normalized.length === 4) {
    ;[norm_x, norm_y, norm_w, norm_h] = face.bbox_normalized
  } else if (face.bbox && face.bbox.length === 4) {
    const fw = frameWidth > 0 ? frameWidth : 640
    const fh = frameHeight > 0 ? frameHeight : 480
    norm_x = face.bbox[0] / fw
    norm_y = face.bbox[1] / fh
    norm_w = face.bbox[2] / fw
    norm_h = face.bbox[3] / fh
  } else {
    norm_x = 0
    norm_y = 0
    norm_w = 0
    norm_h = 0
  }

  const boxW = norm_w * canvasWidth
  const boxH = norm_h * canvasHeight
  const boxY = norm_y * canvasHeight

  // Horizontal mirroring inversion logic: keeps box aligned with mirrored webcam feed
  const boxX = isMirrored
    ? canvasWidth - (norm_x * canvasWidth + boxW)
    : norm_x * canvasWidth

  const isRecognized = face.recognized === true
  const color = isRecognized ? "#22C55E" : "#EF4444"
  const label = isRecognized
    ? `${face.student_id ? `${face.student_id} - ` : ""}${face.student_name || "Sinh viên"}${
        face.score ? ` (${Math.round(face.score * 100)}%)` : ""
      }`
    : "Unknown"

  return { boxX, boxY, boxW, boxH, color, label }
}

export function WebRTCStream({
  maBuoiHoc,
  onConnectionStateChange,
  onAttendanceMarked,
}: WebRTCStreamProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const dataChannelRef = useRef<RTCDataChannel | null>(null)
  const staleTimerRef = useRef<NodeJS.Timeout | null>(null)

  const [streamActive, setStreamActive] = useState(false)
  const [iceConnectionState, setIceConnectionState] = useState("new")
  const [iceGatheringState, setIceGatheringState] = useState("new")
  const [signalingState, setSignalingState] = useState("stable")
  const [useStun, setUseStun] = useState(true)
  const [selectedCodec, setSelectedCodec] = useState("default")
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [facesCount, setFacesCount] = useState(0)
  const [mirrorVideo, setMirrorVideo] = useState(true)

  // WebRTC Simulator States & Refs
  const [videoSource, setVideoSource] = useState<"camera" | "mock">("camera")
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null)

  const mockCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const mockImageRef = useRef<HTMLImageElement | null>(null)
  const animationFrameIdRef = useRef<number | null>(null)

  // Escape regex helper
  const escapeRegExp = (string: string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  }

  // Filter Codec in SDP
  const sdpFilterCodec = (kind: string, codec: string, realSdp: string) => {
    const allowed: number[] = []
    const rtxRegex = new RegExp("a=fmtp:(\\d+) apt=(\\d+)\r$")
    const codecRegex = new RegExp("a=rtpmap:([0-9]+) " + escapeRegExp(codec))
    const videoRegex = new RegExp("(m=" + kind + " .*?)( ([0-9]+))*\\s*$")

    const lines = realSdp.split("\n")
    let isKind = false

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith("m=" + kind + " ")) {
        isKind = true
      } else if (lines[i].startsWith("m=")) {
        isKind = false
      }

      if (isKind) {
        let match = lines[i].match(codecRegex)
        if (match) {
          allowed.push(parseInt(match[1]))
        }

        match = lines[i].match(rtxRegex)
        if (match && allowed.includes(parseInt(match[2]))) {
          allowed.push(parseInt(match[1]))
        }
      }
    }

    if (allowed.length === 0) {
      return realSdp
    }

    const skipRegex = "a=(fmtp|rtcp-fb|rtpmap):([0-9]+)"
    let sdp = ""
    isKind = false

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith("m=" + kind + " ")) {
        isKind = true
      } else if (lines[i].startsWith("m=")) {
        isKind = false
      }

      if (isKind) {
        const skipMatch = lines[i].match(skipRegex)
        if (skipMatch && !allowed.includes(parseInt(skipMatch[2]))) {
          continue
        } else if (lines[i].match(videoRegex)) {
          sdp += lines[i].replace(videoRegex, "$1 " + allowed.join(" ")) + "\n"
        } else {
          sdp += lines[i] + "\n"
        }
      } else {
        sdp += lines[i] + "\n"
      }
    }

    return sdp
  }

  // Handle uploaded simulation image
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadedFileName(file.name)

    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        mockImageRef.current = img
      }
      img.src = event.target?.result as string
    }
    reader.readAsDataURL(file)
  }

  // Draw Bounding Boxes on Overlay Canvas
  const drawOverlay = useCallback(
    (faces: DetectionFace[]) => {
      const canvas = overlayCanvasRef.current
      const video = localVideoRef.current
      if (!canvas) return

      const ctx = canvas.getContext("2d")
      if (!ctx) return

      const rect = canvas.getBoundingClientRect()
      const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1
      const cw = rect.width > 0 ? Math.round(rect.width) : (canvas.clientWidth || 640)
      const ch = rect.height > 0 ? Math.round(rect.height) : (canvas.clientHeight || 480)

      if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
        canvas.width = Math.round(cw * dpr)
        canvas.height = Math.round(ch * dpr)
      }

      ctx.save()
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, cw, ch)

      if (!faces || faces.length === 0) {
        ctx.restore()
        return
      }

      const vw = video && video.videoWidth ? video.videoWidth : 640
      const vh = video && video.videoHeight ? video.videoHeight : 480
      const isMirrored = mirrorVideo && videoSource === "camera"

      faces.forEach((face) => {
        const { boxX, boxY, boxW, boxH, color, label } = computeBoundingBox(
          face,
          cw,
          ch,
          isMirrored,
          vw,
          vh
        )

        if (boxW <= 0 || boxH <= 0) return

        // 1. Subtle background tint
        ctx.fillStyle = face.recognized ? "rgba(34, 197, 94, 0.08)" : "rgba(239, 68, 68, 0.08)"
        if (typeof (ctx as any).roundRect === "function") {
          ctx.beginPath()
          ;(ctx as any).roundRect(boxX, boxY, boxW, boxH, 4)
          ctx.fill()
        } else {
          ctx.fillRect(boxX, boxY, boxW, boxH)
        }

        // 2. Bounding Box Border (2.5px)
        ctx.strokeStyle = color
        ctx.lineWidth = 2.5
        ctx.beginPath()
        if (typeof (ctx as any).roundRect === "function") {
          ;(ctx as any).roundRect(boxX, boxY, boxW, boxH, 4)
        } else {
          ctx.rect(boxX, boxY, boxW, boxH)
        }
        ctx.stroke()

        // 3. High-tech Corner Accents (length 12px)
        const cLen = Math.min(12, boxW / 4, boxH / 4)
        ctx.lineWidth = 3.5
        ctx.strokeStyle = color

        // Top-Left corner
        ctx.beginPath()
        ctx.moveTo(boxX, boxY + cLen)
        ctx.lineTo(boxX, boxY)
        ctx.lineTo(boxX + cLen, boxY)
        ctx.stroke()

        // Top-Right corner
        ctx.beginPath()
        ctx.moveTo(boxX + boxW - cLen, boxY)
        ctx.lineTo(boxX + boxW, boxY)
        ctx.lineTo(boxX + boxW, boxY + cLen)
        ctx.stroke()

        // Bottom-Left corner
        ctx.beginPath()
        ctx.moveTo(boxX, boxY + boxH - cLen)
        ctx.lineTo(boxX, boxY + boxH)
        ctx.lineTo(boxX + cLen, boxY + boxH)
        ctx.stroke()

        // Bottom-Right corner
        ctx.beginPath()
        ctx.moveTo(boxX + boxW - cLen, boxY + boxH)
        ctx.lineTo(boxX + boxW, boxY + boxH)
        ctx.lineTo(boxX + boxW, boxY + boxH - cLen)
        ctx.stroke()

        // 4. Label Pill Badge
        ctx.font = "bold 11px system-ui, -apple-system, sans-serif"
        const textMetrics = ctx.measureText(label)
        const pillWidth = textMetrics.width + 16
        const pillHeight = 22

        // Position pill above box, or inside top if near upper canvas boundary
        const pillY = boxY >= pillHeight + 4 ? boxY - pillHeight - 2 : boxY + 4
        const pillX = Math.max(0, Math.min(boxX, cw - pillWidth))

        ctx.fillStyle = color
        ctx.beginPath()
        if (typeof (ctx as any).roundRect === "function") {
          ;(ctx as any).roundRect(pillX, pillY, pillWidth, pillHeight, 4)
        } else {
          ctx.fillRect(pillX, pillY, pillWidth, pillHeight)
        }
        ctx.fill()

        // 5. Label Text (White, legible, upright left-to-right)
        ctx.fillStyle = "#FFFFFF"
        ctx.textAlign = "left"
        ctx.textBaseline = "middle"
        ctx.fillText(label, pillX + 8, pillY + pillHeight / 2)
      })

      ctx.restore()
    },
    [mirrorVideo, videoSource]
  )

  // Handle incoming DataChannel messages
  const handleDataMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const data: DetectionPayload =
          typeof event.data === "string" ? JSON.parse(event.data) : event.data

        if (data.faces && Array.isArray(data.faces)) {
          setFacesCount(data.faces.length)
          drawOverlay(data.faces)

          // Reset 1500ms stale debounce
          if (staleTimerRef.current) clearTimeout(staleTimerRef.current)
          staleTimerRef.current = setTimeout(() => {
            drawOverlay([])
            setFacesCount(0)
          }, 1500)
        }

        // Attendance confirmation callback
        if (data.attendance_confirmed && onAttendanceMarked) {
          onAttendanceMarked(data.attendance_confirmed)
        } else if (data.faces && onAttendanceMarked) {
          for (const f of data.faces) {
            if (f.attendance_status === "NEWLY_MARKED" && f.student_id) {
              onAttendanceMarked({
                student_id: f.student_id,
                student_name: f.student_name || "Sinh viên",
              })
              break
            }
          }
        }
      } catch (e) {
        // Non-JSON or ping message
      }
    },
    [drawOverlay, onAttendanceMarked]
  )

  // Setup WebRTC DataChannel listeners
  const setupDataChannel = useCallback(
    (dc: RTCDataChannel) => {
      dc.onopen = () => {
        console.log(`[WebRTC] DataChannel '${dc.label}' opened successfully`)
      }
      dc.onmessage = handleDataMessage
      dc.onclose = () => {
        console.log(`[WebRTC] DataChannel '${dc.label}' closed`)
      }
      dc.onerror = (err) => {
        console.error(`[WebRTC] DataChannel '${dc.label}' error:`, err)
      }
    },
    [handleDataMessage]
  )

  // Generate mock canvas video stream for testing
  const startMockStream = (): MediaStream => {
    if (typeof window === "undefined") return new MediaStream()
    const canvas = mockCanvasRef.current || document.createElement("canvas")
    canvas.width = 640
    canvas.height = 480
    const ctx = canvas.getContext("2d")

    let angle = 0
    const draw = () => {
      if (!ctx) return

      // Background
      ctx.fillStyle = "#070A0F"
      ctx.fillRect(0, 0, 640, 480)

      // Grid pattern
      ctx.strokeStyle = "rgba(14, 165, 233, 0.1)"
      ctx.lineWidth = 1
      for (let i = 0; i < 640; i += 40) {
        ctx.beginPath()
        ctx.moveTo(i, 0)
        ctx.lineTo(i, 480)
        ctx.stroke()
      }
      for (let j = 0; j < 480; j += 40) {
        ctx.beginPath()
        ctx.moveTo(0, j)
        ctx.lineTo(640, j)
        ctx.stroke()
      }

      // Scanner Target Box
      ctx.strokeStyle = "rgba(14, 165, 233, 0.3)"
      ctx.lineWidth = 2
      ctx.strokeRect(170, 90, 300, 300)

      // Draw corners of target box
      ctx.strokeStyle = "#0EA5E9"
      ctx.lineWidth = 4

      // Top-Left corner
      ctx.beginPath()
      ctx.moveTo(170, 120)
      ctx.lineTo(170, 90)
      ctx.lineTo(200, 90)
      ctx.stroke()

      // Top-Right corner
      ctx.beginPath()
      ctx.moveTo(470, 120)
      ctx.lineTo(470, 90)
      ctx.lineTo(440, 90)
      ctx.stroke()

      // Bottom-Left corner
      ctx.beginPath()
      ctx.moveTo(170, 360)
      ctx.lineTo(170, 390)
      ctx.lineTo(200, 390)
      ctx.stroke()

      // Bottom-Right corner
      ctx.beginPath()
      ctx.moveTo(470, 360)
      ctx.lineTo(470, 390)
      ctx.lineTo(440, 390)
      ctx.stroke()

      if (mockImageRef.current) {
        // Draw the uploaded face image inside scanner target
        ctx.drawImage(mockImageRef.current, 175, 95, 290, 290)
      } else {
        // Draw standard face mock silhouette/graphic
        ctx.fillStyle = "rgba(14, 165, 233, 0.05)"
        ctx.fillRect(175, 95, 290, 290)

        ctx.fillStyle = "#64748B"
        ctx.font = "13px sans-serif"
        ctx.textAlign = "center"
        ctx.fillText("Chưa tải ảnh test", 320, 230)
        ctx.fillText("(Bấm 'Chọn ảnh test' bên dưới)", 320, 255)
      }

      // Scanning line animation
      const scanY = 90 + ((Math.sin(angle) + 1) / 2) * 300
      ctx.strokeStyle = "#22C55E"
      ctx.shadowColor = "#22C55E"
      ctx.shadowBlur = 10
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(170, scanY)
      ctx.lineTo(470, scanY)
      ctx.stroke()
      ctx.shadowBlur = 0 // reset shadow

      // UI info texts
      ctx.fillStyle = "#0EA5E9"
      ctx.font = "bold 15px monospace"
      ctx.textAlign = "left"
      ctx.fillText("SYSTEM: WEBRTC SIMULATOR FEED", 30, 40)

      ctx.fillStyle = "#94A3B8"
      ctx.font = "11px monospace"
      ctx.fillText(`STATUS: TRANSMITTING [FPS: 10]`, 30, 60)
      ctx.fillText(`TARGET ROOM ID: ${maBuoiHoc}`, 30, 75)
      ctx.fillText(`SYSTEM TIME: ${new Date().toLocaleTimeString()}`, 30, 450)

      // Draw crosshairs
      ctx.strokeStyle = "rgba(239, 68, 68, 0.4)"
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(320, 220)
      ctx.lineTo(320, 260)
      ctx.moveTo(300, 240)
      ctx.lineTo(340, 240)
      ctx.stroke()

      angle += 0.04
      animationFrameIdRef.current = requestAnimationFrame(draw)
    }

    draw()

    // Capture stream at 10 fps
    const c = canvas as any
    if (c.captureStream) return c.captureStream(10)
    if (c.mozCaptureStream) return c.mozCaptureStream(10)
    return new MediaStream()
  }

  const stopStream = () => {
    setLoading(true)
    try {
      if (staleTimerRef.current) {
        clearTimeout(staleTimerRef.current)
        staleTimerRef.current = null
      }

      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current)
        animationFrameIdRef.current = null
      }

      if (dataChannelRef.current) {
        try {
          dataChannelRef.current.close()
        } catch (e) {}
        dataChannelRef.current = null
      }

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop())
        localStreamRef.current = null
      }

      if (pcRef.current) {
        // close transceivers
        if (pcRef.current.getTransceivers) {
          pcRef.current.getTransceivers().forEach((transceiver) => {
            if (transceiver.stop) transceiver.stop()
          })
        }
        // close senders
        pcRef.current.getSenders().forEach((sender) => {
          if (sender.track) sender.track.stop()
        })

        pcRef.current.close()
        pcRef.current = null
      }

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null
      }

      drawOverlay([])
      setFacesCount(0)
      setStreamActive(false)
      setIceConnectionState("closed")
      setIceGatheringState("complete")
      setSignalingState("closed")
      if (onConnectionStateChange) onConnectionStateChange("closed")
    } catch (err: any) {
      console.error("Lỗi khi ngắt kết nối WebRTC:", err)
    } finally {
      setLoading(false)
    }
  }

  const startStream = async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      const config = {
        sdpSemantics: "unified-plan",
      } as RTCConfiguration

      if (useStun) {
        config.iceServers = [{ urls: ["stun:stun.l.google.com:19302"] }]
      }

      const pc = new RTCPeerConnection(config)
      pcRef.current = pc

      // Proactively create DataChannel with label "faces" before createOffer
      const dc = pc.createDataChannel("faces", { ordered: false })
      dataChannelRef.current = dc
      setupDataChannel(dc)

      // Listen on pc.ondatachannel
      pc.ondatachannel = (event) => {
        setupDataChannel(event.channel)
      }

      // Listeners
      pc.addEventListener("icegatheringstatechange", () => {
        setIceGatheringState(pc.iceGatheringState)
      })
      pc.addEventListener("iceconnectionstatechange", () => {
        setIceConnectionState(pc.iceConnectionState)
        if (onConnectionStateChange) onConnectionStateChange(pc.iceConnectionState)
      })
      pc.addEventListener("signalingstatechange", () => {
        setSignalingState(pc.signalingState)
      })

      // Get Media
      let stream: MediaStream
      if (videoSource === "camera") {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 10 },
          },
        })
      } else {
        stream = startMockStream()
      }
      localStreamRef.current = stream

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
      }

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream)
      })

      // Create Offer
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      // Wait for ICE gathering to complete
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === "complete") {
          resolve()
        } else {
          const checkState = () => {
            if (pc.iceGatheringState === "complete") {
              pc.removeEventListener("icegatheringstatechange", checkState)
              resolve()
            }
          }
          pc.addEventListener("icegatheringstatechange", checkState)
        }
      })

      const localDesc = pc.localDescription
      if (!localDesc) throw new Error("Không thể khởi tạo mô tả SDP cục bộ")

      let sdp = localDesc.sdp
      if (selectedCodec !== "default") {
        sdp = sdpFilterCodec("video", selectedCodec, sdp)
      }

      // Post offer to backend
      const response = await apiClient.post<any>("/webrtc/offers", {
        sdp: sdp,
        type: localDesc.type,
        class_session_id: maBuoiHoc,
      })

      if (!response || !response.sdp || !response.type) {
        throw new Error("Phản hồi SDP không hợp lệ từ máy chủ WebRTC")
      }

      // Set Remote Description
      const normalizedSdp = response.sdp.replace(/\r?\n/g, "\r\n").trim() + "\r\n"
      await pc.setRemoteDescription({
        type: response.type.toLowerCase(),
        sdp: normalizedSdp,
      })

      setStreamActive(true)
    } catch (err: any) {
      console.error("Lỗi khi kết nối WebRTC:", err)
      setErrorMsg(err.message || "Không thể kết nối luồng camera WebRTC")
      stopStream()
    } finally {
      setLoading(false)
    }
  }

  // Attach the stream after React mounts the video element.
  useEffect(() => {
    const video = localVideoRef.current
    if (streamActive && video && localStreamRef.current) {
      video.srcObject = localStreamRef.current
      video.play().catch(() => setErrorMsg("Không thể phát camera. Vui lòng bật lại camera."))
    }
  }, [streamActive])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (staleTimerRef.current) {
        clearTimeout(staleTimerRef.current)
      }
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current)
      }
      if (dataChannelRef.current) {
        try {
          dataChannelRef.current.close()
        } catch (e) {}
      }
      if (localStreamRef.current || pcRef.current) {
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((t) => t.stop())
        }
        if (pcRef.current) {
          pcRef.current.close()
        }
      }
    }
  }, [])

  return (
    <div className="flex flex-col h-full w-full bg-[#0D1117] rounded-xl overflow-hidden border border-[#2D3748] relative">
      {/* Video stream container with Canvas Overlay */}
      <div className="flex-1 relative bg-[#070A0F] flex items-center justify-center overflow-hidden min-h-[220px]">
        {streamActive ? (
          <>
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={cn(
                "w-full h-full object-cover",
                mirrorVideo && videoSource === "camera" && "transform -scale-x-100"
              )}
            />
            {/* Transparent Canvas Overlay for Bounding Boxes */}
            <canvas
              ref={overlayCanvasRef}
              className="absolute inset-0 w-full h-full pointer-events-none z-10"
            />
          </>
        ) : (
          <div className="text-center p-6 space-y-3 z-10">
            <div className="w-16 h-16 rounded-full bg-[#1A2536] flex items-center justify-center mx-auto text-[#64748B]">
              <VideoOff className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-gray-300">Camera lớp học chưa bật</p>
              <p className="text-xs text-[#64748B] max-w-[240px] mx-auto">
                Bật camera để bắt đầu truyền luồng video điểm danh tự động bằng AI
              </p>
            </div>
          </div>
        )}

        {/* Real-time Detections Count Badge */}
        {streamActive && (
          <div className="absolute top-3 right-3 bg-[#0D1117]/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-[#2D3748] flex items-center gap-2 text-xs z-20">
            <span className="w-2 h-2 rounded-full bg-[#0EA5E9] animate-pulse" />
            <span className="font-mono text-[#94A3B8]">
              {facesCount > 0 ? `${facesCount} khuôn mặt` : "Đang quét..."}
            </span>
          </div>
        )}

        {/* Connection status overlay */}
        {streamActive && (
          <div className="absolute top-3 left-3 bg-[#0D1117]/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-[#2D3748] flex items-center gap-2 text-xs z-20">
            <span
              className={cn(
                "w-2 h-2 rounded-full",
                iceConnectionState === "connected" || iceConnectionState === "completed"
                  ? "bg-[#22C55E]"
                  : iceConnectionState === "checking"
                  ? "bg-[#F59E0B] animate-pulse"
                  : "bg-[#EF4444]"
              )}
            />
            <span className="font-mono text-[#94A3B8]">
              {iceConnectionState === "connected" || iceConnectionState === "completed"
                ? "Đã kết nối AI"
                : iceConnectionState === "checking"
                ? "Đang xác thực..."
                : "Chưa kết nối"}
            </span>
          </div>
        )}

        {/* Error overlay */}
        {errorMsg && (
          <div className="absolute inset-0 bg-[#070A0F]/95 flex flex-col items-center justify-center p-6 text-center space-y-3 z-20">
            <ShieldAlert className="w-12 h-12 text-[#EF4444]" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-white">Lỗi kết nối WebRTC</p>
              <p className="text-xs text-[#EF4444]/90 max-w-[280px]">{errorMsg}</p>
            </div>
            <Button
              size="sm"
              onClick={() => setErrorMsg(null)}
              className="bg-[#1F2937] hover:bg-[#374151] text-xs"
            >
              Đóng thông báo
            </Button>
          </div>
        )}
      </div>

      {/* Control panel */}
      <div className="p-3 border-t border-[#2D3748] bg-[#161B22] space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[#64748B] text-xs">
            <Cpu className="w-4 h-4 text-[#0EA5E9]" />
            <span>
              Mạng weekday thập: <strong className="text-gray-300">{iceGatheringState}</strong>
            </span>
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={loading}
              onClick={streamActive ? stopStream : startStream}
              className={cn(
                "h-9 font-medium px-4 text-xs shrink-0 rounded-lg",
                streamActive
                  ? "bg-[#EF4444] hover:bg-[#DC2626] text-white"
                  : "bg-[#0EA5E9] hover:bg-[#0284C7] text-white"
              )}
            >
              {loading ? (
                <span className="flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Đang thiết lập...
                </span>
              ) : streamActive ? (
                <span className="flex items-center gap-1.5">
                  <VideoOff className="w-3.5 h-3.5" /> Tắt camera lớp
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <Video className="w-3.5 h-3.5" /> Bật camera lớp
                </span>
              )}
            </Button>
          </div>
        </div>

        {/* Video Source Selection & Mirror Toggle */}
        <div className="flex flex-col gap-2 pt-2 border-t border-[#2D3748]/50 text-[10px] space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[#64748B]">Nguồn camera:</span>
            <div className="flex items-center gap-2">
              {videoSource === "camera" && (
                <label className="flex items-center gap-1 text-[#64748B] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mirrorVideo}
                    onChange={(e) => setMirrorVideo(e.target.checked)}
                    className="rounded bg-[#0D1117] border-[#2D3748] text-[#0EA5E9]"
                  />
                  <span>Lật gương</span>
                </label>
              )}
              <select
                value={videoSource}
                onChange={(e) => setVideoSource(e.target.value as any)}
                disabled={streamActive}
                className="bg-[#0D1117] border border-[#2D3748] rounded px-1.5 py-0.5 text-[10px] text-gray-300 focus:outline-none focus:border-[#0EA5E9] cursor-pointer"
              >
                <option value="camera">Webcam thực tế</option>
                <option value="mock">Mô phỏng AI (Chọn ảnh)</option>
              </select>
            </div>
          </div>

          {videoSource === "mock" && (
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-[#64748B]">Ảnh khuôn mặt test:</span>
              <div className="flex items-center gap-1.5 overflow-hidden">
                {uploadedFileName && (
                  <span className="text-gray-400 max-w-[90px] truncate" title={uploadedFileName}>
                    {uploadedFileName}
                  </span>
                )}
                <label className="cursor-pointer bg-[#1A2536] hover:bg-[#24334a] border border-[#2D3748] px-2 py-0.5 rounded text-[10px] text-gray-300 font-medium whitespace-nowrap">
                  <span>Chọn ảnh test</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    disabled={streamActive}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Hidden Canvas used for generating WebRTC Mock simulator stream */}
        <canvas ref={mockCanvasRef} style={{ display: "none" }} />

        {/* Hidden settings collapsible */}
        <div className="flex items-center justify-between gap-3 text-[10px] text-[#64748B] pt-2 border-t border-[#2D3748]/50">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={useStun}
              onChange={(e) => setUseStun(e.target.checked)}
              disabled={streamActive}
              className="rounded bg-[#0D1117] border-[#2D3748] text-[#0EA5E9] focus:ring-[#0EA5E9]"
            />
            <span>Sử dụng STUN (Google)</span>
          </label>

          <div className="flex items-center gap-1.5">
            <span>Codec:</span>
            <select
              value={selectedCodec}
              onChange={(e) => setSelectedCodec(e.target.value)}
              disabled={streamActive}
              className="bg-[#0D1117] border border-[#2D3748] rounded px-1.5 py-0.5 text-[10px] text-gray-300 focus:outline-none focus:border-[#0EA5E9]"
            >
              <option value="default">Mặc định</option>
              <option value="H264/90000">H264</option>
              <option value="VP8/90000">VP8</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  )
}
