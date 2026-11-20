"use client"

import { toast } from "sonner"
import { useState } from "react"
import { LoginForm, RegisterForm, AuthHero } from "@/components/auth-forms"
import { useRouter } from "next/navigation"
import { AuthService } from "@/services/auth.service"
import { apiClient } from "@/lib/api-client"
import { ModeToggle } from "@/components/mode-toggle"

export default function LoginPage() {
  const [view, setView] = useState<"login" | "register">("login")
  const router = useRouter()

  const handleLogin = async (data: { email: string; password: string; role: string; remember: boolean }) => {
    try {
      await AuthService.login(data.email, data.password, data.remember);
      // Try to fetch profile to know exactly what the user is
      const user = await apiClient.get<any>("/users/me");
      if (user.role === "SINH_VIEN") {
        try {
          const faces: any = await apiClient.get<any>("/face-images/me");
          if (!faces || !faces.data || faces.data.length === 0 || faces.count === 0) {
            toast.warning("Bạn chưa có dữ liệu khuôn mặt. Vui lòng cập nhật hình ảnh khuôn mặt!");
            router.push("/student/registration");
            return;
          }
        } catch (e) {
          // Ignore face check error if endpoint differs
        }
        router.push("/student")
      } else if (user.role === "GIANG_VIEN") {
        router.push("/lecturer")
      } else {
        router.push("/admin")
      }
    } catch (err: any) {
      throw err;
    }
  }

  const handleRegister = async (data: {
    mssv: string
    email: string
    password: string
    otp_code: string
  }) => {
    try {
      await AuthService.register(data);
      toast.success("Xác thực OTP và Đăng ký tài khoản thành công! Hãy đăng nhập bằng MSSV và Mật khẩu của bạn.");
      setView("login");
    } catch (err: any) {
      toast.error("Đăng ký thất bại: " + (err.message || "Lỗi không xác định"));
    }
  }

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left Panel - Hero */}
      <div className="hidden lg:flex lg:w-[45%]">
        <AuthHero />
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-background relative">
        <div className="absolute top-4 right-4 z-50">
          <ModeToggle />
        </div>
        
        {view === "login" ? (
          <LoginForm
            onSubmit={handleLogin}
            onRegisterClick={() => setView("register")}
          />
        ) : (
          <RegisterForm
            onSubmit={handleRegister}
            onLoginClick={() => setView("login")}
          />
        )}
      </div>
    </div>
  )
}
