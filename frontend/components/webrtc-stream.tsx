"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Video, VideoOff, ShieldAlert, Cpu } from "lucide-react"
import { apiClient } from "@/lib/api-client"

interface WebRTCStreamProps {
  maBuoiHoc: number
  onConnectionStateChange?: (state: string) => void
}

export function WebRTCStream({ maBuoiHoc, onConnectionStateChange }: WebRTCStreamProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)

  const [streamActive, setStreamActive] = useState(false)
  const [iceConnectionState, setIceConnectionState] = useState("new")
  const [iceGatheringState, setIceGatheringState] = useState("new")
  const [signalingState, setSignalingState] = useState("stable")
  const [useStun, setUseStun] = useState(true)
  const [selectedCodec, setSelectedCodec] = useState("default")
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

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
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current)
        animationFrameIdRef.current = null
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
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current)
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
      {/* Video stream container */}
      <div className="flex-1 relative bg-[#070A0F] flex items-center justify-center overflow-hidden min-h-[220px]">
        {streamActive ? (
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover transform -scale-x-100"
          />
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

        {/* Connection status overlay */}
        {streamActive && (
          <div className="absolute top-3 left-3 bg-[#0D1117]/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-[#2D3748] flex items-center gap-2 text-xs">
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
            <Button size="sm" onClick={() => setErrorMsg(null)} className="bg-[#1F2937] hover:bg-[#374151] text-xs">
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
            <span>Mạng weekday thập: <strong className="text-gray-300">{iceGatheringState}</strong></span>
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

        {/* Video Source Selection */}
        <div className="flex flex-col gap-2 pt-2 border-t border-[#2D3748]/50 text-[10px] space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[#64748B]">Nguồn camera:</span>
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
