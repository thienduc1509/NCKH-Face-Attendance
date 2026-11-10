import { Claim, AttendanceReport } from "@/types/lecturer";
import { apiClient } from "@/lib/api-client";

export const LecturerService = {
  getProfile: async (): Promise<any> => {
    try {
      const data = await apiClient.get<any>("/users/me/profile");
      const profile = data.profile || {};
      return {
        id: profile.staff_id?.toString() || data.account?.account_id?.toString() || "unknown",
        name: `${profile.last_name || ""} ${profile.first_name || ""}`.trim() || data.account?.username || "Giảng viên",
        email: profile.google_email || data.account?.username || "Unknown",
        phone: profile.phone || "Chưa cập nhật",
        maCanBo: profile.staff_id || 0,
        academicDegree: profile.academic_degree || "TS.",
        username: data.account?.username || "",
        role: "Giảng viên Khoa CNTT"
      };
    } catch (error) {
      console.error("Lỗi tải thông tin cá nhân giảng viên:", error);
      throw error;
    }
  },

  getClaims: async (maCanBo: number): Promise<Claim[]> => {
    try {
      const response = await apiClient.get<any>(`/appeals/staff/${maCanBo}?status=pending`);
      const claims = response.data || [];
      return claims.map((claim: any) => ({
        id: claim.appeal_id?.toString() || `CLM${Math.random()}`,
        studentId: claim.student_id?.toString() || "Unknown",
        studentName: claim.student_full_name || "Unknown",
        subjectCode: claim.class_section_id?.toString() || "Unknown",
        subjectName: claim.course_name || "Lớp học phần",
        date: claim.class_date ? new Date(claim.class_date).toLocaleDateString("vi-VN") : "N/A",
        sessionNumber: claim.session_number || 0,
        currentStatus: claim.attendance_status === 'CO_MAT' ? 'present' : (claim.attendance_status === 'DI_MUON' ? 'late' : 'absent'),
        reason: claim.reason || "",
        status: claim.status === 'CHO_XU_LY' ? 'pending' : (claim.status === 'DA_DUYET' ? 'approved' : 'rejected'),
        submittedAt: claim.submitted_at ? new Date(claim.submitted_at).toLocaleString("vi-VN") : "N/A",
      }));
    } catch (error) {
      console.error("Lỗi tải danh sách khiếu nại:", error);
      throw error;
    }
  },

  getLichDayToday: async (maCanBo: number): Promise<any[]> => {
    try {
      const todayStr = new Date().toISOString().split("T")[0];
      const response = await apiClient.get<any>(`/staff/${maCanBo}/teaching-schedule?from_date=${todayStr}&to_date=${todayStr}`);
      return response.data || [];
    } catch (error) {
      console.error("Lỗi tải lịch dạy hôm nay:", error);
      return [];
    }
  },

  getRecentSessions: async (maCanBo: number): Promise<any[]> => {
    try {
      const response = await apiClient.get<any>(`/staff/${maCanBo}/class-sessions/recent`);
      return response.data || [];
    } catch (error) {
      console.error("Lỗi tải các buổi học gần đây:", error);
      return [];
    }
  },

  getPendingClaimsCount: async (maCanBo: number): Promise<number> => {
    try {
      const response = await apiClient.get<any>(`/staff/${maCanBo}/appeals/pending/count`);
      return response.count || 0;
    } catch (error) {
      console.error("Lỗi tải số khiếu nại chờ xử lý:", error);
      return 0;
    }
  },

  getMonthlyAttendanceSummary: async (maCanBo: number): Promise<any> => {
    try {
      const response = await apiClient.get<any>(`/staff/${maCanBo}/attendance/monthly-summary`);
      return response;
    } catch (error) {
      console.error("Lỗi tải thống kê điểm danh tháng:", error);
      return null;
    }
  },

  getLopHocPhanCount: async (maCanBo: number): Promise<number> => {
    try {
      const response = await apiClient.get<any>(`/staff/${maCanBo}/class-sections/active/count`);
      return response.count || 0;
    } catch (error) {
      console.error("Lỗi tải số lớp học phần đang giảng dạy:", error);
      return 0;
    }
  },

  getReports: async (): Promise<AttendanceReport[]> => {
    try {
      const response = await apiClient.get<AttendanceReport[]>("/staff/me/reports");
      return response;
    } catch (error) {
      console.error("Lỗi tải báo cáo:", error);
      throw error;
    }
  },

  updateClaimStatus: async (maCanBo: number, claimId: string, status: 'approved' | 'rejected'): Promise<boolean> => {
    try {
      const idNum = parseInt(claimId);
      if (status === 'approved') {
        await apiClient.patch(`/appeals/${idNum}?staff_id=${maCanBo}`, {
          status: "approved",
          new_attendance_status: "CO_MAT",
          resolution_note: "Giảng viên đã chấp thuận khiếu nại"
        });
      } else {
        await apiClient.patch(`/appeals/${idNum}?staff_id=${maCanBo}`, {
          status: "rejected",
          resolution_note: "Giảng viên từ chối khiếu nại"
        });
      }
      return true;
    } catch (error) {
      console.error("Lỗi cập nhật trạng thái khiếu nại:", error);
      return false;
    }
  },

  getLiveAttendance: async (maBuoiHoc: number): Promise<any[]> => {
    try {
      const response = await apiClient.get<any>(`/class-sessions/${maBuoiHoc}/attendance`);
      const rawData = response?.data || (Array.isArray(response) ? response : []);
      return rawData.map((item: any) => {
        const rawStatus = item.status || "CHUA_DIEM_DANH";
        let normStatus = "pending";
        if (["CO_MAT", "PRESENT", "present"].includes(rawStatus)) normStatus = "present";
        else if (["DI_MUON", "MUON", "LATE", "late"].includes(rawStatus)) normStatus = "late";
        else if (["VANG", "VANG_MAT", "ABSENT", "absent"].includes(rawStatus)) normStatus = "absent";

        return {
          id: item.student_id?.toString() || "",
          studentId: item.student_id?.toString() || "",
          name: `${item.last_name || ""} ${item.first_name || ""}`.trim() || `SV ${item.student_id}`,
          status: normStatus,
          confidence: normStatus === "present" ? "high" : normStatus === "late" ? "medium" : "low",
          hasCamera: true,
          verifiedAt: normStatus !== "pending" ? "Đã ghi nhận" : undefined,
        };
      });
    } catch (error) {
      console.error("Lỗi lấy danh sách điểm danh trực tiếp:", error);
      return [];
    }
  },

  moDiemDanh: async (maBuoiHoc: number): Promise<any> => {
    try {
      const response = await apiClient.patch<any>(`/class-sessions/${maBuoiHoc}`, {
        status: "DANG_DIEN_RA",
      });
      return response;
    } catch (error) {
      console.error("Lỗi mở phiên điểm danh:", error);
      throw error;
    }
  },

  dongDiemDanh: async (maBuoiHoc: number): Promise<any> => {
    try {
      const response = await apiClient.patch<any>(`/class-sessions/${maBuoiHoc}`, {
        status: "DA_KET_THUC",
      });
      return response;
    } catch (error) {
      console.error("Lỗi đóng phiên điểm danh:", error);
      throw error;
    }
  },

  updateAttendanceManual: async (maBuoiHoc: number, maSinhVien: number, status: 'present' | 'late' | 'absent'): Promise<any> => {
    try {
      const statusMap = {
        present: "CO_MAT",
        late: "DI_MUON",
        absent: "VANG"
      };
      const response = await apiClient.post<any>("/attendance-records/manual-adjustments", {
        class_session_id: maBuoiHoc,
        student_id: maSinhVien,
        status: statusMap[status],
        note: "Giảng viên cập nhật thủ công"
      });
      return response;
    } catch (error) {
      console.error("Lỗi cập nhật điểm danh thủ công:", error);
      throw error;
    }
  },

  getClassSessions: async (maLopHocPhan: number): Promise<any[]> => {
    try {
      const response = await apiClient.get<any>(`/class-sessions/class-sections/${maLopHocPhan}`);
      return response.data || [];
    } catch (error) {
      console.error("Lỗi tải danh sách buổi học:", error);
      throw error;
    }
  },

  createSession: async (payload: any): Promise<any> => {
    try {
      return await apiClient.post<any>("/class-sessions/", payload);
    } catch (error) {
      console.error("Lỗi tạo buổi học:", error);
      throw error;
    }
  },

  updateSession: async (maBuoiHoc: number, payload: any): Promise<any> => {
    try {
      return await apiClient.patch<any>(`/class-sessions/${maBuoiHoc}`, payload);
    } catch (error) {
      console.error("Lỗi cập nhật buổi học:", error);
      throw error;
    }
  },

  cancelSession: async (maBuoiHoc: number): Promise<any> => {
    try {
      return await apiClient.delete<any>(`/class-sessions/${maBuoiHoc}/lecturer`);
    } catch (error) {
      console.error("Lỗi hủy buổi học:", error);
      throw error;
    }
  },

  postponeSession: async (maBuoiHoc: number, reason: string): Promise<any> => {
    try {
      return await apiClient.post<any>(`/class-sessions/${maBuoiHoc}/postpone?reason=${encodeURIComponent(reason)}`, {});
    } catch (error) {
      console.error("Lỗi hoãn buổi học:", error);
      throw error;
    }
  },

  getClassWarnings: async (maLopHocPhan: number): Promise<any[]> => {
    try {
      const response = await apiClient.get<any>(`/class-sections/${maLopHocPhan}/warnings`);
      return response.data || [];
    } catch (error) {
      console.error("Lỗi tải cảnh báo chuyên cần:", error);
      return [];
    }
  },

  getClassStudents: async (maLopHocPhan: number): Promise<any[]> => {
    try {
      const response = await apiClient.get<any>(`/class-sections/${maLopHocPhan}/students`);
      return response.data || [];
    } catch (error) {
      console.error("Lỗi tải danh sách sinh viên lớp học phần:", error);
      return [];
    }
  },


  downloadAttendanceReport: async (maLopHocPhan: number, format: "excel" | "csv" = "excel"): Promise<void> => {
    const endpoint = format === "csv"
      ? `/reports/class-sections/${maLopHocPhan}/attendance?format=csv`
      : `/reports/class-sections/${maLopHocPhan}/attendance?format=xlsx`;
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
    const response = await fetch(`${baseUrl}${endpoint}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
      throw new Error("Không thể xuất báo cáo điểm danh");
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `DiemDanh_${maLopHocPhan}.${format === "csv" ? "csv" : "xlsx"}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }
};
