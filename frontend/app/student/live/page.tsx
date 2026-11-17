"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Hand,
  MessageSquare,
  LogOut,
  Clock,
  BookOpen,
  User,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  RefreshCw
} from "lucide-react"

import { StudentService } from "@/services/student.service"
import { apiClient } from "@/lib/api-client"

type VerificationStatus = "verified" | "pending" | "failed"

export default function StudentLiveClassroom() {
  const [micEnabled, setMicEnabled] = useState(true)
  const [cameraEnabled, setCameraEnabled] = useState(true)
  const [handRaised, setHandRaised] = useState(false)
  const [sessionTime, setSessionTime] = useState(0)
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>("pending")
  const [confidence, setConfidence] = useState(0)
  const [showAntiSpoof, setShowAntiSpoof] = useState(false)
  const router = useRouter()

  const videoRef = useRef<HTMLVideoElement>(null)

  // Real session states
  const [maBuoiHoc, setMaBuoiHoc] = useState<number | null>(null)
  const [subjectName, setSubjectName] = useState("CS101 - Lập trình Web")
  const [sessionNum, setSessionNum] = useState(8)
  const [lecturerName, setLecturerName] = useState("Nguyễn Văn B")
  const [isSessionActive, setIsSessionActive] = useState(true)
  const [apiError, setApiError] = useState<string | null>(null)
  const [lastVerifiedTime, setLastVerifiedTime] = useState<string | null>(null)
  const [isManualScanning, setIsManualScanning] = useState(false)
  const isVerifiedRef = useRef(false)
  const lastVerifiedEpochRef = useRef(0)
  const isVerifyingRef = useRef(false)

  useEffect(() => {
    isVerifiedRef.current = verificationStatus === "verified"
  }, [verificationStatus])

  useEffect(() => {
    let disposed = false
    const params = new URLSearchParams(window.location.search)
    const idVal = params.get("id")
    const sessionId = idVal ? parseInt(idVal) : null

    if (sessionId) {
      setMaBuoiHoc(sessionId)

      apiClient.get<any>(`/class-sessions/${sessionId}`)
        .then((buoiHoc) => {
          if (disposed) return
          setSessionNum(buoiHoc.session_number || 1)
          const active = buoiHoc.status === "DANG_DIEN_RA"
          setIsSessionActive(active)
          setSubjectName(buoiHoc.course_name || "Lớp học phần")
          setLecturerName(buoiHoc.lecturer_name || "Giảng viên")

          if (!active) {
            setApiError("Phiên điểm danh chưa được mở hoặc đã kết thúc")
            setVerificationStatus("failed")
          }
        })
        .catch((err) => {
          if (disposed) return
          console.error("Lỗi tải thông tin buổi học:", err)
          setApiError("Không thể tải thông tin buổi học thực tế")
          setVerificationStatus("failed")
        })
    }

    const syncActiveSession = async () => {
      const syncStartedAt = Date.now()
      try {
        const [schedule, attendanceList] = await Promise.all([
          StudentService.getSchedule(),
          StudentService.getAttendance().catch(() => null),
        ])
        if (disposed) return
        const current = sessionId
          ? schedule.find((s) => String(s.class_session_id) === String(sessionId))
          : undefined

        if (current) {
          if (current.session_number) setSessionNum(current.session_number)
          if (current.course_name) setSubjectName(current.course_name)
        }

        if (!current || current.status !== "DANG_DIEN_RA") {
          const activeSession = schedule.find((s) => s.status === "DANG_DIEN_RA")
          if (activeSession && String(activeSession.class_session_id) !== String(sessionId ?? "")) {
            window.location.replace(`/student/live?id=${activeSession.class_session_id}`)
            return
          } else if (current && current.status !== "DANG_DIEN_RA") {
            setIsSessionActive(false)
            setApiError("Phiên điểm danh chưa được mở hoặc đã kết thúc")
            setVerificationStatus("failed")
            return
          }
        }

        if (
          sessionId &&
          Array.isArray(attendanceList) &&
          isVerifiedRef.current &&
          syncStartedAt > lastVerifiedEpochRef.current + 1500
        ) {
          const hasValidRecord = attendanceList.some(
            (item) =>
              String(item.class_session_id) === String(sessionId) &&
              ["CO_MAT", "PRESENT", "DI_MUON", "MUON", "LATE"].includes(item.status)
          )
          if (!hasValidRecord) {
            isVerifiedRef.current = false
            setVerificationStatus("pending")
            setConfidence(0)
            setLastVerifiedTime(null)
            setApiError(null)
          }
        }
      } catch (err) {
        console.error("Lỗi đồng bộ buổi học đang mở:", err)
      }
    }

    syncActiveSession()
    const syncTimer = setInterval(syncActiveSession, 5000)
    return () => {
      disposed = true
      clearInterval(syncTimer)
    }
  }, [])

  // Handle Camera Stream
  useEffect(() => {
    let stream: MediaStream | null = null;

    const setupCamera = async () => {
      if (cameraEnabled) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true })
          if (videoRef.current) {
            videoRef.current.srcObject = stream
          }
        } catch (err) {
          console.error("Lỗi khi truy cập camera:", err)
        }
      }
    }

    setupCamera()

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop())
      }
    }
  }, [cameraEnabled])

  // Session timer
  useEffect(() => {
    const timer = setInterval(() => {
      setSessionTime((prev) => prev + 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // Capture a frame from video
  const captureFrame = async (): Promise<Blob | null> => {
    if (!videoRef.current || videoRef.current.readyState !== videoRef.current.HAVE_ENOUGH_DATA) return null;
    const canvas = document.createElement("canvas");
    // Use 640x480 resolution for better face detection accuracy
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.9);
    });
  };

  const verifyNow = useCallback(async (manual = false) => {
    if (!cameraEnabled || (maBuoiHoc && !isSessionActive) || isVerifyingRef.current) return;
    const blob = await captureFrame();
    if (!blob) return;

    isVerifyingRef.current = true;
    if (manual) setIsManualScanning(true);
    try {
      const result = await StudentService.verifyFace(blob, maBuoiHoc || undefined);
      if (result.verified) {
        isVerifiedRef.current = true;
        lastVerifiedEpochRef.current = Date.now();
        setConfidence(result.confidence);
        setVerificationStatus("verified");
        setLastVerifiedTime(new Date().toLocaleTimeString("vi-VN"));
        setApiError(result.message || null);
      } else {
        isVerifiedRef.current = false;
        setConfidence(result.confidence || 0);
        setVerificationStatus("failed");
        setApiError(result.message || "Xác minh thất bại");
      }
    } finally {
      isVerifyingRef.current = false;
      if (manual) setIsManualScanning(false);
    }
  }, [cameraEnabled, maBuoiHoc, isSessionActive]);

  // Real AI verification loop
  useEffect(() => {
    if (!cameraEnabled) {
      isVerifiedRef.current = false;
      setVerificationStatus("pending");
      return;
    }
    if (maBuoiHoc && !isSessionActive) {
      isVerifiedRef.current = false;
      setVerificationStatus("failed");
      return;
    }
    if (verificationStatus === "verified") {
      return;
    }

    // Initial check after 2 seconds
    const initialTimer = setTimeout(() => {
      verifyNow(false);
    }, 2000);

    // Then check every 5 seconds while not verified
    const intervalId = setInterval(() => {
      verifyNow(false);
    }, 5000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(intervalId);
    };
  }, [cameraEnabled, maBuoiHoc, isSessionActive, verificationStatus, verifyNow]);

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  const checkpoints = [
    { time: "10:00", done: true },
    { time: "10:30", done: false, next: true },
    { time: "11:00", done: false },
    { time: "11:30", done: false }
  ]

  return (
    <div className="min-h-screen bg-[#0D1117] text-white flex">
      {/* Main Video Area */}
      <div className="flex-1 flex flex-col">
        {/* Top Overlay Bar */}
        <div className="absolute top-0 left-0 right-[27%] z-10 bg-gradient-to-b from-black/80 to-transparent p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-[#0EA5E9]" />
                <span className="font-semibold">{subjectName}</span>
              </div>
              <span className="text-[#64748B]">|</span>
              <span className="text-[#94A3B8]">Buổi {sessionNum}</span>
            </div>
            <div className="flex items-center gap-2 text-[#0EA5E9]">
              <div className="w-2 h-2 rounded-full bg-[#EF4444] animate-pulse" />
              <Clock className="w-4 h-4" />
              <span className="font-mono">{formatTime(sessionTime)}</span>
            </div>
          </div>
        </div>

        {/* Main Video */}
        <div className="flex-1 relative flex items-center justify-center bg-[#0D1117]">
          {/* Placeholder for shared screen/slides */}
          <div className="w-full h-full max-w-5xl max-h-[70vh] bg-[#161B22] rounded-lg flex items-center justify-center">
            <div className="text-center">
              <div className="w-32 h-32 mx-auto mb-4 bg-[#1A3A5C] rounded-lg flex items-center justify-center">
                <Video className="w-16 h-16 text-[#0EA5E9]" />
              </div>
              <p className="text-[#94A3B8]">Màn hình chia sẻ của giảng viên</p>
              <p className="text-sm text-[#64748B] mt-2">Bài giảng: Introduction to React.js</p>
            </div>
          </div>

          {/* Lecturer PiP */}
          <div className="absolute bottom-4 left-4 w-32 h-24 rounded-xl bg-[#1A3A5C] border-2 border-white/20 overflow-hidden">
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#0A2540] to-[#1A3A5C]">
              <User className="w-8 h-8 text-white/50" />
            </div>
            <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1">
              <p className="text-xs text-white truncate">GV: {lecturerName}</p>
            </div>
          </div>
        </div>

        {/* Bottom Control Toolbar */}
        <div className="p-4 flex justify-center">
          <div className="flex items-center gap-2 bg-[#161B22]/90 backdrop-blur-sm rounded-full px-4 py-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMicEnabled(!micEnabled)}
              className={cn(
                "rounded-full w-12 h-12",
                micEnabled ? "bg-[#1A3A5C] text-white hover:bg-[#1A3A5C]/80" : "bg-[#EF4444] text-white hover:bg-[#EF4444]/80"
              )}
            >
              {micEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCameraEnabled(!cameraEnabled)}
              className={cn(
                "rounded-full w-12 h-12",
                cameraEnabled ? "bg-[#1A3A5C] text-white hover:bg-[#1A3A5C]/80" : "bg-[#EF4444] text-white hover:bg-[#EF4444]/80"
              )}
            >
              {cameraEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setHandRaised(!handRaised)}
              className={cn(
                "rounded-full w-12 h-12",
                handRaised ? "bg-[#F59E0B] text-white hover:bg-[#F59E0B]/80" : "bg-[#1A3A5C] text-white hover:bg-[#1A3A5C]/80"
              )}
            >
              <Hand className="w-5 h-5" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="rounded-full w-12 h-12 bg-[#1A3A5C] text-white hover:bg-[#1A3A5C]/80"
            >
              <MessageSquare className="w-5 h-5" />
            </Button>

            <div className="w-px h-8 bg-[#2D3748] mx-2" />

            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push('/student')}
              title="Thoát phòng học"
              className="rounded-full w-12 h-12 bg-[#EF4444] text-white hover:bg-[#EF4444]/80"
            >
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>

      {/* AI Verification Sidebar */}
      <div className="w-[27%] bg-[#161B22] border-l border-[#2D3748] flex flex-col">
        {/* My Camera Preview */}
        <div className="p-4 border-b border-[#2D3748]">
          <h3 className="text-sm font-medium text-[#94A3B8] mb-3">Camera của bạn</h3>
          <div className="relative aspect-square rounded-lg overflow-hidden bg-[#0D1117]">
            {cameraEnabled ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover bg-[#1A3A5C]"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-[#0D1117]">
                <VideoOff className="w-12 h-12 text-[#64748B]" />
                <p className="text-sm text-[#64748B] absolute bottom-4">Camera đã tắt</p>
              </div>
            )}

            {/* Face tracking brackets */}
            {cameraEnabled && verificationStatus !== "failed" && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className={cn(
                  "w-32 h-40 border-2 rounded-lg",
                  verificationStatus === "verified" ? "border-[#22C55E]" : "border-[#0EA5E9]",
                  verificationStatus === "pending" && "animate-pulse"
                )}>
                  {/* Corner brackets */}
                  <div className={cn("absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 rounded-tl",
                    verificationStatus === "verified" ? "border-[#22C55E]" : "border-[#0EA5E9]")} />
                  <div className={cn("absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 rounded-tr",
                    verificationStatus === "verified" ? "border-[#22C55E]" : "border-[#0EA5E9]")} />
                  <div className={cn("absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 rounded-bl",
                    verificationStatus === "verified" ? "border-[#22C55E]" : "border-[#0EA5E9]")} />
                  <div className={cn("absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 rounded-br",
                    verificationStatus === "verified" ? "border-[#22C55E]" : "border-[#0EA5E9]")} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* AI Verification Status */}
        <div className="p-4 border-b border-[#2D3748] space-y-4">
          <h3 className="text-sm font-medium text-[#94A3B8]">Trạng thái xác thực AI</h3>

          {/* Anti-spoof Alert */}
          {showAntiSpoof && (
            <div className="p-3 bg-[#FEF9C3]/10 border border-[#F59E0B] rounded-lg animate-pulse">
              <div className="flex items-center gap-2 text-[#F59E0B]">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm font-medium">Kiểm tra chống giả mạo</span>
              </div>
              <p className="text-xs text-[#F59E0B]/80 mt-1">
                Hãy chớp mắt hoặc xoay đầu nhẹ để xác minh
              </p>
            </div>
          )}

          {/* Confidence Meter */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-[#94A3B8]">Độ khớp:</span>
              <span className={cn(
                "font-medium",
                confidence >= 85 ? "text-[#22C55E]" : confidence >= 70 ? "text-[#F59E0B]" : "text-[#EF4444]"
              )}>
                {confidence}%
              </span>
            </div>
            <div className="h-2 bg-[#0D1117] rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full transition-all duration-500",
                  confidence >= 85 ? "bg-gradient-to-r from-[#0A2540] to-[#22C55E]" :
                  confidence >= 70 ? "bg-gradient-to-r from-[#0A2540] to-[#F59E0B]" :
                  "bg-gradient-to-r from-[#0A2540] to-[#EF4444]"
                )}
                style={{ width: `${confidence}%` }}
              />
            </div>
          </div>

          {/* Status Badge */}
          <div className={cn(
            "p-4 rounded-lg text-center",
            verificationStatus === "verified" && "bg-[#22C55E]/10 border border-[#22C55E]",
            verificationStatus === "pending" && "bg-[#F59E0B]/10 border border-[#F59E0B]",
            verificationStatus === "failed" && "bg-[#EF4444]/10 border border-[#EF4444]"
          )}>
            {verificationStatus === "verified" && (
              <>
                <CheckCircle2 className="w-8 h-8 mx-auto text-[#22C55E] mb-2" />
                <p className="font-medium text-[#22C55E]">Đã xác minh - Có mặt</p>
              </>
            )}
            {verificationStatus === "pending" && (
              <>
                <Loader2 className="w-8 h-8 mx-auto text-[#F59E0B] mb-2 animate-spin" />
                <p className="font-medium text-[#F59E0B]">Đang nhận diện...</p>
              </>
            )}
            {verificationStatus === "failed" && (
              <>
                <AlertTriangle className="w-8 h-8 mx-auto text-[#EF4444] mb-2" />
                <p className="font-medium text-[#EF4444]">{apiError || "Xác minh thất bại"}</p>
              </>
            )}
          </div>

          {/* Last verified */}
          {verificationStatus === "verified" && lastVerifiedTime && (
            <p className="text-xs text-[#64748B] text-center">
              Xác minh lần cuối: {lastVerifiedTime}
            </p>
          )}

          <Button
            type="button"
            variant="outline"
            disabled={!cameraEnabled || !isSessionActive || isManualScanning}
            onClick={() => verifyNow(true)}
            className="w-full border-[#0EA5E9]/40 bg-[#0EA5E9]/10 text-[#0EA5E9] hover:bg-[#0EA5E9]/20 hover:text-[#38BDF8] text-xs font-semibold"
          >
            {isManualScanning ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            )}
            Quét khuôn mặt ngay (Test AI)
          </Button>
        </div>

        {/* Session Info */}
        <div className="p-4 border-b border-[#2D3748] space-y-3">
          <h3 className="text-sm font-medium text-[#94A3B8]">Thông tin buổi học</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[#64748B]">Môn học:</span>
              <span className="text-white">{subjectName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#64748B]">Buổi:</span>
              <span className="text-white">Buổi {sessionNum}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#64748B]">Giảng viên:</span>
              <span className="text-white">{lecturerName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#64748B]">Còn lại:</span>
              <span className="text-[#0EA5E9] font-mono">01:17:43</span>
            </div>
          </div>
        </div>

        {/* Check Schedule */}
        <div className="p-4 flex-1">
          <h3 className="text-sm font-medium text-[#94A3B8] mb-3">Lịch kiểm tra</h3>
          <div className="flex items-center justify-between gap-2">
            {checkpoints.map((cp, index) => (
              <div key={index} className="flex flex-col items-center">
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium",
                  cp.done ? "bg-[#22C55E] text-white" :
                  cp.next ? "bg-[#0EA5E9] text-white ring-2 ring-[#0EA5E9]/50" :
                  "bg-[#2D3748] text-[#64748B]"
                )}>
                  {cp.done ? "✓" : index + 1}
                </div>
                <span className="text-xs text-[#64748B] mt-1">{cp.time}</span>
                {index < checkpoints.length - 1 && (
                  <div className="absolute top-4 left-full w-full h-0.5 bg-[#2D3748]" />
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-[#64748B] mt-4 text-center">
            Bạn cần hiện diện đủ 4 lần kiểm tra để được tính có mặt.
          </p>
        </div>
      </div>
    </div>
  )
}
