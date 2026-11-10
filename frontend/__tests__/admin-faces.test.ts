import {
  FACE_ANGLES,
  MIN_REQUIRED_IMAGES,
  RECOMMENDED_IMAGES,
  MAX_ALLOWED_IMAGES,
} from "@/app/admin/faces/page"

describe("Admin Face Registration UI & Business Rules (M2)", () => {
  test("FACE_ANGLES should define exactly 8 conditions", () => {
    expect(FACE_ANGLES).toHaveLength(8)
  })

  test("FACE_ANGLES should have correct condition IDs and labels per specification", () => {
    const expectedConditions = [
      { id: "chinh_dien", label: "Chính diện", required: true },
      { id: "goc_trai", label: "Nghiêng trái", required: true },
      { id: "goc_phai", label: "Nghiêng phải", required: true },
      { id: "goc_tren", label: "Ngẩng lên", required: true },
      { id: "goc_duoi", label: "Cúi xuống", required: true },
      { id: "deo_kinh", label: "Đeo kính", required: false },
      { id: "anh_sang_yeu", label: "Ánh sáng yếu", required: false },
      { id: "nguoc_sang", label: "Ngược sáng", required: false },
    ]

    expectedConditions.forEach((expected) => {
      const condition = FACE_ANGLES.find((c) => c.id === expected.id)
      expect(condition).toBeDefined()
      expect(condition?.label).toBe(expected.label)
      expect(condition?.required).toBe(expected.required)
      expect(condition?.description).toBeTruthy()
      expect(condition?.sublabel).toBeTruthy()
    })
  })

  test("Registration rules threshold constants are configured correctly", () => {
    expect(MIN_REQUIRED_IMAGES).toBe(5)
    expect(RECOMMENDED_IMAGES).toBe(8)
    expect(MAX_ALLOWED_IMAGES).toBe(10)
  })

  test("Registration eligibility requires at least 5 images", () => {
    const checkEligibility = (count: number) => count >= MIN_REQUIRED_IMAGES

    expect(checkEligibility(0)).toBe(false)
    expect(checkEligibility(3)).toBe(false)
    expect(checkEligibility(4)).toBe(false)
    expect(checkEligibility(5)).toBe(true)
    expect(checkEligibility(7)).toBe(true)
    expect(checkEligibility(8)).toBe(true)
    expect(checkEligibility(10)).toBe(true)
  })

  test("All 8 conditions have unique IDs", () => {
    const ids = FACE_ANGLES.map((a) => a.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(8)
  })
})
