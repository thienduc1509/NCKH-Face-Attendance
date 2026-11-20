"use client"

import { toast } from "sonner"
import { useEffect, useState } from "react"
import { AppShell } from "@/components/app-shell"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/status-badge"
import { Claim } from "@/types/lecturer"
import { LecturerService } from "@/services/lecturer.service"
import { Loader2, AlertCircle, Inbox, CheckCircle, XCircle } from "lucide-react"

export default function LecturerClaimsPage() {
  const [profile, setProfile] = useState<{ name: string; email: string; maCanBo: number } | null>(null)
  const [claims, setClaims] = useState<Claim[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [processingId, setProcessingId] = useState<string | null>(null)

  const fetchProfileAndClaims = async () => {
    setLoading(true)
    setError(null)
    try {
      const prof = await LecturerService.getProfile()
      setProfile(prof)
      if (prof.maCanBo) {
        const data = await LecturerService.getClaims(prof.maCanBo)
        setClaims(data)
      } else {
        setError("Không tìm thấy mã giảng viên.")
      }
    } catch (err: any) {
      setError(err.message || "Đã xảy ra lỗi khi tải dữ liệu.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProfileAndClaims()
  }, [])

  const handleUpdateStatus = async (id: string, newStatus: 'approved' | 'rejected') => {
    if (!profile) return
    setProcessingId(id)
    try {
      const success = await LecturerService.updateClaimStatus(profile.maCanBo, id, newStatus)
      if (success) {
        setClaims(claims.map(c => c.id === id ? { ...c, status: newStatus } : c))
      } else {
        toast.error("Đã xảy ra lỗi khi cập nhật trạng thái.")
      }
    } catch (err) {
      toast.error("Đã xảy ra lỗi khi cập nhật trạng thái.")
    } finally {
      setProcessingId(null)
    }
  }

  const pendingClaims = claims.filter(c => c.status === 'pending')
  const processedClaims = claims.filter(c => c.status !== 'pending')

  const userDisplayName = profile ? profile.name : "Giảng viên"
  const userEmail = profile ? profile.email : "loading..."

  return (
    <AppShell
      role="lecturer"
      user={{ name: userDisplayName, email: userEmail, avatar: "" }}
      breadcrumb="Duyệt khiếu nại"
      notificationCount={pendingClaims.length}
    >
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">Quản lý khiếu nại điểm danh</h1>
          <p className="text-[#64748B] mt-1">Xem và xử lý các phản hồi về điểm danh từ sinh viên</p>
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center py-24 bg-white rounded-xl border border-[#E2E8F0]">
            <Loader2 className="w-10 h-10 text-[#0EA5E9] animate-spin mb-4" />
            <p className="text-[#64748B] font-medium">Đang tải dữ liệu khiếu nại...</p>
          </div>
        )}

        {!loading && error && (
          <Card className="border-[#EF4444] bg-[#FEF2F2]">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-[#FEE2E2] flex items-center justify-center mb-4">
                <AlertCircle className="w-8 h-8 text-[#EF4444]" />
              </div>
              <h3 className="text-xl font-semibold text-[#991B1B] mb-2">Không thể tải dữ liệu</h3>
              <p className="text-[#DC2626] mb-6 max-w-md">{error}</p>
              <Button onClick={fetchProfileAndClaims} variant="outline" className="border-[#EF4444] text-[#EF4444] hover:bg-[#EF4444] hover:text-white">
                Thử lại ngay
              </Button>
            </CardContent>
          </Card>
        )}

        {!loading && !error && claims.length === 0 && (
          <Card className="border-dashed border-2 border-[#E2E8F0] bg-[#F8FAFC]">
            <CardContent className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-full bg-[#E2E8F0] flex items-center justify-center mb-4">
                <Inbox className="w-8 h-8 text-[#64748B]" />
              </div>
              <h3 className="text-xl font-semibold text-[#0F172A] mb-2">Hộp thư trống</h3>
              <p className="text-[#64748B] max-w-sm">
                Hiện tại không có khiếu nại nào từ sinh viên cần bạn xử lý.
              </p>
            </CardContent>
          </Card>
        )}

        {!loading && !error && claims.length > 0 && (
          <div className="space-y-6">
            {/* Chờ duyệt */}
            <div>
              <h2 className="text-lg font-semibold text-[#0F172A] mb-4 border-b border-[#E2E8F0] pb-2">
                Cần xử lý ({pendingClaims.length})
              </h2>
              {pendingClaims.length === 0 ? (
                <p className="text-[#64748B] italic">Không có khiếu nại nào đang chờ duyệt.</p>
              ) : (
                <div className="space-y-4">
                  {pendingClaims.map(claim => (
                    <Card key={claim.id} className="border-l-4 border-l-[#F59E0B] shadow-sm hover:shadow-md transition-all duration-200">
                      <CardContent className="p-5">
                        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                          <div className="flex-1 space-y-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-[#0A2540] flex items-center justify-center text-white font-medium">
                                {claim.studentName.charAt(0)}
                              </div>
                              <div>
                                <h3 className="font-semibold text-[#0F172A] text-lg">
                                  {claim.studentName}{" "}
                                  <span className="text-[#64748B] text-base font-normal">
                                    (Mã SV: {claim.studentId})
                                  </span>
                                </h3>
                                <p className="text-sm text-[#64748B]">
                                  {claim.subjectName} ({claim.subjectCode}) • Buổi {claim.sessionNumber} • {claim.date}
                                </p>
                              </div>
                            </div>
                            <div className="bg-[#F8FAFC] p-3 rounded-lg border border-[#E2E8F0]">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-sm font-medium text-[#0F172A]">Ghi nhận hiện tại:</span>
                                <StatusBadge status={claim.currentStatus} />
                              </div>
                              <p className="text-[#334155] text-sm leading-relaxed">
                                <span className="font-medium text-[#0F172A]">Lý do:</span> {claim.reason}
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-row lg:flex-col gap-2 shrink-0 border-t lg:border-t-0 lg:border-l border-[#E2E8F0] pt-4 lg:pt-0 lg:pl-4">
                            <Button
                              onClick={() => handleUpdateStatus(claim.id, 'approved')}
                              disabled={processingId === claim.id}
                              className="bg-[#22C55E] hover:bg-[#16A34A] text-white flex-1 font-semibold"
                            >
                              {processingId === claim.id ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : <CheckCircle className="w-4 h-4 mr-2" />}
                              Chấp thuận
                            </Button>
                            <Button
                              onClick={() => handleUpdateStatus(claim.id, 'rejected')}
                              disabled={processingId === claim.id}
                              variant="outline"
                              className="border-[#EF4444] text-[#EF4444] hover:bg-[#FEF2F2] hover:text-[#EF4444] flex-1 font-semibold border"
                            >
                              {processingId === claim.id ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : <XCircle className="w-4 h-4 mr-2" />}
                              Từ chối
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* Đã xử lý */}
            {processedClaims.length > 0 && (
              <div className="mt-8">
                <h2 className="text-lg font-semibold text-[#0F172A] mb-4 border-b border-[#E2E8F0] pb-2">
                  Đã xử lý gần đây
                </h2>
                <div className="space-y-4 opacity-75">
                  {processedClaims.map(claim => (
                    <Card key={claim.id} className="border-[#E2E8F0] bg-[#F8FAFC] shadow-none">
                      <CardContent className="p-4 flex items-center justify-between">
                        <div>
                          <p className="font-medium text-[#0F172A]">{claim.studentName} ({claim.studentId})</p>
                          <p className="text-xs text-[#64748B] mt-1">{claim.subjectName} ({claim.subjectCode}) • Buổi {claim.sessionNumber} • {claim.date}</p>
                        </div>
                        <div>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                            claim.status === 'approved'
                              ? 'bg-[#E8F5E9] text-[#22C55E] border-[#22C55E]/15'
                              : 'bg-[#FEE2E2] text-[#EF4444] border-[#EF4444]/15'
                          }`}>
                            {claim.status === 'approved' ? 'Đã chấp thuận' : 'Đã từ chối'}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  )
}
