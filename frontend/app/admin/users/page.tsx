"use client"

import { useEffect, useState } from "react"
import { AppShell } from "@/components/app-shell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { RoleBadge } from "@/components/status-badge"
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import {
  Plus,
  Download,
  Search,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Trash2,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertTriangle
} from "lucide-react"
import { AdminService } from "@/services/admin.service"

type UserRole = "student" | "lecturer" | "admin"
type UserStatus = "active" | "locked"

interface UserData {
  id: string
  name: string
  email: string
  role: UserRole
  status: UserStatus
  createdAt: string
  lastLogin: string
  studentId?: string
  faceDataStatus?: "approved" | "pending" | "none"
  classes?: string[]
}

export default function AdminUserManagement() {
  const [adminUser, setAdminUser] = useState({
    name: "Admin",
    email: "admin@university.edu.vn",
    avatar: ""
  })
  const [users, setUsers] = useState<UserData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [roleFilter, setRoleFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [expandedUser, setExpandedUser] = useState<string | null>(null)
  const [createUserOpen, setCreateUserOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Form states
  const [formName, setFormName] = useState("")
  const [formUsername, setFormUsername] = useState("")
  const [formEmail, setFormEmail] = useState("")
  const [formRole, setFormRole] = useState("student")
  const [formGender, setFormGender] = useState("Nam")
  const [formPhone, setFormPhone] = useState("")
  const [formPassword, setFormPassword] = useState("password")
  const [showPassword, setShowPassword] = useState(false)

  const fetchUsers = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await AdminService.getUsers(roleFilter, statusFilter, searchTerm)
      setUsers(response.data || [])
    } catch (err: any) {
      console.error(err)
      setError("Không thể tải danh sách người dùng từ hệ thống.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    AdminService.getProfile()
      .then(p => setAdminUser({ ...p, avatar: "" }))
      .catch(err => console.error("Lỗi tải profile admin:", err))
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchUsers()
    }, 300)
    return () => clearTimeout(timer)
  }, [roleFilter, statusFilter, searchTerm])

  const handleToggleStatus = async (accountId: number) => {
    try {
      const res = await AdminService.toggleUserStatus(accountId)
      if (res) {
        setUsers(prev => prev.map(u => u.id === accountId.toString() ? {
          ...u,
          status: u.status === "active" ? "locked" : "active"
        } : u))
      }
    } catch (err) {
      alert("Không thể cập nhật trạng thái tài khoản.")
    }
  }

  const handleDeleteUser = async (accountId: number) => {
    if (!confirm("Bạn có chắc chắn muốn xóa tài khoản này và hồ sơ liên quan? Hành động này không thể hoàn tác.")) return
    try {
      const success = await AdminService.deleteUser(accountId)
      if (success) {
        setUsers(prev => prev.filter(u => u.id !== accountId.toString()))
      }
    } catch (err) {
      alert("Lỗi khi xóa người dùng.")
    }
  }

  const handleCreateUser = async () => {
    if (!formName.trim() || !formUsername.trim() || !formPassword.trim()) {
      alert("Vui lòng điền đầy đủ các thông tin bắt buộc (Họ tên, Tên đăng nhập và Mật khẩu).")
      return
    }
    setSubmitting(true)
    try {
      const nameParts = formName.trim().split(" ")
      const last_name = nameParts.length > 1 ? nameParts.slice(0, -1).join(" ") : ""
      const first_name = nameParts.length > 0 ? nameParts[nameParts.length - 1] : ""

      const payload = {
        username: formUsername.trim(),
        email: formEmail.trim() || null,
        password: formPassword,
        role: formRole,
        last_name,
        first_name,
        phone: formPhone.trim() || null,
        gender: formGender
      }

      const res = await AdminService.createUser(payload)
      if (res) {
        alert("Tạo người dùng thành công!")
        setCreateUserOpen(false)
        // Reset form
        setFormName("")
        setFormUsername("")
        setFormEmail("")
        setFormPhone("")
        setFormPassword("password")
        setShowPassword(false)
        // Reload list
        fetchUsers()
      }
    } catch (err: any) {
      alert(err.message || "Lỗi khi tạo tài khoản người dùng.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AppShell
      role="admin"
      user={adminUser}
      breadcrumb="Quản lý người dùng"
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A]">Quản lý người dùng</h1>
            <span className="inline-flex items-center px-2.5 py-1 mt-2 rounded-full text-xs font-medium bg-[#DBEAFE] text-[#1E40AF]">
              {users.length} tài khoản
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => setCreateUserOpen(true)}
              className="bg-[#0A2540] hover:bg-[#1A3A5C]"
            >
              <Plus className="w-4 h-4 mr-2" />
              Thêm người dùng
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card className="border-[#E2E8F0] shadow-sm">
          <CardContent className="pt-6">
            <div className="flex flex-wrap gap-4">
              <div className="relative flex-1 min-w-[250px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
                <Input
                  placeholder="Tìm theo tên, email, mã số..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              <div className="flex bg-[#F1F5F9] rounded-lg p-1">
                {[
                  { value: "all", label: "Tất cả" },
                  { value: "student", label: "Sinh viên" },
                  { value: "lecturer", label: "Giảng viên" },
                  { value: "admin", label: "Quản trị viên" },
                ].map((role) => (
                  <button
                    key={role.value}
                    onClick={() => setRoleFilter(role.value)}
                    className={cn(
                      "px-4 py-2 rounded-md text-sm font-medium transition-all",
                      roleFilter === role.value
                        ? "bg-white text-[#0A2540] shadow-sm"
                        : "text-[#64748B] hover:text-[#0F172A]"
                    )}
                  >
                    {role.label}
                  </button>
                ))}
              </div>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Trạng thái" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả</SelectItem>
                  <SelectItem value="active">Kích hoạt</SelectItem>
                  <SelectItem value="locked">Bị khóa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {loading && (
          <div className="flex flex-col items-center justify-center py-24 bg-white rounded-xl border border-[#E2E8F0] shadow-sm">
            <Loader2 className="w-10 h-10 text-[#0EA5E9] animate-spin mb-4" />
            <p className="text-[#64748B] font-medium">Đang tải danh sách người dùng...</p>
          </div>
        )}

        {!loading && error && (
          <Card className="border-[#EF4444] bg-[#FEF2F2]">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <AlertTriangle className="w-12 h-12 text-[#EF4444] mb-3" />
              <h3 className="text-lg font-semibold text-[#991B1B] mb-1">Đã xảy ra lỗi</h3>
              <p className="text-[#DC2626] mb-4 max-w-md text-sm">{error}</p>
              <Button onClick={fetchUsers} variant="outline" className="border-[#EF4444] text-[#EF4444] hover:bg-[#EF4444] hover:text-white">
                Tải lại
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Users Table */}
        {!loading && !error && (
          <Card className="border-[#E2E8F0] shadow-sm">
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]"></TableHead>
                    <TableHead>Người dùng</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Vai trò</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead>Ngày tạo</TableHead>
                    <TableHead>Hành động</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-[#64748B]">
                        Không tìm thấy người dùng nào phù hợp.
                      </TableCell>
                    </TableRow>
                  ) : (
                    users.map((user) => (
                      <>
                        <TableRow
                          key={user.id}
                          className={cn(
                            "cursor-pointer hover:bg-[#F8FAFC]",
                            expandedUser === user.id && "bg-[#F8FAFC]"
                          )}
                          onClick={() => setExpandedUser(expandedUser === user.id ? null : user.id)}
                        >
                          <TableCell>
                            {expandedUser === user.id ? (
                              <ChevronUp className="w-4 h-4 text-[#64748B]" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-[#64748B]" />
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="w-9 h-9">
                                <AvatarFallback className="bg-[#0A2540] text-white text-sm">
                                  {user.name.charAt(0)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="font-medium">{user.name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-[#64748B]">{user.email}</TableCell>
                          <TableCell>
                            <RoleBadge role={user.role} />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className={cn(
                                "w-2 h-2 rounded-full",
                                user.status === "active" ? "bg-[#22C55E]" : "bg-[#EF4444]"
                              )} />
                              <span className={cn(
                                "text-sm",
                                user.status === "active" ? "text-[#22C55E]" : "text-[#EF4444]"
                              )}>
                                {user.status === "active" ? "Kích hoạt" : "Bị khóa"}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-[#64748B]">{user.createdAt}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="w-8 h-8"
                                onClick={() => handleToggleStatus(parseInt(user.id))}
                              >
                                {user.status === "active" ? (
                                  <Lock className="w-4 h-4 text-[#F59E0B]" />
                                ) : (
                                  <Unlock className="w-4 h-4 text-[#22C55E]" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="w-8 h-8 text-[#EF4444] hover:text-[#EF4444]"
                                onClick={() => handleDeleteUser(parseInt(user.id))}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        {expandedUser === user.id && (
                          <TableRow>
                            <TableCell colSpan={7} className="bg-[#F8FAFC]">
                              <div className="p-4 space-y-3">
                                <div className="grid grid-cols-4 gap-4 text-sm">
                                  <div>
                                    <span className="text-[#64748B]">Đăng nhập gần nhất:</span>
                                    <p className="font-medium text-[#0F172A]">{user.lastLogin}</p>
                                  </div>
                                  {user.studentId && (
                                    <div>
                                      <span className="text-[#64748B]">Mã sinh viên (Hồ sơ):</span>
                                      <p className="font-medium text-[#0F172A]">{user.studentId}</p>
                                    </div>
                                  )}
                                  {user.faceDataStatus && (
                                    <div>
                                      <span className="text-[#64748B]">Dữ liệu khuôn mặt:</span>
                                      <p className={cn(
                                        "font-medium",
                                        user.faceDataStatus === "approved" ? "text-[#22C55E]" :
                                        user.faceDataStatus === "pending" ? "text-[#F59E0B]" : "text-[#EF4444]"
                                      )}>
                                        {user.faceDataStatus === "approved" ? "Đã đăng ký" : "Chưa đăng ký"}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    ))
                  )}
                </TableBody>
              </Table>

              <div className="flex items-center justify-between mt-4 pt-4 border-t border-[#E2E8F0]">
                <p className="text-sm text-[#64748B]">
                  Hiển thị {users.length} người dùng
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Create User Modal */}
      <Dialog open={createUserOpen} onOpenChange={setCreateUserOpen}>
        <DialogContent className="max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Thêm người dùng mới</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-[#0F172A] mb-2">
                Họ và tên <span className="text-red-500">*</span>
              </label>
              <Input
                placeholder="VD: Nguyễn Văn C"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="border-[#E2E8F0]"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#0F172A] mb-2">
                Tên đăng nhập <span className="text-red-500">*</span>
              </label>
              <Input
                placeholder="VD: nguyen_van_c"
                value={formUsername}
                onChange={(e) => setFormUsername(e.target.value)}
                className="border-[#E2E8F0]"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#0F172A] mb-2">
                Gmail
              </label>
              <Input
                type="email"
                placeholder="VD: c.nguyen@student.edu.vn"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                className="border-[#E2E8F0]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-[#0F172A] mb-2">
                  Giới tính
                </label>
                <Select value={formGender} onValueChange={setFormGender}>
                  <SelectTrigger className="border-[#E2E8F0]">
                    <SelectValue placeholder="Chọn giới tính" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Nam">Nam</SelectItem>
                    <SelectItem value="Nữ">Nữ</SelectItem>
                    <SelectItem value="Khác">Khác</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#0F172A] mb-2">
                  Số điện thoại
                </label>
                <Input
                  placeholder="VD: 0987654321"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  className="border-[#E2E8F0]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-[#0F172A] mb-2">
                  Vai trò <span className="text-red-500">*</span>
                </label>
                <Select value={formRole} onValueChange={setFormRole}>
                  <SelectTrigger className="border-[#E2E8F0]">
                    <SelectValue placeholder="Chọn vai trò" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="student">Sinh viên</SelectItem>
                    <SelectItem value="lecturer">Giảng viên</SelectItem>
                    <SelectItem value="admin">Quản trị viên</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#0F172A] mb-2">
                  Mật khẩu <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Mật khẩu"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    className="border-[#E2E8F0] pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateUserOpen(false)} disabled={submitting} className="border-[#E2E8F0] text-slate-600">
              Hủy
            </Button>
            <Button
              onClick={handleCreateUser}
              className="bg-[#0A2540] hover:bg-[#1A3A5C] text-white"
              disabled={submitting}
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : null}
              Tạo người dùng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}
