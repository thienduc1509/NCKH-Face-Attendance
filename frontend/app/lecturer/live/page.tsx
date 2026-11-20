"use client"

import { toast } from "sonner"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AppShell } from "@/components/app-shell"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ClassService } from "@/services/class.service"
import { LecturerService } from "@/services/lecturer.service"
import { CourseClass } from "@/types/class"
import { Video, PlayCircle, Clock, CalendarDays, Loader2, BookOpen, AlertCircle, RotateCcw } from "lucide-react"
import { formatDateVN } from "@/lib/utils"

export default function LecturerLiveOverviewPage() {
  const router = useRouter()
  const [lecturerUser, setLecturerUser] = useState({
    name: "Giảng viên",
    email: "loading...",
    avatar: ""
  })
  const [classes, setClasses] = useState<CourseClass[]>([])
  const [activeSessions, setActiveSessions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [resettingClassId, setResettingClassId] = useState<number | null>(null)

  const loadData = async () => {
    setLoading(true)
    try {
      const profile = await LecturerService.getProfile()
      setLecturerUser({ name: profile.name, email: profile.email, avatar: "" })
      
      const classData = await ClassService.getClasses()
      setClasses(classData)

      // Fetch all sessions across assigned classes to find active/ongoing ones
      const allSessionsProms = classData.map(cls => LecturerService.getClassSessions(cls.id))
      const allSessionsResults = await Promise.all(allSessionsProms)
      const combined = allSessionsResults.flat()
      
      // Filter sessions that are in progress (DANG_DIEN_RA) or available today
      setActiveSessions(combined)
    } catch (err) {
      console.error("Lỗi tải dữ liệu phòng học trực tiếp:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const ongoingSessions = activeSessions.filter(s => s.status === "DANG_DIEN_RA")
  const readySessions = activeSessions.filter(s => s.status !== "DA_KET_THUC" && s.status !== "DA_HUY" && s.status !== "HOAN_HOC")

  const handleStartTestSession = async (cls: CourseClass) => {
    if (resettingClassId !== null) return
    if (!confirm(`Xóa toàn bộ buổi học cũ của lớp "${cls.tenHocPhan}" và tạo 1 phiên test mới ngay bây giờ?`)) return
    setResettingClassId(cls.id)
    try {
      const created = await LecturerService.resetAndCreateTestSession(cls.id)
      router.push(`/lecturer/live/${created.class_session_id}`)
    } catch (err) {
      console.error("Lỗi tạo phiên test thử nghiệm:", err)
      toast.error("Không thể tạo phiên test thử nghiệm. Vui lòng thử lại!")
    } finally {
      setResettingClassId(null)
    }
  }

  return (
    <AppShell
      role="lecturer"
      user={lecturerUser}
      breadcrumb="Phòng học trực tiếp"
    >
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A] flex items-center gap-2">
            <Video className="w-7 h-7 text-[#0EA5E9]" />
            Trung tâm Điều hành Phòng học Trực tiếp
          </h1>
          <p className="text-[#64748B] mt-1">Chọn buổi học để mở phiên điểm danh và theo dõi sinh viên check-in thời gian thực qua AI.</p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-[#E2E8F0]">
            <Loader2 className="w-10 h-10 text-[#0EA5E9] animate-spin mb-3" />
            <p className="text-[#64748B] font-medium">Đang kiểm tra các phiên học trực tuyến...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Chế độ Test Thử Nghiệm Nhanh với Sinh Viên */}
            {classes.length > 0 && (
              <Card className="border-[#F59E0B]/40 bg-[#FFFBEB]/60 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg font-bold text-[#92400E] flex items-center gap-2">
                    <RotateCcw className="w-5 h-5 text-[#D97706]" />
                    Chế độ Test Thử Nghiệm Nhanh với Sinh Viên
                  </CardTitle>
                  <CardDescription className="text-xs text-[#B45309]">
                    Xóa toàn bộ buổi học và lượt điểm danh cũ của lớp học phần, tạo ngay 1 phiên mới đang mở để sinh viên vào kiểm tra nhận diện AI.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {classes.map((cls) => (
                    <div key={cls.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-white rounded-xl border border-[#FDE68A]">
                      <div className="min-w-0">
                        <h4 className="font-bold text-[#0F172A] text-sm truncate">{cls.tenHocPhan}</h4>
                        <p className="text-xs text-[#64748B]">Sĩ số: {cls.siSoHienTai} sinh viên</p>
                      </div>
                      <Button
                        size="sm"
                        disabled={resettingClassId !== null}
                        onClick={() => handleStartTestSession(cls)}
                        className="bg-[#D97706] hover:bg-[#B45309] text-white font-semibold shrink-0"
                      >
                        {resettingClassId === cls.id ? (
                          <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                        ) : (
                          <RotateCcw className="w-4 h-4 mr-1.5" />
                        )}
                        Xóa buổi cũ & Mở Phiên Test Mới
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Phiên đang diễn ra */}
            {ongoingSessions.length > 0 && (
              <Card className="border-[#0EA5E9] bg-[#F0F9FF] shadow-md">
                <CardHeader>
                  <CardTitle className="text-lg font-bold text-[#0369A1] flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#22C55E] animate-ping"></span>
                    Buổi học ĐANG DIỄN RA
                  </CardTitle>
                  <CardDescription className="text-xs text-[#0284C7]">
                    Đang có buổi học được mở phiên điểm danh trực tuyến thời gian thực.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {ongoingSessions.map(session => (
                    <div key={session.class_session_id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-white rounded-xl border border-[#BAE6FD] gap-4 shadow-sm">
                      <div>
                        <h4 className="font-bold text-[#0F172A] text-base">{session.course_name || `Lớp HP #${session.class_section_id}`}</h4>
                        <div className="flex flex-wrap gap-3 text-sm text-[#64748B] mt-1">
                          <span className="flex items-center gap-1"><CalendarDays className="w-4 h-4 text-[#0EA5E9]" /> Buổi số {session.session_number} ({formatDateVN(session.class_date)})</span>
                          <span className="flex items-center gap-1"><Clock className="w-4 h-4 text-[#0EA5E9]" /> {session.start_time || "--:--"} - {session.end_time || "--:--"}</span>
                        </div>
                      </div>
                      <Button
                        onClick={() => router.push(`/lecturer/live/${session.class_session_id}`)}
                        className="bg-[#22C55E] hover:bg-[#16A34A] text-white font-bold shrink-0 shadow-sm"
                      >
                        <PlayCircle className="w-4 h-4 mr-1.5" />
                        Vào Phòng Live Ngay
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Danh sách các buổi học khả dụng */}
            <Card className="border-[#E2E8F0] shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg font-bold text-[#0F172A]">Danh sách Buổi học khả dụng</CardTitle>
                <CardDescription>Chọn một buổi học bên dưới để truy cập Phòng học trực tiếp AI</CardDescription>
              </CardHeader>
              <CardContent>
                {readySessions.length === 0 ? (
                  <div className="text-center py-12 text-[#64748B] border border-dashed border-[#CBD5E1] rounded-xl">
                    <BookOpen className="w-10 h-10 mx-auto mb-2 text-[#94A3B8]" />
                    <p className="font-semibold">Chưa có buổi học nào sẵn sàng.</p>
                    <p className="text-xs mt-1">Vui lòng kiểm tra lịch giảng dạy tại trang Quản lý lớp học.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {readySessions.map(session => (
                      <div key={session.class_session_id} className="p-4.5 rounded-xl border border-[#E2E8F0] bg-white hover:border-[#0EA5E9] hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col justify-between gap-3 shadow-xs">
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-[#0EA5E9] bg-[#E0F2FE] px-2.5 py-0.5 rounded-full">
                              Buổi {session.session_number || "-"}
                            </span>
                            <span className="text-xs font-semibold text-[#64748B]">
                              {session.status === "DANG_DIEN_RA" ? (
                                <span className="text-[#22C55E] font-bold">● Đang mở</span>
                              ) : (
                                "Chưa mở phiên"
                              )}
                            </span>
                          </div>
                          <h4 className="font-bold text-[#0F172A] mt-2 line-clamp-1">{session.course_name || `Lớp HP #${session.class_section_id}`}</h4>
                          <p className="text-xs text-[#64748B] mt-1 flex items-center gap-1">
                            <CalendarDays className="w-3.5 h-3.5" /> {formatDateVN(session.class_date)} ({session.start_time || "--:--"} - {session.end_time || "--:--"})
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          onClick={() => router.push(`/lecturer/live/${session.class_session_id}`)}
                          className="w-full border-[#0EA5E9] text-[#0EA5E9] hover:bg-[#EFF6FF] hover:text-[#0EA5E9] font-semibold mt-2"
                        >
                          <Video className="w-4 h-4 mr-1.5" />
                          Truy cập Phòng Live
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </AppShell>
  )
}
