"use client"

import { toast } from "sonner"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AppShell } from "@/components/app-shell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn, formatDateVN } from "@/lib/utils"
import { CourseClass } from "@/types/class"
import { ClassService } from "@/services/class.service"
import { LecturerService } from "@/services/lecturer.service"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  CalendarDays,
  Clock,
  Download,
  Loader2,
  Pencil,
  PlayCircle,
  Trash2,
  Users,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  PlusCircle,
  CheckCircle2,
  RotateCcw,
} from "lucide-react"


interface SessionForm {
  class_date: string
  start_time: string
  end_time: string
  session_number: string
  late_grace_minutes: string
  recognition_threshold: string
  note: string
}

const emptySessionForm: SessionForm = {
  class_date: "",
  start_time: "",
  end_time: "",
  session_number: "",
  late_grace_minutes: "15",
  recognition_threshold: "0.6",
  note: "",
}

export default function LecturerClassesPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<{ name: string; email: string; maCanBo: number } | null>(null)
  const [classes, setClasses] = useState<CourseClass[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingClaimsCount, setPendingClaimsCount] = useState(0)
  const [selectedClass, setSelectedClass] = useState<CourseClass | null>(null)
  const [sessions, setSessions] = useState<any[]>([])
  const [warnings, setWarnings] = useState<any[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [editingSessionId, setEditingSessionId] = useState<number | null>(null)
  const [sessionForm, setSessionForm] = useState<SessionForm>(emptySessionForm)
  const [students, setStudents] = useState<any[]>([])
  const [studentsLoading, setStudentsLoading] = useState(false)
  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false)

  // Student Modal Filter & Sort State
  const [studentSearchTerm, setStudentSearchTerm] = useState("")
  const [studentSortField, setStudentSortField] = useState<"mssv" | "name">("mssv")
  const [studentSortOrder, setStudentSortOrder] = useState<"asc" | "desc">("asc")

  // Postpone Modal State
  const [isPostponeModalOpen, setIsPostponeModalOpen] = useState(false)
  const [postponingSession, setPostponingSession] = useState<any | null>(null)
  const [postponeReason, setPostponeReason] = useState("")
  const [postponeSubmitting, setPostponeSubmitting] = useState(false)

  // Makeup Prompt UI Modal State
  const [isMakeupPromptModalOpen, setIsMakeupPromptModalOpen] = useState(false)
  const [postponedSessionForMakeup, setPostponedSessionForMakeup] = useState<any | null>(null)

  // Form Visibility State (Ban đầu vào sẽ ẩn Form)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [testSessionCreating, setTestSessionCreating] = useState(false)


  const fetchProfileAndClasses = async () => {
    setLoading(true)
    setError(null)
    try {
      const prof = await LecturerService.getProfile()
      setProfile(prof)
      const [classData, claimsCount] = await Promise.all([
        ClassService.getClasses(),
        prof.maCanBo ? LecturerService.getPendingClaimsCount(prof.maCanBo) : Promise.resolve(0),
      ])
      setClasses(classData)
      setPendingClaimsCount(claimsCount)
    } catch (err: any) {
      setError(err.message || "Da xay ra loi.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProfileAndClasses()
  }, [])

  const resetSessionForm = () => {
    setEditingSessionId(null)
    setSessionForm(emptySessionForm)
    setIsFormOpen(false)
  }

  const loadClassDetails = async (cls: CourseClass) => {
    setSelectedClass(cls)
    setSessionsLoading(true)
    resetSessionForm()
    try {
      const [sessionData, warningData] = await Promise.all([
        LecturerService.getClassSessions(cls.id),
        LecturerService.getClassWarnings(cls.id),
      ])
      setSessions(sessionData)
      setWarnings(warningData)
    } catch (err: any) {
      setError(err.message || "Khong the tai chi tiet lop hoc phan.")
    } finally {
      setSessionsLoading(false)
    }
  }

  const viewClassStudents = async (cls: CourseClass) => {
    setSelectedClass(cls)
    setIsStudentModalOpen(true)
    setStudentsLoading(true)
    setStudentSearchTerm("")
    setStudentSortField("mssv")
    setStudentSortOrder("asc")
    try {
      const studentData = await LecturerService.getClassStudents(cls.id)
      setStudents(studentData)
    } catch (err: any) {
      toast.error("Không thể tải danh sách sinh viên.")
    } finally {
      setStudentsLoading(false)
    }
  }


  const handleSessionSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedClass) return

    const payload = {
      class_section_id: selectedClass.id,
      class_date: sessionForm.class_date,
      start_time: sessionForm.start_time || null,
      end_time: sessionForm.end_time || null,
      session_number: sessionForm.session_number ? Number(sessionForm.session_number) : null,
      late_grace_minutes: Number(sessionForm.late_grace_minutes) || 15,
      recognition_threshold: Number(sessionForm.recognition_threshold) || 0.6,
      note: sessionForm.note || null,
      status: "CHUA_DIEM_DANH",
    }

    try {
      if (editingSessionId) {
        await LecturerService.updateSession(editingSessionId, payload)
      } else {
        await LecturerService.createSession(payload)
      }
      await loadClassDetails(selectedClass)
    } catch (err: any) {
      console.error("Lỗi lưu buổi học:", err)
      const msg = err?.response?.data?.detail || err?.message || "Không thể lưu buổi học."
      toast.error(`Lỗi: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`)
    }
  }

  const handleEditSession = (session: any) => {
    setIsFormOpen(true)
    setEditingSessionId(session.class_session_id)
    setSessionForm({
      class_date: session.class_date || "",
      start_time: session.start_time || "",
      end_time: session.end_time || "",
      session_number: session.session_number?.toString() || "",
      late_grace_minutes: session.late_grace_minutes?.toString() || "15",
      recognition_threshold: session.recognition_threshold?.toString() || "0.6",
      note: session.note || "",
    })
  }

  const handleCancelSession = async (maBuoiHoc: number) => {
    if (!selectedClass) return
    if (!confirm("Ban co chac muon huy buoi hoc nay?")) return
    try {
      await LecturerService.cancelSession(maBuoiHoc)
      await loadClassDetails(selectedClass)
    } catch {
      toast.error("Khong the huy buoi hoc.")
    }
  }

  const openPostponeModal = (sessionItem: any) => {
    setPostponingSession(sessionItem)
    setPostponeReason("Giảng viên có lịch bận đột xuất")
    setIsPostponeModalOpen(true)
  }

  const prepareMakeupSession = (sessionItem: any) => {
    setIsFormOpen(true)
    setEditingSessionId(null)
    setSessionForm({
      class_date: "",
      start_time: sessionItem?.start_time || "07:30",
      end_time: sessionItem?.end_time || "10:00",
      session_number: sessionItem?.session_number?.toString() || "",
      late_grace_minutes: "15",
      recognition_threshold: "0.6",
      note: `Học bù cho Buổi ${sessionItem?.session_number || ""} ngày ${formatDateVN(sessionItem?.class_date)} bị hoãn`,
    })
    // Scroll smoothly to form
    window.scrollTo({ top: 400, behavior: "smooth" })
  }

  const submitPostponeSession = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedClass || !postponingSession) return
    setPostponeSubmitting(true)
    try {
      const currentPostponed = postponingSession
      await LecturerService.postponeSession(postponingSession.class_session_id, postponeReason)
      setIsPostponeModalOpen(false)
      await loadClassDetails(selectedClass)
      
      // Mở UI Modal giao diện hiển thị sự lựa chọn tạo lịch học bù
      setPostponedSessionForMakeup(currentPostponed)
      setIsMakeupPromptModalOpen(true)
    } catch {
      toast.error("Không thể hoãn buổi học. Vui lòng thử lại!")
    } finally {
      setPostponeSubmitting(false)
    }
  }

  const handleStartSession = async (maBuoiHoc: number) => {
    try {
      await LecturerService.moDiemDanh(maBuoiHoc)
      router.push(`/lecturer/live/${maBuoiHoc}`)
    } catch {
      toast.error("Khong the mo phien diem danh.")
    }
  }

  const handleCreateTestSession = async () => {
    if (!selectedClass || testSessionCreating) return
    if (!confirm(`Xóa sạch các buổi học cũ của "${selectedClass.tenHocPhan}" và mở 1 phiên test thử nghiệm mới?`)) return
    setTestSessionCreating(true)
    try {
      const created = await LecturerService.resetAndCreateTestSession(selectedClass.id)
      router.push(`/lecturer/live/${created.class_session_id}`)
    } catch {
      toast.error("Không thể tạo phiên test thử nghiệm.")
    } finally {
      setTestSessionCreating(false)
    }
  }

  const userDisplayName = profile ? profile.name : "Giang vien"
  const userEmail = profile ? profile.email : "loading..."

  return (
    <AppShell
      role="lecturer"
      user={{ name: userDisplayName, email: userEmail, avatar: "" }}
      breadcrumb="Quan ly lop hoc phan"
      notificationCount={pendingClaimsCount}
    >
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A]">Danh sách lớp học phần</h1>
            <p className="text-[#64748B] mt-1">Quản lý lớp, buổi học, điểm danh và báo cáo chuyên cần.</p>
          </div>
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center py-24 bg-white rounded-xl border border-[#E2E8F0] shadow-sm">
            <Loader2 className="w-10 h-10 text-[#0EA5E9] animate-spin mb-4" />
            <p className="text-[#64748B] font-medium">Đang tải dữ liệu lớp học phần...</p>
          </div>
        )}

        {!loading && error && (
          <Card className="border-[#EF4444] bg-[#FEF2F2]">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <AlertCircle className="w-12 h-12 text-[#EF4444] mb-3" />
              <h3 className="text-xl font-semibold text-[#991B1B] mb-2">Đã xảy ra lỗi</h3>
              <p className="text-[#DC2626] mb-6 max-w-md">{error}</p>
              <Button onClick={fetchProfileAndClasses} variant="outline" className="border-[#EF4444] text-[#EF4444]">
                Thử lại
              </Button>
            </CardContent>
          </Card>
        )}

        {!loading && !error && classes.length === 0 && (
          <Card className="border-dashed border-2 border-[#E2E8F0] bg-[#F8FAFC]">
            <CardContent className="flex flex-col items-center justify-center py-20 text-center">
              <BookOpen className="w-12 h-12 text-[#64748B] mb-3" />
              <h3 className="text-xl font-semibold text-[#0F172A] mb-2">Chưa có lớp học phần nào</h3>
              <p className="text-[#64748B] max-w-sm">Bạn chưa được phân công lớp học phần nào trong học kỳ này.</p>
            </CardContent>
          </Card>
        )}

        {!loading && !error && classes.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {classes.map((cls) => (
              <Card key={cls.id} className="border-[#E2E8F0] shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg font-bold text-[#0F172A] truncate" title={cls.tenHocPhan}>
                        {cls.tenHocPhan}
                      </CardTitle>
                      <p className="text-sm text-[#64748B] mt-1">Mã lớp: {cls.maLop} - {cls.hocKy}</p>
                    </div>
                    <span className="shrink-0 px-2.5 py-1 text-xs font-semibold rounded-full bg-[#DCFCE7] text-[#166534]">
                      {cls.trangThai}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm text-[#64748B] bg-[#F8FAFC] p-3 rounded-lg border border-[#F1F5F9]">
                      <Users className="w-5 h-5 text-[#0EA5E9] shrink-0" />
                      <span className="font-medium">Sĩ số:</span>
                      <span className="font-semibold text-[#0F172A]">{cls.siSoHienTai} / {cls.siSo} sinh viên</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5 pt-1">
                      <Button
                        className="w-full bg-[#0A2540] hover:bg-[#1A3A5C] text-xs sm:text-sm px-2"
                        onClick={() => loadClassDetails(cls)}
                      >
                        <PlayCircle className="w-4 h-4 mr-1.5 shrink-0" />
                        Quản lý buổi
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full text-[#0A2540] border-[#CBD5E1] hover:bg-[#F8FAFC] text-xs sm:text-sm px-2 font-medium"
                        onClick={() => viewClassStudents(cls)}
                      >
                        <Users className="w-4 h-4 mr-1.5 shrink-0 text-[#0EA5E9]" />
                        Xem sinh viên
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {selectedClass && (
          <div className={cn("grid grid-cols-1 gap-6", isFormOpen && "xl:grid-cols-[420px_1fr]")}>
            {isFormOpen && (
              <Card className="border-[#E2E8F0] shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">{editingSessionId ? "Cập nhật buổi học bù" : "Tạo buổi học bù / Đổi lịch"}</CardTitle>
                </CardHeader>
                <CardContent>
                  <form className="space-y-4" onSubmit={handleSessionSubmit}>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="space-y-1 text-sm font-medium text-[#334155]">
                        Ngày học
                        <input
                          type="date"
                          required
                          value={sessionForm.class_date}
                          onChange={(e) => setSessionForm({ ...sessionForm, class_date: e.target.value })}
                          className="w-full rounded-md border border-[#E2E8F0] px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="space-y-1 text-sm font-medium text-[#334155]">
                        Buổi số
                        <input
                          type="number"
                          min="1"
                          value={sessionForm.session_number}
                          onChange={(e) => setSessionForm({ ...sessionForm, session_number: e.target.value })}
                          className="w-full rounded-md border border-[#E2E8F0] px-3 py-2 text-sm"
                        />
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="space-y-1 text-sm font-medium text-[#334155]">
                        Bắt đầu
                        <input
                          type="time"
                          value={sessionForm.start_time}
                          onChange={(e) => setSessionForm({ ...sessionForm, start_time: e.target.value })}
                          className="w-full rounded-md border border-[#E2E8F0] px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="space-y-1 text-sm font-medium text-[#334155]">
                        Kết thúc
                        <input
                          type="time"
                          value={sessionForm.end_time}
                          onChange={(e) => setSessionForm({ ...sessionForm, end_time: e.target.value })}
                          className="w-full rounded-md border border-[#E2E8F0] px-3 py-2 text-sm"
                        />
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="space-y-1 text-sm font-medium text-[#334155]">
                        Phút muộn tối đa
                        <input
                          type="number"
                          min="0"
                          value={sessionForm.late_grace_minutes}
                          onChange={(e) => setSessionForm({ ...sessionForm, late_grace_minutes: e.target.value })}
                          className="w-full rounded-md border border-[#E2E8F0] px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="space-y-1 text-sm font-medium text-[#334155]">
                        Ngưỡng AI
                        <input
                          type="number"
                          step="0.05"
                          min="0.1"
                          max="1.0"
                          value={sessionForm.recognition_threshold}
                          onChange={(e) => setSessionForm({ ...sessionForm, recognition_threshold: e.target.value })}
                          className="w-full rounded-md border border-[#E2E8F0] px-3 py-2 text-sm"
                        />
                      </label>
                    </div>
                    <label className="space-y-1 text-sm font-medium text-[#334155] block">
                      Ghi chú
                      <textarea
                        value={sessionForm.note}
                        onChange={(e) => setSessionForm({ ...sessionForm, note: e.target.value })}
                        className="min-h-[72px] w-full rounded-md border border-[#E2E8F0] px-3 py-2 text-sm"
                      />
                    </label>
                    <div className="flex gap-2 pt-2 border-t border-[#E2E8F0]">
                      <Button type="submit" className="bg-[#0A2540] hover:bg-[#1A3A5C]">
                        {editingSessionId ? "Lưu thay đổi" : "Lưu lịch học bù"}
                      </Button>
                      <Button type="button" variant="outline" onClick={resetSessionForm}>
                        Hủy
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}

            <Card className="border-[#E2E8F0] shadow-sm">
              <CardHeader>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <CardTitle className="text-lg">{selectedClass.tenHocPhan}</CardTitle>
                    <p className="text-sm text-[#64748B] mt-1">Danh sách buổi học và cảnh báo chuyên cần</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      disabled={testSessionCreating}
                      className="border-[#D97706] bg-[#FFFBEB] text-[#B45309] hover:bg-[#FEF3C7]"
                      onClick={handleCreateTestSession}
                    >
                      {testSessionCreating ? (
                        <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                      ) : (
                        <RotateCcw className="w-4 h-4 mr-1.5" />
                      )}
                      Xóa buổi cũ & Tạo Phiên Test
                    </Button>
                    <Button
                      variant="outline"
                      className="border-[#0EA5E9] text-[#0EA5E9] hover:bg-[#EAFAFF]"
                      onClick={() => viewClassStudents(selectedClass)}
                    >
                      <Users className="w-4 h-4 mr-1.5" />
                      Danh sách SV
                    </Button>
                    <Button variant="outline" onClick={() => LecturerService.downloadAttendanceReport(selectedClass.id, "excel")}>
                      <Download className="w-4 h-4 mr-2" />
                      Excel
                    </Button>
                    <Button variant="outline" onClick={() => LecturerService.downloadAttendanceReport(selectedClass.id, "csv")}>
                      <Download className="w-4 h-4 mr-2" />
                      CSV
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                {sessionsLoading ? (
                  <div className="py-12 text-center text-[#64748B]">
                    <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin text-[#0EA5E9]" />
                    Đang tải buổi học...
                  </div>
                ) : sessions.length === 0 ? (
                  <div className="py-10 text-center text-[#64748B] border border-dashed border-[#CBD5E1] rounded-lg">
                    Chưa có buổi học nào được lên lịch cho lớp học phần này.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sessions.map((session) => (
                      <div key={session.class_session_id} className="flex flex-col gap-3 rounded-lg border border-[#E2E8F0] p-4 md:flex-row md:items-center md:justify-between">
                        <div>
                          <div className="flex items-center gap-2 font-bold text-[#0F172A] text-base">
                            <CalendarDays className="w-4 h-4 text-[#0EA5E9]" />
                            Buổi {session.session_number || "-"} - {formatDateVN(session.class_date)}
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-[#64748B]">
                            <span className="inline-flex items-center gap-1 bg-slate-50 px-2 py-0.5 rounded border border-slate-200 text-slate-700">
                              <Clock className="w-3.5 h-3.5 text-slate-500" />
                              {session.start_time || "--:--"} - {session.end_time || "--:--"}
                            </span>
                            <span className="bg-slate-50 px-2 py-0.5 rounded border border-slate-200 text-slate-700">Muộn tối đa: <strong className="text-slate-800">{session.late_grace_minutes} phút</strong></span>
                            <span className="bg-slate-50 px-2 py-0.5 rounded border border-slate-200 text-slate-700">Ngưỡng nhận diện: <strong className="text-slate-800">{session.recognition_threshold}</strong></span>
                            <span className={cn(
                              "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border",
                              session.status === "DANG_DIEN_RA"
                                ? "bg-amber-50 text-amber-600 border-amber-200/50"
                                : session.status === "DA_KET_THUC" || session.status === "COMPLETED"
                                ? "bg-green-50 text-green-600 border-green-200/50"
                                : session.status === "DA_HUY" || session.status === "CANCELLED"
                                ? "bg-red-50 text-red-600 border-red-200/50"
                                : "bg-slate-100 text-slate-600 border-slate-200"
                            )}>
                              {session.status === "DANG_DIEN_RA"
                                ? "Đang diễn ra"
                                : session.status === "DA_KET_THUC" || session.status === "COMPLETED"
                                ? "Đã hoàn thành"
                                : session.status === "DA_HUY" || session.status === "CANCELLED"
                                ? "Đã hủy"
                                : "Chưa điểm danh"}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {session.status === "DA_KET_THUC" || session.status === "COMPLETED" ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#E8F5E9] text-[#22C55E] border border-[#22C55E]/15">
                              Đã hoàn thành
                            </span>
                          ) : session.status === "DA_HUY" || session.status === "CANCELLED" ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FEE2E2] text-[#EF4444] border border-[#EF4444]/15">
                              Đã hủy
                            </span>
                          ) : (
                            <div className="flex flex-wrap items-center gap-2">
                              {session.status === "HOAN_HOC" ? (
                                <>
                                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-[#FFEDD5] text-[#C2410C] mr-1" title={session.note || ""}>
                                    Đã hoãn học
                                  </span>
                                  <Button size="sm" className="bg-[#0EA5E9] hover:bg-[#0284C7] text-white" onClick={() => prepareMakeupSession(session)}>
                                    <PlusCircle className="w-4 h-4 mr-1" />
                                    Tạo lịch bù
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button size="sm" onClick={() => handleStartSession(session.class_session_id)} className="bg-[#22C55E] hover:bg-[#16A34A]">
                                    <PlayCircle className="w-4 h-4 mr-1" />
                                    Mở phiên
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={() => router.push(`/lecturer/live/${session.class_session_id}`)}>
                                    Live
                                  </Button>
                                  <Button size="sm" variant="outline" className="border-[#F97316] text-[#F97316] hover:bg-[#FFF7ED]" onClick={() => openPostponeModal(session)}>
                                    Hoãn buổi
                                  </Button>
                                </>
                              )}
                              <Button size="sm" variant="outline" onClick={() => handleEditSession(session)}>
                                <Pencil className="w-4 h-4 mr-1" />
                                Sửa
                              </Button>
                              <Button size="sm" variant="outline" className="text-[#EF4444] hover:bg-[#FEE2E2]" onClick={() => handleCancelSession(session.class_session_id)}>
                                <Trash2 className="w-4 h-4 mr-1" />
                                Hủy
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-6 border-t border-[#E2E8F0] pt-6">
                  <h3 className="text-base font-bold text-[#0F172A] mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-[#EF4444]" />
                    Sinh viên có nguy cơ cấm thi do vắng nhiều
                  </h3>
                  {warnings.length === 0 ? (
                    <p className="rounded-xl bg-[#F8FAFC] p-4 text-sm text-[#64748B] border border-[#E2E8F0] border-dashed">
                      Chưa có sinh viên nào vượt quá ngưỡng cảnh báo vắng học.
                    </p>
                  ) : (
                    <div className="overflow-hidden rounded-xl border border-[#E2E8F0]">
                      <table className="w-full text-sm text-left border-collapse">
                        <thead className="bg-[#F8FAFC] text-[#475569] font-bold text-xs uppercase border-b border-[#E2E8F0]">
                          <tr>
                            <th className="px-5 py-3.5 font-semibold text-slate-700">Mã SV</th>
                            <th className="px-5 py-3.5 font-semibold text-slate-700">Họ và tên</th>
                            <th className="px-5 py-3.5 font-semibold text-slate-700">Số buổi vắng</th>
                            <th className="px-5 py-3.5 font-semibold text-slate-700">Tỷ lệ vắng</th>
                            <th className="px-5 py-3.5 font-semibold text-slate-700">Trạng thái</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E2E8F0]">
                          {warnings.map((warning) => (
                            <tr key={warning.student_id} className="bg-white hover:bg-slate-50/80 transition-colors">
                              <td className="px-5 py-3.5 font-bold text-[#0A2540]">{warning.student_code || `SV${String(warning.student_id).padStart(3, "0")}`}</td>
                              <td className="px-5 py-3.5 font-semibold text-[#0F172A]">{warning.ho_ten}</td>
                              <td className="px-5 py-3.5 text-slate-600 font-semibold">{warning.absent_session_count}/{warning.total_sessions} buổi</td>
                              <td className="px-5 py-3.5 text-[#EF4444] font-bold">{warning.absence_rate}%</td>
                              <td className="px-5 py-3.5">
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-[#FEE2E2] text-[#EF4444] border-[#EF4444]/15">
                                  {warning.warning_status || "Nguy cơ cấm thi"}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <Dialog open={isStudentModalOpen} onOpenChange={setIsStudentModalOpen}>
        <DialogContent className="max-w-3xl bg-white">
          <DialogHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E2E8F0] pb-3">
              <div>
                <DialogTitle className="text-xl font-bold text-[#0F172A]">
                  Danh sách sinh viên lớp {selectedClass?.tenHocPhan}
                </DialogTitle>
                <DialogDescription className="text-xs text-[#64748B] mt-1">
                  Mã lớp học phần: <b>LHP{selectedClass?.id}</b>
                </DialogDescription>
              </div>
              <div className="inline-flex items-center px-3 py-1 bg-[#EFF6FF] text-[#0EA5E9] border border-[#BAE6FD] rounded-full text-xs font-semibold shrink-0">
                Tổng số: {students.length} sinh viên
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            {/* Thanh Tìm kiếm & Thiết lập Sắp xếp */}
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
                <input
                  type="text"
                  placeholder="Tìm kiếm theo MSSV hoặc Họ và tên sinh viên..."
                  value={studentSearchTerm}
                  onChange={(e) => setStudentSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 h-10 rounded-lg border border-[#E2E8F0] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]"
                />
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto text-xs">
                <span className="text-[#64748B] font-medium shrink-0">Sắp xếp theo:</span>
                <select
                  value={`${studentSortField}-${studentSortOrder}`}
                  onChange={(e) => {
                    const [field, order] = e.target.value.split("-") as ["mssv" | "name", "asc" | "desc"]
                    setStudentSortField(field)
                    setStudentSortOrder(order)
                  }}
                  className="h-10 px-3 rounded-lg border border-[#E2E8F0] bg-white text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]"
                >
                  <option value="mssv-asc">Mã sinh viên (Tăng dần)</option>
                  <option value="mssv-desc">Mã sinh viên (Giảm dần)</option>
                  <option value="name-asc">Họ và tên (A - Z)</option>
                  <option value="name-desc">Họ và tên (Z - A)</option>
                </select>
              </div>
            </div>

            {studentsLoading ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Loader2 className="w-8 h-8 text-[#0EA5E9] animate-spin mb-3" />
                <p className="text-sm text-[#64748B] font-medium">Đang tải danh sách sinh viên...</p>
              </div>
            ) : students.length === 0 ? (
              <div className="text-center py-16 text-[#64748B] border border-dashed border-[#CBD5E1] rounded-lg bg-[#F8FAFC]">
                Chưa có sinh viên nào đăng ký lớp học phần này.
              </div>
            ) : (
              (() => {
                const filteredAndSorted = students
                  .filter((student) => {
                    const mssv = String(student.student_id || "")
                    const fullName = `${student.last_name || ""} ${student.first_name || ""}`.trim()
                    const term = studentSearchTerm.toLowerCase()
                    return mssv.includes(term) || fullName.toLowerCase().includes(term)
                  })
                  .sort((a, b) => {
                    let valA = ""
                    let valB = ""
                    if (studentSortField === "mssv") {
                      valA = String(a.student_id || "")
                      valB = String(b.student_id || "")
                    } else {
                      valA = `${a.last_name || ""} ${a.first_name || ""}`.trim()
                      valB = `${b.last_name || ""} ${b.first_name || ""}`.trim()
                    }

                    const cmp = valA.localeCompare(valB, "vi", { numeric: true })
                    return studentSortOrder === "asc" ? cmp : -cmp
                  })

                if (filteredAndSorted.length === 0) {
                  return (
                    <div className="text-center py-12 text-[#64748B] border border-dashed border-[#CBD5E1] rounded-lg bg-[#F8FAFC]">
                      Không tìm thấy sinh viên nào phù hợp với từ khóa &quot;{studentSearchTerm}&quot;.
                    </div>
                  )
                }

                const handleToggleSort = (field: "mssv" | "name") => {
                  if (studentSortField === field) {
                    setStudentSortOrder(prev => prev === "asc" ? "desc" : "asc")
                  } else {
                    setStudentSortField(field)
                    setStudentSortOrder("asc")
                  }
                }

                return (
                  <div className="overflow-x-auto rounded-lg border border-[#E2E8F0] max-h-[380px]">
                    <table className="w-full text-sm">
                      <thead className="bg-[#F8FAFC] text-left text-[#475569] sticky top-0 border-b border-[#E2E8F0] z-10">
                        <tr>
                          <th className="px-4 py-3 font-semibold text-center w-[70px]">STT</th>
                          <th
                            className="px-4 py-3 font-semibold cursor-pointer hover:bg-[#F1F5F9] transition-colors select-none"
                            onClick={() => handleToggleSort("mssv")}
                          >
                            <div className="flex items-center gap-1.5">
                              Mã sinh viên
                              {studentSortField === "mssv" ? (
                                studentSortOrder === "asc" ? <ArrowUp className="w-3.5 h-3.5 text-[#0EA5E9]" /> : <ArrowDown className="w-3.5 h-3.5 text-[#0EA5E9]" />
                              ) : <ArrowUpDown className="w-3.5 h-3.5 text-[#94A3B8]" />}
                            </div>
                          </th>
                          <th
                            className="px-4 py-3 font-semibold cursor-pointer hover:bg-[#F1F5F9] transition-colors select-none"
                            onClick={() => handleToggleSort("name")}
                          >
                            <div className="flex items-center gap-1.5">
                              Họ và tên
                              {studentSortField === "name" ? (
                                studentSortOrder === "asc" ? <ArrowUp className="w-3.5 h-3.5 text-[#0EA5E9]" /> : <ArrowDown className="w-3.5 h-3.5 text-[#0EA5E9]" />
                              ) : <ArrowUpDown className="w-3.5 h-3.5 text-[#94A3B8]" />}
                            </div>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2E8F0]">
                        {filteredAndSorted.map((student, index) => (
                          <tr key={student.student_id} className="hover:bg-[#F8FAFC] transition-colors">
                            <td className="px-4 py-3 text-center font-medium text-[#64748B]">
                              {index + 1}
                            </td>
                            <td className="px-4 py-3 font-bold text-[#0EA5E9]">
                              {student.student_id}
                            </td>
                            <td className="px-4 py-3 font-semibold text-[#0F172A]">
                              {`${student.last_name || ""} ${student.first_name || ""}`.trim()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              })()
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Form Nhận Hoãn Buổi Học */}
      <Dialog open={isPostponeModalOpen} onOpenChange={setIsPostponeModalOpen}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-[#0F172A] flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#F97316]"></span>
              Xác nhận Hoãn Buổi Học
            </DialogTitle>
            <DialogDescription className="text-xs text-[#64748B]">
              Lớp: <b>{selectedClass?.tenHocPhan}</b> — Buổi số <b>{postponingSession?.session_number}</b> ({formatDateVN(postponingSession?.class_date)})
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submitPostponeSession} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-[#334155]">Lý do hoãn buổi học:</label>
              <textarea
                rows={3}
                required
                placeholder="Nhập chi tiết lý do hoãn học (Ví dụ: Giảng viên bận lịch công tác đột xuất...)"
                value={postponeReason}
                onChange={(e) => setPostponeReason(e.target.value)}
                className="w-full rounded-lg border border-[#E2E8F0] p-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#F97316] leading-relaxed"
              />
            </div>

            <div className="p-3 bg-[#FFF7ED] border border-[#FFEDD5] rounded-lg text-xs text-[#C2410C]">
              💡 <b>Lưu ý:</b> Sau khi xác nhận hoãn, trạng thái buổi học sẽ chuyển thành <b>Đã hoãn học</b> và hệ thống sẽ thông báo tới tất cả sinh viên thuộc lớp học phần.
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E2E8F0]">
              <Button
                type="button"
                variant="outline"
                disabled={postponeSubmitting}
                onClick={() => setIsPostponeModalOpen(false)}
                className="border-[#CBD5E1] text-[#475569]"
              >
                Hủy bỏ
              </Button>
              <Button
                type="submit"
                disabled={postponeSubmitting}
                className="bg-[#F97316] hover:bg-[#EA580C] text-white"
              >
                {postponeSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Xác nhận Hoãn Buổi
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal UI Gợi ý Lập Lịch Học Bù */}
      <Dialog open={isMakeupPromptModalOpen} onOpenChange={setIsMakeupPromptModalOpen}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-[#0F172A] flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-[#22C55E]" />
              Hoãn Buổi Học Thành Công!
            </DialogTitle>
            <DialogDescription className="text-sm text-[#475569] mt-1 leading-relaxed">
              Buổi học số <b>{postponedSessionForMakeup?.session_number}</b> ({formatDateVN(postponedSessionForMakeup?.class_date)}) môn <b>{selectedClass?.tenHocPhan}</b> đã được chuyển sang trạng thái <b>Đã hoãn học</b>.
            </DialogDescription>
          </DialogHeader>

          <div className="p-4 bg-[#EFF6FF] border border-[#BAE6FD] rounded-xl my-2 space-y-2">
            <p className="text-sm font-semibold text-[#0369A1]">📅 Bạn có muốn lên lịch HỌC BÙ ngay bây giờ không?</p>
            <p className="text-xs text-[#0284C7] leading-relaxed">
              Hệ thống sẽ tự động điền mẫu thông tin học bù cho buổi này lên Form để bạn chọn ngày giờ mới một cách nhanh chóng.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E2E8F0]">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsMakeupPromptModalOpen(false)}
              className="border-[#CBD5E1] text-[#64748B] hover:bg-[#F8FAFC]"
            >
              Để sau
            </Button>
            <Button
              type="button"
              onClick={() => {
                setIsMakeupPromptModalOpen(false)
                prepareMakeupSession(postponedSessionForMakeup)
              }}
              className="bg-[#0EA5E9] hover:bg-[#0284C7] text-white"
            >
              Lập lịch học bù ngay
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}
