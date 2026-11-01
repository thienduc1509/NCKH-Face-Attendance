"use client"

import { useEffect, useState } from "react"
import { AppShell } from "@/components/app-shell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import {
  CalendarCheck,
  AlertTriangle,
  TrendingUp,
  Clock,
  BookOpen,
  ArrowRight,
  Loader2
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { StudentService } from "@/services/student.service"
import { StudentProfile } from "@/types/student"
import { cn } from "@/lib/utils"

export default function StudentDashboard() {
  const router = useRouter()
  const [profile, setProfile] = useState<StudentProfile | null>(null)
  const [schedule, setSchedule] = useState<any[]>([])
  const [attendance, setAttendance] = useState<any[]>([])
  const [registeredCourses, setRegisteredCourses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [notificationsList, setNotificationsList] = useState<any[]>([])

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        const [profileData, scheduleData, attendanceData, warningsData, claimsData, availableClassesData] = await Promise.all([
          StudentService.getProfile(),
          StudentService.getSchedule(),
          StudentService.getAttendance(),
          StudentService.getWarnings().catch(() => []),
          StudentService.getClaims().catch(() => []),
          StudentService.getAvailableClasses().catch(() => [])
        ])
        setProfile(profileData)
        setSchedule(scheduleData)
        setAttendance(attendanceData)
        setRegisteredCourses(availableClassesData.filter((c: any) => c.is_registered))

        // Construct dynamic real-time notification items
        const notifs: any[] = []

        // 1. Absence warning notifications
        if (warningsData && warningsData.length > 0) {
          warningsData.forEach((w: any, idx: number) => {
            notifs.push({
              id: `warn-${idx}`,
              type: "warning",
              title: "[CẢNH BÁO NGUY CƠ CẤM THI]",
              description: `Môn ${w.course_name || 'Học phần'}: Bạn đã vắng ${w.absent_session_count}/${w.total_class_sessions} buổi. Hãy chú ý chuyên cần!`
            })
          })
        }

        // 2. Claim response notifications
        if (claimsData && claimsData.length > 0) {
          claimsData.slice(0, 2).forEach((c: any, idx: number) => {
            if (c.status === "approved") {
              notifs.push({
                id: `claim-${idx}`,
                type: "info",
                title: "[KẾT QUẢ KHIẾU NẠI]",
                description: `Khiếu nại môn ${c.subjectName} đã được Giảng viên CHẤP THUẬN. Dữ liệu điểm danh đã cập nhật.`
              })
            }
          })
        }

        // 3. Fallback reminder if no warnings
        if (notifs.length === 0) {
          notifs.push({
            id: "system-welcome",
            type: "info",
            title: "[NHẮC NHỞ CHUYÊN CẦN]",
            description: "Chào mừng bạn trở lại! Hãy chú ý điểm danh đầy đủ bằng nhận diện khuôn mặt AI cho các buổi học."
          })
        }

        setNotificationsList(notifs)
      } catch (err: any) {
        console.error("Error loading dashboard data:", err)
        setError(err.message || "Đã xảy ra lỗi khi tải dữ liệu.")
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  useEffect(() => {
    let disposed = false
    const refreshSchedule = () => {
      StudentService.getSchedule().then(items => {
        if (!disposed) setSchedule(items)
      }).catch(() => {})
    }
    const timer = setInterval(refreshSchedule, 5000)
    window.addEventListener("focus", refreshSchedule)
    return () => {
      disposed = true
      clearInterval(timer)
      window.removeEventListener("focus", refreshSchedule)
    }
  }, [])

  if (loading) {
    return (
      <AppShell
        role="student"
        user={{ name: "Đang tải", email: "", avatar: "" }}
        breadcrumb="Dashboard"
      >
        <div className="flex flex-col items-center justify-center py-24 bg-white rounded-xl border border-[#E2E8F0]">
          <Loader2 className="w-10 h-10 text-[#0EA5E9] animate-spin mb-4" />
          <p className="text-[#64748B] font-medium">Đang tải dữ liệu dashboard...</p>
        </div>
      </AppShell>
    )
  }

  const userDisplayName = profile?.name || "Sinh viên"
  const userEmail = profile?.email || ""

  // Calculate statistics (Supports both English PRESENT/LATE/ABSENT and Vietnamese CO_MAT/DI_MUON/VANG)
  const totalSessions = attendance.length
  const presentCount = attendance.filter(a => a.status === "PRESENT" || a.status === "CO_MAT").length
  const lateCount = attendance.filter(a => a.status === "LATE" || a.status === "DI_MUON").length
  const absentCount = attendance.filter(a => a.status === "ABSENT" || a.status === "VANG").length

  // Standard attendance rate: (Present + Late) / Total
  const attendedCount = presentCount + lateCount
  const rawRate = totalSessions > 0 ? (attendedCount / totalSessions) * 100 : 0
  const attendanceRate = Number.isInteger(rawRate) ? rawRate.toFixed(0) : rawRate.toFixed(1)

  // Absence warnings (absent count per class > 20% limit or just count absents)
  const absencesByClass: Record<number, { absent: number, total: number, name: string }> = {}
  attendance.forEach(a => {
    const classId = a.class_section_id
    const className = a.course_name || `Lớp ${classId}`
    if (!absencesByClass[classId]) {
      absencesByClass[classId] = { absent: 0, total: 0, name: className }
    }
    absencesByClass[classId].total++
    if (a.status === "ABSENT" || a.status === "VANG") {
      absencesByClass[classId].absent++
    }
  })

  // Warning classes list (classes where student missed >= 20% sessions)
  const warningClasses = Object.values(absencesByClass).filter(c => c.absent / c.total >= 0.2)
  const warningText = warningClasses.length > 0
    ? `${warningClasses.length} môn`
    : "Không có"

  // Find active session
  const activeSession = schedule.find(item => item.status === "DANG_DIEN_RA" || item.status === "ONGOING")

  // Map registered course classes and schedule items
  const upcomingClasses = (registeredCourses.length > 0
    ? registeredCourses.map(rc => {
        const matches = schedule.filter(s => s.class_section_id === rc.class_section_id)
        const matchSched = matches.find(s => s.status === "DANG_DIEN_RA" || s.status === "ONGOING") || matches[0]
        return {
          id: matchSched?.class_session_id || rc.class_section_id,
          maBuoiHoc: matchSched?.class_session_id,
          subject: rc.course_name || `Lớp HP ${rc.class_section_id}`,
          date: matchSched?.class_date ? new Date(matchSched.class_date).toLocaleDateString("vi-VN") : `Học kỳ ${rc.semester || 1}`,
          time: matchSched ? `${matchSched.start_time?.substring(0, 5) || "07:30"} - ${matchSched.end_time?.substring(0, 5) || "11:30"}` : "07:30 - 11:30",
          room: matchSched?.phong_hoc || "Phòng A2-301",
          status: matchSched?.status || "CHUA_DIEM_DANH",
          lecturer: rc.lecturer_name || "Giảng viên"
        }
      })
    : schedule.map((item, idx) => ({
        id: item.class_session_id || item.class_section_id || idx,
        maBuoiHoc: item.class_session_id,
        subject: item.course_name || `Lớp HP ${item.class_section_id}`,
        date: item.class_date ? new Date(item.class_date).toLocaleDateString("vi-VN") : "Hôm nay",
        time: `${item.start_time?.substring(0, 5) || "07:30"} - ${item.end_time?.substring(0, 5) || "11:30"}`,
        room: item.phong_hoc || "Phòng A2-301",
        status: item.status || "CHUA_DIEM_DANH",
        lecturer: "Giảng viên"
      }))
  ).slice(0, 5)

  const getScheduleStatusText = (status: string) => {
    if (status === "DANG_DIEN_RA" || status === "ONGOING") return "Đang mở điểm danh"
    if (status === "DA_KET_THUC" || status === "COMPLETED") return "Đã kết thúc"
    if (status === "DA_HUY" || status === "CANCELLED") return "Đã hủy"
    return "Chưa mở điểm danh"
  }

  const handleOpenSchedule = (item: typeof upcomingClasses[number]) => {
    if (!item.maBuoiHoc) {
      alert("Buổi học này chưa có mã phiên điểm danh.")
      return
    }

    if (item.status === "DANG_DIEN_RA" || item.status === "ONGOING") {
      router.push(`/student/live?id=${item.maBuoiHoc}`)
      return
    }

    if (item.status === "DA_KET_THUC" || item.status === "COMPLETED") {
      alert("Buổi học này đã kết thúc. Bạn có thể xem kết quả trong lịch sử điểm danh.")
      router.push("/student/history")
      return
    }

    if (item.status === "DA_HUY" || item.status === "CANCELLED") {
      alert("Buổi học này đã bị hủy.")
      return
    }

    alert("Giảng viên chưa mở phiên điểm danh cho buổi học này.")
  }

  // Map attendance items (most recent first)
  const recentAttendance = [...attendance].reverse().slice(0, 5).map((item, idx) => ({
    id: item.attendance_id || idx,
    subject: item.course_name || `Lớp học phần ${item.class_section_id}`,
    date: item.class_date ? new Date(item.class_date).toLocaleDateString("vi-VN") : "N/A",
    status: (item.status === "PRESENT" || item.status === "CO_MAT") ? "present" as const : (item.status === "LATE" || item.status === "DI_MUON") ? "late" as const : "absent" as const
  }))

  // Map streak items (last 10 records)
  const streakDays = attendance.slice(-10).map((item) => ({
    date: item.class_date ? item.class_date.substring(5, 10).replace("-", "/") : "N/A",
    status: item.status === "CO_MAT" ? "present" : item.status === "DI_MUON" ? "late" : "absent"
  }))

  // Map warning classes to detailed notification items
  const studentNotifications = warningClasses.map((cls, idx) => ({
    id: `warning-absent-${idx}`,
    title: "Cảnh báo cấm thi",
    description: `Môn học phần "${cls.name}" đã nghỉ ${cls.absent}/${cls.total} buổi (${((cls.absent / cls.total) * 100).toFixed(0)}%).`,
    type: "warning" as const,
  }))

  return (
    <AppShell
      role="student"
      user={{ name: userDisplayName, email: userEmail, avatar: "" }}
      breadcrumb="Dashboard"
      notifications={notificationsList.length > 0 ? notificationsList : studentNotifications}
    >
      <div className="space-y-6">
        {/* Welcome */}
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">
            Xin chào, {userDisplayName}!
          </h1>
          <p className="text-[#64748B] mt-1">Học kỳ hiện tại — Năm học 2025-2026</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-[#E2E8F0] shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-[#64748B] font-medium">Tỷ lệ chuyên cần</p>
                  <p className="text-3xl font-bold text-[#0A2540] mt-1">{attendanceRate}%</p>
                  <p className="text-xs text-[#22C55E] mt-1.5 flex items-center gap-1 font-semibold">
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
                  <p className="text-3xl font-bold text-[#0A2540] mt-1">{attendedCount}/{totalSessions}</p>
                  <p className="text-xs text-[#64748B] mt-1.5">Số buổi có mặt + đi muộn</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-[#E0F2FE] flex items-center justify-center">
                  <BookOpen className="w-6 h-6 text-[#0EA5E9]" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className={cn(
            "border-[#E2E8F0] shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200",
            warningClasses.length > 0 ? "border-l-4 border-l-[#EF4444] bg-red-50/10" : "border-l-4 border-l-[#22C55E]"
          )}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-[#64748B] font-medium">Cảnh báo vắng</p>
                  <p className={cn(
                    "text-3xl font-bold mt-1",
                    warningClasses.length > 0 ? "text-[#EF4444]" : "text-[#22C55E]"
                  )}>{warningText}</p>
                  <p className={cn(
                    "text-xs mt-1.5 font-medium",
                    warningClasses.length > 0 ? "text-[#EF4444]" : "text-slate-500"
                  )}>
                    {warningClasses.length > 0 ? "Vượt quá 20% giới hạn vắng" : "Đạt yêu cầu chuyên cần"}
                  </p>
                </div>
                <div className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center",
                  warningClasses.length > 0 ? "bg-red-100" : "bg-[#E8F5E9]"
                )}>
                  <AlertTriangle className={cn("w-6 h-6", warningClasses.length > 0 ? "text-[#EF4444]" : "text-[#22C55E]")} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Upcoming Classes */}
          <Card className="border-[#E2E8F0] shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-semibold text-[#0F172A]">
                  Lịch học đã đăng ký
                </CardTitle>
                <span className="text-sm text-[#64748B]">Học phần</span>
              </div>
            </CardHeader>
            <CardContent>
              {upcomingClasses.length > 0 ? (
                <div className="space-y-3">
                  {upcomingClasses.map((cls) => (
                    <button
                      key={cls.id}
                      type="button"
                      onClick={() => handleOpenSchedule(cls)}
                      className="flex w-full items-center justify-between p-3.5 bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] hover:bg-[#EFF6FF] hover:border-[#0EA5E9] transition-all text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0EA5E9]"
                    >
                      <div className="flex items-center gap-3.5">
                        <div className="w-11 h-11 rounded-xl bg-[#0A2540] flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-xs">
                          LHP
                        </div>
                        <div>
                          <p className="font-bold text-[#0F172A] text-base">{cls.subject}</p>
                          <p className="text-xs text-[#475569] mt-0.5">👨‍🏫 {cls.lecturer} • 🏛️ {cls.room}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={cls.status === "DANG_DIEN_RA" ? "px-2 py-0.5 text-[11px] font-bold bg-[#DCFCE7] text-[#15803D] rounded-md border border-[#86EFAC]" : "px-2 py-0.5 text-[11px] font-medium bg-[#E2E8F0] text-[#475569] rounded-md"}>
                              {getScheduleStatusText(cls.status)}
                            </span>
                            <span className="text-xs text-[#64748B]">{cls.date}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="flex items-center gap-1.5 text-[#0F172A] bg-white px-2.5 py-1 rounded-lg border border-[#E2E8F0] text-xs font-semibold">
                          <Clock className="w-3.5 h-3.5 text-[#0EA5E9]" />
                          <span>{cls.time}</span>
                        </div>
                        <ArrowRight className="w-4 h-4 text-[#94A3B8]" />
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[#64748B] text-center py-6">Không có lịch học nào được xếp.</p>
              )}
              {activeSession && (
                <Link href={`/student/live?id=${activeSession.class_session_id}`}>
                  <Button className="w-full mt-4 bg-[#22C55E] hover:bg-[#16A34A] text-white font-semibold animate-pulse border border-[#22C55E]">
                    Vào điểm danh: {activeSession.course_name}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>

          {/* Recent Attendance */}
          <Card className="border-[#E2E8F0] shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-semibold text-[#0F172A]">
                  Điểm danh gần đây
                </CardTitle>
                <Link
                  href="/student/history"
                  className="text-sm text-[#0EA5E9] hover:underline flex items-center gap-1"
                >
                  Xem tất cả
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {recentAttendance.length > 0 ? (
                <div className="space-y-3">
                  {recentAttendance.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between py-2 border-b border-[#E2E8F0] last:border-0"
                    >
                      <div>
                        <p className="font-medium text-[#0F172A]">{item.subject}</p>
                        <p className="text-sm text-[#64748B]">{item.date}</p>
                      </div>
                      <StatusBadge status={item.status} />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[#64748B] text-center py-6">Chưa có lịch sử điểm danh nào.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Attendance Streak */}
        {streakDays.length > 0 && (
          <Card className="border-[#E2E8F0] shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold text-[#0F172A]">
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
      </div>
    </AppShell>
  )
}
