"use client"

import { toast } from "sonner"
import { useEffect, useState } from "react"
import { AppShell } from "@/components/app-shell"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LecturerService } from "@/services/lecturer.service"
import { apiClient } from "@/lib/api-client"
import { Loader2, AlertCircle, User, Mail, Phone, Building2, GraduationCap, KeyRound, CheckCircle2, ShieldCheck, BookOpen, Eye, EyeOff } from "lucide-react"

export default function LecturerProfilePage() {
  const [profile, setProfile] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [editForm, setEditForm] = useState({ phone: '', email: '', academicDegree: 'TS.' })

  const [passwordForm, setPasswordForm] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' })
  const [changingPassword, setChangingPassword] = useState(false)
  
  const [showOldPassword, setShowOldPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const fetchProfile = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await LecturerService.getProfile()
      setProfile(data)
      setEditForm({
        phone: data.phone || "",
        email: data.email || "",
        academicDegree: data.academicDegree || "TS."
      })
    } catch (err: any) {
      console.error("Error loading lecturer profile:", err)
      setError(err.message || "Đã xảy ra lỗi khi tải hồ sơ giảng viên.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProfile()
  }, [])

  const handleSaveInfo = async () => {
    if (!profile) return
    setSaving(true)
    try {
      const nameParts = profile.name ? profile.name.split(" ") : []
      const last_name = nameParts.length > 1 ? nameParts.slice(0, -1).join(" ") : undefined
      const first_name = nameParts.length > 0 ? nameParts[nameParts.length - 1] : undefined

      const payload: any = {}
      if (last_name) payload.last_name = last_name
      if (first_name) payload.first_name = first_name
      if (editForm.email) payload.google_email = editForm.email
      if (editForm.phone) payload.phone = editForm.phone

      await apiClient.patch("/users/me", payload)
      setProfile({ ...profile, ...editForm })
      toast.success("Cập nhật thông tin hồ sơ thành công!")
    } catch (err: any) {
      console.error("Lỗi cập nhật hồ sơ:", err)
      toast.error("Có lỗi xảy ra khi lưu thông tin.")
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async () => {
    if (!passwordForm.oldPassword || !passwordForm.newPassword) {
      toast.warning("Vui lòng nhập đầy đủ mật khẩu cũ và mật khẩu mới.")
      return
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.warning("Mật khẩu mới và xác nhận mật khẩu không khớp.")
      return
    }
    setChangingPassword(true)
    try {
      await apiClient.patch("/users/me/password", {
        current_password: passwordForm.oldPassword,
        new_password: passwordForm.newPassword
      })
      toast.success("Đổi mật khẩu thành công!")
      setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' })
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Mật khẩu cũ không chính xác hoặc lỗi hệ thống.")
    } finally {
      setChangingPassword(false)
    }
  }

  return (
    <AppShell
      role="lecturer"
      user={profile ? { name: profile.name, email: profile.email, avatar: "" } : { name: "Giảng viên", email: "", avatar: "" }}
      breadcrumb="Hồ sơ thông tin"
    >
      <div className="space-y-6 max-w-4xl mx-auto pb-12">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A] flex items-center gap-2">
            <User className="w-7 h-7 text-[#0EA5E9]" />
            Hồ sơ Thông tin Cán bộ Giảng viên
          </h1>
          <p className="text-[#64748B] mt-1">Quản lý thông tin tài khoản cá nhân, thông tin liên lạc và mật khẩu truy cập.</p>
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center py-24 bg-white rounded-xl border border-[#E2E8F0]">
            <Loader2 className="w-10 h-10 text-[#0EA5E9] animate-spin mb-4" />
            <p className="text-[#64748B] font-medium">Đang tải hồ sơ cán bộ...</p>
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
            {/* Sidebar Overview */}
            <div className="md:col-span-1 space-y-6">
              <Card className="border-[#E2E8F0] shadow-sm bg-white">
                <CardContent className="p-6 flex flex-col items-center text-center">
                  <div className="w-24 h-24 rounded-2xl bg-[#0A2540] flex items-center justify-center text-white text-3xl font-extrabold mb-4 shadow-md border-2 border-[#1A3A5C]">
                    {profile.name.charAt(0)}
                  </div>
                  <h2 className="text-xl font-bold text-[#0F172A]">{profile.academicDegree} {profile.name}</h2>
                  <p className="text-[#0EA5E9] font-bold text-sm mt-1 bg-[#E0F2FE] px-3 py-0.5 rounded-full">
                    Mã CB: {profile.maCanBo || profile.id}
                  </p>
                  <div className="mt-4 w-full pt-4 border-t border-[#E2E8F0] space-y-2 text-left text-sm">
                    <div className="flex items-center text-[#475569]">
                      <GraduationCap className="w-4 h-4 mr-2 text-[#0EA5E9] shrink-0" />
                      <span>{profile.role || "Giảng viên Cơ hữu"}</span>
                    </div>
                    <div className="flex items-center text-[#475569]">
                      <Building2 className="w-4 h-4 mr-2 text-[#0EA5E9] shrink-0" />
                      <span>Khoa Công nghệ thông tin</span>
                    </div>
                    <div className="flex items-center text-[#475569]">
                      <ShieldCheck className="w-4 h-4 mr-2 text-[#22C55E] shrink-0" />
                      <span className="text-[#22C55E] font-semibold">Tài khoản Xác thực Hệ thống</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-[#E2E8F0] shadow-sm bg-[#F8FAFC]">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold text-[#0F172A] flex items-center gap-1.5">
                    <BookOpen className="w-4 h-4 text-[#0EA5E9]" />
                    Nhiệm vụ Giảng dạy
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-[#64748B] space-y-2">
                  <p>• Giảng dạy các môn học chuyên ngành Công nghệ Thông tin.</p>
                  <p>• Mở phiên điểm danh AI thời gian thực và quản lý lớp học phần.</p>
                  <p>• Tiếp nhận và phê duyệt khiếu nại chuyên cần sinh viên.</p>
                </CardContent>
              </Card>
            </div>

            {/* Main Edit Forms */}
            <div className="md:col-span-2 space-y-6">
              {/* Personal Info Edit */}
              <Card className="border-[#E2E8F0] shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg font-bold text-[#0F172A]">Thông tin cá nhân & Liên hệ</CardTitle>
                  <CardDescription>Cập nhật số điện thoại và email liên lạc trường cấp</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="fullname" className="text-xs font-bold text-[#334155]">Họ và Tên Giảng viên</Label>
                      <Input id="fullname" value={profile.name} disabled className="bg-[#F8FAFC] font-semibold text-[#0F172A]" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="macanbo" className="text-xs font-bold text-[#334155]">Mã Cán bộ / CBGD</Label>
                      <Input id="macanbo" value={profile.maCanBo || profile.id} disabled className="bg-[#F8FAFC] font-semibold text-[#0F172A]" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="degree" className="text-xs font-bold text-[#334155]">Học hàm / Học vị</Label>
                      <Input id="degree" value={editForm.academicDegree} onChange={(e) => setEditForm({...editForm, academicDegree: e.target.value})} placeholder="TS., ThS., PGS.TS..." className="border-[#E2E8F0] focus-visible:ring-[#0EA5E9]" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="username" className="text-xs font-bold text-[#334155]">Tên đăng nhập hệ thống</Label>
                      <Input id="username" value={profile.username || profile.id} disabled className="bg-[#F8FAFC] font-semibold text-[#0F172A]" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-xs font-bold text-[#334155]">Email liên kết Trường / Google</Label>
                    <div className="relative">
                      <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
                      <Input id="email" className="pl-9 border-[#E2E8F0] focus-visible:ring-[#0EA5E9]" value={editForm.email} onChange={(e) => setEditForm({...editForm, email: e.target.value})} placeholder="gv@example.com" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-xs font-bold text-[#334155]">Số điện thoại liên hệ</Label>
                    <div className="relative">
                      <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
                      <Input id="phone" className="pl-9 border-[#E2E8F0] focus-visible:ring-[#0EA5E9]" value={editForm.phone} onChange={(e) => setEditForm({...editForm, phone: e.target.value})} placeholder="09xxxxxxxx" />
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <Button onClick={handleSaveInfo} disabled={saving} className="bg-[#0A2540] hover:bg-[#1A3A5C] font-bold text-sm">
                      {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                      Lưu thay đổi thông tin
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Change Password */}
              <Card className="border-[#E2E8F0] shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg font-bold text-[#0F172A] flex items-center gap-2">
                    <KeyRound className="w-5 h-5 text-[#0EA5E9]" />
                    Đổi Mật Khẩu Đăng Nhập
                  </CardTitle>
                  <CardDescription>Cập nhật mật khẩu mới bảo vệ tài khoản cán bộ giảng viên</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="oldPass" className="text-xs font-bold text-[#334155]">Mật khẩu hiện tại</Label>
                    <div className="relative">
                      <Input
                        id="oldPass"
                        type={showOldPassword ? "text" : "password"}
                        value={passwordForm.oldPassword}
                        onChange={(e) => setPasswordForm({...passwordForm, oldPassword: e.target.value})}
                        placeholder="••••••••"
                        className="border-[#E2E8F0] focus-visible:ring-[#0EA5E9] pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowOldPassword(!showOldPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                      >
                        {showOldPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="newPass" className="text-xs font-bold text-[#334155]">Mật khẩu mới</Label>
                      <div className="relative">
                        <Input
                          id="newPass"
                          type={showNewPassword ? "text" : "password"}
                          value={passwordForm.newPassword}
                          onChange={(e) => setPasswordForm({...passwordForm, newPassword: e.target.value})}
                          placeholder="••••••••"
                          className="border-[#E2E8F0] focus-visible:ring-[#0EA5E9] pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                        >
                          {showNewPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirmPass" className="text-xs font-bold text-[#334155]">Xác nhận mật khẩu mới</Label>
                      <div className="relative">
                        <Input
                          id="confirmPass"
                          type={showConfirmPassword ? "text" : "password"}
                          value={passwordForm.confirmPassword}
                          onChange={(e) => setPasswordForm({...passwordForm, confirmPassword: e.target.value})}
                          placeholder="••••••••"
                          className="border-[#E2E8F0] focus-visible:ring-[#0EA5E9] pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                        >
                          {showConfirmPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="pt-2 flex justify-end">
                    <Button onClick={handleChangePassword} disabled={changingPassword} variant="outline" className="border-[#0EA5E9] text-[#0EA5E9] hover:bg-[#EFF6FF] font-bold text-sm">
                      {changingPassword && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                      Cập nhật Mật khẩu
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
