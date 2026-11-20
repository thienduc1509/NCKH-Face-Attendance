"use client"

import { toast } from "sonner"
import { useEffect, useState } from "react"
import { AppShell } from "@/components/app-shell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { StudentClaim } from "@/types/student"
import { StudentService } from "@/services/student.service"
import { Loader2, AlertCircle, MessageSquareWarning, Plus, Minus, Clock, CheckCircle, XCircle } from "lucide-react"

export default function StudentClaimsPage() {
  const [studentUser, setStudentUser] = useState({
    name: "Sinh viên",
    email: "sv@student.edu.vn",
    avatar: ""
  })
  const [claims, setClaims] = useState<StudentClaim[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Registered classes for dropdown
  const [registeredClasses, setRegisteredClasses] = useState<any[]>([])
  const [loadingClasses, setLoadingClasses] = useState(false)

  // Form state
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [selectedClassId, setSelectedClassId] = useState<string>('')
  const [sessionNumber, setSessionNumber] = useState<number>(1)
  const [reason, setReason] = useState<string>('')

  const fetchClaims = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await StudentService.getClaims()
      setClaims(data)
    } catch (err: any) {
      setError(err.message || "Đã xảy ra lỗi khi tải dữ liệu.")
    } finally {
      setLoading(false)
    }
  }

  const loadRegisteredClasses = async () => {
    try {
      setLoadingClasses(true)
      const allClasses = await StudentService.getAvailableClasses()
      const registered = allClasses.filter((c: any) => c.is_registered)
      setRegisteredClasses(registered)
    } catch (err) {
      console.error("Error loading registered classes for claim:", err)
    } finally {
      setLoadingClasses(false)
    }
  }

  useEffect(() => {
    StudentService.getProfile()
      .then(profile => {
        setStudentUser({
          name: profile.name,
          email: profile.email,
          avatar: ""
        })
      })
      .catch(err => console.error("Lỗi tải thông tin sinh viên:", err))
    fetchClaims()
    loadRegisteredClasses()
  }, [])

  const selectedClass = registeredClasses.find(c => c.class_section_id.toString() === selectedClassId)
  const maxSessions = selectedClass ? (selectedClass.total_sessions || 15) : 15

  const handleSubmitClaim = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedClassId || !reason) {
      toast.warning("Vui lòng chọn môn học và nhập lý do khiếu nại.")
      return
    }

    setSubmitting(true)
    try {
      const newClaim = await StudentService.submitClaim({
        subjectCode: selectedClass?.course_name || `LHP ${selectedClassId}`,
        subjectName: selectedClass?.course_name || "Môn học đã chọn",
        class_section_id: Number(selectedClassId),
        sessionNumber: sessionNumber,
        reason: reason
      })
      setClaims([newClaim, ...claims])
      setIsDialogOpen(false)
      setSelectedClassId('')
      setSessionNumber(1)
      setReason('')
      toast.success("Gửi khiếu nại thành công!")
    } catch (err: any) {
      toast.error(err.message || "Đã xảy ra lỗi khi gửi khiếu nại.")
    } finally {
      setSubmitting(false)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved': return <CheckCircle className="w-5 h-5 text-[#22C55E]" />
      case 'rejected': return <XCircle className="w-5 h-5 text-[#EF4444]" />
      default: return <Clock className="w-5 h-5 text-[#F59E0B]" />
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'approved': return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-[#E8F5E9] text-[#22C55E] border-[#22C55E]/15">Được chấp thuận</span>
      case 'rejected': return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-[#FEE2E2] text-[#EF4444] border-[#EF4444]/15">Bị từ chối</span>
      default: return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-[#FFF9C4] text-[#F59E0B] border-[#F59E0B]/15">Đang chờ duyệt</span>
    }
  }

  return (
    <AppShell
      role="student"
      user={studentUser}
      breadcrumb="Khiếu nại điểm danh"
    >
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A]">Lịch sử khiếu nại</h1>
            <p className="text-[#64748B] mt-1">Gửi và theo dõi kết quả xử lý khiếu nại điểm danh của bạn</p>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open)
            if (open) loadRegisteredClasses()
          }}>
            <DialogTrigger asChild>
              <Button className="bg-[#0A2540] hover:bg-[#1A3A5C] text-white shrink-0">
                <Plus className="w-4 h-4 mr-2" />
                Gửi khiếu nại mới
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[480px]">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold text-[#0F172A]">Tạo khiếu nại mới</DialogTitle>
                <DialogDescription>
                  Chọn môn học trong học kỳ hiện tại và nhập số buổi học cần khiếu nại.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmitClaim} className="space-y-5 py-2">
                <div className="space-y-2">
                  <Label htmlFor="subject-select" className="text-[#334155] font-semibold">
                    Học phần đã đăng ký <span className="text-[#EF4444]">*</span>
                  </Label>
                  {loadingClasses ? (
                    <div className="flex items-center text-sm text-[#64748B] py-2">
                      <Loader2 className="w-4 h-4 animate-spin mr-2 text-[#0EA5E9]" />
                      Đang tải danh sách môn học...
                    </div>
                  ) : registeredClasses.length > 0 ? (
                    <select
                      id="subject-select"
                      value={selectedClassId}
                      onChange={(e) => {
                        setSelectedClassId(e.target.value)
                        setSessionNumber(1)
                      }}
                      className="w-full h-11 px-3.5 rounded-lg border border-[#E2E8F0] bg-white text-sm text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0EA5E9] transition-all"
                      required
                    >
                      <option value="">-- Chọn học phần trong học kỳ này --</option>
                      {registeredClasses.map((cls) => (
                        <option key={cls.class_section_id} value={cls.class_section_id}>
                          {cls.course_name} (Lớp {cls.class_section_id} - GV: {cls.lecturer_name})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="p-3 bg-[#FEF9C3] border border-[#FEF08A] rounded-lg text-xs text-[#92400E]">
                      Bạn chưa đăng ký lớp học phần nào trong học kỳ này. Vui lòng vào trang <b>Đăng ký học phần</b> trước.
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="session-stepper" className="text-[#334155] font-semibold">
                    Buổi học số <span className="text-[#EF4444]">*</span>
                  </Label>
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 shrink-0 border-[#E2E8F0] hover:bg-[#F8FAFC] active:scale-95 transition-all"
                      disabled={!selectedClassId || sessionNumber <= 1}
                      onClick={() => setSessionNumber(prev => Math.max(1, prev - 1))}
                    >
                      <Minus className="w-4 h-4 text-[#0F172A]" />
                    </Button>

                    <Input
                      id="session-stepper"
                      type="number"
                      min={1}
                      max={maxSessions}
                      value={sessionNumber}
                      onChange={(e) => {
                        const val = parseInt(e.target.value)
                        if (isNaN(val)) setSessionNumber(1)
                        else setSessionNumber(Math.min(maxSessions, Math.max(1, val)))
                      }}
                      disabled={!selectedClassId}
                      className="text-center font-bold text-base h-10 w-24 border-[#E2E8F0] focus-visible:ring-[#0EA5E9]"
                      required
                    />

                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 shrink-0 border-[#E2E8F0] hover:bg-[#F8FAFC] active:scale-95 transition-all"
                      disabled={!selectedClassId || sessionNumber >= maxSessions}
                      onClick={() => setSessionNumber(prev => Math.min(maxSessions, prev + 1))}
                    >
                      <Plus className="w-4 h-4 text-[#0F172A]" />
                    </Button>

                    <span className="text-xs font-medium text-[#64748B]">
                      {selectedClassId ? `(Phạm vi: 1 - ${maxSessions} buổi)` : "(Hãy chọn môn trước)"}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reason" className="text-[#334155] font-semibold">
                    Lý do khiếu nại chi tiết <span className="text-[#EF4444]">*</span>
                  </Label>
                  <textarea
                    id="reason"
                    className="w-full min-h-[100px] flex rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2.5 text-sm ring-offset-background placeholder:text-[#94A3B8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0EA5E9] disabled:cursor-not-allowed disabled:opacity-50 transition-all"
                    placeholder="Mô tả cụ thể lý do hệ thống điểm danh sai sót (VD: máy quét chưa kịp nhận diện, em đi học đúng giờ...)"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    required
                  />
                </div>

                <DialogFooter className="pt-2">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} className="border-[#E2E8F0] text-slate-600">Hủy</Button>
                  <Button type="submit" disabled={submitting || !selectedClassId} className="bg-[#0A2540] hover:bg-[#1A3A5C] text-white">
                    {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2"/>}
                    Gửi yêu cầu khiếu nại
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center py-24 bg-white rounded-xl border border-[#E2E8F0]">
            <Loader2 className="w-10 h-10 text-[#0EA5E9] animate-spin mb-4" />
            <p className="text-[#64748B] font-medium">Đang tải lịch sử khiếu nại...</p>
          </div>
        )}

        {!loading && error && (
          <Card className="border-[#EF4444] bg-[#FEF2F2]">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-[#FEE2E2] flex items-center justify-center mb-4">
                <AlertCircle className="w-8 h-8 text-[#EF4444]" />
              </div>
              <h3 className="text-xl font-semibold text-[#991B1B] mb-2">Lỗi kết nối</h3>
              <p className="text-[#DC2626] mb-6 max-w-md">{error}</p>
              <Button onClick={fetchClaims} variant="outline" className="border-[#EF4444] text-[#EF4444] hover:bg-[#EF4444] hover:text-white">
                Thử lại ngay
              </Button>
            </CardContent>
          </Card>
        )}

        {!loading && !error && claims.length === 0 && (
          <Card className="border-dashed border-2 border-[#E2E8F0] bg-[#F8FAFC]">
            <CardContent className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-full bg-[#E2E8F0] flex items-center justify-center mb-4">
                <MessageSquareWarning className="w-8 h-8 text-[#64748B]" />
              </div>
              <h3 className="text-xl font-semibold text-[#0F172A] mb-2">Chưa có khiếu nại nào</h3>
              <p className="text-[#64748B] max-w-sm">
                Bạn chưa gửi yêu cầu khiếu nại điểm danh nào cho giảng viên.
              </p>
            </CardContent>
          </Card>
        )}

        {!loading && !error && claims.length > 0 && (
          <div className="space-y-4">
            {claims.map((claim) => (
              <Card key={claim.id} className="border-[#E2E8F0] hover:border-[#0EA5E9] hover:shadow-sm transition-all duration-200">
                <CardContent className="p-5">
                  <div className="flex flex-col md:flex-row md:items-start gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="mt-1">
                        {getStatusIcon(claim.status)}
                      </div>
                      <div className="space-y-2 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="font-bold text-[#0F172A] text-lg">
                            {claim.subjectCode} - {claim.subjectName}
                          </h3>
                          <div>{getStatusText(claim.status)}</div>
                        </div>
                        <p className="text-sm text-[#64748B]">Buổi {claim.sessionNumber} • Lịch học: {claim.date} • Đã gửi: {claim.submittedAt}</p>
                        <div className="bg-[#F8FAFC] p-4.5 rounded-xl mt-3 border border-[#E2E8F0]">
                          <p className="text-sm text-[#334155]">
                            <span className="font-semibold text-[#0F172A]">Lý do gửi:</span> {claim.reason}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
