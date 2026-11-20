"use client"

import { toast } from "sonner"
import { useEffect, useState } from "react"
import { AppShell } from "@/components/app-shell"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AdminClassPayload, AdminService, CanBoOption, HocPhanOption } from "@/services/admin.service"
import { AlertCircle, BookOpen, Edit, Loader2, Plus, Search, Trash2, Users } from "lucide-react"

type AdminClass = Awaited<ReturnType<typeof AdminService.getClasses>>[number]

const defaultForm = {
  course_id: "",
  staff_id: "",
  semester: "1",
  academic_year: "2025-2026",
  minimum_attendance_rate: "0.8",
  status: "true",
}

export default function AdminClassesPage() {
  const [adminUser, setAdminUser] = useState({ name: "Admin", email: "admin@university.edu.vn", avatar: "" })
  const [classes, setClasses] = useState<AdminClass[]>([])
  const [subjects, setSubjects] = useState<HocPhanOption[]>([])
  const [lecturers, setLecturers] = useState<CanBoOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [formData, setFormData] = useState(defaultForm)

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [classData, subjectData, lecturerData] = await Promise.all([
        AdminService.getClasses(),
        AdminService.getSubjects(),
        AdminService.getLecturers(),
      ])
      setClasses(classData)
      setSubjects(subjectData)
      setLecturers(lecturerData)
    } catch (err: any) {
      setError(err.message || "Khong the tai du lieu lop hoc phan.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    AdminService.getProfile()
      .then((profile) => setAdminUser({ ...profile, avatar: "" }))
      .catch((err) => console.error("Loi tai profile admin:", err))
    fetchData()
  }, [])

  const openCreateDialog = () => {
    setEditingId(null)
    setFormData({
      ...defaultForm,
      course_id: subjects[0]?.course_id?.toString() || "",
      staff_id: lecturers[0]?.staff_id?.toString() || "",
    })
    setIsDialogOpen(true)
  }

  const openEditDialog = (item: AdminClass) => {
    setEditingId(item.id)
    setFormData({
      course_id: item.maHocPhan?.toString() || "",
      staff_id: item.maCanBo?.toString() || "",
      semester: item.hocKyNumber?.toString() || "1",
      academic_year: item.namHoc || "2025-2026",
      minimum_attendance_rate: item.tyLeChuyenCanToiThieu?.toString() || "0.8",
      status: item.trangThai === "Đang học" ? "true" : "false",
    })
    setIsDialogOpen(true)
  }

  const buildPayload = (): AdminClassPayload => ({
    course_id: Number(formData.course_id),
    staff_id: Number(formData.staff_id),
    semester: Number(formData.semester),
    academic_year: formData.academic_year.trim(),
    minimum_attendance_rate: Number(formData.minimum_attendance_rate),
    status: formData.status === "true",
  })

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    try {
      const payload = buildPayload()
      if (editingId) {
        const updated = await AdminService.updateClass(editingId, payload)
        setClasses((prev) => prev.map((item) => (item.id === editingId ? updated : item)))
      } else {
        const created = await AdminService.createClass(payload)
        setClasses((prev) => [created, ...prev])
      }
      setIsDialogOpen(false)
    } catch (err: any) {
      toast.error(err.message || "Khong the luu lop hoc phan.")
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!editingId) return
    setSubmitting(true)
    try {
      await AdminService.deleteClass(editingId)
      setClasses((prev) => prev.filter((item) => item.id !== editingId))
      setIsDeleteDialogOpen(false)
    } catch {
      toast.error("Khong the xoa lop hoc phan.")
    } finally {
      setSubmitting(false)
    }
  }

  const filteredClasses = classes.filter((item) => {
    const query = searchQuery.toLowerCase()
    return (
      item.maLop.toLowerCase().includes(query) ||
      item.tenHocPhan.toLowerCase().includes(query) ||
      item.giangVien.toLowerCase().includes(query) ||
      item.namHoc.toLowerCase().includes(query)
    )
  })

  return (
    <AppShell role="admin" user={adminUser} breadcrumb="Quản lý lớp học phần">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A]">Danh sách lớp học phần</h1>
            <p className="text-[#64748B] mt-1">Tạo lớp theo học phần, phân công giảng viên và quản lý trạng thái.</p>
          </div>
          <Button onClick={openCreateDialog} className="bg-[#0A2540] hover:bg-[#1A3A5C] text-white shrink-0">
            <Plus className="w-4 h-4 mr-2" />
            Thêm lớp mới
          </Button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 bg-white rounded-xl border border-[#E2E8F0]">
            <Loader2 className="w-10 h-10 text-[#0EA5E9] animate-spin mb-4" />
            <p className="text-[#64748B] font-medium">Đang đồng bộ dữ liệu lớp học...</p>
          </div>
        ) : error ? (
          <Card className="border-[#EF4444] bg-[#FEF2F2]">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <AlertCircle className="w-12 h-12 text-[#EF4444] mb-4" />
              <h3 className="text-xl font-semibold text-[#991B1B] mb-2">Lỗi truy xuất hệ thống</h3>
              <p className="text-[#DC2626] mb-6 max-w-md">{error}</p>
              <Button onClick={fetchData} variant="outline" className="border-[#EF4444] text-[#EF4444]">
                Thử lại
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
              <Input
                placeholder="Tìm theo mã lớp, học phần, giảng viên, năm học..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="pl-9 border-[#E2E8F0] focus-visible:ring-[#0EA5E9]"
              />
            </div>

            {filteredClasses.length === 0 ? (
              <Card className="border-dashed border-2 border-[#E2E8F0] bg-[#F8FAFC]">
                <CardContent className="flex flex-col items-center justify-center py-20 text-center">
                  <BookOpen className="w-12 h-12 text-[#64748B] mb-3" />
                  <h3 className="text-xl font-semibold text-[#0F172A] mb-2">Không tìm thấy lớp học phần</h3>
                  <p className="text-[#64748B] max-w-sm">Chưa có dữ liệu phù hợp với bộ lọc hiện tại.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-[#F8FAFC] text-[#475569] font-semibold border-b border-[#E2E8F0]">
                      <tr>
                        <th className="px-6 py-4 whitespace-nowrap">Mã lớp</th>
                        <th className="px-6 py-4 whitespace-nowrap">Học phần</th>
                        <th className="px-6 py-4 whitespace-nowrap">Giảng viên</th>
                        <th className="px-6 py-4 whitespace-nowrap">Học kỳ</th>
                        <th className="px-6 py-4 whitespace-nowrap text-center">Chuyên cần tối thiểu</th>
                        <th className="px-6 py-4 whitespace-nowrap">Trạng thái</th>
                        <th className="px-6 py-4 whitespace-nowrap text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {filteredClasses.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-6 py-4 font-bold text-[#0F172A]">LHP{item.id}</td>
                          <td className="px-6 py-4 text-[#334155] font-medium">{item.tenHocPhan}</td>
                          <td className="px-6 py-4 text-[#334155]">{item.giangVien}</td>
                          <td className="px-6 py-4 text-[#64748B]">{item.hocKy}</td>
                          <td className="px-6 py-4 text-center">
                            <span className="inline-flex items-center justify-center gap-1 font-semibold text-[#0F172A]">
                              <Users className="w-3.5 h-3.5 text-[#64748B]" />
                              {Math.round(item.tyLeChuyenCanToiThieu * 100)}%
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${
                              item.trangThai === "Đang học"
                                ? "bg-[#E8F5E9] text-[#22C55E] border-[#22C55E]/15"
                                : "bg-slate-100 text-slate-500 border-slate-200"
                            }`}>
                              {item.trangThai}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-2">
                              <Button size="icon" variant="ghost" onClick={() => openEditDialog(item)} className="h-8 w-8 text-[#0EA5E9] hover:bg-sky-50">
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => {
                                  setEditingId(item.id)
                                  setIsDeleteDialogOpen(true)
                                }}
                                className="h-8 w-8 text-[#EF4444] hover:bg-rose-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-[680px]">
            <DialogHeader>
              <DialogTitle className="text-[#0F172A] font-bold text-lg">
                {editingId ? "Cập nhật lớp học phần" : "Thêm lớp học phần mới"}
              </DialogTitle>
              <DialogDescription>
                Chọn học phần, giảng viên và thông tin học kỳ đúng với dữ liệu hệ thống.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[#0F172A] font-semibold">Học phần</Label>
                  <Select value={formData.course_id} onValueChange={(value) => setFormData({ ...formData, course_id: value })}>
                    <SelectTrigger className="border-[#E2E8F0]">
                      <SelectValue placeholder="Chọn học phần" />
                    </SelectTrigger>
                    <SelectContent>
                      {subjects.map((subject) => (
                        <SelectItem key={subject.course_id} value={subject.course_id.toString()}>
                          {subject.course_name} ({subject.course_id})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[#0F172A] font-semibold">Giảng viên</Label>
                  <Select value={formData.staff_id} onValueChange={(value) => setFormData({ ...formData, staff_id: value })}>
                    <SelectTrigger className="border-[#E2E8F0]">
                      <SelectValue placeholder="Chọn giảng viên" />
                    </SelectTrigger>
                    <SelectContent>
                      {lecturers.map((lecturer) => (
                        <SelectItem key={lecturer.staff_id} value={lecturer.staff_id.toString()}>
                          {lecturer.last_name} {lecturer.first_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="hocKy" className="text-[#0F172A] font-semibold">Học kỳ</Label>
                  <Select value={formData.semester} onValueChange={(value) => setFormData({ ...formData, semester: value })}>
                    <SelectTrigger id="hocKy" className="border-[#E2E8F0]">
                      <SelectValue placeholder="Chọn học kỳ" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Học kỳ 1</SelectItem>
                      <SelectItem value="2">Học kỳ 2</SelectItem>
                      <SelectItem value="3">Học kỳ 3</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="namHoc" className="text-[#0F172A] font-semibold">Năm học</Label>
                  <Select value={formData.academic_year} onValueChange={(value) => setFormData({ ...formData, academic_year: value })}>
                    <SelectTrigger id="namHoc" className="border-[#E2E8F0]">
                      <SelectValue placeholder="Chọn năm học" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2023-2024">2023-2024</SelectItem>
                      <SelectItem value="2024-2025">2024-2025</SelectItem>
                      <SelectItem value="2025-2026">2025-2026</SelectItem>
                      <SelectItem value="2026-2027">2026-2027</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="tyLe" className="text-[#0F172A] font-semibold">Tỷ lệ chuyên cần tối thiểu</Label>
                  <Select value={formData.minimum_attendance_rate} onValueChange={(value) => setFormData({ ...formData, minimum_attendance_rate: value })}>
                    <SelectTrigger id="tyLe" className="border-[#E2E8F0]">
                      <SelectValue placeholder="Chọn tỷ lệ" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0.7">70%</SelectItem>
                      <SelectItem value="0.75">75%</SelectItem>
                      <SelectItem value="0.8">80% (Khuyến nghị)</SelectItem>
                      <SelectItem value="0.85">85%</SelectItem>
                      <SelectItem value="0.9">90%</SelectItem>
                      <SelectItem value="0.95">95%</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[#0F172A] font-semibold">Trạng thái</Label>
                  <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                    <SelectTrigger className="border-[#E2E8F0]">
                      <SelectValue placeholder="Chọn trạng thái" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Đang học</SelectItem>
                      {editingId && (
                        <SelectItem value="false">Đã kết thúc</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter className="pt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} className="border-[#E2E8F0] text-slate-600">Hủy</Button>
                <Button type="submit" disabled={submitting} className="bg-[#0A2540] hover:bg-[#1A3A5C] text-white">
                  {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  {editingId ? "Lưu thay đổi" : "Tạo lớp học"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle className="text-[#EF4444] flex items-center font-bold">
                <AlertCircle className="w-5 h-5 mr-2" />
                Xóa lớp học phần
              </DialogTitle>
              <DialogDescription className="pt-2">
                Hành động này có thể bị chặn nếu lớp đã có dữ liệu điểm danh liên quan.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setIsDeleteDialogOpen(false)} className="border-[#E2E8F0] text-slate-600">Hủy</Button>
              <Button onClick={handleDelete} disabled={submitting} className="bg-[#EF4444] hover:bg-[#DC2626] text-white">
                {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Xác nhận xóa
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  )
}
