"use client"

import { toast } from "sonner"
import { useEffect, useState } from "react"
import { AppShell } from "@/components/app-shell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import {
  CalendarCheck,
  AlertTriangle,
  TrendingUp,
  Search,
  Download,
  Upload,
  X,
  Clock,
  FileText,
  Loader2
} from "lucide-react"
import { cn } from "@/lib/utils"
import { StudentService } from "@/services/student.service"
import { StudentProfile } from "@/types/student"

type AttendanceStatus = "present" | "late" | "absent"

const methodLabels = {
  face: { label: "Khuôn mặt", bgClass: "bg-sky-50 text-sky-600 border border-sky-200/50" },
  manual: { label: "Thủ công", bgClass: "bg-slate-100 text-slate-600 border border-slate-200" },
  claim: { label: "Sau khiếu nại", bgClass: "bg-[#F3E8FF] text-[#7C3AED] border border-[#7C3AED]/15" }
}

export default function StudentHistory() {
  const [profile, setProfile] = useState<StudentProfile | null>(null)
  const [attendance, setAttendance] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [subjectFilter, setSubjectFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [searchTerm, setSearchTerm] = useState("")
  const [claimModalOpen, setClaimModalOpen] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<any | null>(null)
  const [claimReason, setClaimReason] = useState("")
  const [claimFile, setClaimFile] = useState<File | null>(null)
  const [submittingClaim, setSubmittingClaim] = useState(false)

  const [scheduleModalOpen, setScheduleModalOpen] = useState(false)
  const [selectedCourseName, setSelectedCourseName] = useState("")
  const [classSessionsList, setClassSessionsList] = useState<any[]>([])
  const [loadingSessions, setLoadingSessions] = useState(false)

  const handleViewFullSchedule = async (classSectionId: number, courseName: string) => {
    setSelectedCourseName(courseName)
    setScheduleModalOpen(true)
    setLoadingSessions(true)
    try {
      const sessions = await StudentService.getClassSessions(classSectionId)
      setClassSessionsList(sessions)
    } catch (err) {
      console.error("Lỗi tải thời khóa biểu môn:", err)
      setClassSessionsList([])
    } finally {
      setLoadingSessions(false)
    }
  }

  const loadData = async () => {
    try {
      setLoading(true)
      const [profileData, attendanceData] = await Promise.all([
        StudentService.getProfile(),
        StudentService.getAttendance()
      ])
      setProfile(profileData)
      setAttendance(attendanceData)
    } catch (err: any) {
      console.error("Error loading history:", err)
      setError(err.message || "Đã xảy ra lỗi khi tải lịch sử điểm danh.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Calculate unique subjects list for filter dropdown
  const uniqueSubjects = Array.from(new Set(attendance.map(a => a.course_name || `Lớp ${a.class_section_id}`)))

  // Calculate statistics (Supports both PRESENT/LATE/ABSENT and CO_MAT/DI_MUON/VANG)
  const totalSessions = attendance.length
  const presentCount = attendance.filter(a => a.status === "PRESENT" || a.status === "CO_MAT").length
  const lateCount = attendance.filter(a => a.status === "LATE" || a.status === "DI_MUON").length
  const absentCount = attendance.filter(a => a.status === "ABSENT" || a.status === "VANG").length
  const attendedCount = presentCount + lateCount
  const rawRate = totalSessions > 0 ? (attendedCount / totalSessions) * 100 : 0
  const attendanceRate = Number.isInteger(rawRate) ? rawRate.toFixed(0) : rawRate.toFixed(1)

  // Group absences by class for warning counts
  const absencesByClass: Record<number, { absent: number, total: number }> = {}
  attendance.forEach(a => {
    const classId = a.class_section_id
    if (!absencesByClass[classId]) {
      absencesByClass[classId] = { absent: 0, total: 0 }
    }
    absencesByClass[classId].total++
    if (a.status === "ABSENT" || a.status === "VANG") {
      absencesByClass[classId].absent++
    }
  })
  const warningCount = Object.values(absencesByClass).filter(c => c.absent / c.total >= 0.2).length

  // Filter records
  const filteredData = attendance.filter((a) => {
    const subjectName = a.course_name || `Lớp ${a.class_section_id}`
    const mappedStatus = (a.status === "PRESENT" || a.status === "CO_MAT") ? "present" : (a.status === "LATE" || a.status === "DI_MUON") ? "late" : "absent"

    if (subjectFilter !== "all" && subjectName !== subjectFilter) return false
    if (statusFilter !== "all" && mappedStatus !== statusFilter) return false
    if (searchTerm && !subjectName.toLowerCase().includes(searchTerm.toLowerCase())) return false
    return true
  })

  // Format attendance list for rendering
  const mappedRecords = filteredData.map((item, idx) => {
    const isAbsent = item.status === "ABSENT" || item.status === "VANG"
    const isLate = item.status === "LATE" || item.status === "DI_MUON"
    const mappedStatus = (item.status === "PRESENT" || item.status === "CO_MAT") ? "present" as const : isLate ? "late" as const : "absent" as const
    return {
      id: item.attendance_id || idx,
      subject: item.course_name || `Lớp học phần ${item.class_section_id}`,
      date: item.class_date ? new Date(item.class_date).toLocaleDateString("vi-VN") : "N/A",
      session: item.class_section_id,
      sessionNumber: item.session_number || (idx + 1),
      status: mappedStatus,
      lateMinutes: isLate ? 10 : 0,
      method: "face" as const,
      canClaim: isAbsent || isLate,
      raw: item
    }
  })

  // Streak days
  const streakDays = attendance.slice(-10).map((item) => ({
    date: item.class_date ? item.class_date.substring(5, 10).replace("-", "/") : "N/A",
    status: item.status === "CO_MAT" ? "present" : item.status === "DI_MUON" ? "late" : "absent"
  }))

  const handleClaimClick = (record: any) => {
    setSelectedRecord(record)
    setClaimModalOpen(true)
  }

  const handleClaimSubmit = async () => {
    if (!selectedRecord) return
    setSubmittingClaim(true)
    try {
      await StudentService.submitClaim({
        reason: claimReason,
        attendance_id: selectedRecord.id,
        subjectCode: selectedRecord.raw.class_section_id,
        subjectName: selectedRecord.subject,
        sessionNumber: selectedRecord.session,
        currentStatus: selectedRecord.status
      })
      toast.success("Đã gửi khiếu nại thành công!")
      setClaimModalOpen(false)
      setClaimReason("")
      setClaimFile(null)
      setSelectedRecord(null)
      loadData() // Refresh list
    } catch (err: any) {
      toast.error(err.message || "Đã xảy ra lỗi khi gửi khiếu nại.")
    } finally {
      setSubmittingClaim(false)
    }
  }

  if (loading) {
    return (
      <AppShell
        role="student"
        user={{ name: "Đang tải", email: "", avatar: "" }}
        breadcrumb="Lịch sử điểm danh"
      >
        <div className="flex flex-col items-center justify-center py-24 bg-white rounded-xl border border-[#E2E8F0]">
          <Loader2 className="w-10 h-10 text-[#0EA5E9] animate-spin mb-4" />
          <p className="text-[#64748B] font-medium">Đang tải lịch sử điểm danh...</p>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell
      role="student"
      user={profile ? { name: profile.name, email: profile.email, avatar: "" } : { name: "Sinh viên", email: "", avatar: "" }}
      breadcrumb="Lịch sử điểm danh"
      notificationCount={warningCount}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A]">Lịch sử điểm danh</h1>
            <span className="inline-flex items-center px-2.5 py-1 mt-2 rounded-full text-xs font-medium bg-[#DBEAFE] text-[#1E40AF]">
              HK1-2025-2026
            </span>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-[#E2E8F0] shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-[#64748B] font-medium">Tỷ lệ chuyên cần</p>
                  <p className="text-3xl font-bold text-[#0A2540] mt-1">{attendanceRate}%</p>
                  <p className="text-xs text-[#22C55E] mt-1 flex items-center gap-1 font-semibold">
                    <TrendingUp className="w-3 h-3" />
                    Toàn học kỳ
                  </p>
                </div>
                <div className="w-12 h-12 rounded-full bg-[#E8F5E9] flex items-center justify-center">
                  <CalendarCheck className="w-6 h-6 text-[#22C55E]" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-[#E2E8F0] shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-[#64748B] font-medium">Tổng buổi đi học</p>
                  <p className="text-3xl font-bold text-[#22C55E] mt-1">{attendedCount}/{totalSessions}</p>
                  <p className="text-xs text-[#64748B] mt-1">Số buổi có mặt + đi muộn</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-[#E0F2FE] flex items-center justify-center">
                  <CalendarCheck className="w-6 h-6 text-[#3B82F6]" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-[#E2E8F0] shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-[#64748B] font-medium">Cảnh báo vắng</p>
                  <p className="text-3xl font-bold text-[#F59E0B] mt-1">{warningCount} môn</p>
                  <p className="text-xs text-[#F59E0B] mt-1 font-medium">Vượt quá 20% giới hạn vắng</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-[#FEF9C3] flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-[#F59E0B]" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="border-[#E2E8F0] shadow-sm">
          <CardContent className="pt-6">
            <div className="flex flex-wrap gap-4">
              <Select value={subjectFilter} onValueChange={setSubjectFilter}>
                <SelectTrigger className="w-[200px] border-[#E2E8F0]">
                  <SelectValue placeholder="Tất cả môn học" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả môn học</SelectItem>
                  {uniqueSubjects.map(subj => (
                    <SelectItem key={subj} value={subj}>{subj}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {subjectFilter !== "all" && (
                <Button
                  onClick={() => {
                    const matchRec = attendance.find(a => (a.course_name || `Lớp ${a.class_section_id}`) === subjectFilter)
                    if (matchRec) handleViewFullSchedule(matchRec.class_section_id, subjectFilter)
                  }}
                  className="bg-[#0EA5E9] hover:bg-[#0284C7] text-white font-semibold text-xs gap-1.5 shadow-xs"
                >
                  <CalendarCheck className="w-4 h-4" />
                  Xem thời khóa biểu tất cả các buổi môn này
                </Button>
              )}

              <div className="flex bg-[#F1F5F9] rounded-lg p-1">
                {["all", "present", "late", "absent"].map((status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={cn(
                      "px-4 py-2 rounded-md text-sm font-medium transition-all",
                      statusFilter === status
                        ? "bg-white text-[#0A2540] shadow-sm"
                        : "text-[#64748B] hover:text-[#0F172A]"
                    )}
                  >
                    {status === "all" ? "Tất cả" : status === "present" ? "Có mặt" : status === "late" ? "Muộn" : "Vắng"}
                  </button>
                ))}
              </div>

              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
                <Input
                  placeholder="Tìm theo môn học..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 border-[#E2E8F0] focus-visible:ring-[#0EA5E9]"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Attendance Streak */}
        {streakDays.length > 0 && (
          <Card className="border-[#E2E8F0] shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-[#0F172A]">
                Chuỗi điểm danh các buổi gần đây
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-start gap-4 overflow-x-auto pb-2">
                {streakDays.map((day, index) => (
                  <div key={index} className="flex flex-col items-center gap-2 shrink-0">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium ${
                        day.status === "present"
                          ? "bg-[#22C55E]"
                          : day.status === "late"
                          ? "bg-[#F59E0B]"
                          : "bg-[#EF4444]"
                      }`}
                      title={`${day.date}: ${day.status === "present" ? "Có mặt" : day.status === "late" ? "Muộn" : "Vắng"}`}
                    >
                      {day.status === "present" ? "P" : day.status === "late" ? "L" : "V"}
                    </div>
                    <span className="text-xs text-[#64748B]">{day.date}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Data Table */}
        <Card className="border-[#E2E8F0] shadow-sm overflow-hidden">
          <CardContent className="p-0">
            {mappedRecords.length > 0 ? (
              <Table className="w-full text-sm text-left">
                <TableHeader className="bg-[#F8FAFC]">
                  <TableRow className="border-b border-[#E2E8F0]">
                    <TableHead className="w-[60px] px-6 py-4 font-semibold text-slate-700">STT</TableHead>
                    <TableHead className="px-6 py-4 font-semibold text-slate-700">Môn học</TableHead>
                    <TableHead className="px-6 py-4 font-semibold text-slate-700">Buổi thứ</TableHead>
                    <TableHead className="px-6 py-4 font-semibold text-slate-700">Ngày học</TableHead>
                    <TableHead className="px-6 py-4 font-semibold text-slate-700">Mã LHP</TableHead>
                    <TableHead className="px-6 py-4 font-semibold text-slate-700">Trạng thái</TableHead>
                    <TableHead className="px-6 py-4 font-semibold text-slate-700">Phút muộn</TableHead>
                    <TableHead className="px-6 py-4 font-semibold text-slate-700">Phương thức</TableHead>
                    <TableHead className="px-6 py-4 text-center font-semibold text-slate-700">Hành động</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-[#E2E8F0]">
                  {mappedRecords.map((record, index) => (
                    <TableRow key={record.id} className="bg-white hover:bg-slate-50/80 transition-colors">
                      <TableCell className="px-6 py-4 font-medium text-slate-500">{index + 1}</TableCell>
                      <TableCell className="px-6 py-4 font-semibold text-[#0F172A]">{record.subject}</TableCell>
                      <TableCell className="px-6 py-4">
                        <span className="px-2 py-0.5 bg-[#E0F2FE] text-[#0369A1] font-bold rounded-md text-xs border border-[#E0F2FE]">
                          Buổi {record.sessionNumber}
                        </span>
                      </TableCell>
                      <TableCell className="px-6 py-4 text-slate-600">{record.date}</TableCell>
                      <TableCell className="px-6 py-4 font-bold text-[#0A2540]">LHP{record.session}</TableCell>
                      <TableCell className="px-6 py-4">
                        <StatusBadge status={record.status} />
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        {record.lateMinutes > 0 ? (
                          <span className="text-[#F59E0B] font-semibold">{record.lateMinutes} phút</span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        <span className={cn(
                          "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border",
                          methodLabels[record.method].bgClass
                        )}>
                          {methodLabels[record.method].label}
                        </span>
                      </TableCell>
                      <TableCell className="px-6 py-4 text-center">
                        {record.canClaim ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleClaimClick(record)}
                            className="text-[#0EA5E9] hover:text-[#0A2540] hover:bg-[#EFF6FF] h-8 font-semibold"
                          >
                            <FileText className="w-4 h-4 mr-1" />
                            Gửi khiếu nại
                          </Button>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-[#64748B] text-center py-12">Không tìm thấy bản ghi điểm danh nào khớp bộ lọc.</p>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-[#E2E8F0]">
              <p className="text-sm text-[#64748B]">
                Hiển thị {mappedRecords.length} / {attendance.length} bản ghi
              </p>
              <Button variant="outline" className="gap-2">
                <Download className="w-4 h-4" />
                Xuất Excel
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Claim Modal */}
      <Dialog open={claimModalOpen} onOpenChange={setClaimModalOpen}>
        <DialogContent className="max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Gửi khiếu nại điểm danh
            </DialogTitle>
          </DialogHeader>

          {selectedRecord && (
            <div className="space-y-4">
              {/* Pre-filled Info */}
              <div className="p-4 bg-[#F8FAFC] rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-[#64748B]">Môn học:</span>
                  <span className="text-sm font-medium text-[#0F172A]">{selectedRecord.subject}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-[#64748B]">Lớp học phần:</span>
                  <span className="text-sm font-medium text-[#0F172A]">
                    Mã LHP: {selectedRecord.session} — {selectedRecord.date}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-[#64748B]">Trạng thái hiện tại:</span>
                  <StatusBadge status={selectedRecord.status} />
                </div>
              </div>

              {/* Reason */}
              <div>
                <label className="block text-sm font-medium text-[#0F172A] mb-2">
                  Lý do khiếu nại <span className="text-red-500">*</span>
                </label>
                <Textarea
                  placeholder="Mô tả chi tiết lý do bạn bị ghi nhận sai..."
                  value={claimReason}
                  onChange={(e) => setClaimReason(e.target.value)}
                  className="min-h-[120px]"
                  maxLength={500}
                />
                <p className="text-xs text-[#64748B] text-right mt-1">
                  {claimReason.length}/500 ký tự
                </p>
              </div>

              {/* File Upload */}
              <div>
                <label className="block text-sm font-medium text-[#0F172A] mb-2">
                  Bằng chứng đính kèm
                </label>
                {!claimFile ? (
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-[#0EA5E9] rounded-lg cursor-pointer hover:bg-[#EFF6FF] transition-colors">
                    <Upload className="w-8 h-8 text-[#0EA5E9] mb-2" />
                    <span className="text-sm text-[#64748B]">
                      Kéo thả file vào đây hoặc nhấn để chọn
                    </span>
                    <span className="text-xs text-[#64748B] mt-1">
                      JPG, PNG, PDF — tối đa 5MB
                    </span>
                    <input
                      type="file"
                      className="hidden"
                      accept=".jpg,.jpeg,.png,.pdf"
                      onChange={(e) => setClaimFile(e.target.files?.[0] || null)}
                    />
                  </label>
                ) : (
                  <div className="flex items-center gap-3 p-3 bg-[#F8FAFC] rounded-lg">
                    <FileText className="w-8 h-8 text-[#0EA5E9]" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-[#0F172A]">{claimFile.name}</p>
                      <p className="text-xs text-[#64748B]">
                        {(claimFile.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setClaimFile(null)}
                      className="text-[#64748B] hover:text-[#EF4444]"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" disabled={submittingClaim} onClick={() => setClaimModalOpen(false)}>
              Hủy
            </Button>
            <Button
              onClick={handleClaimSubmit}
              disabled={!claimReason.trim() || submittingClaim}
              className="bg-[#0A2540] hover:bg-[#1A3A5C]"
            >
              {submittingClaim && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Gửi khiếu nại
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Thời khóa biểu chi tiết toàn bộ các buổi học */}
      <Dialog open={scheduleModalOpen} onOpenChange={setScheduleModalOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-[#0F172A] flex items-center gap-2">
              <CalendarCheck className="w-5 h-5 text-[#0EA5E9]" />
              Thời Khóa Biểu Chi Tiết Các Buổi Học
            </DialogTitle>
            <p className="text-xs text-[#64748B]">Môn học: <span className="font-bold text-[#0F172A]">{selectedCourseName}</span></p>
          </DialogHeader>

          {loadingSessions ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-[#0EA5E9] animate-spin mb-2" />
              <p className="text-xs text-[#64748B]">Đang tải thời khóa biểu các buổi học...</p>
            </div>
          ) : classSessionsList.length === 0 ? (
            <div className="text-center py-8 text-[#64748B] text-xs">
              Chưa có dữ liệu danh sách các buổi học cho môn này.
            </div>
          ) : (
            <div className="max-h-[360px] overflow-y-auto pr-1 space-y-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">Buổi số</TableHead>
                    <TableHead>Ngày học</TableHead>
                    <TableHead>Thời gian</TableHead>
                    <TableHead>Phòng học</TableHead>
                    <TableHead>Trạng thái</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {classSessionsList.map((sess, i) => (
                    <TableRow key={sess.class_session_id || i}>
                      <TableCell className="font-bold text-[#0369A1]">Buổi {sess.session_number || i + 1}</TableCell>
                      <TableCell className="font-medium">{sess.class_date ? new Date(sess.class_date).toLocaleDateString("vi-VN") : "N/A"}</TableCell>
                      <TableCell className="text-xs">{sess.start_time?.substring(0,5) || "07:30"} - {sess.end_time?.substring(0,5) || "10:00"}</TableCell>
                      <TableCell className="text-xs text-[#475569]">{sess.phong_hoc || "Phòng A2-301"}</TableCell>
                      <TableCell>
                        {sess.status === "DANG_DIEN_RA" ? (
                          <span className="px-2 py-0.5 text-[11px] font-bold bg-[#DCFCE7] text-[#166534] rounded-full">🟢 Đang mở ĐĐ</span>
                        ) : sess.status === "DA_KET_THUC" ? (
                          <span className="px-2 py-0.5 text-[11px] font-medium bg-[#F1F5F9] text-[#64748B] rounded-full">Đã kết thúc</span>
                        ) : sess.status === "HOAN_HOC" ? (
                          <span className="px-2 py-0.5 text-[11px] font-medium bg-[#FFEDD5] text-[#C2410C] rounded-full">Đã hoãn</span>
                        ) : (
                          <span className="px-2 py-0.5 text-[11px] font-medium bg-[#E0F2FE] text-[#0369A1] rounded-full">Chưa diễn ra</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleModalOpen(false)}>
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}
