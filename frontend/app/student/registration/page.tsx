"use client"

import { toast } from "sonner"
import { useEffect, useState } from "react"
import { AppShell } from "@/components/app-shell"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Loader2, BookOpen, Search, Check, AlertCircle } from "lucide-react"
import { StudentService } from "@/services/student.service"
import { StudentProfile } from "@/types/student"

export default function StudentRegistrationPage() {
  const [profile, setProfile] = useState<StudentProfile | null>(null)
  const [classes, setClasses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [processingId, setProcessingId] = useState<number | null>(null)

  const loadData = async () => {
    try {
      setLoading(true)
      const [profileData, classesData] = await Promise.all([
        StudentService.getProfile(),
        StudentService.getAvailableClasses()
      ])
      setProfile(profileData)
      setClasses(classesData)
    } catch (err: any) {
      console.error("Error loading registration data:", err)
      setError(err.message || "Đã xảy ra lỗi khi tải danh sách học phần có sẵn.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleRegister = async (maLopHocPhan: number) => {
    if (confirm("Bạn có chắc chắn muốn đăng ký lớp học phần này?")) {
      setProcessingId(maLopHocPhan)
      try {
        const success = await StudentService.registerClass(maLopHocPhan)
        if (success) {
          toast.success("Đăng ký lớp học phần thành công!")
          const updatedClasses = await StudentService.getAvailableClasses()
          setClasses(updatedClasses)
        } else {
          toast.error("Đăng ký thất bại. Vui lòng thử lại!")
        }
      } catch (err: any) {
        toast.error(err.message || "Có lỗi xảy ra.")
      } finally {
        setProcessingId(null)
      }
    }
  }

  const handleCancel = async (maLopHocPhan: number) => {
    if (confirm("Bạn có chắc chắn muốn hủy đăng ký lớp học phần này? Tất cả dữ liệu điểm danh liên quan sẽ bị xóa.")) {
      setProcessingId(maLopHocPhan)
      try {
        const success = await StudentService.cancelClassRegistration(maLopHocPhan)
        if (success) {
          toast.success("Hủy đăng ký lớp học phần thành công!")
          const updatedClasses = await StudentService.getAvailableClasses()
          setClasses(updatedClasses)
        } else {
          toast.error("Hủy đăng ký thất bại. Vui lòng thử lại!")
        }
      } catch (err: any) {
        toast.error(err.message || "Có lỗi xảy ra.")
      } finally {
        setProcessingId(null)
      }
    }
  }

  const filteredClasses = classes.filter(cls => {
    const subjectName = cls.course_name || ""
    const teacherName = cls.lecturer_name || ""
    const term = cls.academic_year || ""

    return (
      subjectName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      teacherName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      term.toLowerCase().includes(searchTerm.toLowerCase())
    )
  })

  if (loading && classes.length === 0) {
    return (
      <AppShell
        role="student"
        user={{ name: "Đang tải", email: "", avatar: "" }}
        breadcrumb="Đăng ký học phần"
      >
        <div className="flex flex-col items-center justify-center py-24 bg-white rounded-xl border border-[#E2E8F0]">
          <Loader2 className="w-10 h-10 text-[#0EA5E9] animate-spin mb-4" />
          <p className="text-[#64748B] font-medium">Đang tải danh sách học phần...</p>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell
      role="student"
      user={profile ? { name: profile.name, email: profile.email, avatar: "" } : { name: "Sinh viên", email: "", avatar: "" }}
      breadcrumb="Đăng ký học phần"
    >
      <div className="space-y-6 max-w-6xl mx-auto">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A] flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-[#0EA5E9]" />
            Đăng ký học phần trực tuyến
          </h1>
          <p className="text-[#64748B] mt-1">Đăng ký lớp học phần cho Học kỳ 1 - Năm học 2025-2026</p>
        </div>

        {/* Info & Search */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="md:col-span-2 border-[#E2E8F0] shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Tìm kiếm học phần</CardTitle>
              <CardDescription>Nhập tên môn học, giảng viên phụ trách hoặc năm học để lọc</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
                <Input
                  placeholder="Ví dụ: Cơ sở dữ liệu, Nguyễn Văn, 2025..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 focus-visible:ring-[#0EA5E9]"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-[#E2E8F0] shadow-sm bg-[#F8FAFC]">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold text-[#0A2540]">Thông tin chung</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2 text-[#475569]">
              <div className="flex justify-between">
                <span>Học kỳ đăng ký:</span>
                <span className="font-semibold text-[#0F172A]">Học kỳ 1</span>
              </div>
              <div className="flex justify-between">
                <span>Năm học:</span>
                <span className="font-semibold text-[#0F172A]">2025-2026</span>
              </div>
              <div className="flex justify-between">
                <span>Lớp đã đăng ký:</span>
                <span className="font-bold text-[#166534] bg-[#DCFCE7] px-2 py-0.5 rounded-full text-xs">
                  {classes.filter(c => c.is_registered).length} lớp
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Classes Table */}
        <Card className="border-[#E2E8F0] shadow-sm overflow-hidden">
          <CardContent className="p-0">
            {filteredClasses.length > 0 ? (
              <Table className="w-full text-sm text-left">
                <TableHeader className="bg-[#F8FAFC]">
                  <TableRow className="border-b border-[#E2E8F0]">
                    <TableHead className="w-[100px] px-6 py-4 font-semibold text-slate-700">Mã Lớp</TableHead>
                    <TableHead className="px-6 py-4 font-semibold text-slate-700">Tên Môn Học</TableHead>
                    <TableHead className="px-6 py-4 font-semibold text-slate-700">Số Tín Chỉ</TableHead>
                    <TableHead className="px-6 py-4 font-semibold text-slate-700">Giảng Viên</TableHead>
                    <TableHead className="px-6 py-4 font-semibold text-slate-700">Học Kỳ / Năm</TableHead>
                    <TableHead className="px-6 py-4 font-semibold text-slate-700">Thời Gian Học</TableHead>
                    <TableHead className="px-6 py-4 font-semibold text-slate-700">Yêu Cầu</TableHead>
                    <TableHead className="text-center w-[180px] px-6 py-4 font-semibold text-slate-700">Hành Động</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-[#E2E8F0]">
                  {filteredClasses.map((cls) => {
                    const isProcessing = processingId === cls.class_section_id
                    return (
                      <TableRow key={cls.class_section_id} className="bg-white hover:bg-slate-50/80 transition-colors">
                        <TableCell className="px-6 py-4 font-bold text-[#0A2540]">LHP {cls.class_section_id}</TableCell>
                        <TableCell className="px-6 py-4 font-semibold text-[#0F172A]">{cls.course_name}</TableCell>
                        <TableCell className="px-6 py-4 font-semibold text-slate-700">{cls.credit_count || 3} TC</TableCell>
                        <TableCell className="px-6 py-4 text-slate-600">{cls.lecturer_name}</TableCell>
                        <TableCell className="px-6 py-4 text-slate-600">Kỳ {cls.semester} — {cls.academic_year}</TableCell>
                        <TableCell className="px-6 py-4 text-xs text-[#0EA5E9] font-medium">
                          {cls.start_date || "02/02/2026"} ➔ {cls.end_date || "31/05/2026"}
                        </TableCell>
                        <TableCell className="px-6 py-4">
                          <span className="text-xs font-semibold text-slate-500">
                            {cls.minimum_attendance_rate * 100}% Chuyên cần
                          </span>
                        </TableCell>
                        <TableCell className="px-6 py-4 text-center">
                          {cls.is_registered ? (
                            <div className="flex items-center justify-center gap-2">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-[#E8F5E9] text-[#22C55E] border-[#22C55E]/15">
                                <Check className="w-3 h-3 mr-1" />
                                Đã đăng ký
                              </span>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={isProcessing}
                                onClick={() => handleCancel(cls.class_section_id)}
                                className="border-[#EF4444] text-[#EF4444] hover:bg-[#EF4444] hover:text-white h-7 text-xs font-semibold"
                              >
                                {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : "Hủy"}
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              disabled={isProcessing}
                              onClick={() => handleRegister(cls.class_section_id)}
                              className="bg-[#0A2540] hover:bg-[#1A3A5C] text-white w-24 h-8 text-xs font-semibold shadow-xs"
                            >
                              {isProcessing ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : "Đăng ký"}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <AlertCircle className="w-12 h-12 text-[#64748B] mb-2" />
                <p className="text-[#64748B] font-medium text-sm">Không tìm thấy học phần nào khả dụng.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}
