"use client"

import { useEffect, useState } from "react"
import { AppShell } from "@/components/app-shell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Users,
  BookOpen,
  ScanFace,
  TrendingUp,
  AlertTriangle,
  FileText,
  ArrowRight,
  Loader2
} from "lucide-react"
import Link from "next/link"
import { AdminService } from "@/services/admin.service"

const defaultStats = {
  total_users: 0,
  total_students: 0,
  total_lecturers: 0,
  total_admins: 0,
  total_classes: 0,
  avg_attendance_rate: 0,
  students_without_face: 0
}

const actionLabels: Record<string, string> = {
  "DANG_NHAP": "Đăng nhập",
  "DANG_KY_KHUON_MAT": "Đăng ký khuôn mặt",
  "XAC_MINH_KHUON_MAT": "Điểm danh quét mặt",
  "PHE_DUYET_KHUON_MAT": "Phê duyệt khuôn mặt",
  "TU_CHOI_KHUON_MAT": "Từ chối khuôn mặt",
  "TAO_NGUOI_DUNG": "Tạo người dùng",
  "CAP_NHAT_NGUOI_DUNG": "Cập nhật người dùng",
  "XOA_NGUOI_DUNG": "Xóa người dùng"
}

const getActionLabel = (action: string) => {
  return actionLabels[action] || action
}

export default function AdminDashboard() {
  const [adminUser, setAdminUser] = useState({
    name: "Admin",
    email: "admin@university.edu.vn",
    avatar: ""
  })
  const [stats, setStats] = useState(defaultStats)
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadDashboardData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [statsData, logsData, profile] = await Promise.all([
        AdminService.getStats(),
        AdminService.getLogs(),
        AdminService.getProfile().catch(() => ({ name: "Admin", email: "admin@university.edu.vn" }))
      ])
      setStats(statsData)
      setLogs(logsData)
      setAdminUser({ ...profile, avatar: "" })
    } catch (err: any) {
      console.error("Lỗi tải thông tin dashboard:", err)
      setError("Không thể tải thông tin thống kê từ máy chủ.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDashboardData()
  }, [])

  return (
    <AppShell
      role="admin"
      user={adminUser}
      breadcrumb="Dashboard"
      notificationCount={stats.students_without_face}
    >
      <div className="space-y-6">
        {/* Welcome */}
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">
            Bảng điều khiển Quản trị
          </h1>
          <p className="text-[#64748B] mt-1">Học kỳ này - Năm học hiện tại</p>
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center py-24 bg-white rounded-xl border border-[#E2E8F0] shadow-sm">
            <Loader2 className="w-10 h-10 text-[#0EA5E9] animate-spin mb-4" />
            <p className="text-[#64748B] font-medium">Đang tải số liệu thống kê...</p>
          </div>
        )}

        {!loading && error && (
          <Card className="border-[#EF4444] bg-[#FEF2F2]">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <AlertTriangle className="w-12 h-12 text-[#EF4444] mb-3" />
              <h3 className="text-lg font-semibold text-[#991B1B] mb-1">Đã xảy ra lỗi</h3>
              <p className="text-[#DC2626] mb-4 max-w-md text-sm">{error}</p>
              <Button onClick={loadDashboardData} variant="outline" className="border-[#EF4444] text-[#EF4444] hover:bg-[#EF4444] hover:text-white">
                Thử lại
              </Button>
            </CardContent>
          </Card>
        )}

        {!loading && !error && (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-stretch">
              {/* Card 1: Tổng người dùng */}
              <Card className="border-[#E2E8F0] shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 h-full flex flex-col justify-between">
                <CardContent className="pt-6 pb-6 flex-1 flex flex-col justify-between">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <p className="text-sm text-[#64748B] font-normal">Tổng người dùng</p>
                      <p className="text-4xl font-bold text-[#0F172A] tracking-tight">{stats.total_users}</p>
                    </div>
                    <div className="w-11 h-11 rounded-full bg-[#F1F5F9] flex items-center justify-center shrink-0">
                      <Users className="w-5 h-5 text-[#475569]" />
                    </div>
                  </div>
                  <p className="text-xs text-[#64748B] mt-4 font-normal">
                    {stats.total_students} Sinh viên • {stats.total_lecturers} Giảng viên • {stats.total_admins} Quản trị viên
                  </p>
                </CardContent>
              </Card>

              {/* Card 2: Lớp học phần */}
              <Card className="border-[#E2E8F0] shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 h-full flex flex-col justify-between">
                <CardContent className="pt-6 pb-6 flex-1 flex flex-col justify-between">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <p className="text-sm text-[#64748B] font-normal">Lớp học phần</p>
                      <p className="text-4xl font-bold text-[#0F172A] tracking-tight">{stats.total_classes}</p>
                    </div>
                    <div className="w-11 h-11 rounded-full bg-[#FFEDD5] flex items-center justify-center shrink-0">
                      <BookOpen className="w-5 h-5 text-[#F97316]" />
                    </div>
                  </div>
                  <p className="text-xs text-[#F97316] mt-4 font-medium">
                    {stats.total_classes} lớp đang hoạt động
                  </p>
                </CardContent>
              </Card>

              {/* Card 3: Tỷ lệ chuyên cần */}
              <Card className="border-[#E2E8F0] shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 h-full flex flex-col justify-between">
                <CardContent className="pt-6 pb-6 flex-1 flex flex-col justify-between">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <p className="text-sm text-[#64748B] font-normal">Tỷ lệ chuyên cần</p>
                      <p className="text-4xl font-bold text-[#16A34A] tracking-tight">
                        {Math.round(stats.avg_attendance_rate * 1000) / 10}%
                      </p>
                    </div>
                    <div className="w-11 h-11 rounded-full bg-[#DCFCE7] flex items-center justify-center shrink-0">
                      <TrendingUp className="w-5 h-5 text-[#16A34A]" />
                    </div>
                  </div>
                  <p className="text-xs text-[#16A34A] mt-4 font-medium">
                    Tính trên các buổi đã hoàn thành
                  </p>
                </CardContent>
              </Card>

              {/* Card 4: Sinh viên chưa đăng ký khuôn mặt */}
              <Card className="border-[#E2E8F0] shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 h-full flex flex-col justify-between">
                <CardContent className="pt-6 pb-6 flex-1 flex flex-col justify-between">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <p className="text-sm text-[#64748B] font-normal">Sinh viên chưa đăng ký khuôn mặt</p>
                      <p className="text-4xl font-bold text-[#EF4444] tracking-tight">{stats.students_without_face}</p>
                    </div>
                    <div className="w-11 h-11 rounded-full bg-[#FEE2E2] flex items-center justify-center shrink-0">
                      <ScanFace className="w-5 h-5 text-[#EF4444]" />
                    </div>
                  </div>
                  <p className="text-xs text-[#EF4444] mt-4 font-medium">
                    Yêu cầu đăng ký khuôn mặt
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Quick Actions */}
              <Card className="border-[#E2E8F0] shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg font-semibold text-[#0F172A]">
                    Truy cập nhanh
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3">
                    <Link href="/admin/users">
                      <div className="p-4 bg-[#F8FAFC] border border-slate-100 rounded-xl hover:bg-sky-50/50 hover:border-sky-200 transition-all duration-200 cursor-pointer group">
                        <Users className="w-8 h-8 text-[#0A2540] mb-2" />
                        <p className="font-semibold text-[#0F172A] group-hover:text-[#0EA5E9] transition-colors">Quản lý người dùng</p>
                        <p className="text-sm text-[#64748B] mt-0.5">{stats.total_users} tài khoản</p>
                      </div>
                    </Link>
                    <Link href="/admin/classes">
                      <div className="p-4 bg-[#F8FAFC] border border-slate-100 rounded-xl hover:bg-sky-50/50 hover:border-sky-200 transition-all duration-200 cursor-pointer group">
                        <BookOpen className="w-8 h-8 text-[#0A2540] mb-2" />
                        <p className="font-semibold text-[#0F172A] group-hover:text-[#0EA5E9] transition-colors">Lớp học phần</p>
                        <p className="text-sm text-[#64748B] mt-0.5">{stats.total_classes} lớp</p>
                      </div>
                    </Link>
                    <Link href="/admin/faces">
                      <div className="p-4 bg-[#F8FAFC] border border-slate-100 rounded-xl hover:bg-sky-50/50 hover:border-sky-200 transition-all duration-200 cursor-pointer group">
                        <ScanFace className="w-8 h-8 text-[#0A2540] mb-2" />
                        <p className="font-semibold text-[#0F172A] group-hover:text-[#0EA5E9] transition-colors">Dữ liệu khuôn mặt</p>
                        <p className="text-sm text-[#64748B] mt-0.5">{stats.students_without_face} SV chưa có</p>
                      </div>
                    </Link>
                    <Link href="/admin/reports">
                      <div className="p-4 bg-[#F8FAFC] border border-slate-100 rounded-xl hover:bg-sky-50/50 hover:border-sky-200 transition-all duration-200 cursor-pointer group">
                        <FileText className="w-8 h-8 text-[#0A2540] mb-2" />
                        <p className="font-semibold text-[#0F172A] group-hover:text-[#0EA5E9] transition-colors">Báo cáo tổng hợp</p>
                        <p className="text-sm text-[#64748B] mt-0.5">Xuất báo cáo</p>
                      </div>
                    </Link>
                  </div>
                </CardContent>
              </Card>

              {/* Warnings */}
              <Card className="border-[#E2E8F0] shadow-sm border-l-4 border-l-[#F59E0B]">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-semibold text-[#0F172A] flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-[#F59E0B]" />
                      Cảnh báo hệ thống
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="p-3 bg-[#FEE2E2] rounded-lg">
                      <p className="font-medium text-[#991B1B]">Cảnh báo chuyên cần</p>
                      <p className="text-sm text-[#991B1B]/80 mt-1">Cần rà soát các sinh viên vắng vượt quá 20% số buổi.</p>
                    </div>
                    {stats.students_without_face > 0 && (
                      <div className="p-3 bg-[#FEF9C3] rounded-lg">
                        <p className="font-medium text-[#92400E]">{stats.students_without_face} sinh viên chưa có ảnh</p>
                        <p className="text-sm text-[#92400E]/80 mt-1">Yêu cầu đăng ký khuôn mặt để bắt đầu điểm danh tự động.</p>
                      </div>
                    )}
                    <div className="p-3 bg-[#DBEAFE] rounded-lg">
                      <p className="font-medium text-[#1E40AF]">Khiếu nại điểm danh</p>
                      <p className="text-sm text-[#1E40AF]/80 mt-1">Các đơn khiếu nại quá hạn cần được nhắc nhở xử lý.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Recent Activity */}
            <Card className="border-[#E2E8F0] shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-semibold text-[#0F172A]">
                    Hoạt động gần đây
                  </CardTitle>
                  <Link
                    href="/admin/audit"
                    className="text-sm text-[#0EA5E9] hover:underline flex items-center gap-1"
                  >
                    Xem tất cả
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {logs.length === 0 ? (
                    <div className="text-center py-6 text-[#64748B] text-sm">
                      Chưa ghi nhận hoạt động nào gần đây.
                    </div>
                  ) : (
                    logs.map((log) => (
                      <div
                        key={log.id}
                        className="flex items-center gap-4 p-3 bg-[#F8FAFC] rounded-xl hover:bg-slate-50 transition-colors border border-slate-100"
                      >
                        <div className={`w-1 h-10 rounded-full ${
                          log.action === "DANG_NHAP" ? "bg-[#3B82F6]" :
                          log.action?.includes("XOA") || log.action === "TU_CHOI_KHUON_MAT" ? "bg-[#EF4444]" :
                          log.action?.includes("PHE_DUYET") || log.action?.includes("XAC_MINH") ? "bg-[#22C55E]" : "bg-[#64748B]"
                        }`} />
                        <div className="flex-1">
                          <p className="text-sm">
                            <span className="font-semibold text-[#0F172A]">{log.user}</span>
                            <span className="text-slate-500"> • {getActionLabel(log.action)}</span>
                            {log.target && <span className="text-slate-400 font-medium"> → {log.target}</span>}
                          </p>
                        </div>
                        <span className="text-xs font-semibold text-slate-400">{log.time}</span>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  )
}
