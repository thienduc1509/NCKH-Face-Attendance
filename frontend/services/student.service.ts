import { StudentProfile, StudentClaim } from "@/types/student";
import { apiClient } from "@/lib/api-client";

export const StudentService = {
  getProfile: async (): Promise<StudentProfile> => {
    try {
      const data = await apiClient.get<any>("/users/me/profile");
      const profile = data.profile || {};

      // Map backend response to frontend StudentProfile interface
      return {
        id: profile.student_id?.toString() || data.account?.account_id?.toString() || "unknown",
        name: `${profile.last_name || ''} ${profile.first_name || ''}`.trim() || data.account?.username || "Unknown Student",
        studentId: profile.student_id?.toString() || "N/A",
        email: profile.google_email || "Not provided",
        phone: profile.phone || "Chưa cập nhật",
        department: profile.major_id?.toString() || "1",
        majorName: profile.major_name || "Công nghệ thông tin",
        birthDate: profile.birth_date ? new Date(profile.birth_date).toLocaleDateString("vi-VN") : "Chưa cập nhật",
        gender: profile.gender || "Chưa cập nhật",
        academicStatus: profile.academic_status === true || profile.academic_status === "DANG_HOC" ? "Đang học" : "Thôi học",
        studyStartedAt: profile.study_started_at ? new Date(profile.study_started_at).toLocaleDateString("vi-VN") : "N/A",
        faceRegistered: !!profile.face_registered,
        registeredFacesCount: profile.registered_faces_count || 0,
      };
    } catch (error) {
      console.error("Error fetching student profile:", error);
      throw error;
    }
  },

  updateProfile: async (data: Partial<StudentProfile>): Promise<boolean> => {
    try {
      // Map frontend update to backend StudentUpdate
      const nameParts = data.name ? data.name.split(" ") : [];
      const last_name = nameParts.length > 1 ? nameParts.slice(0, -1).join(" ") : undefined;
      const first_name = nameParts.length > 0 ? nameParts[nameParts.length - 1] : undefined;

      const payload: any = {};
      if (last_name !== undefined) payload.last_name = last_name;
      if (first_name !== undefined) payload.first_name = first_name;
      if (data.email) payload.google_email = data.email;
      if (data.phone) payload.phone = data.phone;

      // Assuming there's a PATCH endpoint for student profile, adjust if different
      await apiClient.patch("/users/me/profile", payload);
      return true;
    } catch (error) {
      console.error("Error updating profile:", error);
      return false;
    }
  },

  getClaims: async (): Promise<StudentClaim[]> => {
    try {
      const response = await apiClient.get<any>("/appeals");
      const claims = response?.data || [];

      return claims.map((claim: any) => ({
        id: claim.appeal_id?.toString() || `CLM-${Math.random().toString(36).substring(7)}`,
        subjectCode: claim.course_id?.toString() || claim.class_section_id?.toString() || "N/A",
        subjectName: claim.course_name || `Lớp học phần ${claim.class_section_id || "N/A"}`,
        date: claim.class_date ? new Date(claim.class_date).toLocaleDateString("vi-VN") : "N/A",
        sessionNumber: claim.session_number || 1,
        currentStatus: claim.attendance_status === "DI_MUON" || claim.attendance_status === "MUON" ? "late" : "absent",
        reason: claim.reason || "No reason",
        status: claim.status === "DA_XU_LY" ? "approved" : claim.status === "TU_CHOI" ? "rejected" : "pending",
        submittedAt: claim.submitted_at ? new Date(claim.submitted_at).toLocaleString("vi-VN") : "N/A"
      }));
    } catch (error) {
      console.error("Error fetching claims:", error);
      return []; // Return empty array instead of throwing to prevent frontend crashes
    }
  },

  submitClaim: async (data: any): Promise<StudentClaim> => {
    try {
      const payload = {
        reason: data.reason,
        attendance_id: data.attendance_id || 1, // You will need the actual attendance record ID
        minh_chung: "string" // Add file upload logic if necessary
      };

      const claim = await apiClient.post<any>("/appeals", payload);

      return {
        id: claim.appeal_id?.toString() || `CLM-${Math.random()}`,
        subjectCode: claim.class_section_id?.toString() || data.subjectCode || "Unknown",
        subjectName: data.subjectName || "Unknown Subject",
        date: new Date().toLocaleDateString("vi-VN"),
        sessionNumber: data.sessionNumber || 1,
        currentStatus: data.currentStatus || "absent",
        reason: claim.reason,
        status: 'pending',
        submittedAt: new Date().toLocaleString("vi-VN")
      };
    } catch (error) {
      console.error("Error submitting claim:", error);
      throw error;
    }
  },

  verifyFace: async (file: Blob, maBuoiHoc?: number): Promise<{ verified: boolean, confidence: number, message: string }> => {
    const formData = new FormData();
    formData.append("file", file, "frame.jpg");
    if (maBuoiHoc !== undefined && maBuoiHoc !== null) {
      formData.append("class_session_id", maBuoiHoc.toString());
    }

    try {
      const response = await apiClient.post<any>("/face-verifications/", formData, {
        headers: {
          "Content-Type": "multipart/form-data"
        }
      });
      return {
        verified: response.verified,
        confidence: response.confidence || 0,
        message: response.message || ""
      };
    } catch (error: any) {
      console.error("Error verifying face:", error);
      return {
        verified: false,
        confidence: 0,
        message: error?.response?.data?.detail || "Lỗi kết nối máy chủ"
      };
    }
  },

  getSchedule: async (): Promise<any[]> => {
    try {
      const [today, active] = await Promise.all([
        apiClient.get<any>("/schedules/me/today"),
        apiClient.get<any>("/schedules/me/active"),
      ]);
      const sessions = [...(active.data || []), ...(today.data || [])];
      return sessions.filter((item, index) => sessions.findIndex(other => other.class_session_id === item.class_session_id) === index);
    } catch (error) {
      console.error("Error fetching schedule:", error);
      return [];
    }
  },

  getWarnings: async (): Promise<any[]> => {
    try {
      const response = await apiClient.get<any>("/students/me/warnings");
      return response.data || [];
    } catch (error) {
      console.error("Error fetching absence warnings:", error);
      return [];
    }
  },

  getAttendance: async (): Promise<any[]> => {
    try {
      const response = await apiClient.get<any>("/students/me/attendance");
      return response.data || [];
    } catch (error) {
      console.error("Error fetching attendance:", error);
      return [];
    }
  },

  getAvailableClasses: async (): Promise<any[]> => {
    try {
      const response = await apiClient.get<any>("/students/me/class-sections-available");
      return response.data || [];
    } catch (error) {
      console.error("Error fetching available classes:", error);
      return [];
    }
  },

  registerClass: async (maLopHocPhan: number): Promise<boolean> => {
    try {
      await apiClient.post(`/students/me/course-registrations?class_section_id=${maLopHocPhan}`, {});
      return true;
    } catch (error) {
      console.error("Error registering class:", error);
      return false;
    }
  },

  cancelClassRegistration: async (maLopHocPhan: number): Promise<boolean> => {
    try {
      await apiClient.delete(`/students/me/course-registrations/${maLopHocPhan}`);
      return true;
    } catch (error) {
      console.error("Error cancelling class registration:", error);
      return false;
    }
  },

  getClassSessions: async (classSectionId: number): Promise<any[]> => {
    try {
      const response = await apiClient.get<any>(`/class-sessions/class-sections/${classSectionId}`);
      return response.data || [];
    } catch (error) {
      console.error("Error fetching class sessions:", error);
      return [];
    }
  }
};
