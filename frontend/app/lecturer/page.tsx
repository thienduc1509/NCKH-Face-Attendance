"use client"

import { toast } from "sonner"
import { useEffect, useState } from "react"
import { AppShell } from "@/components/app-shell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import {
  Users,
  Clock,
  BookOpen,
  CalendarCheck,
  TrendingUp,
  Video,
  ArrowRight,
  AlertTriangle,
  Loader2
} from "lucide-react"
import Link from "next/link"
import { LecturerService } from "@/services/lecturer.service"
import { ClassService } from "@/services/class.service"
import { Claim } from "@/types/lecturer"
import { cn, formatDateVN } from "@/lib/utils"

export default function LecturerDashboard() {
  const [profile, setProfile] = useState<{ name: string; email: string; maCanBo: number } | null>(null)
  const [stats, setStats] = useState({
    lopCount: 0,
    studentCount: 0,
    attendanceRate: 0,
    changeRate: 0,
    claimsCount: 0
  })
  const [todayClasses, setTodayClasses] = useState<any[]>([])
  const [recentSessions, setRecentSessions] = useState<any[]>([])
  const [pendingClaims, setPendingClaims] = useState<Claim[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [processingClaimId, setProcessingClaimId] = useState<string | null>(null)

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      // 1. Fetch lecturer profile
      const prof = await LecturerService.getProfile()
      setProfile(prof)

      if (prof.maCanBo) {
        // 2. Fetch stats and lists in parallel using maCanBo
        const [
          classesList,
          claimsCount,
          monthlySummary,
          todaySched,
          recentSess,
          allClaims
        ] = await Promise.all([
          ClassService.getClasses(),
          LecturerService.getPendingClaimsCount(prof.maCanBo),
          LecturerService.getMonthlyAttendanceSummary(prof.maCanBo),
          LecturerService.getLichDayToday(prof.maCanBo),
          LecturerService.getRecentSessions(prof.maCanBo),
          LecturerService.getClaims(prof.maCanBo)
        ])

        // Parse attendance stats
        const currentRate = monthlySummary?.current_month_attendance_rate !== null && monthlySummary?.current_month_attendance_rate !== undefined
          ? Math.round(monthlySummary.current_month_attendance_rate * 10) / 10
          : (monthlySummary?.previous_month_attendance_rate
            ? Math.round(monthlySummary.previous_month_attendance_rate * 10) / 10
            : 0)

        const changeVal = monthlySummary?.change_percentage
          ? Math.round(monthlySummary.change_percentage * 10) / 10
          : 0

        // Parse student count: sum of current students in recent sessions or class lists
        // If not available, we can estimate or use a default
        const totalStudents = monthlySummary?.current_month_total_count
          || monthlySummary?.previous_month_total_count
          || 0

        setStats({
          lopCount: classesList.length,
          studentCount: totalStudents,
          attendanceRate: currentRate,
          changeRate: changeVal,
          claimsCount
        })

        // Map today classes
        setTodayClasses(todaySched.map((item: any) => {
          const isMakeup = item.note && (item.note.includes("Học bù") || item.note.includes("Hoãn"));
          return {
            id: item.class_session_id || item.class_section_id,
            subject: item.course_name || "Môn học",
            time: `${item.start_time || "N/A"} - ${item.end_time || "N/A"}`,
            room: "Phòng A2-301",
            students: item.student_count !== undefined ? item.student_count : (item.present_student_count + item.late_student_count + item.absent_student_count || 0),
            session: item.session_number || 1,
            isOfficial: !isMakeup,
            note: item.note || "",
            status: item.class_session_status === 'DA_KET_THUC' ? 'completed' : 'upcoming'
          };
        }))

        // Map recent sessions
        setRecentSessions(recentSess.map((item: any) => ({
          id: item.class_section_id,
          subject: item.course_name || "Môn học",
          date: item.class_date ? formatDateVN(item.class_date) : "N/A",
          present: item.present_student_count || 0,
          late: item.late_student_count || 0,
          absent: item.absent_student_count || 0
        })))

        // Filter and set pending claims
        setPendingClaims(allClaims.filter(c => c.status === 'pending'))
      }
    } catch (err: any) {
      console.error("Lỗi khi tải thông tin giảng viên:", err)
      setError("Không thể tải thông tin. Vui lòng kiểm tra lại kết nối mạng hoặc đăng nhập lại.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleClaimStatus = async (claimId: string, status: 'approved' | 'rejected') => {
    if (!profile) return
    setProcessingClaimId(claimId)
    try {
      const success = await LecturerService.updateClaimStatus(profile.maCanBo, claimId, status)
      if (success) {
        setPendingClaims(prev => prev.filter(c => c.id !== claimId))
        setStats(prev => ({
          ...prev,
          claimsCount: Math.max(0, prev.claimsCount - 1)
        }))
      } else {
        toast.error("Không thể cập nhật trạng thái khiếu nại.")
      }
    } catch (err) {
      toast.error("Đã xảy ra lỗi khi xử lý khiếu nại.")
    } finally {
      setProcessingClaimId(null)
    }
  }

  const userDisplayName = profile ? profile.name : "Giảng viên"
  const userEmail = profile ? profile.email : "loading..."

  return (
    <AppShell
      role="lecturer"
      user={{ name: userDisplayName, email: userEmail, avatar: "" }}
      breadcrumb="Dashboard"
      notificationCount={pendingClaims.length}
    >
      <div className="space-y-6">
        {/* Welcome */}
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">
            Xin chào, {userDisplayName}!
          </h1>
          <p className="text-[#64748B] mt-1">Học kỳ 1 — Năm học 2025-2026</p>
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center py-24 bg-white rounded-xl border border-[#E2E8F0]">
            <Loader2 className="w-10 h-10 text-[#0EA5E9] animate-spin mb-4" />
            <p className="text-[#64748B] font-medium">Đang tải thông tin dashboard...</p>
          </div>
        )}

        {!loading && error && (
          <Card className="border-[#EF4444] bg-[#FEF2F2]">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <AlertTriangle className="w-12 h-12 text-[#EF4444] mb-3" />
              <h3 className="text-lg font-semibold text-[#991B1B] mb-1">Không thể kết nối</h3>
              <p className="text-[#DC2626] mb-4 max-w-md text-sm">{error}</p>
              <Button onClick={loadData} variant="outline" className="border-[#EF4444] text-[#EF4444] hover:bg-[#EF4444] hover:text-white">
                Thử lại
              </Button>
            </CardContent>
          </Card>
        )}

        {!loading && !error && (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="border-[#E2E8F0] shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-[#64748B] font-medium">Lớp giảng dạy</p>
                      <p className="text-3xl font-bold text-[#0A2540] mt-1">{stats.lopCount}</p>
                      <p className="text-xs text-[#64748B] mt-1">trong học kỳ này</p>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-[#E0F2FE] flex items-center justify-center">
                      <BookOpen className="w-6 h-6 text-[#0EA5E9]" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-[#E2E8F0] shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-[#64748B] font-medium">Tổng lượt ĐD</p>
                      <p className="text-3xl font-bold text-[#0A2540] mt-1">{stats.studentCount}</p>
                      <p className="text-xs text-[#64748B] mt-1">trong tháng này</p>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-[#E8F5E9] flex items-center justify-center">
                      <Users className="w-6 h-6 text-[#22C55E]" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-[#E2E8F0] shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-[#64748B] font-medium">Tỷ lệ có mặt TB</p>
                      <p className="text-3xl font-bold text-[#22C55E] mt-1">{stats.attendanceRate}%</p>
                      <p className={cn(
                        "text-xs mt-1 flex items-center gap-1 font-semibold",
                        stats.changeRate >= 0 ? "text-[#22C55E]" : "text-[#EF4444]"
                      )}>
                        <TrendingUp className="w-3 h-3" />
                        {stats.changeRate >= 0 ? `+${stats.changeRate}` : stats.changeRate}% so với tháng trước
                      </p>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-[#E8F5E9] flex items-center justify-center">
                      <CalendarCheck className="w-6 h-6 text-[#22C55E]" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className={cn(
                "border-[#E2E8F0] shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200",
                stats.claimsCount > 0 ? "border-l-4 border-l-[#F59E0B] bg-[#FFF9C4]/10" : "border-l-4 border-l-[#22C55E]"
              )}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-[#64748B] font-medium">Khiếu nại chờ</p>
                      <p className={cn(
                        "text-3xl font-bold mt-1",
                        stats.claimsCount > 0 ? "text-[#F59E0B]" : "text-[#22C55E]"
                      )}>{stats.claimsCount}</p>
                      <p className={cn(
                        "text-xs mt-1 font-medium",
                        stats.claimsCount > 0 ? "text-[#F59E0B]" : "text-slate-500"
                      )}>cần xử lý</p>
                    </div>
                    <div className={cn(
                      "w-12 h-12 rounded-full flex items-center justify-center",
                      stats.claimsCount > 0 ? "bg-[#FFF9C4]" : "bg-[#E8F5E9]"
                    )}>
                      <AlertTriangle className={cn("w-6 h-6", stats.claimsCount > 0 ? "text-[#F59E0B]" : "text-[#22C55E]")} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Today's Classes - Full Width Prominent Section */}
            <Card className="border-[#0EA5E9]/30 bg-gradient-to-r from-white via-[#F8FAFC] to-[#F0F9FF] dark:from-[#0B1329] dark:via-[#0F172A] dark:to-[#111E38] dark:border-[#1E293B] shadow-md">
              <CardHeader className="pb-3 border-b border-[#E2E8F0] dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-[#0EA5E9] animate-pulse" />
                    <CardTitle className="text-xl font-bold text-[#0F172A] dark:text-white">
                      Lịch Giảng Dạy Hôm Nay
                    </CardTitle>
                  </div>
                  <span className="text-sm font-semibold text-[#0EA5E9] dark:text-[#38BDF8] bg-[#E0F2FE] dark:bg-[#0284C7]/20 border border-transparent dark:border-[#0EA5E9]/30 px-3 py-1 rounded-full">
                    📅 {new Date().toLocaleDateString("vi-VN", { weekday: 'long', year: 'numeric', month: 'numeric', day: 'numeric' })}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="space-y-4">
                  {todayClasses.length === 0 ? (
                    <div className="text-center py-8 text-[#64748B] dark:text-slate-400 text-base bg-white dark:bg-slate-900 rounded-xl border border-dashed border-[#CBD5E1] dark:border-slate-800">
                      🎉 Hôm nay bạn không có lịch giảng dạy nào. Tận hưởng thời gian nghỉ ngơi!
                    </div>
                  ) : (
                    todayClasses.map((cls) => (
                      <div
                        key={cls.id}
                        className="flex flex-col md:flex-row md:items-center justify-between p-5 bg-white dark:bg-[#0A1628] rounded-2xl border-2 border-[#E2E8F0] dark:border-slate-800 hover:border-[#0EA5E9] dark:hover:border-[#0EA5E9] hover:shadow-md transition-all gap-4"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-16 h-16 rounded-2xl bg-[#0A2540] dark:bg-[#071322] flex flex-col items-center justify-center text-white shrink-0 shadow-sm border border-[#1A3A5C]">
                            <span className="text-[11px] text-[#93C5FD] font-semibold uppercase tracking-wider">Tiết học</span>
                            <span className="text-base font-extrabold">Buổi {cls.session}</span>
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2.5 flex-wrap">
                              <h3 className="font-extrabold text-[#0F172A] dark:text-white text-lg">{cls.subject}</h3>
                              {cls.isOfficial ? (
                                <span className="px-3 py-1 text-xs font-bold rounded-lg bg-[#DCFCE7] dark:bg-[#14532D]/40 text-[#15803D] dark:text-[#4ADE80] border border-[#86EFAC] dark:border-[#22C55E]/40 flex items-center gap-1">
                                  ✓ Buổi chính khóa (QTV lập sẵn)
                                </span>
                              ) : (
                                <span className="px-3 py-1 text-xs font-bold rounded-lg bg-[#FFEDD5] dark:bg-[#7C2D12]/40 text-[#C2410C] dark:text-[#FB923C] border border-[#FDBA74] dark:border-[#F97316]/40 flex items-center gap-1">
                                  ⚡ Buổi học bù / Đổi lịch
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-sm text-[#475569] dark:text-slate-400 pt-0.5">
                              <span className="font-bold text-[#0A2540] dark:text-slate-200 bg-[#F1F5F9] dark:bg-slate-800/80 px-2.5 py-0.5 rounded-md border border-[#E2E8F0] dark:border-slate-700">🏛️ {cls.room}</span>
                              <span>•</span>
                              <span className="font-semibold text-[#0284C7] dark:text-[#38BDF8]">👥 {cls.students} Sinh viên đăng ký</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between md:justify-end gap-4 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-[#F1F5F9] dark:border-slate-800">
                          <div className="flex items-center gap-2 text-[#0F172A] dark:text-white bg-[#F8FAFC] dark:bg-slate-800 px-4 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 text-sm font-bold shadow-xs">
                            <Clock className="w-4 h-4 text-[#0EA5E9]" />
                            <span>{cls.time}</span>
                          </div>
                          <Link href={`/lecturer/live/${cls.id}`}>
                            <Button size="lg" className="bg-[#0EA5E9] hover:bg-[#0284C7] text-white font-bold text-sm px-5 py-2.5 rounded-xl shadow-md transition-all hover:scale-102">
                              <Video className="w-4 h-4 mr-2" />
                              Mở phòng Live
                            </Button>
                          </Link>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Recent Sessions */}
              <Card className="border-[#E2E8F0] shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-semibold text-[#0F172A]">
                      Buổi học gần đây
                    </CardTitle>
                    <Link
                      href="/lecturer/reports"
                      className="text-sm text-[#0EA5E9] hover:underline flex items-center gap-1"
                    >
                      Xem tất cả
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {recentSessions.length === 0 ? (
                      <div className="text-center py-6 text-[#64748B] text-sm">
                        Chưa có buổi học nào diễn ra gần đây.
                      </div>
                    ) : (
                      recentSessions.map((session, idx) => (
                        <div
                          key={`${session.id}-${idx}`}
                          className="p-3 border-b border-[#E2E8F0] last:border-0"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <p className="font-medium text-[#0F172A]">{session.subject}</p>
                            <span className="text-sm text-[#64748B]">{session.date}</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-1">
                              <div className="w-2 h-2 rounded-full bg-[#22C55E]" />
                              <span className="text-sm text-[#64748B]">{session.present} có mặt</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <div className="w-2 h-2 rounded-full bg-[#F59E0B]" />
                              <span className="text-sm text-[#64748B]">{session.late} muộn</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <div className="w-2 h-2 rounded-full bg-[#EF4444]" />
                              <span className="text-sm text-[#64748B]">{session.absent} vắng</span>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Pending Claims */}
            {pendingClaims.length > 0 && (
              <Card className="border-[#E2E8F0] shadow-sm border-l-4 border-l-[#F59E0B]">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-semibold text-[#0F172A] flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-[#F59E0B]" />
                      Khiếu nại cần xử lý
                    </CardTitle>
                    <Link
                      href="/lecturer/claims"
                      className="text-sm text-[#0EA5E9] hover:underline flex items-center gap-1"
                    >
                      Xem tất cả
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {pendingClaims.map((claim) => (
                      <div
                        key={claim.id}
                        className="flex items-center justify-between p-3 bg-[#FEF9C3]/30 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-[#0A2540] flex items-center justify-center text-white font-medium">
                            {claim.studentName.charAt(0)}
                          </div>
                          <div>
                            <p className="font-medium text-[#0F172A]">{claim.studentName}</p>
                            <p className="text-sm text-[#64748B]">
                              Mã SV: {claim.studentId} • {claim.subjectName} • Buổi {claim.sessionNumber} • {claim.date}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <StatusBadge status={claim.currentStatus} />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-[#22C55E] border-[#22C55E] hover:bg-[#22C55E] hover:text-white"
                              onClick={() => handleClaimStatus(claim.id, 'approved')}
                              disabled={processingClaimId === claim.id}
                            >
                              Chấp thuận
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-[#EF4444] border-[#EF4444] hover:bg-[#EF4444] hover:text-white"
                              onClick={() => handleClaimStatus(claim.id, 'rejected')}
                              disabled={processingClaimId === claim.id}
                            >
                              Từ chối
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </AppShell>
  )
}
