import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import LecturerDashboard from "@/app/lecturer/page"
import LecturerLiveOverviewPage from "@/app/lecturer/live/page"
import { ClassService } from "@/services/class.service"
import { LecturerService } from "@/services/lecturer.service"

const mockPush = jest.fn()

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}))

jest.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

jest.mock("@/services/class.service", () => ({
  ClassService: {
    getClasses: jest.fn(),
  },
}))

jest.mock("@/services/lecturer.service", () => ({
  LecturerService: {
    getProfile: jest.fn(),
    getPendingClaimsCount: jest.fn(),
    getMonthlyAttendanceSummary: jest.fn(),
    getLichDayToday: jest.fn(),
    getRecentSessions: jest.fn(),
    getClaims: jest.fn(),
    getClassSessions: jest.fn(),
    createSession: jest.fn(),
    moDiemDanh: jest.fn(),
  },
}))

const mockedClassService = jest.mocked(ClassService)
const mockedLecturerService = jest.mocked(LecturerService)

async function renderDashboard(schedule: Record<string, unknown>[]) {
  mockedLecturerService.getProfile.mockResolvedValue({
    name: "Giảng viên",
    email: "lecturer@example.edu",
    maCanBo: 1,
  })
  mockedClassService.getClasses.mockResolvedValue([])
  mockedLecturerService.getPendingClaimsCount.mockResolvedValue(0)
  mockedLecturerService.getMonthlyAttendanceSummary.mockResolvedValue({})
  mockedLecturerService.getLichDayToday.mockResolvedValue(schedule)
  mockedLecturerService.getRecentSessions.mockResolvedValue([])
  mockedLecturerService.getClaims.mockResolvedValue([])

  render(<LecturerDashboard />)
  await screen.findByText("Lịch Giảng Dạy Hôm Nay")
}

describe("lecturer dashboard live navigation", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("waits for the API to open a scheduled session before navigating", async () => {
    await renderDashboard([
      {
        class_session_id: 17,
        class_section_id: 9,
        class_session_status: "CHUA_DIEM_DANH",
        course_name: "Trí tuệ nhân tạo",
      },
    ])
    let resolveOpen!: (value: { class_session_id: number; status: string }) => void
    mockedLecturerService.moDiemDanh.mockReturnValue(
      new Promise((resolve) => {
        resolveOpen = resolve
      }),
    )

    fireEvent.click(await screen.findByRole("button", { name: "Mở phòng Live" }))

    await waitFor(() => expect(mockedLecturerService.moDiemDanh).toHaveBeenCalledWith(17))
    expect(mockPush).not.toHaveBeenCalled()

    await act(async () => {
      resolveOpen({ class_session_id: 17, status: "DANG_DIEN_RA" })
    })

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/lecturer/live/17"))
  })

  it("enters an ongoing session without opening it again", async () => {
    await renderDashboard([
      {
        class_session_id: 23,
        class_section_id: 9,
        class_session_status: "DANG_DIEN_RA",
        course_name: "Cơ sở dữ liệu",
      },
    ])

    fireEvent.click(await screen.findByRole("button", { name: "Vào phòng Live" }))

    expect(mockedLecturerService.moDiemDanh).not.toHaveBeenCalled()
    expect(mockPush).toHaveBeenCalledWith("/lecturer/live/23")
  })

  it("creates and opens a scheduled row using its new class session ID", async () => {
    await renderDashboard([
      {
        class_session_id: null,
        class_section_id: 9,
        class_session_status: null,
        course_name: "Cơ sở dữ liệu",
      },
    ])
    mockedLecturerService.createSession.mockResolvedValue({
      class_session_id: 31,
      status: "CHUA_DIEM_DANH",
    })
    mockedLecturerService.moDiemDanh.mockResolvedValue({
      class_session_id: 31,
      status: "DANG_DIEN_RA",
    })

    fireEvent.click(await screen.findByRole("button", { name: "Mở phòng Live" }))

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/lecturer/live/31"))
    expect(mockedLecturerService.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ class_section_id: 9 }),
    )
    expect(mockedLecturerService.moDiemDanh).toHaveBeenCalledWith(31)
  })
})

describe("lecturer quick test session", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("disables the test-session action when the class has no active students", async () => {
    mockedLecturerService.getProfile.mockResolvedValue({
      name: "Giảng viên",
      email: "lecturer@example.edu",
      maCanBo: 1,
    })
    mockedClassService.getClasses.mockResolvedValue([
      {
        id: 9,
        maLop: "AI",
        tenHocPhan: "Trí tuệ nhân tạo",
        giangVien: "",
        hocKy: "Học kỳ 1",
        siSo: 50,
        siSoHienTai: 0,
        trangThai: "Đang học",
      },
      {
        id: 10,
        maLop: "DB",
        tenHocPhan: "Cơ sở dữ liệu",
        giangVien: "",
        hocKy: "Học kỳ 1",
        siSo: 50,
        siSoHienTai: 3,
        trangThai: "Đang học",
      },
    ])
    mockedLecturerService.getClassSessions.mockResolvedValue([])

    render(<LecturerLiveOverviewPage />)

    expect(await screen.findByText("Chế độ Test Thử Nghiệm Nhanh với Sinh Viên")).toBeTruthy()
    expect(screen.getByText("Lớp chưa có sinh viên")).toBeTruthy()
    const testButtons = screen.getAllByRole("button", {
      name: "Xóa buổi cũ & Mở Phiên Test Mới",
    })
    expect(testButtons[0]).toBeDisabled()
    expect(testButtons[1]).toBeEnabled()
  })
})
