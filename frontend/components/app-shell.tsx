"use client"

import { cn } from "@/lib/utils"
import { Logo } from "@/components/logo"
import { RoleBadge } from "@/components/status-badge"
import Link from "next/link"
import { ModeToggle } from "@/components/mode-toggle"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  History,
  MessageSquareWarning,
  User,
  Video,
  BookOpen,
  BarChart3,
  CheckSquare,
  Users,
  GraduationCap,
  ScanFace,
  FileText,
  Building2,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Bell,
  AlertTriangle
} from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { AuthService } from "@/services/auth.service"

type UserRole = "student" | "lecturer" | "admin"

interface NavItem {
  icon: React.ElementType
  label: string
  href: string
}

const navConfig: Record<UserRole, NavItem[]> = {
  student: [
    { icon: LayoutDashboard, label: "Dashboard", href: "/student" },
    { icon: BookOpen, label: "Đăng ký học phần", href: "/student/registration" },
    { icon: History, label: "Lịch sử điểm danh", href: "/student/history" },
    { icon: MessageSquareWarning, label: "Khiếu nại", href: "/student/claims" },
    { icon: User, label: "Hồ sơ cá nhân", href: "/student/profile" }
  ],
  lecturer: [
    { icon: LayoutDashboard, label: "Dashboard", href: "/lecturer" },
    { icon: Video, label: "Phòng học trực tiếp", href: "/lecturer/live" },
    { icon: BookOpen, label: "Quản lý lớp học", href: "/lecturer/classes" },
    { icon: BarChart3, label: "Thống kê & Báo cáo", href: "/lecturer/reports" },
    { icon: CheckSquare, label: "Duyệt khiếu nại", href: "/lecturer/claims" },
    { icon: User, label: "Hồ sơ thông tin", href: "/lecturer/profile" }
  ],
  admin: [
    { icon: LayoutDashboard, label: "Dashboard", href: "/admin" },
    { icon: Users, label: "Người dùng", href: "/admin/users" },
    { icon: BookOpen, label: "Học phần", href: "/admin/subjects" },
    { icon: Building2, label: "Ngành đào tạo", href: "/admin/departments" },
    { icon: GraduationCap, label: "Lớp học phần", href: "/admin/classes" },
    { icon: ScanFace, label: "Dữ liệu khuôn mặt", href: "/admin/faces" },
    { icon: FileText, label: "Nhật ký hệ thống", href: "/admin/audit" },
    { icon: BarChart3, label: "Báo cáo tổng hợp", href: "/admin/reports" }
  ]
}

interface SidebarProps {
  role: UserRole
  user: {
    name: string
    email: string
    avatar?: string
  }
  className?: string
}

export function Sidebar({ role, user, className }: SidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const navItems = navConfig[role]

  const handleLogout = () => {
    void AuthService.logout()
  }

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 h-screen bg-sidebar text-white transition-all duration-300 flex flex-col",
        collapsed ? "w-16" : "w-60",
        className
      )}
    >
      {/* Logo */}
      <div className={cn("flex items-center h-16 px-4 border-b border-sidebar-border", collapsed && "justify-center")}>
        <Logo variant="light" showText={!collapsed} size={collapsed ? "sm" : "md"} />
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        <ul className="space-y-1 px-2">
          {navItems.map((item) => {
            const isRootRolePath = item.href === "/admin" || item.href === "/lecturer" || item.href === "/student"
            const isActive = isRootRolePath
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(item.href + "/")
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                    isActive
                      ? "bg-[#EFF6FF] text-[#0A2540] dark:bg-[#1E293B] dark:text-[#38BDF8] border-l-4 border-[#0EA5E9] -ml-0.5"
                      : "text-white/80 hover:bg-[#1A3A5C] hover:text-white",
                    collapsed && "justify-center px-2"
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <item.icon className="w-5 h-5 shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* User Info */}
      <div className={cn("border-t border-sidebar-border p-4", collapsed && "px-2")}>
        <div className={cn("flex items-center gap-3", collapsed && "flex-col")}>
          <Avatar className="w-10 h-10">
            <AvatarImage src={user.avatar} alt={user.name} />
            <AvatarFallback className="bg-[#0EA5E9] text-white">
              {user.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user.name}</p>
              <RoleBadge role={role} className="mt-1" />
            </div>
          )}
        </div>
        <div className={cn("flex gap-2 mt-4", collapsed ? "flex-col" : "items-center")}>
          <Button
            variant="ghost"
            size="icon"
            className="text-white/80 hover:text-white hover:bg-sidebar-accent"
            title="Cài đặt"
          >
            <Settings className="w-5 h-5" />
          </Button>
          <Button
            variant="ghost"
            size={collapsed ? "icon" : "default"}
            className={cn(
              "text-white/80 hover:text-white hover:bg-sidebar-accent",
              !collapsed && "flex-1 justify-start"
            )}
            title="Đăng xuất"
            onClick={handleLogout}
          >
            <LogOut className="w-5 h-5" />
            {!collapsed && <span>Đăng xuất</span>}
          </Button>
        </div>
      </div>

      {/* Collapse Toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-20 w-6 h-6 bg-sidebar border border-sidebar-border rounded-full flex items-center justify-center text-white hover:bg-sidebar-accent transition-colors"
      >
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>
    </aside>
  )
}

export interface NotificationItem {
  id: string
  title: string
  description: string
  type: "warning" | "info" | "success"
  time?: string
}

interface TopNavbarProps {
  breadcrumb: string
  user: {
    name: string
    avatar?: string
  }
  notificationCount?: number
  notifications?: NotificationItem[]
}

export function TopNavbar({ breadcrumb, user, notificationCount = 0, notifications = [] }: TopNavbarProps) {
  const [showNotifications, setShowNotifications] = useState(false)
  const displayNotifications = [...notifications]

  const displayCount = displayNotifications.length

  return (
    <header className="sticky top-0 z-30 h-16 bg-card border-b border-border flex items-center justify-between px-6">
      <h1 className="text-lg font-semibold text-foreground">{breadcrumb}</h1>
      <div className="flex items-center gap-4 relative">
        <ModeToggle />
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            onClick={() => setShowNotifications(!showNotifications)}
          >
            <Bell className="w-5 h-5 text-muted-foreground" />
            {displayCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-[#EF4444] text-white text-xs rounded-full flex items-center justify-center">
                {displayCount > 9 ? "9+" : displayCount}
              </span>
            )}
          </Button>

          {showNotifications && (
            <>
              {/* Click outside overlay to close */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowNotifications(false)}
              />

              {/* Notifications Dropdown Panel */}
              <div className="absolute right-0 top-12 w-80 bg-card/95 backdrop-blur-md border border-border shadow-xl rounded-xl z-50 overflow-hidden flex flex-col max-h-96">
                <div className="p-3 bg-muted/50 border-b border-border flex items-center justify-between">
                  <span className="font-semibold text-sm text-foreground">Thông báo mới</span>
                  {displayCount > 0 && (
                    <span className="text-xs bg-[#EFF6FF] text-[#0EA5E9] px-2 py-0.5 rounded-full font-medium">
                      {displayCount} tin
                    </span>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto divide-y divide-[#E2E8F0]">
                  {displayCount > 0 ? (
                    displayNotifications.map((item) => (
                      <div key={item.id} className="p-3 hover:bg-muted/50 transition-colors flex gap-2.5 items-start">
                        {item.type === "warning" ? (
                          <div className="w-7 h-7 rounded-full bg-[#FEF9C3] flex items-center justify-center text-[#F59E0B] shrink-0">
                            <AlertTriangle className="w-4 h-4" />
                          </div>
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-[#EFF6FF] flex items-center justify-center text-[#0EA5E9] shrink-0">
                            <Bell className="w-4 h-4" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-foreground">{item.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{item.description}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 text-center text-muted-foreground text-xs">
                      Không có thông báo nào.
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <Avatar className="w-9 h-9 cursor-pointer">
          <AvatarImage src={user.avatar} alt={user.name} />
          <AvatarFallback className="bg-[#0A2540] text-white text-sm">
            {user.name.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  )
}

interface AppShellProps {
  role: UserRole
  user: {
    name: string
    email: string
    avatar?: string
  }
  breadcrumb: string
  notificationCount?: number
  notifications?: NotificationItem[]
  children: React.ReactNode
}

export function AppShell({ role, user, breadcrumb, notificationCount, notifications, children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar role={role} user={user} />
      <div className="pl-60 transition-all duration-300">
        <TopNavbar
          breadcrumb={breadcrumb}
          user={user}
          notificationCount={notificationCount}
          notifications={notifications}
        />
        <main className="p-6">
          <div className="max-w-[1280px] mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}


