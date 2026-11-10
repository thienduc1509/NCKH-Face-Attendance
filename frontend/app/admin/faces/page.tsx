"use client"

import { useState, useEffect, useRef } from "react"
import Image from "next/image"
import { AppShell } from "@/components/app-shell"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import {
  Search,
  Camera,
  RefreshCw,
  Eye,
  User,
  Check,
  X,
  Upload,
  AlertTriangle,
  Glasses,
  Moon,
  Sun,
  CheckCircle2,
  Info,
  ShieldCheck,
  Sparkles,
  CameraOff,
} from "lucide-react"

import { AdminService } from "@/services/admin.service"

export type FaceStatus = "approved" | "pending" | "none" | "poor"

export interface StudentFace {
  id: string
  faceRecordId?: number
  name: string
  studentId: string
  status: FaceStatus
  quality?: number
  lastUpdated?: string
  className?: string
  imageUrl?: string
  email?: string
}

export interface FaceCondition {
  id: string
  label: string
  sublabel: string
  description: string
  hint?: string
  required: boolean
}

// 8 conditions per NCKH YuNet & SFace specifications (5-10 images/person)
export const FACE_ANGLES: FaceCondition[] = [
  {
    id: "chinh_dien",
    label: "Chính diện",
    sublabel: "Frontal",
    description: "Nhìn thẳng camera, mắt mở rõ, ánh sáng tiêu chuẩn",
    hint: "Nhìn thẳng camera, mắt mở to, biểu cảm tự nhiên",
    required: true,
  },
  {
    id: "goc_trai",
    label: "Nghiêng trái",
    sublabel: "Left profile",
    description: "Xoay mặt sang trái góc 15°–30°",
    hint: "Xoay mặt sang trái khoảng 15°–30°",
    required: true,
  },
  {
    id: "goc_phai",
    label: "Nghiêng phải",
    sublabel: "Right profile",
    description: "Xoay mặt sang phải góc 15°–30°",
    hint: "Xoay mặt sang phải khoảng 15°–30°",
    required: true,
  },
  {
    id: "goc_tren",
    label: "Ngẩng lên",
    sublabel: "Tilted up",
    description: "Ngửa đầu lên góc 10°–15°",
    hint: "Ngửa đầu lên trên khoảng 10°–15°",
    required: true,
  },
  {
    id: "goc_duoi",
    label: "Cúi xuống",
    sublabel: "Tilted down",
    description: "Cúi đầu xuống góc 10°–15°",
    hint: "Cúi đầu xuống dưới khoảng 10°–15°",
    required: true,
  },
  {
    id: "deo_kinh",
    label: "Đeo kính",
    sublabel: "Wearing glasses",
    description: "Chụp khi đeo kính cận hoặc kính thời trang",
    hint: "Đeo kính cận hoặc kính thời trang",
    required: false,
  },
  {
    id: "anh_sang_yeu",
    label: "Ánh sáng yếu",
    sublabel: "Low light",
    description: "Chụp trong môi trường thiếu sáng hoặc phòng mờ",
    hint: "Chụp trong điều kiện ánh sáng yếu / thiếu sáng",
    required: false,
  },
  {
    id: "nguoc_sang",
    label: "Ngược sáng",
    sublabel: "Back-light",
    description: "Chụp khi có nguồn sáng chiếu từ phía sau lưng",
    hint: "Chụp khi có nguồn sáng chiếu từ phía sau lưng",
    required: false,
  },
]

export const MIN_REQUIRED_IMAGES = 5
export const RECOMMENDED_IMAGES = 8
export const MAX_ALLOWED_IMAGES = 10

const statusConfig: Record<FaceStatus, { label: string; className: string }> = {
  approved: { label: "Đã duyệt", className: "bg-[#E8F5E9] text-[#22C55E] border border-[#22C55E]/15" },
  pending: { label: "Chờ duyệt", className: "bg-[#FFF3E0] text-[#F59E0B] border border-[#F59E0B]/15" },
  none: { label: "Chưa đăng ký", className: "bg-slate-100 text-slate-500 border border-slate-200" },
  poor: { label: "Chất lượng kém", className: "bg-[#FFEBEE] text-[#EF4444] border border-[#EF4444]/15" },
}

const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:5050/api").replace(/\/api\/?$/, "")

const toBackendAssetUrl = (path?: string) => {
  if (!path) return undefined
  if (/^https?:\/\//i.test(path)) return path
  return `${API_ORIGIN}/${path.replaceAll("\\", "/").replace(/^\/+/, "")}`
}

export default function AdminFaceManagement() {
  const [adminUser, setAdminUser] = useState({
    name: "Admin",
    email: "admin@university.edu.vn",
    avatar: ""
  })
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [selectedStudent, setSelectedStudent] = useState<StudentFace | null>(null)
  const [adminNotes, setAdminNotes] = useState("")
  const [students, setStudents] = useState<StudentFace[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadMessage, setUploadMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [allFaceRecords, setAllFaceRecords] = useState<any[]>([])
  const [activeUploadAngle, setActiveUploadAngle] = useState<string | null>(null)
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null)

  // Webcam modal state
  const [webcamSlot, setWebcamSlot] = useState<string | null>(null)
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null)
  const [webcamError, setWebcamError] = useState<string | null>(null)
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null)
  const [capturedPreviewUrl, setCapturedPreviewUrl] = useState<string | null>(null)
  const webcamVideoRef = useRef<HTMLVideoElement | null>(null)
  const webcamCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const fetchStudents = async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const [response, faceRecords] = await Promise.all([
        AdminService.getUsers("student", "all", ""),
        AdminService.getFaceRecords(),
      ])
      const records = faceRecords || []
      setAllFaceRecords(records)
      const users = Array.isArray(response) ? response : response.data || []
      const mapped: StudentFace[] = users.map((user: any) => {
        const rawStudentId = user.studentId ?? user.student_id ?? user.id
        const studentIdText = rawStudentId?.toString() || ""
        const studentFaces = records.filter((face: any) => face.student_id?.toString() === studentIdText)
        const frontalFace = studentFaces.find((face: any) => face.image_type === "chinh_dien")
        const latestFace = frontalFace || studentFaces.sort((a: any, b: any) => (b.image_id || 0) - (a.image_id || 0))[0]
        const faceStatus: FaceStatus = latestFace?.review_status === "DA_DUYET"
          ? "approved"
          : latestFace?.review_status === "CHO_DUYET"
            ? "pending"
            : latestFace?.review_status === "TU_CHOI"
              ? "poor"
              : user.faceDataStatus || "none"

        return {
          id: studentIdText || user.id?.toString(),
          faceRecordId: latestFace?.image_id,
          name: user.name,
          studentId: studentIdText ? `SV${studentIdText.padStart(3, "0")}` : `SV${user.id}`,
          status: faceStatus,
          quality: latestFace?.quality_score ? Math.round(latestFace.quality_score * 100) : faceStatus === "approved" ? 92 : undefined,
          lastUpdated: latestFace?.reviewed_at
            ? new Date(latestFace.reviewed_at).toLocaleString("vi-VN")
            : undefined,
          className: "CNTT",
          imageUrl: toBackendAssetUrl(latestFace?.image_path),
          email: user.email || user.google_email || ""
        }
      })
      setStudents(mapped)

      // Keep selected student synchronized if open in drawer
      if (selectedStudent) {
        const fresh = mapped.find((s) => s.id === selectedStudent.id)
        if (fresh) setSelectedStudent(fresh)
      }
    } catch (err) {
      console.error("Lỗi tải danh sách khuôn mặt sinh viên:", err)
      setStudents([])
      setLoadError("Không tải được danh sách sinh viên. Vui lòng kiểm tra API /users/profiles và quyền quản trị viên.")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    AdminService.getProfile()
      .then(p => setAdminUser({ ...p, avatar: "" }))
      .catch(err => console.error("Lỗi tải profile admin:", err))
    fetchStudents()
  }, [])

  // Manage webcam stream assignment
  useEffect(() => {
    if (webcamStream && webcamVideoRef.current) {
      webcamVideoRef.current.srcObject = webcamStream
      webcamVideoRef.current.play().catch((err) => {
        console.warn("Lỗi phát video webcam:", err)
      })
    }
  }, [webcamStream])

  // Stop webcam tracks on unmount
  useEffect(() => {
    return () => {
      if (webcamStream) {
        webcamStream.getTracks().forEach((track) => track.stop())
      }
      if (capturedPreviewUrl) {
        URL.revokeObjectURL(capturedPreviewUrl)
      }
    }
  }, [webcamStream, capturedPreviewUrl])

  const openWebcam = async (slotId: string) => {
    setWebcamSlot(slotId)
    setWebcamError(null)
    setCapturedBlob(null)
    if (capturedPreviewUrl) {
      URL.revokeObjectURL(capturedPreviewUrl)
      setCapturedPreviewUrl(null)
    }

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Trình duyệt không hỗ trợ truy cập camera qua WebRTC.")
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio: false,
      })
      setWebcamStream(stream)
    } catch (err: any) {
      console.error("Lỗi truy cập webcam:", err)
      setWebcamError(
        err.name === "NotAllowedError" || err.name === "PermissionDeniedError"
          ? "Trình duyệt chưa được cấp quyền truy cập camera. Vui lòng cho phép quyền máy ảnh trong cài đặt trình duyệt hoặc sử dụng nút 'Tải file'."
          : "Không thể mở camera: " + (err.message || "Thiết bị không khả dụng.")
      )
    }
  }

  const closeWebcam = () => {
    if (webcamStream) {
      webcamStream.getTracks().forEach((track) => track.stop())
      setWebcamStream(null)
    }
    setWebcamSlot(null)
    setWebcamError(null)
    if (capturedPreviewUrl) {
      URL.revokeObjectURL(capturedPreviewUrl)
      setCapturedPreviewUrl(null)
    }
    setCapturedBlob(null)
  }

  const captureFrameFromWebcam = () => {
    if (!webcamVideoRef.current) return
    const video = webcamVideoRef.current
    const canvas = webcamCanvasRef.current || document.createElement("canvas")
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Mirror image horizontally to match webcam display
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    ctx.setTransform(1, 0, 0, 1, 0, 0)

    canvas.toBlob(
      (blob) => {
        if (!blob) return
        const previewUrl = URL.createObjectURL(blob)
        setCapturedBlob(blob)
        setCapturedPreviewUrl(previewUrl)
      },
      "image/jpeg",
      0.95
    )
  }

  const retakeWebcamSnapshot = () => {
    if (capturedPreviewUrl) {
      URL.revokeObjectURL(capturedPreviewUrl)
      setCapturedPreviewUrl(null)
    }
    setCapturedBlob(null)
    if (webcamStream && webcamVideoRef.current) {
      webcamVideoRef.current.play().catch(() => {})
    }
  }

  const uploadFile = async (file: File, targetAngle: string = "chinh_dien") => {
    if (!selectedStudent) return
    setIsUploading(true)
    setUploadMessage(null)
    try {
      const studentDbId = parseInt(selectedStudent.id)
      await AdminService.registerFace(studentDbId, file, targetAngle)

      const targetAngleConfig = FACE_ANGLES.find((a) => a.id === targetAngle)
      const angleLabel = targetAngleConfig ? targetAngleConfig.label : targetAngle
      setUploadMessage({
        type: "success",
        text: `Đã nạp ảnh thành công cho điều kiện "${angleLabel}". Vector SFace 128D đã được trích xuất!`
      })

      // Refresh records and student list
      const faceRecords = await AdminService.getFaceRecords()
      setAllFaceRecords(faceRecords || [])
      await fetchStudents()
    } catch (err: any) {
      console.error("Lỗi đăng ký khuôn mặt:", err)
      const errorDetail = err.response?.data?.detail || err.message || "Không xác định"
      setUploadMessage({
        type: "error",
        text: `Lỗi đăng ký ảnh (${targetAngle}): ${errorDetail}`
      })
    } finally {
      setIsUploading(false)
    }
  }

  const handleConfirmWebcamCapture = async () => {
    if (!capturedBlob || !webcamSlot || !selectedStudent) return
    const fileName = `${selectedStudent.studentId}_${webcamSlot}_${Date.now()}.jpg`
    const file = new File([capturedBlob], fileName, { type: "image/jpeg" })
    const slot = webcamSlot
    closeWebcam()
    await uploadFile(file, slot)
  }

  const triggerFileUploadForAngle = (angleId: string) => {
    setActiveUploadAngle(angleId)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
      fileInputRef.current.click()
    }
  }

  const handleAngleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !activeUploadAngle) return
    const file = e.target.files[0]
    uploadFile(file, activeUploadAngle)
  }

  const handleSlotDrop = (e: React.DragEvent, angleId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverSlot(null)
    if (isUploading || !selectedStudent) return

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0]
      if (file.type.startsWith("image/")) {
        uploadFile(file, angleId)
      } else {
        setUploadMessage({
          type: "error",
          text: "Vui lòng chọn file hình ảnh hợp lệ (JPEG/PNG/WebP)."
        })
      }
    }
  }

  const handleApproveFace = async () => {
    if (!selectedStudent?.faceRecordId) return

    const studentFaces = allFaceRecords.filter(
      (r: any) => r.student_id?.toString() === selectedStudent.id
    )
    const conditionCount = FACE_ANGLES.filter((a) =>
      studentFaces.some((r: any) => r.image_type === a.id)
    ).length

    if (conditionCount < MIN_REQUIRED_IMAGES) {
      const confirmed = window.confirm(
        `Cảnh báo: Sinh viên hiện mới chỉ có ${conditionCount}/${MIN_REQUIRED_IMAGES} điều kiện ảnh tối thiểu theo quy định NCKH. Bạn có chắc chắn muốn duyệt không?`
      )
      if (!confirmed) return
    }

    try {
      await AdminService.approveFace(selectedStudent.faceRecordId)
      await fetchStudents()
      setUploadMessage({
        type: "success",
        text: "Đã phê duyệt hồ sơ khuôn mặt thành công!"
      })
    } catch (err: any) {
      alert("Lỗi phê duyệt: " + (err.response?.data?.detail || err.message))
    }
  }

  const handleRejectFace = async () => {
    if (!selectedStudent?.faceRecordId) return
    try {
      await AdminService.rejectFace(selectedStudent.faceRecordId, adminNotes || "Ảnh chưa đạt chuẩn chất lượng / thiếu điều kiện")
      await fetchStudents()
      setUploadMessage({
        type: "success",
        text: "Đã từ chối hồ sơ khuôn mặt."
      })
    } catch (err: any) {
      alert("Lỗi từ chối: " + (err.response?.data?.detail || err.message))
    }
  }

  const getAngleIcon = (angleId: string) => {
    switch (angleId) {
      case "chinh_dien":
        return <User className="w-4 h-4 text-sky-600" />
      case "goc_trai":
      case "goc_phai":
      case "goc_tren":
      case "goc_duoi":
        return <Camera className="w-4 h-4 text-indigo-600" />
      case "deo_kinh":
        return <Glasses className="w-4 h-4 text-purple-600" />
      case "anh_sang_yeu":
        return <Moon className="w-4 h-4 text-amber-600" />
      case "nguoc_sang":
        return <Sun className="w-4 h-4 text-orange-600" />
      default:
        return <Camera className="w-4 h-4 text-slate-600" />
    }
  }

  const filteredStudents = students.filter((student) => {
    if (statusFilter !== "all" && student.status !== statusFilter) return false
    if (searchTerm && !student.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !student.studentId.toLowerCase().includes(searchTerm.toLowerCase())) return false
    return true
  })

  // Selected student statistics
  const selectedStudentRecords = selectedStudent
    ? allFaceRecords.filter((r: any) => r.student_id?.toString() === selectedStudent.id)
    : []
  const registeredConditionCount = selectedStudent
    ? FACE_ANGLES.filter((angle) =>
        selectedStudentRecords.some((r: any) => r.image_type === angle.id)
      ).length
    : 0
  const totalStudentImages = selectedStudentRecords.length
  const isEligibleForAttendance = registeredConditionCount >= MIN_REQUIRED_IMAGES

  const currentWebcamAngle = FACE_ANGLES.find((a) => a.id === webcamSlot)

  return (
    <AppShell
      role="admin"
      user={adminUser}
      breadcrumb="Quản lý dữ liệu khuôn mặt"
    >
      <div className="flex gap-6">
        {/* Main Content */}
        <div className="flex-1 space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-[#0F172A]">
                Quản lý dữ liệu khuôn mặt
              </h1>
              <p className="text-sm text-[#64748B] mt-1">
                Thu thập và kiểm duyệt 8 điều kiện chụp (5–10 ảnh/người) phục vụ nhận diện YuNet & SFace
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200 py-1 px-3">
                <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                Kiến trúc SFace 128D
              </Badge>
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 py-1 px-3">
                <Sparkles className="w-3.5 h-3.5 mr-1" />
                Chuẩn NCKH: 5–10 ảnh/SV
              </Badge>
            </div>
          </div>

          {/* Filters */}
          <Card className="border-[#E2E8F0] shadow-sm">
            <CardContent className="pt-6">
              <div className="flex flex-wrap gap-4">
                <div className="relative flex-1 min-w-[250px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
                  <Input
                    placeholder="Tìm sinh viên theo mã, tên..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Trạng thái" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả trạng thái</SelectItem>
                    <SelectItem value="approved">Đã duyệt</SelectItem>
                    <SelectItem value="pending">Chờ duyệt</SelectItem>
                    <SelectItem value="none">Chưa đăng ký</SelectItem>
                    <SelectItem value="poor">Chất lượng kém</SelectItem>
                  </SelectContent>
                </Select>

                <Button variant="outline" onClick={fetchStudents} disabled={isLoading}>
                  <RefreshCw className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")} />
                  Làm mới
                </Button>
              </div>
            </CardContent>
          </Card>

          {loadError && (
            <div className="flex items-center gap-2 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-3 text-sm text-[#991B1B]">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{loadError}</span>
            </div>
          )}

          {/* Student Grid */}
          {isLoading ? (
            <Card className="border-[#E2E8F0] shadow-sm">
              <CardContent className="py-12 text-center text-sm text-[#64748B]">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-sky-600" />
                Đang tải dữ liệu hồ sơ và các góc chụp khuôn mặt...
              </CardContent>
            </Card>
          ) : filteredStudents.length === 0 ? (
            <Card className="border-[#E2E8F0] shadow-sm">
              <CardContent className="py-12 text-center text-sm text-[#64748B]">
                Không có sinh viên phù hợp với bộ lọc hiện tại.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredStudents.map((student) => {
                const studentFaces = allFaceRecords.filter(
                  (face: any) => face.student_id?.toString() === student.id
                )
                const conditionCount = FACE_ANGLES.filter((angle) =>
                  studentFaces.some((face: any) => face.image_type === angle.id)
                ).length

                return (
                  <Card
                    key={student.id}
                    className={cn(
                      "border-[#E2E8F0] shadow-sm cursor-pointer transition-all hover:shadow-md relative overflow-hidden",
                      selectedStudent?.id === student.id && "ring-2 ring-[#0EA5E9]"
                    )}
                    onClick={() => {
                      setSelectedStudent(student)
                      setUploadMessage(null)
                    }}
                  >
                    <CardContent className="pt-6">
                      {/* Avatar / Face Photo */}
                      <div className="relative w-24 h-24 mx-auto mb-3 rounded-xl overflow-hidden bg-[#F8FAFC] border border-slate-200 shadow-inner">
                        {student.status !== "none" && student.imageUrl ? (
                          <Image
                            src={student.imageUrl}
                            alt={student.name}
                            fill
                            sizes="96px"
                            className="object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
                            <User className="w-10 h-10 text-slate-400" />
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="text-center mb-3">
                        <p className="font-semibold text-[#0F172A]">{student.name}</p>
                        <p className="text-sm text-[#64748B]">{student.studentId} • {student.className || "CNTT"}</p>
                      </div>

                      {/* Status Badge */}
                      <div className="flex justify-center mb-3">
                        <span className={cn(
                          "inline-flex items-center gap-1 px-3 py-0.5 rounded-full text-xs font-semibold border",
                          statusConfig[student.status].className
                        )}>
                          {student.status === "approved" && <Check className="w-3.5 h-3.5" />}
                          {student.status === "pending" && <span className="w-2 h-2 rounded-full bg-current animate-pulse" />}
                          {student.status === "none" && <X className="w-3.5 h-3.5" />}
                          {student.status === "poor" && <AlertTriangle className="w-3.5 h-3.5" />}
                          {statusConfig[student.status].label}
                        </span>
                      </div>

                      {/* 8-Condition Collection Progress */}
                      <div className="bg-slate-50 rounded-lg p-2.5 mb-3 border border-slate-100">
                        <div className="flex items-center justify-between text-xs text-[#64748B] mb-1.5">
                          <span>Góc & điều kiện:</span>
                          <span className={cn(
                            "font-semibold px-2 py-0.5 rounded-md text-[11px]",
                            conditionCount >= 8
                              ? "bg-emerald-100 text-emerald-800"
                              : conditionCount >= MIN_REQUIRED_IMAGES
                              ? "bg-sky-100 text-sky-800"
                              : conditionCount > 0
                              ? "bg-amber-100 text-amber-800"
                              : "bg-slate-200 text-slate-600"
                          )}>
                            {conditionCount}/8 điều kiện ({studentFaces.length} ảnh)
                          </span>
                        </div>
                        <Progress
                          value={(conditionCount / 8) * 100}
                          className="h-1.5"
                        />
                      </div>

                      {/* Last Updated */}
                      {student.lastUpdated && (
                        <p className="text-[11px] text-center text-[#94A3B8] mb-3">
                          Cập nhật: {student.lastUpdated}
                        </p>
                      )}

                      {/* Action */}
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-xs text-[#0A2540] border-[#0A2540]/20 hover:bg-[#0A2540]/5"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedStudent(student)
                          setUploadMessage(null)
                        }}
                      >
                        <Eye className="w-3.5 h-3.5 mr-1" />
                        Đăng ký & Xem 8 điều kiện
                      </Button>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>

        {/* Detail & Multi-Angle Registration Drawer */}
        {selectedStudent && (
          <>
            {/* Backdrop overlay */}
            <div
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 transition-opacity"
              onClick={() => setSelectedStudent(null)}
            />

            {/* Slide-out Drawer Panel (Expanded width for 8 slots) */}
            <div className="fixed right-0 top-0 h-full w-[600px] max-w-full bg-white shadow-2xl z-50 flex flex-col border-l border-[#E2E8F0] overflow-y-auto">
              {/* Drawer Header */}
              <div className="p-4 border-b border-[#E2E8F0] bg-[#F8FAFC] sticky top-0 z-10 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-[#0F172A] text-base">{selectedStudent.name}</p>
                    <span className={cn(
                      "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border",
                      statusConfig[selectedStudent.status].className
                    )}>
                      {statusConfig[selectedStudent.status].label}
                    </span>
                  </div>
                  <p className="text-xs text-[#64748B] mt-0.5">
                    {selectedStudent.studentId} • Lớp {selectedStudent.className || "CNTT"}
                    {selectedStudent.email && ` • ${selectedStudent.email}`}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full"
                  onClick={() => setSelectedStudent(null)}
                >
                  <X className="w-5 h-5 text-slate-500" />
                </Button>
              </div>

              <div className="p-5 space-y-6 flex-1">
                {/* Upload feedback banner */}
                {uploadMessage && (
                  <div className={cn(
                    "flex items-center justify-between gap-2 p-3 rounded-lg text-xs font-medium border",
                    uploadMessage.type === "success"
                      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                      : "bg-red-50 text-red-800 border-red-200"
                  )}>
                    <div className="flex items-center gap-2">
                      {uploadMessage.type === "success" ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                      )}
                      <span>{uploadMessage.text}</span>
                    </div>
                    <button
                      onClick={() => setUploadMessage(null)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Registration Rules & Progress Tracker */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-[#0F172A] uppercase tracking-wider">
                        Tiến độ thu thập ảnh đăng ký (5–10 ảnh/SV)
                      </p>
                      <p className="text-xs text-[#64748B] mt-0.5">
                        Đã thu thập: <strong className="text-slate-900">{registeredConditionCount}/8</strong> điều kiện ({totalStudentImages} ảnh tổng cộng)
                      </p>
                    </div>
                    <Badge className={cn(
                      "text-xs font-semibold",
                      registeredConditionCount >= 8
                        ? "bg-emerald-600 text-white"
                        : isEligibleForAttendance
                        ? "bg-sky-600 text-white"
                        : "bg-amber-500 text-white"
                    )}>
                      {registeredConditionCount >= 8
                        ? "Tối ưu 8/8"
                        : isEligibleForAttendance
                        ? "Đủ điều kiện nhận diện"
                        : `Thiếu ${MIN_REQUIRED_IMAGES - registeredConditionCount} ảnh`}
                    </Badge>
                  </div>

                  <Progress
                    value={(registeredConditionCount / 8) * 100}
                    className="h-2"
                  />

                  {/* Status explanation rule */}
                  <div className="text-xs rounded-lg p-2.5 flex items-start gap-2 bg-white border border-slate-200">
                    {registeredConditionCount < MIN_REQUIRED_IMAGES ? (
                      <>
                        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                        <div className="text-amber-800">
                          <strong>Chưa đủ điều kiện kích hoạt:</strong> Quy trình NCKH YuNet & SFace yêu cầu tối thiểu <strong>5 ảnh</strong> để trích xuất đặc trưng và nhận diện ổn định trong lớp học.
                        </div>
                      </>
                    ) : registeredConditionCount < 8 ? (
                      <>
                        <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                        <div className="text-sky-800">
                          <strong>Đã đạt yêu cầu cơ bản (≥ 5 ảnh):</strong> Hệ thống đã đủ điều kiện kích hoạt nhận diện. Bạn nên thu thập thêm 3 điều kiện còn lại (đeo kính, ánh sáng yếu, ngược sáng) để đạt độ chính xác tối ưu.
                        </div>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <div className="text-emerald-800">
                          <strong>Hoàn thành xuất sắc:</strong> Đã thu thập đầy đủ 8/8 điều kiện khuôn mặt đa góc độ và đa môi trường ánh sáng.
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* 8 Conditions Collection Grid */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-[#0F172A]">
                      8 Ô điều kiện chụp khuôn mặt
                    </p>
                    <span className="text-xs text-[#64748B]">
                      Hỗ trợ Webcam trực tiếp & Tải file
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {FACE_ANGLES.map((angle) => {
                      const angleRecord = selectedStudentRecords.find(
                        (record: any) => record.image_type === angle.id
                      )
                      const angleUrl = angleRecord ? toBackendAssetUrl(angleRecord.image_path) : null
                      const isHoveredSlot = dragOverSlot === angle.id

                      return (
                        <Card
                          key={angle.id}
                          className={cn(
                            "border-[#E2E8F0] shadow-xs flex flex-col justify-between overflow-hidden transition-all",
                            isHoveredSlot && "ring-2 ring-sky-500 bg-sky-50/50",
                            angleRecord ? "border-slate-200" : "border-dashed border-slate-300"
                          )}
                          onDragOver={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setDragOverSlot(angle.id)
                          }}
                          onDragLeave={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            if (dragOverSlot === angle.id) setDragOverSlot(null)
                          }}
                          onDrop={(e) => handleSlotDrop(e, angle.id)}
                        >
                          {/* Slot Header */}
                          <div className="px-3 py-2 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center justify-between">
                            <div className="flex items-center gap-1.5 min-w-0">
                              {getAngleIcon(angle.id)}
                              <span className="text-xs font-semibold text-[#0F172A] truncate" title={angle.label}>
                                {angle.label}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {angle.required ? (
                                <span className="text-[10px] font-semibold text-sky-700 bg-sky-100 px-1.5 py-0.5 rounded">
                                  Bắt buộc
                                </span>
                              ) : (
                                <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                  Mở rộng
                                </span>
                              )}
                              {angleRecord ? (
                                <span className="w-2 h-2 rounded-full bg-[#22C55E]" title="Đã có ảnh" />
                              ) : (
                                <span className="w-2 h-2 rounded-full bg-slate-300" title="Chưa nạp ảnh" />
                              )}
                            </div>
                          </div>

                          {/* Slot Body */}
                          <div className="p-3 flex flex-col items-center justify-center space-y-2.5">
                            {/* Thumbnail container */}
                            <div className="w-24 h-24 rounded-lg overflow-hidden border border-[#E2E8F0] bg-slate-50 flex items-center justify-center relative shadow-inner">
                              {angleUrl ? (
                                <Image
                                  src={angleUrl}
                                  alt={angle.label}
                                  fill
                                  sizes="96px"
                                  className="object-cover"
                                />
                              ) : (
                                <div className="flex flex-col items-center justify-center p-2 text-center">
                                  <Camera className="w-6 h-6 text-slate-300 mb-1" />
                                  <span className="text-[10px] text-slate-400 leading-tight">
                                    {angle.sublabel}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Angle description hint */}
                            <p className="text-[11px] text-[#64748B] text-center line-clamp-2 px-1 h-8">
                              {angle.description}
                            </p>

                            {/* Action Buttons for this slot */}
                            <div className="w-full grid grid-cols-2 gap-1.5 pt-1">
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs h-7 px-1.5 border-slate-200 hover:bg-sky-50 hover:text-sky-700"
                                disabled={isUploading}
                                onClick={() => openWebcam(angle.id)}
                                title={`Chụp ảnh webcam cho điều kiện ${angle.label}`}
                              >
                                <Camera className="w-3 h-3 mr-1" />
                                Webcam
                              </Button>

                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs h-7 px-1.5 border-slate-200 hover:bg-slate-100"
                                disabled={isUploading}
                                onClick={() => triggerFileUploadForAngle(angle.id)}
                                title={`Tải file ảnh cho điều kiện ${angle.label}`}
                              >
                                <Upload className="w-3 h-3 mr-1" />
                                Tải file
                              </Button>
                            </div>
                          </div>
                        </Card>
                      )
                    })}
                  </div>
                </div>

                {/* Hidden File Input for Angle Uploads */}
                <input
                  ref={fileInputRef}
                  id="angle-file-input"
                  type="file"
                  className="hidden"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleAngleFileChange}
                  disabled={isUploading}
                />

                {/* Admin Notes */}
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-[#0F172A]">Ghi chú kiểm duyệt</p>
                  <Textarea
                    placeholder="Nhập nhận xét về chất lượng ảnh, độ sáng, góc nghiêng..."
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    className="min-h-[70px] text-xs"
                  />
                </div>

                {/* Approval Actions */}
                {selectedStudent.status === "pending" && (
                  <div className="flex gap-2 pt-2">
                    <Button
                      className="flex-1 bg-[#22C55E] hover:bg-[#22C55E]/90 text-white font-medium"
                      onClick={handleApproveFace}
                    >
                      <Check className="w-4 h-4 mr-2" />
                      Duyệt hồ sơ ({registeredConditionCount}/8)
                    </Button>
                    <Button
                      className="flex-1 bg-[#EF4444] hover:bg-[#EF4444]/90 text-white font-medium"
                      onClick={handleRejectFace}
                    >
                      <X className="w-4 h-4 mr-2" />
                      Từ chối
                    </Button>
                  </div>
                )}

                {/* Close Button */}
                <div className="pt-2 border-t border-[#E2E8F0]">
                  <Button
                    variant="outline"
                    className="w-full text-xs"
                    onClick={() => setSelectedStudent(null)}
                  >
                    Đóng panel
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Live Webcam Capture Dialog */}
        <Dialog open={!!webcamSlot} onOpenChange={(open) => !open && closeWebcam()}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base text-[#0F172A]">
                <Camera className="w-5 h-5 text-sky-600" />
                Chụp ảnh Webcam — {currentWebcamAngle?.label} ({currentWebcamAngle?.sublabel})
              </DialogTitle>
              <DialogDescription className="text-xs text-[#64748B]">
                {currentWebcamAngle?.description}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              {/* Webcam stream or snapshot preview */}
              <div className="relative w-full aspect-4/3 bg-black rounded-xl overflow-hidden flex items-center justify-center border border-slate-300 shadow-inner">
                {webcamError ? (
                  <div className="p-6 text-center text-white space-y-3">
                    <CameraOff className="w-10 h-10 text-red-400 mx-auto" />
                    <p className="text-xs text-red-200 max-w-sm">{webcamError}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs bg-white/10 hover:bg-white/20 text-white border-white/30"
                      onClick={() => currentWebcamAngle && openWebcam(currentWebcamAngle.id)}
                    >
                      Thử lại camera
                    </Button>
                  </div>
                ) : capturedPreviewUrl ? (
                  <div className="relative w-full h-full flex items-center justify-center bg-black">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={capturedPreviewUrl}
                      alt="Xem trước ảnh chụp"
                      className="w-full h-full object-contain"
                    />
                    <div className="absolute top-2 left-2 bg-black/60 text-white text-[11px] px-2 py-0.5 rounded backdrop-blur-sm">
                      Ảnh đã chụp — Kiểm tra độ rõ nét trước khi lưu
                    </div>
                  </div>
                ) : (
                  <>
                    <video
                      ref={webcamVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover transform -scale-x-100"
                    />
                    {/* Framing guide overlay */}
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                      <div className="w-48 h-60 rounded-[50%] border-2 border-dashed border-white/70 shadow-2xl flex items-center justify-center">
                        <div className="w-32 border-b border-white/40" />
                      </div>
                    </div>
                    {/* Live prompt overlay */}
                    <div className="absolute bottom-2 left-2 right-2 text-center bg-black/60 text-white text-xs py-1 px-2 rounded backdrop-blur-sm">
                      {currentWebcamAngle?.hint || "Căn chỉnh khuôn mặt vào giữa khung bầu dục"}
                    </div>
                  </>
                )}
              </div>

              {/* Hidden Canvas for Frame Capture */}
              <canvas ref={webcamCanvasRef} className="hidden" />
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              {capturedPreviewUrl ? (
                <>
                  <Button
                    variant="outline"
                    onClick={retakeWebcamSnapshot}
                    disabled={isUploading}
                    className="text-xs"
                  >
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                    Chụp lại
                  </Button>
                  <Button
                    onClick={handleConfirmWebcamCapture}
                    disabled={isUploading}
                    className="bg-[#22C55E] hover:bg-[#22C55E]/90 text-white text-xs font-semibold"
                  >
                    {isUploading ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        Đang trích xuất SFace...
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5 mr-1.5" />
                        Lưu & Đăng ký ({currentWebcamAngle?.label})
                      </>
                    )}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={closeWebcam}
                    className="text-xs"
                  >
                    Hủy
                  </Button>
                  <Button
                    onClick={captureFrameFromWebcam}
                    disabled={!webcamStream || !!webcamError}
                    className="bg-[#0A2540] hover:bg-[#0A2540]/90 text-white text-xs font-semibold"
                  >
                    <Camera className="w-3.5 h-3.5 mr-1.5" />
                    Chụp ảnh ngay
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  )
}
