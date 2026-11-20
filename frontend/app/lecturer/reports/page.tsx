"use client"

import { useEffect, useState } from "react"
import { AppShell } from "@/components/app-shell"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AttendanceReport } from "@/types/lecturer"
import { LecturerService } from "@/services/lecturer.service"
import { ClassService } from "@/services/class.service"
import { CourseClass } from "@/types/class"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, AlertCircle, BarChart3, Download, Users, CheckCircle, BookOpen } from "lucide-react"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { toast } from "sonner"

export default function LecturerReportsPage() {
  const [lecturerUser, setLecturerUser] = useState({
    name: "Giảng viên",
    email: "gv@university.edu.vn",
    avatar: ""
  })
  const [reports, setReports] = useState<AttendanceReport[]>([])
  const [classList, setClassList] = useState<CourseClass[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)

  const fetchReports = async () => {
    setLoading(true)
    setError(null)
    try {
      const [data, classes] = await Promise.all([
        LecturerService.getReports(),
        ClassService.getClasses(),
      ])
      setReports(data)
      setClassList(classes)
      if (classes.length > 0) {
        setSelectedReportId(classes[0].id.toString())
      } else if (data.length > 0) {
        setSelectedReportId(data[0].id)
      }
    } catch (err: any) {
      setError(err.message || "Đã xảy ra lỗi khi tải báo cáo.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    LecturerService.getProfile()
      .then(profile => {
        setLecturerUser({
          name: profile.name,
          email: profile.email,
          avatar: ""
        })
      })
      .catch(err => console.error("Lỗi tải thông tin giảng viên:", err))
    fetchReports()
  }, [])

  const selectedReport = reports.find(r => r.id === selectedReportId) || reports[0]

  const handleExport = async () => {
    const classSectionId = Number(selectedReportId)
    if (!selectedReportId || !Number.isFinite(classSectionId)) {
      toast.error("Vui lòng chọn lớp học phần cần xuất báo cáo.")
      return
    }
    setIsExporting(true)
    const toastId = toast.loading("Đang khởi tạo và tải file Excel...")
    try {
      await LecturerService.downloadAttendanceReport(classSectionId, "excel")
      toast.success("Đã xuất báo cáo điểm danh thành công!", { id: toastId })
    } catch (err: any) {
      console.error("Lỗi xuất báo cáo điểm danh:", err)
      toast.error(`Xuất báo cáo thất bại: ${err?.message || "Không thể tải file."}`, { id: toastId })
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <AppShell
      role="lecturer"
      user={lecturerUser}
      breadcrumb="Thống kê & Báo cáo"
    >
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A]">Báo cáo chuyên cần</h1>
            <p className="text-[#64748B] mt-1">Theo dõi và phân tích tình hình học tập của sinh viên</p>
          </div>
          <Button
            onClick={handleExport}
            disabled={!selectedReport || loading || isExporting}
            className="bg-[#0A2540] hover:bg-[#1A3A5C] shrink-0"
          >
            {isExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            {isExporting ? "Đang xuất..." : "Xuất Excel"}
          </Button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 bg-white rounded-xl border border-[#E2E8F0]">
            <Loader2 className="w-10 h-10 text-[#0EA5E9] animate-spin mb-4" />
            <p className="text-[#64748B] font-medium">Đang phân tích dữ liệu...</p>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <Card className="border-[#EF4444] bg-[#FEF2F2]">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-[#FEE2E2] flex items-center justify-center mb-4">
                <AlertCircle className="w-8 h-8 text-[#EF4444]" />
              </div>
              <h3 className="text-xl font-semibold text-[#991B1B] mb-2">Lỗi truy xuất báo cáo</h3>
              <p className="text-[#DC2626] mb-6 max-w-md">{error}</p>
              <Button onClick={fetchReports} variant="outline" className="border-[#EF4444] text-[#EF4444] hover:bg-[#EF4444] hover:text-white">
                Thử lại ngay
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Empty */}
        {!loading && !error && reports.length === 0 && (
          <Card className="border-dashed border-2 border-[#E2E8F0] bg-[#F8FAFC]">
            <CardContent className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-full bg-[#E2E8F0] flex items-center justify-center mb-4">
                <BarChart3 className="w-8 h-8 text-[#64748B]" />
              </div>
              <h3 className="text-xl font-semibold text-[#0F172A] mb-2">Chưa có dữ liệu thống kê</h3>
              <p className="text-[#64748B] max-w-sm">
                Bạn chưa mở phiên điểm danh nào trong học kỳ này nên chưa có báo cáo.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Filter Combobox Bar */}
        {!loading && !error && (classList.length > 0 || reports.length > 0) && (
          <Card className="border-[#E2E8F0] shadow-sm bg-white p-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full sm:w-auto flex-1 max-w-xl">
                <label className="text-sm font-bold text-[#0F172A] whitespace-nowrap flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-[#0EA5E9]" />
                  Học phần học kỳ này đảm nhận:
                </label>
                <Select
                  value={selectedReportId || ""}
                  onValueChange={(val) => setSelectedReportId(val)}
                >
                  <SelectTrigger className="w-full bg-white border-[#E2E8F0] text-[#0F172A] font-semibold focus:ring-[#0EA5E9]">
                    <SelectValue placeholder="-- Chọn lớp học phần --" />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    {classList.length > 0 ? (
                      classList.map((cls) => (
                        <SelectItem key={cls.id} value={cls.id.toString()}>
                          {cls.tenHocPhan} (Mã lớp: {cls.maLop})
                        </SelectItem>
                      ))
                    ) : (
                      reports.map((report) => (
                        <SelectItem key={report.id} value={report.id}>
                          {report.subjectName} ({report.subjectCode})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>
        )}

        {/* Success Dashboard */}
        {!loading && !error && selectedReport && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <Card className="shadow-sm border-[#E2E8F0] hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
                <CardContent className="p-5">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm text-[#64748B] font-medium">Sĩ số lớp học</p>
                      <p className="text-2xl font-bold text-[#0F172A] mt-1">{selectedReport.totalStudents}</p>
                      <p className="text-xs text-slate-400 mt-2">Tổng số sinh viên đăng ký chính thức</p>
                    </div>
                    <div className="p-2 bg-[#E0F2FE] rounded-lg"><Users className="w-4 h-4 text-[#0EA5E9]" /></div>
                  </div>
                </CardContent>
              </Card>
              <Card className="shadow-sm border-[#E2E8F0] hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
                <CardContent className="p-5">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm text-[#64748B] font-medium">Số buổi đã học</p>
                      <p className="text-2xl font-bold text-[#0F172A] mt-1">{selectedReport.completedSessions}/{selectedReport.totalSessions}</p>
                      <p className="text-xs text-slate-400 mt-2">Buổi đã hoàn thành / Tổng số buổi</p>
                    </div>
                    <div className="p-2 bg-[#E0F2FE] rounded-lg"><CheckCircle className="w-4 h-4 text-[#0EA5E9]" /></div>
                  </div>
                </CardContent>
              </Card>
              <Card className="shadow-sm border-[#E2E8F0] hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
                <CardContent className="p-5">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm text-[#64748B] font-medium">Tỷ lệ chuyên cần</p>
                      <p className="text-2xl font-bold text-[#22C55E] mt-1">{selectedReport.averageAttendanceRate}%</p>
                      <p className="text-xs text-slate-400 mt-2">Tỷ lệ đi học đầy đủ trung bình</p>
                    </div>
                    <div className="p-2 bg-[#E8F5E9] rounded-lg"><BarChart3 className="w-4 h-4 text-[#22C55E]" /></div>
                  </div>
                </CardContent>
              </Card>
              <Card className="shadow-sm border-[#E2E8F0] hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 border-l-4 border-l-[#EF4444]">
                <CardContent className="p-5">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm text-[#64748B] font-medium">Số ca cảnh báo vắng</p>
                      <p className="text-2xl font-bold text-[#EF4444] mt-1">2</p>
                      <p className="text-xs text-[#EF4444] mt-2 font-medium">Vượt quá 20% số buổi vắng giới hạn</p>
                    </div>
                    <div className="p-2 bg-red-100 rounded-lg"><AlertCircle className="w-4 h-4 text-[#EF4444]" /></div>
                  </div>
                </CardContent>
              </Card>
            </div>

              <Card className="shadow-sm border-[#E2E8F0]">
                <CardHeader>
                  <CardTitle className="text-lg font-bold text-[#0F172A]">Biểu đồ diễn biến chuyên cần qua các buổi học</CardTitle>
                  <CardDescription>Số liệu sinh viên Có mặt, Đi muộn, và Vắng mặt qua các buổi học đã diễn ra</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[320px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={selectedReport.dataPoints} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                        <defs>
                          <linearGradient id="colorPresent" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#22C55E" stopOpacity={0.45}/>
                            <stop offset="95%" stopColor="#22C55E" stopOpacity={0.01}/>
                          </linearGradient>
                          <linearGradient id="colorLate" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.45}/>
                            <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.01}/>
                          </linearGradient>
                          <linearGradient id="colorAbsent" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#EF4444" stopOpacity={0.45}/>
                            <stop offset="95%" stopColor="#EF4444" stopOpacity={0.01}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                        <XAxis dataKey="date" tick={{fontSize: 12, fill: '#64748B'}} tickLine={false} axisLine={false} dy={8} />
                        <YAxis tick={{fontSize: 12, fill: '#64748B'}} tickLine={false} axisLine={false} dx={-8} />
                        <Tooltip contentStyle={{borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}} />
                        <Legend wrapperStyle={{fontSize: '12px', paddingTop: '15px'}} iconType="circle" />
                        <Area name="Có mặt" type="monotone" dataKey="present" stackId="1" stroke="#22C55E" fill="url(#colorPresent)" strokeWidth={2.5} />
                        <Area name="Đi muộn" type="monotone" dataKey="late" stackId="1" stroke="#F59E0B" fill="url(#colorLate)" strokeWidth={2.5} />
                        <Area name="Vắng mặt" type="monotone" dataKey="absent" stackId="1" stroke="#EF4444" fill="url(#colorAbsent)" strokeWidth={2.5} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>
        )}
      </div>
    </AppShell>
  )
}
