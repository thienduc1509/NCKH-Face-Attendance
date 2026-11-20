"use client"

import { toast } from "sonner"
import { useEffect, useState } from "react"
import { AppShell } from "@/components/app-shell"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { StudentProfile } from "@/types/student"
import { StudentService } from "@/services/student.service"
import { Loader2, AlertCircle, User, ScanFace, Mail, Phone, Building2, CheckCircle2 } from "lucide-react"

export default function StudentProfilePage() {
  const [profile, setProfile] = useState<StudentProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [editForm, setEditForm] = useState({ phone: '', email: '' })

  const fetchProfile = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await StudentService.getProfile()
      setProfile(data)
      setEditForm({ phone: data.phone, email: data.email })
    } catch (err: any) {
      setError(err.message || "Đã xảy ra lỗi khi tải hồ sơ.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProfile()
  }, [])

  const handleSave = async () => {
    if (!profile) return
    setSaving(true)
    try {
      await StudentService.updateProfile(editForm)
      setProfile({ ...profile, ...editForm })
      toast.success("Cập nhật thông tin thành công!")
    } catch (err) {
      toast.error("Có lỗi xảy ra khi lưu thông tin.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppShell
      role="student"
      user={profile ? { name: profile.name, email: profile.email, avatar: "" } : { name: "Đang tải", email: "", avatar: "" }}
      breadcrumb="Hồ sơ cá nhân"
    >
      <div className="space-y-6 max-w-4xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">Thông tin tài khoản</h1>
          <p className="text-[#64748B] mt-1">Quản lý hồ sơ cá nhân và dữ liệu nhận diện khuôn mặt</p>
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center py-24 bg-white rounded-xl border border-[#E2E8F0]">
            <Loader2 className="w-10 h-10 text-[#0EA5E9] animate-spin mb-4" />
            <p className="text-[#64748B] font-medium">Đang tải hồ sơ...</p>
          </div>
        )}

        {!loading && error && (
          <Card className="border-[#EF4444] bg-[#FEF2F2]">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-[#FEE2E2] flex items-center justify-center mb-4">
                <AlertCircle className="w-8 h-8 text-[#EF4444]" />
              </div>
              <h3 className="text-xl font-semibold text-[#991B1B] mb-2">Lỗi truy xuất dữ liệu</h3>
              <p className="text-[#DC2626] mb-6 max-w-md">{error}</p>
              <Button onClick={fetchProfile} variant="outline" className="border-[#EF4444] text-[#EF4444] hover:bg-[#EF4444] hover:text-white">
                Thử lại ngay
              </Button>
            </CardContent>
          </Card>
        )}

        {!loading && !error && profile && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Sidebar: Face Data & Avatar */}
            <div className="md:col-span-1 space-y-6">
              <Card className="border-[#E2E8F0] shadow-sm">
                <CardContent className="p-6 flex flex-col items-center text-center">
                  <div className="w-24 h-24 rounded-full bg-[#0A2540] flex items-center justify-center text-white text-3xl font-bold mb-4 shadow-inner">
                    {profile.name.charAt(0)}
                  </div>
                  <h2 className="text-xl font-bold text-[#0F172A]">{profile.name}</h2>
                  <p className="text-[#64748B] font-medium mt-1">{profile.studentId}</p>
                  <div className="mt-4 px-3 py-1 bg-[#F1F5F9] rounded-full text-sm text-[#475569] flex items-center">
                    <Building2 className="w-4 h-4 mr-2" />
                    {profile.majorName || profile.department}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-[#E2E8F0] shadow-sm overflow-hidden">
                <CardHeader className="bg-[#F8FAFC] border-b border-[#E2E8F0] pb-4">
                  <CardTitle className="text-base flex items-center">
                    <ScanFace className="w-5 h-5 mr-2 text-[#0EA5E9]" />
                    Dữ liệu khuôn mặt
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  {profile.faceRegistered ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 text-[#166534] bg-[#E8F5E9] p-3 rounded-lg border border-[#22C55E]/15">
                        <CheckCircle2 className="w-6 h-6 shrink-0" />
                        <div className="text-sm">
                          <p className="font-semibold">Đã đăng ký nhận diện</p>
                          <p>Hệ thống đang lưu {profile.registeredFacesCount} góc mặt</p>
                        </div>
                      </div>
                      <p className="text-xs text-[#64748B] text-center">
                        Vui lòng liên hệ Quản trị viên nếu bạn muốn cập nhật lại khuôn mặt.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 text-[#92400E] bg-[#FFF9C4] p-3 rounded-lg border border-[#F59E0B]/15">
                        <AlertCircle className="w-6 h-6 shrink-0" />
                        <div className="text-sm">
                          <p className="font-semibold">Chưa đăng ký nhận diện</p>
                          <p>Bạn chưa có dữ liệu khuôn mặt trên hệ thống.</p>
                        </div>
                      </div>
                      <p className="text-xs text-[#64748B] text-center">
                        Vui lòng liên hệ Quản trị viên hệ thống để đăng ký khuôn mặt điểm danh.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Main Form: Profile Info */}
            <div className="md:col-span-2 space-y-6">
              <Card className="border-[#E2E8F0] shadow-sm">
                <CardHeader className="border-b border-[#E2E8F0] pb-4">
                  <CardTitle>Thông tin lý lịch sinh viên</CardTitle>
                  <CardDescription>Thông tin hồ sơ chính thức lưu trữ trong hệ thống đào tạo nhà trường</CardDescription>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div className="p-3 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
                      <span className="text-[#64748B] block text-xs font-medium mb-1">Họ và Tên</span>
                      <span className="font-semibold text-[#0F172A]">{profile.name}</span>
                    </div>
                    <div className="p-3 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
                      <span className="text-[#64748B] block text-xs font-medium mb-1">Mã số sinh viên (MSSV)</span>
                      <span className="font-semibold text-[#0EA5E9]">{profile.studentId}</span>
                    </div>
                    <div className="p-3 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
                      <span className="text-[#64748B] block text-xs font-medium mb-1">Chuyên ngành đào tạo</span>
                      <span className="font-semibold text-[#0F172A]">{profile.majorName}</span>
                    </div>
                    <div className="p-3 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
                      <span className="text-[#64748B] block text-xs font-medium mb-1">Ngày sinh</span>
                      <span className="font-medium text-[#0F172A]">{profile.birthDate}</span>
                    </div>
                    <div className="p-3 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
                      <span className="text-[#64748B] block text-xs font-medium mb-1">Giới tính</span>
                      <span className="font-medium text-[#0F172A]">{profile.gender}</span>
                    </div>
                    <div className="p-3 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
                      <span className="text-[#64748B] block text-xs font-medium mb-1">Trạng thái học tập</span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-[#DCFCE7] text-[#166534]">
                        {profile.academicStatus}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-[#E2E8F0] shadow-sm">
                <CardHeader className="border-b border-[#E2E8F0] pb-4">
                  <CardTitle>Thông tin liên hệ</CardTitle>
                  <CardDescription>Cập nhật số điện thoại và email để nhận thông báo từ hệ thống</CardDescription>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  <div className="space-y-4">
                    <div className="grid gap-2">
                      <Label htmlFor="email" className="text-[#334155] font-semibold flex items-center">
                        <Mail className="w-4 h-4 mr-2 text-[#64748B]"/> Email liên hệ
                      </Label>
                      <Input
                        id="email"
                        type="email"
                        value={editForm.email}
                        onChange={(e) => setEditForm({...editForm, email: e.target.value})}
                        className="border-[#E2E8F0] focus-visible:ring-[#0EA5E9]"
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="phone" className="text-[#334155] font-semibold flex items-center">
                        <Phone className="w-4 h-4 mr-2 text-[#64748B]"/> Số điện thoại
                      </Label>
                      <Input
                        id="phone"
                        type="tel"
                        value={editForm.phone}
                        onChange={(e) => setEditForm({...editForm, phone: e.target.value})}
                        className="border-[#E2E8F0] focus-visible:ring-[#0EA5E9]"
                      />
                    </div>
                  </div>

                  <div className="pt-4 border-t border-[#E2E8F0] flex justify-end">
                    <Button
                      onClick={handleSave}
                      disabled={saving || (editForm.email === profile.email && editForm.phone === profile.phone)}
                      className="bg-[#0A2540] hover:bg-[#1A3A5C] text-white min-w-[120px]"
                    >
                      {saving && <Loader2 className="w-4 h-4 animate-spin mr-2"/>}
                      Lưu thay đổi
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
