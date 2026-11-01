"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { StatusBadge, ConfidenceBadge } from "@/components/status-badge"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Play,
  Square,
  Settings,
  Clock,
  Users,
  Pencil,
  CheckCircle2,
  User,
  Video,
  VideoOff,
  Loader2,
  AlertCircle,
  ArrowLeft
} from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { apiClient } from "@/lib/api-client"
import { LecturerService } from "@/services/lecturer.service"
import { WebRTCStream } from "@/components/webrtc-stream"

type StudentStatus = "present" | "late" | "absent" | "pending"

interface StudentTile {
  id: string
  name: string
  studentId: string
  status: StudentStatus
  confidence: "high" | "medium" | "low"
  hasCamera: boolean
  verifiedAt?: string
}

export default function LecturerLiveClassroom() {
  const params = useParams()
  const router = useRouter()
  const maBuoiHoc = parseInt(params?.id as string)

  const [sessionActive, setSessionActive] = useState(false)
  const [sessionTime, setSessionTime] = useState(0)
  const [lateMinutes, setLateMinutes] = useState(15)
  const [checkCount, setCheckCount] = useState(4)
  const [editingStudent, setEditingStudent] = useState<string | null>(null)
  const [students, setStudents] = useState<StudentTile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [className, setClassName] = useState("Lớp học phần")
  const [sessionNum, setSessionNum] = useState(1)

  const loadSessionData = async () => {
    if (!maBuoiHoc) return
    setLoading(true)
    setError(null)
    try {
      const buoiHoc = await apiClient.get<any>(`/class-sessions/${maBuoiHoc}`)
      setLateMinutes(buoiHoc.late_grace_minutes || 15)
      setSessionNum(buoiHoc.session_number || 1)
      setSessionActive(buoiHoc.status === "DANG_DIEN_RA")
      setClassName(buoiHoc.course_name || `Lớp học phần ${buoiHoc.class_section_id}`)

      const attList = await LecturerService.getLiveAttendance(maBuoiHoc)
      setStudents(attList)
    } catch (err: any) {
      console.error(err)
      setError("Không thể tải thông tin phiên điểm danh.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSessionData()
  }, [maBuoiHoc])

  // Session timer
  useEffect(() => {
    if (!sessionActive) return
    const timer = setInterval(() => {
      setSessionTime((prev) => prev + 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [sessionActive])

  // Active real-time polling of student recognition statuses
  useEffect(() => {
    let interval: NodeJS.Timeout
    if (maBuoiHoc) {
      // Fetch immediately on mount or status change
      LecturerService.getLiveAttendance(maBuoiHoc)
        .then(data => setStudents(data))
        .catch(err => console.error("Lỗi cập nhật danh sách điểm danh:", err))

      interval = setInterval(() => {
        LecturerService.getLiveAttendance(maBuoiHoc)
          .then(data => setStudents(data))
          .catch(err => console.error("Lỗi cập nhật danh sách điểm danh:", err))
      }, 2500)
    }
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [maBuoiHoc, sessionActive])

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  const stats = {
    present: students.filter(s => s.status === "present").length,
    late: students.filter(s => s.status === "late").length,
    absent: students.filter(s => s.status === "absent").length,
    pending: students.filter(s => s.status === "pending").length,
    total: students.length
  }

  const handleStartSession = async () => {
    if (!maBuoiHoc) return
    try {
      try {
        await apiClient.patch(`/class-sessions/${maBuoiHoc}`, { late_grace_minutes: lateMinutes })
      } catch (e) {
        console.warn("Could not patch late_grace_minutes:", e)
      }
      await LecturerService.moDiemDanh(maBuoiHoc)
      setSessionActive(true)
      setSessionTime(0)
      const attList = await LecturerService.getLiveAttendance(maBuoiHoc)
      setStudents(attList)
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || "Lỗi khi mở phiên điểm danh."
      alert(`Lỗi: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`)
    }
  }

  const handleEndSession = async () => {
    if (!maBuoiHoc) return
    if (!confirm("Bạn có chắc chắn muốn kết thúc buổi học và chốt điểm danh?")) return
    try {
      await LecturerService.dongDiemDanh(maBuoiHoc)
      setSessionActive(false)
      const attList = await LecturerService.getLiveAttendance(maBuoiHoc)
      setStudents(attList)
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || "Lỗi khi đóng phiên điểm danh."
      alert(`Lỗi: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`)
    }
  }

  const handleStatusChange = async (studentId: string, newStatus: StudentStatus) => {
    if (!maBuoiHoc) return
    try {
      const studentDbId = parseInt(studentId)
      await LecturerService.updateAttendanceManual(maBuoiHoc, studentDbId, newStatus as any)

      setStudents(prev => prev.map(s =>
        s.id === studentId ? { ...s, status: newStatus, verifiedAt: new Date().toLocaleTimeString("vi-VN") } : s
      ))
      setEditingStudent(null)
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || "Không thể cập nhật điểm danh."
      alert(`Lỗi: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0D1117] text-white flex items-center justify-center flex-col">
        <Loader2 className="w-10 h-10 text-[#0EA5E9] animate-spin mb-4" />
        <p className="text-gray-400 font-medium">Đang tải dữ liệu lớp học trực tuyến...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0D1117] text-white flex items-center justify-center flex-col p-6">
        <AlertCircle className="w-16 h-16 text-[#EF4444] mb-4" />
        <h2 className="text-xl font-bold mb-2">Đã xảy ra lỗi</h2>
        <p className="text-gray-400 max-w-md text-center mb-6">{error}</p>
        <Button onClick={loadSessionData} className="bg-[#0EA5E9] text-white hover:bg-[#0EA5E9]/80">
          Thử lại
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0D1117] text-white flex">
      {/* Main Grid Area */}
      <div className="flex-1 flex flex-col p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold">{className}</h1>
            <span className="px-3 py-1 bg-[#22C55E]/20 text-[#22C55E] rounded-full text-sm font-medium">
              Buổi {sessionNum}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {sessionActive && (
              <div className="flex items-center gap-2 text-[#0EA5E9] bg-[#161B22] px-3 py-1.5 rounded-lg border border-[#30363D]">
                <div className="w-2 h-2 rounded-full bg-[#22C55E] animate-pulse" />
                <Clock className="w-4 h-4" />
                <span className="font-mono">{formatTime(sessionTime)}</span>
              </div>
            )}
            <Button
              variant="outline"
              onClick={() => router.push("/lecturer/live")}
              className="border-[#30363D] bg-[#161B22] text-[#C9D1D9] hover:bg-[#21262D] hover:text-white"
            >
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              Rời phòng
            </Button>
          </div>
        </div>

        {/* Student Grid */}
        <div className="flex-1 grid grid-cols-4 gap-3 overflow-y-auto">
          {students.map((student) => (
            <div
              key={student.id}
              className={cn(
                "relative rounded-lg overflow-hidden bg-[#161B22] border-2 aspect-video",
                student.status === "present" && "border-[#22C55E]",
                student.status === "late" && "border-[#F59E0B]",
                student.status === "absent" && "border-[#EF4444]",
                student.status === "pending" && "border-[#0EA5E9]"
              )}
            >
              {/* Video / Placeholder */}
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#1A3A5C] to-[#0A2540]">
                {student.hasCamera ? (
                  <User className="w-12 h-12 text-white/30" />
                ) : (
                  <div className="text-center">
                    <VideoOff className="w-8 h-8 text-[#64748B] mx-auto" />
                    <p className="text-xs text-[#64748B] mt-1">Không có camera</p>
                  </div>
                )}
              </div>

              {/* Status badge */}
              <div className={cn(
                "absolute top-2 right-2 w-3 h-3 rounded-full",
                student.status === "present" && "bg-[#22C55E]",
                student.status === "late" && "bg-[#F59E0B]",
                student.status === "absent" && "bg-[#EF4444]",
                student.status === "pending" && "bg-[#0EA5E9] animate-pulse"
              )} />

              {/* Name overlay */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium truncate">{student.name}</p>
                    <p className="text-xs text-[#94A3B8]">{student.studentId}</p>
                  </div>
                  <button
                    onClick={() => setEditingStudent(student.id)}
                    className="p-1 hover:bg-white/10 rounded"
                  >
                    <Pencil className="w-3 h-3 text-[#94A3B8]" />
                  </button>
                </div>
              </div>

              {/* Edit overlay */}
              {editingStudent === student.id && (
                <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center p-2 gap-2">
                  <p className="text-sm font-medium mb-2">Sửa trạng thái</p>
                  {(["present", "late", "absent"] as StudentStatus[]).map((status) => (
                    <button
                      key={status}
                      onClick={() => handleStatusChange(student.id, status)}
                      className={cn(
                        "w-full py-1.5 rounded text-xs font-medium",
                        status === "present" && "bg-[#22C55E] text-white",
                        status === "late" && "bg-[#F59E0B] text-white",
                        status === "absent" && "bg-[#EF4444] text-white"
                      )}
                    >
                      {status === "present" ? "Có mặt" : status === "late" ? "Muộn" : "Vắng"}
                    </button>
                  ))}
                  <button
                    onClick={() => setEditingStudent(null)}
                    className="text-xs text-[#64748B] mt-1"
                  >
                    Hủy
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Right Sidebar - Command Center */}
      <div className="w-[32%] bg-[#161B22] border-l border-[#2D3748] flex flex-col overflow-y-auto">
        {/* Camera Nhận Diện Lớp Học WebRTC */}
        {sessionActive && (
          <div className="p-4 border-b border-[#2D3748] shrink-0">
            <h3 className="text-sm font-medium text-[#94A3B8] mb-3">Camera nhận diện lớp học (AI)</h3>
            <div className="min-h-[360px]">
              <WebRTCStream maBuoiHoc={maBuoiHoc} />
            </div>
          </div>
        )}

        {/* Attendance Summary */}
        <div className="p-4 border-b border-[#2D3748]">
          <h3 className="text-sm font-medium text-[#94A3B8] mb-4">Thống kê điểm danh</h3>

          {/* Donut Chart Placeholder */}
          <div className="flex items-center gap-4 mb-4">
            <div className="relative w-24 h-24">
              <svg className="w-full h-full" viewBox="0 0 36 36">
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="#2D3748"
                  strokeWidth="3"
                />
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="#22C55E"
                  strokeWidth="3"
                  strokeDasharray={`${(stats.present / stats.total) * 100}, 100`}
                />
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="#F59E0B"
                  strokeWidth="3"
                  strokeDasharray={`${(stats.late / stats.total) * 100}, 100`}
                  strokeDashoffset={`-${(stats.present / stats.total) * 100}`}
                />
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="#EF4444"
                  strokeWidth="3"
                  strokeDasharray={`${(stats.absent / stats.total) * 100}, 100`}
                  strokeDashoffset={`-${((stats.present + stats.late) / stats.total) * 100}`}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-lg font-bold">{stats.total}</span>
              </div>
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#22C55E]" />
                  <span className="text-sm text-[#94A3B8]">Có mặt</span>
                </div>
                <span className="font-medium">{stats.present}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#F59E0B]" />
                  <span className="text-sm text-[#94A3B8]">Muộn</span>
                </div>
                <span className="font-medium">{stats.late}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#EF4444]" />
                  <span className="text-sm text-[#94A3B8]">Vắng</span>
                </div>
                <span className="font-medium">{stats.absent}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Session Controls */}
        <div className="p-4 border-b border-[#2D3748] space-y-3">
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-2 h-2 rounded-full",
              sessionActive ? "bg-[#22C55E] animate-pulse" : "bg-[#64748B]"
            )} />
            <span className="text-sm font-medium">
              {sessionActive ? `Đang điểm danh — Buổi ${sessionNum}` : "Chưa bắt đầu"}
            </span>
          </div>

          {!sessionActive ? (
            <Button
              className="w-full bg-[#22C55E] hover:bg-[#22C55E]/80 text-white"
              onClick={handleStartSession}
            >
              <Play className="w-4 h-4 mr-2" />
              Bắt đầu phiên điểm danh
            </Button>
          ) : (
            <Button
              className="w-full bg-[#EF4444] hover:bg-[#EF4444]/80 text-white"
              onClick={handleEndSession}
            >
              <Square className="w-4 h-4 mr-2" />
              Kết thúc buổi học
            </Button>
          )}

          {/* Settings */}
          <div className="pt-3 border-t border-[#2D3748] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#94A3B8] flex items-center gap-1">
                {sessionActive && <span className="text-xs text-[#F59E0B]">🔒</span>}
                Phút muộn tối đa:
              </span>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={lateMinutes}
                  disabled={sessionActive}
                  onChange={(e) => setLateMinutes(Number(e.target.value))}
                  className={cn(
                    "w-16 h-8 bg-[#0D1117] border-[#2D3748] text-center font-bold",
                    sessionActive && "opacity-60 cursor-not-allowed bg-[#161B22] text-[#94A3B8]"
                  )}
                />
                <span className="text-sm text-[#64748B]">phút</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#94A3B8] flex items-center gap-1">
                {sessionActive && <span className="text-xs text-[#F59E0B]">🔒</span>}
                Số lần kiểm tra:
              </span>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={checkCount}
                  disabled={sessionActive}
                  onChange={(e) => setCheckCount(Number(e.target.value))}
                  className={cn(
                    "w-16 h-8 bg-[#0D1117] border-[#2D3748] text-center font-bold",
                    sessionActive && "opacity-60 cursor-not-allowed bg-[#161B22] text-[#94A3B8]"
                  )}
                  min={1}
                  max={10}
                />
                <span className="text-sm text-[#64748B]">lần</span>
              </div>
            </div>
            {sessionActive && (
              <p className="text-[11px] text-[#F59E0B] italic text-right mt-1">
                🔒 Đã khóa cấu hình trong thời gian mở điểm danh.
              </p>
            )}
          </div>
        </div>

        {/* Live Recognition Feed */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="p-4 pb-2">
            <h3 className="text-sm font-medium text-[#94A3B8]">
              Nhật ký nhận diện
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
            {students
              .filter(s => s.status !== "absent" || s.verifiedAt)
              .sort((a, b) => (b.verifiedAt || "").localeCompare(a.verifiedAt || ""))
              .map((student) => (
                <div
                  key={student.id}
                  className="flex items-center gap-3 p-2 bg-[#0D1117] rounded-lg"
                >
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className="bg-[#1A3A5C] text-white text-xs">
                      {student.name.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{student.name}</p>
                    <p className="text-xs text-[#64748B]">{student.studentId}</p>
                  </div>
                  <ConfidenceBadge level={student.confidence} />
                  <StatusBadge status={student.status} showIcon={false} />
                  <button
                    onClick={() => setEditingStudent(student.id)}
                    className="p-1 hover:bg-white/10 rounded"
                  >
                    <Pencil className="w-3 h-3 text-[#64748B]" />
                  </button>
                </div>
              ))}
          </div>
        </div>

        {/* Footer Stats */}
        <div className="p-4 border-t border-[#2D3748] text-sm text-[#64748B]">
          <div className="flex items-center justify-between">
            <span>Tổng sĩ số: {stats.total}</span>
            <span>Đã nhận diện: {stats.present + stats.late}</span>
            <span>Chưa nhận diện: {stats.absent + stats.pending}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
